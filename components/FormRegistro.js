'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BotonesSociales from '@/components/BotonesSociales';
import CampoPassword from '@/components/CampoPassword';
import Logo from '@/components/Logo';
import { DESCUENTO, PLANES } from '@/components/web/datos';
import { datosFiscalesRegistro, PRUEBA_DIAS, PROVINCIAS, TIPOS } from '@/lib/prueba';
import { enfocar, irALaApp, useTrasArranque } from '@/lib/arranque';
import { validarContrasena } from '@/lib/contrasena';

const DETALLE = { aut: 'Trabajas por tu cuenta', pym: 'Sociedad con equipo pequeño', gra: 'Varias empresas o mucho equipo' };
const importe = (p) => p.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(p) ? 0 : 2, maximumFractionDigits: 2 });
const precio = (p, periodo) => periodo === 'anio' ? `${importe(p * 12 * (100 - DESCUENTO) / 100)} €/año` : `${importe(p)} €/mes`;

// Los campos permanecen montados para conservar lo escrito al cambiar de paso.
export default function FormRegistro({ inicial = {} }) {
  const listo = useTrasArranque();
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState(inicial.tipo || '');
  const [plan, setPlan] = useState(inicial.plan || '');
  const [periodo, setPeriodo] = useState(inicial.periodo === 'anio' ? 'anio' : 'mes');
  const [fiscales, setFiscales] = useState({ razon: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', telefono: '' });
  const [cuenta, setCuenta] = useState({});
  const [password, setPassword] = useState('');
  const [errorEmail, setErrorEmail] = useState('');
  const [comprobando, setComprobando] = useState(false);
  const [direccion, setDireccion] = useState(1);
  const [alto, setAlto] = useState();
  const contenido = useRef(null);
  const emailActual = useRef('');
  const seguridad = validarContrasena(password, cuenta);
  function cambiarPaso(n) { setDireccion(n > paso ? 1 : -1); setPaso(n); }
  useLayoutEffect(() => {
    const bloque = form.current?.querySelector(`[data-paso="${paso}"]`);
    if (!bloque) return;
    const medir = () => setAlto(bloque.offsetHeight);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(bloque);
    return () => observador.disconnect();
  }, [paso, listo]);
  async function comprobarEmail(email) {
    emailActual.current = email;
    const r = await fetch('/api/registro/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(5000) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (emailActual.current !== email) return false;
    setErrorEmail(j?.ok === false ? j.error : '');
    return j?.ok !== false;
  }
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const form = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => {
    const bloque = form.current?.querySelector(`[data-paso="${paso}"]`);
    if (listo) enfocar((paso === 5 && bloque?.querySelector('h2')) || bloque?.querySelector('input') || bloque?.querySelector('button') || bloque?.querySelector('h2'));
  }, [listo, paso]);
  useEffect(() => { if (error) enfocar(errorRef.current); }, [error]);

  function comprobarPaso(n) {
    if (n === 2) {
      const datos = datosFiscalesRegistro({ ...fiscales, tipo });
      if (datos.error) { setError(datos.error); return false; }
    }
    const campos = form.current.querySelectorAll(`[data-paso="${n}"] input, [data-paso="${n}"] select`);
    for (const campo of campos) if (!campo.reportValidity()) return false;
    return true;
  }

  async function siguiente(e) {
    e.preventDefault();
    if (enviando || comprobando) return;
    setError('');
    if (!comprobarPaso(paso)) return;
    if (paso === 1) {
      if (!TIPOS[tipo]) { setError('Elige tu tipo de negocio.'); return; }
      if (!PLANES[tipo].some((p) => p.n === plan)) setPlan(PLANES[tipo].find((p) => p.fuerte)?.n || '');
    }
    if (paso === 3 && !PLANES[tipo]?.some((p) => p.n === plan)) { setError('Elige un plan.'); return; }
    if (paso === 4) {
      const d = new FormData(form.current);
      const validacion = validarContrasena(d.get('password'), { email: d.get('email'), nombre: d.get('nombre') });
      if (!validacion.ok) { setError(validacion.error); return; }
      setCuenta({ nombre: d.get('nombre'), email: d.get('email') });
      setComprobando(true);
      const ok = await comprobarEmail(d.get('email'));
      setComprobando(false);
      if (!ok) return;
    }
    if (paso < 5) cambiarPaso(paso + 1);
    else crear();
  }

  async function crear() {
    setEnviando(true);
    const d = new FormData(form.current);
    d.set('tipo', tipo); d.set('plan', plan); d.set('periodo', periodo);
    const r = await fetch('/api/registro', { method: 'POST', headers: { Accept: 'application/json' }, body: d }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (r?.ok) { irALaApp(); return; }
    setEnviando(false);
    setError(j?.error || 'No se ha podido crear la cuenta. Revisa la conexión.');
    if ([1, 2, 3, 4, 5].includes(j?.paso)) cambiarPaso(j.paso);
    else if (/nif|cif|hacienda|empresa|fiscal|postal|provincia/i.test(j?.error || '')) cambiarPaso(2);
    else if (/email|contraseña|nombre/i.test(j?.error || '')) cambiarPaso(4);
  }

  function campoFiscal(e) { setFiscales((antes) => ({ ...antes, [e.target.name]: e.target.value })); }
  const elegido = PLANES[tipo]?.find((p) => p.n === plan);

  if (!listo) return null;
  return (
    <form ref={form} className="registro" onSubmit={siguiente} noValidate aria-busy={enviando}>
      <h1><Logo className="logo-login" /></h1>
      <p className="registro-paso" aria-live="polite">Paso {paso} de 5</p>

      <div className="registro-progreso" aria-hidden>{[1, 2, 3, 4, 5].map((n) => <span key={n} className={paso >= n ? 'lleno' : ''} />)}</div>
      <div ref={contenido} className="registro-contenido" style={{ height: alto }}>
      <div hidden={paso !== 1} data-paso="1" className={`registro-bloque ${direccion > 0 ? 'registro-avanza' : 'registro-vuelve'}`}>
        <h2 className="login-titulo" tabIndex={-1}>¿Qué tipo de negocio tienes?</h2>
        <div className="registro-opciones" role="radiogroup" aria-label="Tipo de negocio">
          {Object.entries(TIPOS).map(([k, t]) => (
            <button key={k} type="button" role="radio" aria-checked={tipo === k} className={`registro-opcion${tipo === k ? ' elegida' : ''}`} onClick={() => setTipo(k)}>
              <strong>{t}</strong><small>{DETALLE[k]}</small>
            </button>
          ))}
        </div>
      </div>

      <div hidden={paso !== 2} data-paso="2" className={`registro-bloque ${direccion > 0 ? 'registro-avanza' : 'registro-vuelve'}`}>
        <h2 className="login-titulo" tabIndex={-1}>Datos fiscales</h2>
        <p className="nota">Escríbelos como aparecen en Hacienda. Comprobaremos el NIF y el nombre fiscal.</p>
        <label htmlFor="razon">{tipo === 'aut' ? 'Nombre y apellidos como en Hacienda' : 'Razón social'}</label>
        <input id="razon" name="razon" autoComplete={tipo === 'aut' ? 'name' : 'organization'} required maxLength={120} value={fiscales.razon} onChange={campoFiscal} />
        <label htmlFor="nif">{tipo === 'aut' ? 'NIF/NIE' : 'CIF'}</label>
        <input id="nif" name="nif" autoCapitalize="characters" autoCorrect="off" spellCheck={false} required maxLength={20} value={fiscales.nif} onChange={campoFiscal} />
        <label htmlFor="direccion">Dirección fiscal (calle y número)</label>
        <input id="direccion" name="direccion" autoComplete="address-line1" required maxLength={160} value={fiscales.direccion} onChange={campoFiscal} />
        <label htmlFor="cp">Código postal</label>
        <input id="cp" name="cp" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" required maxLength={5} value={fiscales.cp} onChange={campoFiscal} />
        <label htmlFor="ciudad">Ciudad</label>
        <input id="ciudad" name="ciudad" autoComplete="address-level2" required maxLength={80} value={fiscales.ciudad} onChange={campoFiscal} />
        <label htmlFor="provincia">Provincia</label>
        <select id="provincia" name="provincia" autoComplete="address-level1" required value={fiscales.provincia} onChange={campoFiscal}>
          <option value="">Elige una provincia</option>
          {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label htmlFor="telefono">Teléfono (opcional)</label>
        <input id="telefono" name="telefono" type="tel" autoComplete="tel" maxLength={30} value={fiscales.telefono} onChange={campoFiscal} />
      </div>

      <div hidden={paso !== 3} data-paso="3" className={`registro-bloque ${direccion > 0 ? 'registro-avanza' : 'registro-vuelve'}`}>
        <h2 className="login-titulo" tabIndex={-1}>Elige tu plan</h2>
        <p className="nota">{TIPOS[tipo]} · El primer mes es gratis. Podrás cambiar de plan cuando quieras.</p>
        <div className="registro-periodo" role="radiogroup" aria-label="Periodo de pago">
          <button type="button" role="radio" aria-checked={periodo === 'mes'} className={periodo === 'mes' ? 'elegida' : ''} onClick={() => setPeriodo('mes')}>Mensual</button>
          <button type="button" role="radio" aria-checked={periodo === 'anio'} className={periodo === 'anio' ? 'elegida' : ''} onClick={() => setPeriodo('anio')}>Anual (−{DESCUENTO} %)</button>
        </div>
        <div className="registro-opciones" role="radiogroup" aria-label="Plan">
          {(PLANES[tipo] || []).map((p) => (
            <button key={p.n} type="button" role="radio" aria-checked={plan === p.n} className={`registro-opcion registro-plan${plan === p.n ? ' elegida' : ''}`} onClick={() => setPlan(p.n)}>
              <span className="registro-plan-cab"><strong>{p.n}</strong>{p.fuerte && <em>Recomendado</em>}<b>{importe(periodo === 'anio' ? p.p * (100 - DESCUENTO) / 100 : p.p)} €<small>/mes</small></b></span>
              <small>{p.para}</small>
              {periodo === 'anio' && <small>{precio(p.p, periodo)} · Pago anual</small>}
            </button>
          ))}
        </div>
        <p className="nota">Precios sin IVA. Puedes ver todo lo que incluye cada plan en <a href="/precios" target="_blank" rel="noopener">Precios</a>.</p>
      </div>

      <div hidden={paso !== 4} data-paso="4" className={`registro-bloque ${direccion > 0 ? 'registro-avanza' : 'registro-vuelve'}`}>
        <h2 className="login-titulo" tabIndex={-1}>Tu cuenta</h2>
        <p className="nota">{PRUEBA_DIAS} días gratis con todo incluido. Sin tarjeta.</p>
        <BotonesSociales />
        <p className="separador"><span>o con tu email</span></p>
        <label htmlFor="nombre">Nombre</label>
        <input onChange={(e) => setCuenta((c) => ({ ...c, nombre: e.target.value }))} id="nombre" name="nombre" autoComplete="name" required maxLength={60} />
        <label htmlFor="email">Email</label>
        <input onChange={(e) => { emailActual.current = e.target.value; setCuenta((c) => ({ ...c, email: e.target.value })); setErrorEmail(''); }} onBlur={(e) => { if (e.target.validity.valid) comprobarEmail(e.target.value); }} aria-describedby="registro-email-error" id="email" name="email" type="email" autoComplete="email" required />
        <label htmlFor="password">Contraseña</label>
        <CampoPassword id="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="registro-seguridad" required />
        <div id="registro-seguridad" className="registro-seguridad" aria-live="polite">
          <div className="registro-fuerza" aria-hidden>{[1, 2, 3, 4].map((n) => <span key={n} className={seguridad.nivel >= n ? 'lleno' : ''} />)}</div>
          <p className="nota">{['Débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena'][seguridad.nivel]}</p>
          {seguridad.faltan.length > 0 && <ul>{seguridad.faltan.map((f) => <li key={f}>{f}</li>)}</ul>}
        </div>
        <p id="registro-email-error" className="error" role="status">{errorEmail}</p>
        {/* Trampa para bots: invisible para personas. */}
        <input name="web" tabIndex={-1} autoComplete="off" className="registro-trampa" aria-hidden />
      </div>

      <div hidden={paso !== 5} data-paso="5" className={`registro-bloque ${direccion > 0 ? 'registro-avanza' : 'registro-vuelve'}`}>
        <h2 className="login-titulo" tabIndex={-1}>Revisar y crear</h2>
        <dl className="registro-resumen">
          <dt>Tu cuenta</dt><dd>{cuenta.nombre}<br />{cuenta.email}</dd>
          <dt>{TIPOS[tipo]}</dt><dd>{fiscales.razon}<br />{fiscales.nif}</dd>
          <dt>Dirección fiscal</dt><dd>{fiscales.direccion}<br />{fiscales.cp} {fiscales.ciudad}<br />{fiscales.provincia}{fiscales.telefono && <><br />{fiscales.telefono}</>}</dd>
          <dt>Plan y periodo</dt><dd>{plan} · {periodo === 'anio' ? 'Anual' : 'Mensual'}<br />{elegido && precio(elegido.p, periodo)} sin IVA después de la prueba</dd>
        </dl>
        <p className="nota">30 días gratis, sin tarjeta.</p>
        <p className="nota">Te enviaremos un email para confirmar que es tuyo.</p>
        <label className="registro-acepto" htmlFor="acepto">
          <input id="acepto" name="acepto" type="checkbox" value="1" required />
          <span>Acepto las <a href="/condiciones" target="_blank" rel="noopener">condiciones</a> y la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a></span>
        </label>
      </div>

      </div>

      {error && <p ref={errorRef} className="error" role="alert" tabIndex={-1}>{error}</p>}
      <button type="submit" disabled={enviando || comprobando || (paso === 1 && !tipo) || (paso === 3 && !plan)}>
        {paso < 5 ? 'Continuar' : enviando ? 'Creando la cuenta…' : 'Crear cuenta'}
      </button>
      {paso > 1 && <button type="button" className="registro-atras" disabled={enviando || comprobando} onClick={() => { setError(''); cambiarPaso(paso - 1); }}>Atrás</button>}
      {paso === 1 && <p className="nota login-cambiar">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p>}
    </form>
  );
}
