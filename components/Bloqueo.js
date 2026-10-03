'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MARCA, entrarConFaceId, faceIdDisponible } from '@/lib/faceid';
import Logo from '@/components/Logo';
import { entrada } from '@/lib/transicion';

// Bloqueo obligatorio: al abrir la app y al volver a ella, pide Face ID (o huella / Windows Hello) o la contraseña.
// Sale ya pintado desde el servidor, así nunca se ve nada de la app antes de desbloquear.
export const ABIERTA = 'netto-abierta';
const OCULTA = 'netto-oculta';
const GRACIA = 10000; // menos de 10 s fuera (compartir un PDF, elegir una foto) no cuenta como cerrar la app

const marcarAbierta = () => { try { sessionStorage.setItem(ABIERTA, '1'); } catch {} };

export default function Bloqueo({ email }) {
  const [bloqueada, setBloqueada] = useState(true);
  const [conFaceId, setConFaceId] = useState(false);
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
    try { await entrarConFaceId(); abrir(); }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError(e.message); }
  }, [abrir]);

  const bloquear = useCallback(() => {
    try { sessionStorage.removeItem(ABIERTA); } catch {}
    delete document.documentElement.dataset.abierta;
    setBloqueada(true);
    if (localStorage.getItem(MARCA)) faceId();
  }, [faceId]);

  useEffect(() => {
    faceIdDisponible().then((ok) => setConFaceId(ok && Boolean(localStorage.getItem(MARCA))));
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

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true); setError('');
    const r = await fetch('/api/login', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(e.currentTarget) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    setEnviando(false);
    if (r?.ok) { pass.current.value = ''; abrir(); } else setError(d?.error || 'No se ha podido comprobar. Revisa la conexión.');
  }

  if (!bloqueada) return null;
  return (
    <main className="login pantalla-bloqueo" role="dialog" aria-modal="true" aria-label="Desbloquear Netto">
      <form onSubmit={entrar}>
        <h1><Logo className="logo-login" /></h1>
        <p className="nota">Tus cuentas están protegidas. Desbloquea para entrar.</p>
        {conFaceId && (
          <div className="entrar-faceid">
            <button type="button" className="boton-faceid" onClick={faceId}>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16c1.5 1 4.5 1 6 0" /></svg>
              Desbloquear con Face ID
            </button>
            <p className="separador"><span>o con tu contraseña</span></p>
          </div>
        )}
        <input type="hidden" name="email" value={email} />
        <p className="bloqueo-quien">{email}</p>
        <label htmlFor="bloqueo-password">Contraseña</label>
        <input ref={pass} id="bloqueo-password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={enviando}>{enviando ? 'Comprobando…' : 'Desbloquear'}</button>
      </form>
      <form method="post" action="/api/logout" className="bloqueo-salir"><button className="enlace-claro">No soy yo · cerrar sesión</button></form>
    </main>
  );
}
