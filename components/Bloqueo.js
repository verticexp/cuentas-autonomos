'use client';

import { useCallback, useEffect, useState } from 'react';
import { MARCA, entrarConFaceId } from '@/lib/faceid';
import Logo from '@/components/Logo';

// Si Face ID está activado en este móvil, la app se bloquea al volver tras 5 minutos sin usarla.
const ESPERA = 5 * 60000;
const ACTIVO = 'cuentas-activo';

export default function Bloqueo({ usuario, email }) {
  const [bloqueada, setBloqueada] = useState(false);
  const [error, setError] = useState('');

  const desbloquear = useCallback(async () => {
    setError('');
    try {
      await entrarConFaceId();
      localStorage.setItem(ACTIVO, String(Date.now()));
      setBloqueada(false);
    } catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError(e.message); }
  }, []);

  useEffect(() => {
    if (!localStorage.getItem(MARCA)) return undefined;
    const comprobar = () => {
      const ultima = Number(localStorage.getItem(ACTIVO)) || 0;
      if (Date.now() - ultima > ESPERA) { setBloqueada(true); desbloquear(); }
    };
    comprobar();
    const cambio = () => {
      if (document.visibilityState === 'hidden') localStorage.setItem(ACTIVO, String(Date.now()));
      else comprobar();
    };
    document.addEventListener('visibilitychange', cambio);
    return () => document.removeEventListener('visibilitychange', cambio);
  }, [usuario, desbloquear]);

  if (!bloqueada) return null;
  // Misma pantalla que el login: Face ID arriba y, si no, email y contraseña.
  return (
    <main className="login pantalla-bloqueo" role="dialog" aria-modal="true" aria-label="Entrar en Netto">
      <form method="post" action="/api/login" onSubmit={() => localStorage.setItem(ACTIVO, String(Date.now()))}>
        <h1><Logo className="logo-login" /></h1>
        <div className="entrar-faceid">
          <button type="button" className="boton-faceid" onClick={desbloquear}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16c1.5 1 4.5 1 6 0" /></svg>
            Entrar con Face ID
          </button>
          {error && <p className="error">{error}</p>}
          <p className="separador"><span>o con tu email</span></p>
        </div>
        <label htmlFor="bloqueo-email">Email</label>
        <input id="bloqueo-email" name="email" type="email" autoComplete="username" defaultValue={email} required />
        <label htmlFor="bloqueo-password">Contraseña</label>
        <input id="bloqueo-password" name="password" type="password" autoComplete="current-password" required />
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
