'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import EntrarLlave from '@/components/EntrarLlave';
import Logo from '@/components/Logo';
import PanelMarca from '@/components/PanelMarca';
import { entrada } from '@/lib/transicion';
import { enfocar, useTrasArranque } from '@/lib/arranque';

// Bloqueo obligatorio: al abrir la app y al volver a ella, pide entrar como en cualquier app: email y contraseña,
// o llave de acceso (Face ID, huella, Windows Hello o el móvil).
// Sale ya pintado desde el servidor, así nunca se ve nada de la app antes de desbloquear. El formulario (y la llave de
// acceso, que se lanza sola donde ya se usó) espera a que acabe la animación de inicio.
export const ABIERTA = 'netto-abierta';
const OCULTA = 'netto-oculta';
const GRACIA = 10000; // menos de 10 s fuera (compartir un PDF, elegir una foto) no cuenta como cerrar la app

const marcarAbierta = () => { try { sessionStorage.setItem(ABIERTA, '1'); } catch {} };
// Al servidor: bloqueada (deja de dar datos) o sigue en uso (alarga el desbloqueo). app/api/bloqueo.
const avisar = (accion) => fetch('/api/bloqueo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }) }).catch(() => {});
const SEGUIR = 5 * 60 * 1000;

// servidor: false si el servidor no la da por desbloqueada (entonces sale el bloqueo aunque el navegador diga que no).
export default function Bloqueo({ email, servidor = true }) {
  const [bloqueada, setBloqueada] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const pass = useRef(null);
  const listo = useTrasArranque();
  const router = useRouter();
  const [refrescando, refrescar] = useTransition();
  const [esperando, setEsperando] = useState(false);

  const abrir = useCallback((animar = true) => {
    if (animar && document.documentElement.dataset.arranque === 'visto') entrada();
    marcarAbierta();
    document.documentElement.dataset.abierta = '1';
    setBloqueada(false);
    setError('');
  }, []);

  const bloquear = useCallback(() => {
    try { sessionStorage.removeItem(ABIERTA); } catch {}
    delete document.documentElement.dataset.abierta;
    setBloqueada(true);
    avisar('bloquear');
  }, []);

  useEffect(() => {
    const recien = document.cookie.includes('recien=1');
    if (recien) document.cookie = 'recien=; path=/; max-age=0';
    if (servidor && (recien || sessionStorage.getItem(ABIERTA))) abrir(recien);
    else bloquear();
    const cambio = () => {
      if (document.visibilityState === 'hidden') { sessionStorage.setItem(OCULTA, String(Date.now())); return; }
      const fuera = Date.now() - (Number(sessionStorage.getItem(OCULTA)) || Date.now());
      if (fuera > GRACIA) bloquear();
    };
    document.addEventListener('visibilitychange', cambio);
    // components/RecargarBloqueo.js: se ha llegado a /bloqueo navegando dentro de la app → bloqueo encima.
    window.addEventListener('netto-bloquear', bloquear);
    const seguir = setInterval(() => { if (document.visibilityState === 'visible' && sessionStorage.getItem(ABIERTA)) avisar('seguir'); }, SEGUIR);
    return () => { document.removeEventListener('visibilitychange', cambio); window.removeEventListener('netto-bloquear', bloquear); clearInterval(seguir); };
  }, [abrir, bloquear]); // servidor: solo cuenta al abrir (si se vuelve a evaluar tras desbloquear, bloquearía otra vez)

  useEffect(() => { if (bloqueada && listo) enfocar(pass.current); }, [bloqueada, listo]);

  // Al desbloquear, la pantalla se agranda y se desvanece mientras el resumen de detrás sube en cascada (app/entrar.css).
  const salir = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { abrir(); return; }
    marcarAbierta();
    setSaliendo(true);
    entrada();
    setTimeout(() => { setSaliendo(false); abrir(false); }, 560);
  };

  // Con otra cuenta (otro email u otra llave), la página se recarga con sus datos.
  // En /bloqueo (el servidor no dio datos), se recarga y el servidor la devuelve a la página de antes.
  // Si no, refresh: olvida lo que el navegador guardó mientras estaba bloqueada (redirecciones a /bloqueo), o se queda cargando.
  // Si no, sin recargar (una recarga es un fundido entre documentos, lento y con la barra «fantasma»): olvida lo guardado
  // mientras estaba bloqueada, en /bloqueo va a la página de antes, y cuando llega sale el bloqueo con su animación.
  const entro = (otra) => {
    if (otra) { marcarAbierta(); location.reload(); return; }
    const a = new URLSearchParams(location.search).get('a') || '/';
    const destino = location.pathname !== '/bloqueo' ? null : /^\/(?![/\\])/.test(a) && !a.startsWith('/bloqueo') ? a : '/';
    setEsperando(true);
    refrescar(() => { router.refresh(); if (destino) router.replace(destino); });
  };
  // Sale cuando ya está la página de verdad (no el esqueleto de app/loading.js), como mucho 2 s después.
  useEffect(() => {
    if (!esperando || refrescando) return undefined;
    const hasta = Date.now() + 2000;
    let f;
    const mirar = () => {
      if (document.querySelector('main.cargando') && Date.now() < hasta) { f = requestAnimationFrame(mirar); return; }
      setEsperando(false); salir();
    };
    mirar();
    return () => cancelAnimationFrame(f);
  }, [esperando, refrescando]); // eslint-disable-line react-hooks/exhaustive-deps

  async function entrar(e) {
    e.preventDefault();
    const otra = new FormData(e.currentTarget).get('email').trim().toLowerCase() !== email.toLowerCase();
    setEnviando(true); setError('');
    const r = await fetch('/api/login', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(e.currentTarget) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setEnviando(false);
    if (r?.ok) { pass.current.value = ''; entro(otra); } else setError(d?.error || 'No se ha podido comprobar. Revisa la conexión.');
  }

  if (!bloqueada) return null;
  return (
    <main className={`login pantalla-bloqueo${saliendo ? ' saliendo' : ''}`} role="dialog" aria-modal="true" aria-label="Iniciar sesión en Netto">
      <PanelMarca />
      {listo && <form onSubmit={entrar} className="form-entrar">
        <h1><Logo className="logo-login" /></h1>
        <p className="login-titulo">Desbloquea Netto</p>
        <label htmlFor="bloqueo-email">Email</label>
        <input id="bloqueo-email" name="email" type="email" autoComplete="username webauthn" defaultValue={email} required />
        <label htmlFor="bloqueo-password">Contraseña</label>
        <input ref={pass} id="bloqueo-password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={enviando || saliendo}>{saliendo ? 'Dentro' : enviando ? 'Comprobando…' : 'Entrar'}</button>
        <EntrarLlave auto alEntrar={(r) => entro(r?.cambio)} />
      </form>}
    </main>
  );
}
