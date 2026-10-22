'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import BotonesSociales from '@/components/BotonesSociales';
import CampoPassword from '@/components/CampoPassword';
import Logo from '@/components/Logo';
import Link from '@/components/web/EnlacePublico';
import ProgresoAlta from '@/components/ProgresoAlta';
import usePasosEnHistorial from '@/components/usePasosEnHistorial';
import { DESCUENTO, PLANES } from '@/components/web/datos';
import { datosFiscalesRegistro, PRUEBA_DIAS, PROVINCIAS, provinciaDeCp, TIPOS, TIPOS_ALTA } from '@/lib/prueba';
import { irALaApp, useTrasArranque } from '@/lib/arranque';
import { validarContrasena } from '@/lib/contrasena';

const DETALLE = { aut: 'Trabajas por tu cuenta, con o sin empleados', pym: 'Una sociedad con su equipo' };
// Orden del alta: primero la cuenta (lo más rápido), luego el negocio, los datos fiscales y revisar. El plan no se pide:
// la prueba lleva todo incluido y se elige al acabarla (Ajustes › Tu plan); se guarda el recomendado o el que se trajo
// de Precios. Con sesión (otra empresa para la misma cuenta) se empieza en el paso 2.
const ETIQUETAS = ['Tu cuenta', 'Negocio', 'Datos fiscales', 'Revisar'];
const PASO = { cuenta: 1, negocio: 2, fiscal: 3, revisar: 4 };
// El servidor numera sus pasos con el orden de antes (1 negocio, 2 fiscal, 3 plan y código, 4 cuenta, 5 condiciones).
const DEL_SERVIDOR = { 1: PASO.negocio, 2: PASO.fiscal, 3: PASO.revisar, 4: PASO.cuenta, 5: PASO.revisar };
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
// sesion: { nombre, email } si ya tiene cuenta y añade otra empresa: se salta el paso de la cuenta (1).
// recomendacion: { codigo, nombre } si llega con el enlace de otra empresa (lib/recomendaciones.js): 2 meses gratis.
export default function FormRegistro({ inicial = {}, sesion = null, recomendacion = null }) {
  const listo = useTrasArranque();
  const primero = sesion ? PASO.negocio : PASO.cuenta;
  const [paso, setPaso] = useState(primero);
  const [tipo, setTipo] = useState(inicial.tipo || '');
  const [plan, setPlan] = useState(inicial.plan || '');
  // La provincia se rellena con el código postal mientras no la elija la persona.
  const provinciaAuto = useRef(true);
  const [periodo] = useState(inicial.periodo === 'anio' ? 'anio' : 'mes');
  const [codigo, setCodigo] = useState(inicial.codigo || '');
  // Código promocional (lib/codigoPromocional.js): de una gestoría o de otra empresa; va plegado en el paso del plan.
  // promo: { codigo, texto, dias } cuando el servidor lo ha dado por bueno.
  const [verCodigo, setVerCodigo] = useState(Boolean(inicial.codigo));
  const [promo, setPromo] = useState(null);
  const codigoActual = useRef('');
  const [fiscales, setFiscales] = useState({ razon: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', telefono: '' });
  const [cuenta, setCuenta] = useState(sesion || {});
  const [password, setPassword] = useState('');
  const [errorEmail, setErrorEmail] = useState('');
  const [comprobando, setComprobando] = useState(false);
  const [direccion, setDireccion] = useState(1);
  const pasoAnterior = useRef(paso);
  const conTeclado = useRef(false);
  const emailActual = useRef('');
  const seguridad = validarContrasena(password, cuenta);
  function atras() { if (enviando || comprobando) return; setError(null); historial.atras(); }
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
  async function comprobarCodigo(texto, alContinuar = false, avisar = true) {
    const valor = texto.trim();
    codigoActual.current = valor;
    if (!valor) { setPromo(null); return true; }
    const r = await fetch('/api/registro/codigo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ codigo: valor }), signal: AbortSignal.timeout(5000) }).catch(() => null);
    const j = r?.ok || r?.status === 429 ? await r.json().catch(() => null) : null;
    if (codigoActual.current !== valor) return false;
    // Sin respuesta (red caída) no se bloquea: el alta lo vuelve a comprobar.
    setPromo(j?.ok ? { codigo: valor, texto: j.texto, dias: j.dias } : null);
    if (j?.ok === false && avisar) setError({ mensaje: j.error, campo: 'codigo' });
    return j?.ok !== false || !alContinuar;
  }
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const form = useRef(null);
  const errorRef = useRef(null);
  const pasoVisto = useRef(paso);
  const historial = usePasosEnHistorial({
    paso, base: primero, total: PASO.revisar + 1, bloqueado: enviando || comprobando,
    cambiarPaso,
  });

  useEffect(() => {
    const bloque = form.current?.querySelector(`[data-paso="${paso}"]`);
    // Cada paso empieza arriba (con el progreso a la vista), no a media página donde quedó el anterior.
    if (listo && pasoVisto.current !== paso) { pasoVisto.current = paso; window.scrollTo({ top: 0, behavior: 'instant' }); }
    if (listo && !error) enfocarVisible(bloque?.querySelector('h2'));
  }, [listo, paso]);
  useEffect(() => { if (error) enfocarVisible(errorRef.current); }, [error, paso]);
  useEffect(() => { if (inicial.codigo && !recomendacion) comprobarCodigo(inicial.codigo, false, false); }, []); // el que llega por la URL

  function accesibilidad(campo, descripcion) {
    const invalido = error?.campo === campo;
    return { 'aria-invalid': invalido || undefined, 'aria-describedby': [descripcion, invalido && 'registro-error'].filter(Boolean).join(' ') || undefined };
  }

  function comprobarPaso(n) {
    if (n === PASO.fiscal) {
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
    if (paso === PASO.cuenta) {
      const d = new FormData(form.current);
      const validacion = validarContrasena(d.get('password'), { email: d.get('email'), nombre: d.get('nombre') });
      if (!validacion.ok) { setError({ mensaje: validacion.error, campo: 'password' }); return; }
      setCuenta({ nombre: d.get('nombre'), email: d.get('email') });
      setComprobando(true);
      const ok = await comprobarEmail(d.get('email'), true);
      setComprobando(false);
      if (!ok) return;
    }
    if (paso === PASO.negocio) {
      if (!Object.hasOwn(TIPOS_ALTA, tipo)) { setError({ mensaje: 'Elige tu tipo de negocio.', campo: 'tipo' }); return; }
      if (!PLANES[tipo].some((p) => p.n === plan)) setPlan(PLANES[tipo].find((p) => p.fuerte)?.n || '');
      // Un autónomo factura con su nombre: se propone el de la cuenta (se puede cambiar).
      if (tipo === 'aut' && !fiscales.razon.trim() && cuenta.nombre) setFiscales((antes) => ({ ...antes, razon: String(cuenta.nombre).trim() }));
    }
    if (paso === PASO.revisar) {
      if (codigo.trim() && promo?.codigo !== codigo.trim()) {
        setComprobando(true);
        const ok = await comprobarCodigo(codigo, true);
        setComprobando(false);
        if (!ok) return;
      }
      crear();
      return;
    }
    historial.avanzar(paso + 1);
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
    const campo = /recomendaci[oó]n/i.test(mensaje) ? undefined : /promocional|c[oó]digo de recomendaci[oó]n/i.test(mensaje) ? 'codigo' : /nif|cif|hacienda/i.test(mensaje) ? 'nif' : /postal/i.test(mensaje) ? 'cp' : /provincia/i.test(mensaje) ? 'provincia' : /direcci[oó]n/i.test(mensaje) ? 'direccion' : /ciudad/i.test(mensaje) ? 'ciudad' : /tel[eé]fono/i.test(mensaje) ? 'telefono' : /fiscal|raz[oó]n social/i.test(mensaje) ? 'razon' : /email/i.test(mensaje) ? 'email' : /contraseña/i.test(mensaje) ? 'password' : /nombre/i.test(mensaje) ? 'nombre' : /condiciones/i.test(mensaje) ? 'acepto' : /periodo/i.test(mensaje) ? 'periodo' : /plan/i.test(mensaje) ? 'plan' : /tipo/i.test(mensaje) ? 'tipo' : undefined;
    setError({ mensaje, campo });
    const destino = DEL_SERVIDOR[j?.paso] || (/nif|cif|hacienda|empresa|fiscal|postal|provincia/i.test(j?.error || '') ? PASO.fiscal : /email|contraseña|nombre/i.test(j?.error || '') ? PASO.cuenta : null);
    if (destino && destino >= primero) historial.saltar(destino);
  }

  function campoFiscal(e) {
    const { name, value } = e.target;
    if (name === 'provincia') provinciaAuto.current = !value;
    setFiscales((antes) => {
      const nuevos = { ...antes, [name]: value };
      if (name === 'cp' && provinciaAuto.current && provinciaDeCp(value)) nuevos.provincia = provinciaDeCp(value);
      return nuevos;
    });
  }
  const elegido = PLANES[tipo]?.find((p) => p.n === plan);
  const desde = PLANES[tipo] ? Math.min(...PLANES[tipo].map((p) => p.p)) : null;
  const total = sesion ? 3 : 4;
  // Días de prueba distintos del normal: 90 con código de gestoría, 60 recomendado (enlace o código).
  const gratis = promo?.dias || (recomendacion ? 60 : 0);

  return (
    <form ref={form} className="registro" onKeyDownCapture={() => { conTeclado.current = true; form.current.dataset.teclado = '1'; }} onPointerDownCapture={() => { conTeclado.current = false; delete form.current.dataset.teclado; }} onSubmit={siguiente} onChange={(e) => { if (error?.campo === e.target.name) setError(null); }} noValidate aria-busy={!listo || enviando || comprobando}>
      <h1><Logo className="logo-login" /></h1>
      <ProgresoAlta paso={paso - primero + 1} total={total} etiqueta={ETIQUETAS[paso - 1]} />
      <div className="registro-contenido">
      {!sesion && <div hidden={paso !== PASO.cuenta} data-paso="1" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>Crea tu cuenta</h2>
        <p className="nota">{gratis === 90 ? '3 meses gratis con todo incluido, con tu código.' : gratis ? '2 meses gratis con todo incluido, por venir recomendado.' : `${PRUEBA_DIAS} días gratis con todo incluido.`} Sin tarjeta.</p>
        <BotonesSociales />
        <p className="separador solo-web"><span>o con tu email</span></p>
        <label htmlFor="nombre">Tu nombre</label>
        <input onChange={(e) => setCuenta((c) => ({ ...c, nombre: e.target.value }))} id="nombre" name="nombre" autoComplete="name" required maxLength={60} {...accesibilidad('nombre')} />
        <label htmlFor="email">Email</label>
        <input onChange={(e) => { emailActual.current = e.target.value; setCuenta((c) => ({ ...c, email: e.target.value })); setErrorEmail(''); }} onBlur={(e) => { if (e.target.validity.valid) comprobarEmail(e.target.value); }} id="email" name="email" type="email" autoComplete="email" required {...accesibilidad('email', errorEmail && error?.campo !== 'email' ? 'registro-email-error' : undefined)} aria-invalid={Boolean(errorEmail) || error?.campo === 'email' || undefined} />
        <p id="registro-email-error" className="error" role="status">{error?.campo !== 'email' && errorEmail}</p>
        <label htmlFor="password">Contraseña</label>
        <CampoPassword id="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} {...accesibilidad('password', 'registro-seguridad')} required />
        {/* Con el campo vacío solo se enseñan las reglas, sin «Débil» en rojo antes de escribir nada. */}
        <div id="registro-seguridad" className={`registro-seguridad${password ? '' : ' vacia'}`} aria-live="polite">
          {password && <div className="registro-fuerza" aria-hidden>{[1, 2, 3, 4].map((n) => <span key={n} className={seguridad.nivel >= n ? 'lleno' : ''} />)}</div>}
          {password && <p className="nota">{['Débil', 'Débil', 'Aceptable', 'Buena', 'Muy buena'][seguridad.nivel]}</p>}
          {seguridad.faltan.length > 0 && <ul>{seguridad.faltan.map((f) => <li key={f}>{f}</li>)}</ul>}
        </div>
        {/* Trampa para bots: invisible para personas. */}
        <input name="web" tabIndex={-1} autoComplete="off" className="registro-trampa" aria-hidden />
      </div>}

      <div hidden={paso !== PASO.negocio} data-paso="2" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>¿Qué tipo de negocio tienes?</h2>
        <p className="nota registro-intro">{sesion ? `Vas a añadir otra empresa a tu cuenta (${sesion.email}). Tendrá su propio plan y su prueba gratis.` : 'Con esto preparamos tus impuestos y tus facturas.'}</p>
        <div className="registro-opciones" role="radiogroup" aria-label="Tipo de negocio">
          {Object.entries(TIPOS_ALTA).map(([k, t]) => (
            <label key={k} className={`registro-opcion${tipo === k ? ' elegida' : ''}`}>
              <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} {...accesibilidad('tipo')} />
              <span className="registro-opcion-texto"><strong>{t}</strong><small>{DETALLE[k]}</small></span>
            </label>
          ))}
        </div>
        {recomendacion && <>
          <input type="hidden" name="ref" value={recomendacion.codigo} />
          <p className="nota registro-recomendacion">Te recomienda <strong>{recomendacion.nombre}</strong>: tienes 2 meses gratis en lugar de uno.</p>
        </>}
        <p className="nota">¿Llevas varias sociedades o un equipo mayor? <Link href="/business">Consulta Fisquo Business</Link>.</p>
      </div>

      <div hidden={paso !== PASO.fiscal} data-paso="3" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>Datos fiscales</h2>
        <p className="nota">Escríbelos como aparecen en Hacienda: salen en tus facturas. Comprobaremos el NIF y el nombre fiscal.</p>
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
        <input id="telefono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={fiscales.telefono} onChange={campoFiscal} {...accesibilidad('telefono')} />
      </div>

      <div hidden={paso !== PASO.revisar} data-paso="4" className="registro-bloque">
        <h2 className="login-titulo" tabIndex={-1}>Revisar y crear</h2>
        <dl className="registro-resumen">
          <dt>Tu cuenta</dt><dd>{cuenta.nombre}<br />{cuenta.email}</dd>
          <dt>{TIPOS[tipo]}</dt><dd>{fiscales.razon}<br />{fiscales.nif}</dd>
          <dt>Dirección fiscal</dt><dd>{fiscales.direccion}<br />{fiscales.cp} {fiscales.ciudad}<br />{fiscales.provincia}{fiscales.telefono && <><br />{fiscales.telefono}</>}</dd>
          <dt>Prueba</dt><dd>{gratis === 90 ? '3 meses gratis con tu código' : gratis ? '2 meses gratis por venir recomendado' : `${PRUEBA_DIAS} días gratis`}, con todo incluido y sin tarjeta.<br />
            {inicial.plan && elegido ? `Después, plan ${plan} (${precio(elegido.p, periodo)} sin IVA). Podrás cambiarlo cuando quieras.` : desde !== null ? `Al acabar eliges tu plan, desde ${importe(desde)} €/mes sin IVA.` : ''}</dd>
        </dl>
        {!recomendacion && (verCodigo ? <div className="registro-codigo">
          <label htmlFor="codigo">Código promocional</label>
          <input id="codigo" name="codigo" autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} value={codigo} onChange={(e) => { setCodigo(e.target.value); setPromo(null); }} onBlur={(e) => comprobarCodigo(e.target.value)} {...accesibilidad('codigo', 'registro-codigo-ayuda')} />
          <p id="registro-codigo-ayuda" className={promo ? 'nota registro-recomendacion' : 'nota'} role="status">{promo ? promo.texto : 'El de tu gestoría te da 3 meses gratis; el de otro cliente de Fisquo, 2.'}</p>
        </div> : <button type="button" className="registro-corregir registro-ver-codigo" aria-expanded="false" onClick={() => { setVerCodigo(true); requestAnimationFrame(() => document.getElementById('codigo')?.focus()); }}>¿Tienes un código promocional?</button>)}
        <p className="nota">La prueba incluye la lectura con IA de 50 páginas (tickets o facturas). Lo que incluye cada plan, en <a href="/precios" target="_blank" rel="noopener">Precios</a>.</p>
        {!sesion && <p className="nota">Te enviaremos un email para confirmar que es tuyo.</p>}
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
      <button type="submit" disabled={enviando || comprobando || (paso === PASO.negocio && !tipo)}>
        {comprobando ? (paso === PASO.cuenta ? 'Comprobando email…' : 'Comprobando…') : paso < PASO.revisar ? 'Continuar' : enviando ? 'Creando…' : sesion ? 'Crear empresa' : 'Crear cuenta'}
      </button>
      {paso === PASO.negocio && !tipo && <p className="nota registro-falta" id="registro-falta">Elige una opción para seguir.</p>}
      {paso > primero && <button type="button" className="registro-atras" disabled={enviando || comprobando} onClick={atras}>Atrás</button>}
      {paso === primero && (sesion ? <p className="nota login-cambiar"><a href="/ajustes">Volver a Fisquo</a></p> : <p className="nota login-cambiar">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p>)}
    </form>
  );
}
