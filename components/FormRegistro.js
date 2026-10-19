'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BotonesSociales from '@/components/BotonesSociales';
import CampoPassword from '@/components/CampoPassword';
import Logo from '@/components/Logo';
import Link from '@/components/web/EnlacePublico';
import ProgresoAlta from '@/components/ProgresoAlta';
import { DESCUENTO, PLANES } from '@/components/web/datos';
import { datosFiscalesRegistro, PRUEBA_DIAS, PROVINCIAS, TIPOS, TIPOS_ALTA } from '@/lib/prueba';
import { irALaApp, useTrasArranque } from '@/lib/arranque';
import { validarContrasena } from '@/lib/contrasena';
import { ESCANEOS_MES } from '@/lib/cuotasIAConfig';

const DETALLE = { aut: 'Trabajas por tu cuenta, con o sin empleados', pym: 'Una sociedad con su equipo' };
const ETIQUETAS = ['Negocio', 'Datos fiscales', 'Plan', 'Cuenta', 'Revisar'];
const importe = (p) => p.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(p) ? 0 : 2, maximumFractionDigits: 2 });
const precio = (p, periodo) => periodo === 'anio' ? `${importe(p * 12 * (100 - DESCUENTO) / 100)} €/año` : `${importe(p)} €/mes`;
function enfocarVisible(elemento) {
  if (!elemento) return;
  elemento.focus({ preventScroll: true });
  const rect = elemento.getBoundingClientRect();
  const vista = window.visualViewport;
  const arriba = vista?.offsetTop || 0;
  if (rect.top < arriba + 16 || rect.bottom > arriba + (vista?.height || window.innerHeight) - 16) {
    elemento.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

// Los campos permanecen montados para conservar lo escrito al cambiar de paso.
export default function FormRegistro({ inicial = {} }) {
  const listo = useTrasArranque();
  const [paso, setPaso] = useState(1);
  const [tipo, setTipo] = useState(inicial.tipo || '');
  const [plan, setPlan] = useState(inicial.plan || '');
  const [periodo, setPeriodo] = useState(inicial.periodo === 'anio' ? 'anio' : 'mes');
  const [gestoria, setGestoria] = useState(inicial.gestoria || '');
  const [fiscales, setFiscales] = useState({ razon: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', telefono: '' });
  const [cuenta, setCuenta] = useState({});
  const [password, setPassword] = useState('');
  const [errorEmail, setErrorEmail] = useState('');
  const [comprobando, setComprobando] = useState(false);
  const [direccion, setDireccion] = useState(1);
  const pasoAnterior = useRef(paso);
  const conTeclado = useRef(false);
  const emailActual = useRef('');
  const seguridad = validarContrasena(password, cuenta);
  function atras() { if (enviando || comprobando) return; setError(null); cambiarPaso(paso - 1); }
  function cambiarPaso(n) { setDireccion(n > paso ? 1 : -1); setPaso(n); }
  useLayoutEffect(() => {
    const anterior = pasoAnterior.current;
    pasoAnterior.current = paso;
    const bloque = form.current?.querySelector(`[data-paso="${paso}"]`);
    // Solo un cambio real de paso anima; escribir y medir no reinician la entrada.
    if (!listo || anterior === paso || !bloque?.animate) return;
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducido.matches || conTeclado.current) return;
    const desplazar = !conTeclado.current && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const animacion = bloque.animate([
      { opacity: 0.7, transform: desplazar ? `translateX(${direccion * 6}px)` : 'none' },
      { opacity: 1, transform: 'none' },
    ], { duration: 180, easing: 'cubic-bezier(.23,1,.32,1)' });
    const cancelar = () => animacion.cancel();
    reducido.addEventListener('change', cancelar);
    return () => { cancelar(); reducido.removeEventListener('change', cancelar); };
  }, [paso, listo, direccion]);
  async function comprobarEmail(email, alContinuar = false) {
    emailActual.current = email;
    const r = await fetch('/api/registro/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), signal: AbortSignal.timeout(5000) }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (emailActual.current !== email) return false;
    setErrorEmail(j?.ok === false ? j.error : '');
    if (alContinuar && j?.ok === false) setError({ mensaje: j.error, campo: 'email' });
    return j?.ok !== false;
  }
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const form = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => {
    const bloque = form.current?.querySelector(`[data-paso="${paso}"]`);
    if (listo && !error) enfocarVisible(bloque?.querySelector('h2'));
  }, [listo, paso]);
  useEffect(() => { if (error) enfocarVisible(errorRef.current); }, [error, paso]);

  function accesibilidad(campo, descripcion) {
    const invalido = error?.campo === campo;
    return { 'aria-invalid': invalido || undefined, 'aria-describedby': [descripcion, invalido && 'registro-error'].filter(Boolean).join(' ') || undefined };
  }

  function comprobarPaso(n) {
    if (n === 2) {
      const datos = datosFiscalesRegistro({ ...fiscales, tipo });
      if (datos.error) { setError({ mensaje: datos.error, campo: datos.campo }); return false; }
    }
    const campos = form.current.querySelectorAll(`[data-paso="${n}"] input, [data-paso="${n}"] select`);
    for (const campo of campos) if (!campo.checkValidity()) {
      const etiqueta = campo.type === 'checkbox' ? 'Condiciones' : campo.labels?.[0]?.textContent;
      setError({ mensaje: `${etiqueta ? `${etiqueta}: ` : ''}${campo.validationMessage}`, campo: campo.name });
      return false;
    }
    return true;
  }

  async function siguiente(e) {
    e.preventDefault();
    if (enviando || comprobando) return;
    setError(null);
    if (!comprobarPaso(paso)) return;
    if (paso === 1) {
      if (!Object.hasOwn(TIPOS_ALTA, tipo)) { setError({ mensaje: 'Elige tu tipo de negocio.', campo: 'tipo' }); return; }
      if (!PLANES[tipo].some((p) => p.n === plan)) setPlan(PLANES[tipo].find((p) => p.fuerte)?.n || '');
    }
    if (paso === 3 && !PLANES[tipo]?.some((p) => p.n === plan)) { setError({ mensaje: 'Elige un plan.', campo: 'plan' }); return; }
    if (paso === 4) {
      const d = new FormData(form.current);
      const validacion = validarContrasena(d.get('password'), { email: d.get('email'), nombre: d.get('nombre') });
      if (!validacion.ok) { setError({ mensaje: validacion.error, campo: 'password' }); return; }
      setCuenta({ nombre: d.get('nombre'), email: d.get('email') });
      setComprobando(true);
      const ok = await comprobarEmail(d.get('email'), true);
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
    const mensaje = j?.error || 'No se ha podido crear la cuenta. Revisa la conexión.';
    const campo = /gestor[ií]a/i.test(mensaje) ? 'gestoria' : /nif|cif|hacienda/i.test(mensaje) ? 'nif' : /postal/i.test(mensaje) ? 'cp' : /provincia/i.test(mensaje) ? 'provincia' : /direcci[oó]n/i.test(mensaje) ? 'direccion' : /ciudad/i.test(mensaje) ? 'ciudad' : /tel[eé]fono/i.test(mensaje) ? 'telefono' : /fiscal|raz[oó]n social/i.test(mensaje) ? 'razon' : /email/i.test(mensaje) ? 'email' : /contraseña/i.test(mensaje) ? 'password' : /nombre/i.test(mensaje) ? 'nombre' : /condiciones/i.test(mensaje) ? 'acepto' : /periodo/i.test(mensaje) ? 'periodo' : /plan/i.test(mensaje) ? 'plan' : /tipo/i.test(mensaje) ? 'tipo' : undefined;
    setError({ mensaje, campo });
    if ([1, 2, 3, 4, 5].includes(j?.paso)) cambiarPaso(j.paso);
    else if (/nif|cif|hacienda|empresa|fiscal|postal|provincia/i.test(j?.error || '')) cambiarPaso(2);
    else if (/email|contraseña|nombre/i.test(j?.error || '')) cambiarPaso(4);
  }

  function campoFiscal(e) { setFiscales((antes) => ({ ...antes, [e.target.name]: e.target.value })); }
  const elegido = PLANES[tipo]?.find((p) => p.n === plan);

  return (
    <form ref={form} className="registro" onKeyDownCapture={() => { conTeclado.current = true; form.current.dataset.teclado = '1'; }} onPointerDownCapture={() => { conTeclado.current = false; delete form.current.dataset.teclado; }} onSubmit={siguiente} onChange={(e) => { if (error?.campo === e.target.name) setError(null); }} noValidate aria-busy={!listo || enviando || comprobando}>
      <h1><Logo className="logo-login" /></h1>
      <ProgresoAlta fase={1} paso={paso} total={5} etiqueta={ETIQUETAS[paso - 1]} atras={paso > 1 ? atras : undefined} ocupado={enviando || comprobando} />
      <div className="registro-contenido">
      <div hidden={paso !== 1} data-paso="1" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>¿Qué tipo de negocio tienes?</h2>
        <p className="nota registro-intro">Primero creamos tu cuenta. Después prepararemos tu negocio con sus actividades e impuestos.</p>
        <div className="registro-opciones" role="radiogroup" aria-label="Tipo de negocio">
          {Object.entries(TIPOS_ALTA).map(([k, t]) => (
            <label key={k} className={`registro-opcion${tipo === k ? ' elegida' : ''}`}>
              <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} {...accesibilidad('tipo')} />
              <span className="registro-opcion-texto"><strong>{t}</strong><small>{DETALLE[k]}</small></span>
            </label>
          ))}
        </div>
        <label htmlFor="gestoria">Código de tu gestoría (opcional)</label>
        <input id="gestoria" name="gestoria" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} value={gestoria} onChange={(e) => setGestoria(e.target.value)} {...accesibilidad('gestoria', 'registro-gestoria-ayuda')} />
        <p id="registro-gestoria-ayuda" className="nota">Con el código de tu gestoría tienes 3 meses gratis.</p>
      </div>

      <div hidden={paso !== 2} data-paso="2" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>Datos fiscales</h2>
        <p className="nota">Escríbelos como aparecen en Hacienda. Comprobaremos el NIF y el nombre fiscal.</p>
        <label htmlFor="razon">{tipo === 'aut' ? 'Nombre y apellidos como en Hacienda' : 'Razón social'}</label>
        <input id="razon" name="razon" autoComplete={tipo === 'aut' ? 'name' : 'organization'} required maxLength={120} value={fiscales.razon} onChange={campoFiscal} {...accesibilidad('razon')} />
        <label htmlFor="nif">{tipo === 'aut' ? 'NIF/NIE' : 'CIF'}</label>
        <input id="nif" name="nif" autoCapitalize="characters" autoCorrect="off" spellCheck={false} required maxLength={20} value={fiscales.nif} onChange={campoFiscal} {...accesibilidad('nif')} />
        <label htmlFor="direccion">Dirección fiscal (calle y número)</label>
        <input id="direccion" name="direccion" autoComplete="address-line1" required maxLength={160} value={fiscales.direccion} onChange={campoFiscal} {...accesibilidad('direccion')} />
        <label htmlFor="cp">Código postal</label>
        <input id="cp" name="cp" autoComplete="postal-code" inputMode="numeric" pattern="[0-9]{5}" required maxLength={5} value={fiscales.cp} onChange={campoFiscal} {...accesibilidad('cp')} />
        <label htmlFor="ciudad">Ciudad</label>
        <input id="ciudad" name="ciudad" autoComplete="address-level2" required maxLength={80} value={fiscales.ciudad} onChange={campoFiscal} {...accesibilidad('ciudad')} />
        <label htmlFor="provincia">Provincia</label>
        <select id="provincia" name="provincia" autoComplete="address-level1" required value={fiscales.provincia} onChange={campoFiscal} {...accesibilidad('provincia')}>
          <option value="">Elige una provincia</option>
          {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label htmlFor="telefono">Teléfono (opcional)</label>
        <input id="telefono" name="telefono" type="tel" autoComplete="tel" maxLength={30} value={fiscales.telefono} onChange={campoFiscal} {...accesibilidad('telefono')} />
      </div>

      <div hidden={paso !== 3} data-paso="3" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>Elige tu plan</h2>
        <p className="nota">{TIPOS[tipo]} · {gestoria.trim() ? 'Con un código de gestoría válido tienes 3 meses gratis.' : 'El primer mes es gratis.'} Podrás cambiar de plan cuando quieras.</p>
        <div className="registro-periodo" role="radiogroup" aria-label="Periodo de pago">
          <label className={periodo === 'mes' ? 'elegida' : ''}><input type="radio" name="periodo" value="mes" checked={periodo === 'mes'} onChange={() => setPeriodo('mes')} {...accesibilidad('periodo')} />Mensual</label>
          <label className={periodo === 'anio' ? 'elegida' : ''}><input type="radio" name="periodo" value="anio" checked={periodo === 'anio'} onChange={() => setPeriodo('anio')} {...accesibilidad('periodo')} />Anual (−{DESCUENTO} %)</label>
        </div>
        <div className="registro-opciones" role="radiogroup" aria-label="Plan">
          {(PLANES[tipo] || []).map((p) => (
            <label key={p.n} className={`registro-opcion registro-plan${plan === p.n ? ' elegida' : ''}`}>
              <input type="radio" name="plan" value={p.n} checked={plan === p.n} onChange={() => setPlan(p.n)} {...accesibilidad('plan')} />
              <span className="registro-opcion-texto">
              <span className="registro-plan-cab"><strong>{p.n}</strong>{p.fuerte && <em>Recomendado</em>}<b>{importe(periodo === 'anio' ? p.p * (100 - DESCUENTO) / 100 : p.p)} €<small>/mes</small></b></span>
              <small>{p.para}</small>
              <small>{ESCANEOS_MES[tipo]?.[p.n]?.toLocaleString('es-ES')} páginas de lectura IA al mes</small>
              {periodo === 'anio' && <small>{precio(p.p, periodo)} · Pago anual</small>}
              </span>
            </label>
          ))}
        </div>
        <p className="nota">Precios sin IVA. Puedes ver todo lo que incluye cada plan en <a href="/precios" target="_blank" rel="noopener">Precios</a>.</p>
        <p className="nota">La prueba tiene 50 páginas de lectura IA en total. Al empezar el periodo de pago se activa la cuota mensual indicada, también si eliges pago anual; se comparte por empresa con la gestoría, se renueva cada mes natural y no se acumula.</p>
      </div>

      <div hidden={paso !== 4} data-paso="4" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>Tu cuenta</h2>
        <p className="nota">{gestoria.trim() ? 'Con un código de gestoría válido tienes 3 meses gratis con todo incluido.' : `${PRUEBA_DIAS} días gratis con todo incluido.`} Sin tarjeta.</p>
        <BotonesSociales />
        <p className="separador"><span>o con tu email</span></p>
        <label htmlFor="nombre">Nombre</label>
        <input onChange={(e) => setCuenta((c) => ({ ...c, nombre: e.target.value }))} id="nombre" name="nombre" autoComplete="name" required maxLength={60} {...accesibilidad('nombre')} />
        <label htmlFor="email">Email</label>
        <input onChange={(e) => { emailActual.current = e.target.value; setCuenta((c) => ({ ...c, email: e.target.value })); setErrorEmail(''); }} onBlur={(e) => { if (e.target.validity.valid) comprobarEmail(e.target.value); }} id="email" name="email" type="email" autoComplete="email" required {...accesibilidad('email', errorEmail && error?.campo !== 'email' ? 'registro-email-error' : undefined)} aria-invalid={Boolean(errorEmail) || error?.campo === 'email' || undefined} />
        <p id="registro-email-error" className="error" role="status">{error?.campo !== 'email' && errorEmail}</p>
        <label htmlFor="password">Contraseña</label>
        <CampoPassword id="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} {...accesibilidad('password', 'registro-seguridad')} required />
        <div id="registro-seguridad" className="registro-seguridad" aria-live="polite">
          <div className="registro-fuerza" aria-hidden>{[1, 2, 3, 4].map((n) => <span key={n} className={seguridad.nivel >= n ? 'lleno' : ''} />)}</div>
          <p className="nota">{['Débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena'][seguridad.nivel]}</p>
          {seguridad.faltan.length > 0 && <ul>{seguridad.faltan.map((f) => <li key={f}>{f}</li>)}</ul>}
        </div>
        {/* Trampa para bots: invisible para personas. */}
        <input name="web" tabIndex={-1} autoComplete="off" className="registro-trampa" aria-hidden />
      </div>

      <div hidden={paso !== 5} data-paso="5" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>Revisar y crear</h2>
        <dl className="registro-resumen">
          <dt>Tu cuenta</dt><dd>{cuenta.nombre}<br />{cuenta.email}</dd>
          <dt>{TIPOS[tipo]}</dt><dd>{fiscales.razon}<br />{fiscales.nif}</dd>
          <dt>Dirección fiscal</dt><dd>{fiscales.direccion}<br />{fiscales.cp} {fiscales.ciudad}<br />{fiscales.provincia}{fiscales.telefono && <><br />{fiscales.telefono}</>}</dd>
          <dt>Plan y periodo</dt><dd>{plan} · {periodo === 'anio' ? 'Anual' : 'Mensual'}<br />{elegido && precio(elegido.p, periodo)} sin IVA después de la prueba</dd>
        </dl>
        <p className="nota">{gestoria.trim() ? 'Con un código de gestoría válido tienes 3 meses gratis, sin tarjeta.' : `${PRUEBA_DIAS} días gratis, sin tarjeta.`}</p>
        <p className="nota">Te enviaremos un email para confirmar que es tuyo.</p>
        <p className="nota registro-siguiente">Después de crear la cuenta, configuraremos las actividades y los impuestos de tu negocio.</p>
        <label className="registro-acepto" htmlFor="acepto">
          <input id="acepto" name="acepto" type="checkbox" value="1" required {...accesibilidad('acepto')} />
          <span>Acepto las <a href="/condiciones" target="_blank" rel="noopener">condiciones</a> y la <a href="/privacidad" target="_blank" rel="noopener">política de privacidad</a></span>
        </label>
      </div>

      </div>

      {error && <div id="registro-error" ref={errorRef} className="error registro-error" role="alert" tabIndex={-1}>
        <p>{error.mensaje}</p>
        {error.campo && <button type="button" className="registro-corregir" onClick={() => enfocarVisible(form.current?.querySelector(`[data-paso="${paso}"] [name="${error.campo}"]`))}>Revisar campo</button>}
      </div>}
      <button type="submit" disabled={enviando || comprobando || (paso === 1 && !tipo) || (paso === 3 && !plan)}>
        {comprobando ? 'Comprobando email…' : paso < 5 ? 'Continuar' : enviando ? 'Creando la cuenta…' : 'Crear cuenta'}
      </button>
      {paso > 1 && <button type="button" className="registro-atras" disabled={enviando || comprobando} onClick={atras}>Atrás</button>}
      {paso === 1 && <p className="nota">¿Llevas varias sociedades o un equipo mayor? <Link href="/business">Consulta Netto Business</Link>.</p>}
      {paso === 1 && <p className="nota login-cambiar">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p>}
    </form>
  );
}
