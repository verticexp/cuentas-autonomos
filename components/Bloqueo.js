'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MARCA, entrarConFaceId } from '@/lib/faceid';
import EntrarLlave from '@/components/EntrarLlave';
import Logo from '@/components/Logo';
import { entrada } from '@/lib/transicion';

// Bloqueo obligatorio: al abrir la app y al volver a ella, pide entrar como en cualquier app: email y contraseña,
// o llave de acceso (Face ID, huella, Windows Hello o el móvil).
// Sale ya pintado desde el servidor, así nunca se ve nada de la app antes de desbloquear.
export const ABIERTA = 'netto-abierta';
const OCULTA = 'netto-oculta';
const GRACIA = 10000; // menos de 10 s fuera (compartir un PDF, elegir una foto) no cuenta como cerrar la app

const marcarAbierta = () => { try { sessionStorage.setItem(ABIERTA, '1'); } catch {} };

export default function Bloqueo({ email }) {
  const [bloqueada, setBloqueada] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pass = useRef(null);

  const abrir = useCallback((animar = true) => {
    if (animar && document.documentElement.dataset.arranque === 'visto') entrada();
    marcarAbierta();
    document.documentElement.dataset.abierta = '1';
    setBloqueada(false);
    setError('');
  }, []);

  const faceId = useCallback(async () => {
    setError('');
    try { const r = await entrarConFaceId(); if (r?.cambio) { marcarAbierta(); location.reload(); } else abrir(); }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError(e.message); }
  }, [abrir]);

  const bloquear = useCallback(() => {
    try { sessionStorage.removeItem(ABIERTA); } catch {}
    delete document.documentElement.dataset.abierta;
    setBloqueada(true);
    if (localStorage.getItem(MARCA)) faceId();
  }, [faceId]);

  useEffect(() => {
    const recien = document.cookie.includes('recien=1');
    if (recien) document.cookie = 'recien=; path=/; max-age=0';
    if (recien || sessionStorage.getItem(ABIERTA)) abrir(recien);
    else bloquear();
    const cambio = () => {
      if (document.visibilityState === 'hidden') { sessionStorage.setItem(OCULTA, String(Date.now())); return; }
      const fuera = Date.now() - (Number(sessionStorage.getItem(OCULTA)) || Date.now());
      if (fuera > GRACIA) bloquear();
    };
    document.addEventListener('visibilitychange', cambio);
    return () => document.removeEventListener('visibilitychange', cambio);
  }, [abrir, bloquear]);

  // Con otra cuenta (otro email u otra llave), la página se recarga con sus datos.
  const entro = (otra) => { if (otra) { marcarAbierta(); location.reload(); } else abrir(); };

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
    <main className="login pantalla-bloqueo" role="dialog" aria-modal="true" aria-label="Iniciar sesión en Netto">
      <form onSubmit={entrar}>
        <h1><Logo className="logo-login" /></h1>
        <label htmlFor="bloqueo-email">Email</label>
        <input id="bloqueo-email" name="email" type="email" autoComplete="username webauthn" defaultValue={email} required />
        <label htmlFor="bloqueo-password">Contraseña</label>
        <input ref={pass} id="bloqueo-password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={enviando}>{enviando ? 'Comprobando…' : 'Entrar'}</button>
        <EntrarLlave alEntrar={(r) => entro(r?.cambio)} />
      </form>
    </main>
  );
}
