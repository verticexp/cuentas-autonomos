'use client';

import { useCallback, useEffect, useState } from 'react';
import { MARCA, entrarConFaceId } from '@/lib/faceid';

// Si Face ID está activado en este móvil, la app se bloquea al volver tras 5 minutos sin usarla.
const ESPERA = 5 * 60000;
const ACTIVO = 'cuentas-activo';

export default function Bloqueo({ usuario }) {
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
  return (
    <div className="pantalla-bloqueo" role="dialog" aria-modal="true" aria-label="App bloqueada">
      <div>
        <svg viewBox="0 0 24 24" aria-hidden className="icono-faceid"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16c1.5 1 4.5 1 6 0" /></svg>
        <h1>Netto</h1>
        {error && <p className="error">{error}</p>}
        <button type="button" className="boton" onClick={desbloquear}>Desbloquear con Face ID</button>
        <form method="post" action="/api/logout"><button className="enlace-claro">Entrar con contraseña</button></form>
      </div>
    </div>
  );
}
