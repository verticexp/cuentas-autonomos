'use client';

import { useEffect, useState } from 'react';
import { MARCA, entrarConFaceId, faceIdDisponible } from '@/lib/faceid';

// Botón «Entrar con Face ID» en el login; si ya se usó en este móvil, se lanza solo.
export default function EntrarFaceId() {
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');

  async function entrar() {
    setError('');
    try { await entrarConFaceId(); location.href = '/'; }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError(e.message); }
  }

  useEffect(() => {
    faceIdDisponible().then((ok) => {
      setVer(ok);
      if (ok && localStorage.getItem(MARCA) && !location.search.includes('salir')) entrar();
    });
  }, []);

  if (!ver) return null;
  return (
    <div className="entrar-faceid">
      <button type="button" className="boton-faceid" onClick={entrar}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16c1.5 1 4.5 1 6 0" /></svg>
        Entrar con Face ID
      </button>
      {error && <p className="error">{error}</p>}
      <p className="separador"><span>o con tu email</span></p>
    </div>
  );
}
