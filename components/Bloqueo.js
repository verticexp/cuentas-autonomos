'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

export default function Bloqueo({ email }) {
  const [bloqueada, setBloqueada] = useState(true);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const pass = useRef(null);
  const listo = useTrasArranque();

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
  }, []);

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

  useEffect(() => { if (bloqueada && listo) enfocar(pass.current); }, [bloqueada, listo]);

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
      <PanelMarca />
      {listo && <form onSubmit={entrar} className="form-entrar">
        <h1><Logo className="logo-login" /></h1>
        <p className="login-titulo">Desbloquea Netto</p>
        <label htmlFor="bloqueo-email">Email</label>
        <input id="bloqueo-email" name="email" type="email" autoComplete="username webauthn" defaultValue={email} required />
        <label htmlFor="bloqueo-password">Contraseña</label>
        <input ref={pass} id="bloqueo-password" name="password" type="password" autoComplete="current-password" required />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={enviando}>{enviando ? 'Comprobando…' : 'Entrar'}</button>
        <EntrarLlave auto alEntrar={(r) => entro(r?.cambio)} />
      </form>}
    </main>
  );
}
