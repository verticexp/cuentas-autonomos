'use client';

import { useEffect, useState } from 'react';
import { MARCA, autofillDisponible, entrarConFaceId } from '@/lib/faceid';
import '@/app/login.css';

// «Entrar con llave de acceso» (Face ID, huella, Windows Hello o el móvil), y la llave en el autorrelleno del email.
// alEntrar(r): qué hacer al entrar. auto: en el dispositivo donde ya se usó, se lanza sola al abrir (como hasta ahora).
export default function EntrarLlave({ alEntrar = () => { location.href = '/'; }, auto = false }) {
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');

  async function entrar(autofill = false) {
    setError('');
    try { alEntrar(await entrarConFaceId({ autofill })); }
    catch (e) { if (!autofill && e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError(e.message); }
  }

  useEffect(() => {
    if (!window.PublicKeyCredential) return;
    setVer(true);
    if (auto && localStorage.getItem(MARCA) && !location.search.includes('salir')) entrar();
    else autofillDisponible().then((ok) => ok && entrar(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ver) return null;
  return (
    <div className="entrar-llave">
      <p className="separador"><span>o</span></p>
      <button type="button" className="boton-llave" onClick={() => entrar()}>
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></svg>
        Entrar con llave de acceso
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
