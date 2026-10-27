'use client';

import { useEffect, useState } from 'react';
import { MARCA, autofillDisponible, entrarConFaceId } from '@/lib/faceid';
import { nombreBiometria } from '@/lib/biometria';
import { useT } from '@/components/Idioma';
import '@/app/login.css';

// «Entrar con Face ID» (o Touch ID, huella, Windows Hello: lib/biometria.js), y la llave en el autorrelleno del email.
// En la app de iOS funciona con el dominio asociado (webcredentials en App.entitlements y apple-app-site-association).
// alEntrar(r): qué hacer al entrar. auto: en el dispositivo donde ya se usó, se lanza sola al abrir (como hasta ahora).
export default function EntrarLlave({ alEntrar = () => { location.href = '/'; }, auto = false }) {
  const tr = useT();
  const [ver, setVer] = useState(false);
  const [nombre, setNombre] = useState('llave de acceso');
  const [error, setError] = useState('');

  async function entrar(autofill = false) {
    setError('');
    try { alEntrar(await entrarConFaceId({ autofill })); }
    catch (e) { if (!autofill && e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError(e.message); }
  }

  useEffect(() => {
    if (!window.PublicKeyCredential) return;
    setNombre(nombreBiometria(navigator.userAgent));
    setVer(true);
    if (auto && localStorage.getItem(MARCA) && !location.search.includes('salir')) entrar();
    else autofillDisponible().then((ok) => ok && entrar(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ver) return null;
  return (
    <div className="entrar-llave">
      <p className="separador"><span>{tr('o')}</span></p>
      <button type="button" className="boton-llave" onClick={() => entrar()}>
        <svg viewBox="0 0 24 24" aria-hidden><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></svg>
        {tr('Entrar con {nombre}', { nombre: tr(nombre) })}
      </button>
      {error && <p className="error" role="alert">{tr(error)}</p>}
    </div>
  );
}
