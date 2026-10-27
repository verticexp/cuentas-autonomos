'use client';

import { useEffect, useState } from 'react';
import { MARCA, autofillDisponible, entrarConFaceId } from '@/lib/faceid';
import { nombreBiometria } from '@/lib/biometria';
import { entrarNativo, estadoNativo, hayNativo, nombreTipo } from '@/lib/faceidNativo';
import '@/app/login.css';

// «Entrar con Face ID» (o Touch ID, huella, Windows Hello: lib/biometria.js), y la llave en el autorrelleno del email.
// En la app de iOS, Face ID nativo (lib/faceidNativo.js) en lugar de las llaves de acceso: solo sale si está activado
// en este iPhone, y con auto se lanza solo al abrir, como en la app de un banco.
// alEntrar(r): qué hacer al entrar. auto: en el dispositivo donde ya se usó, se lanza sola al abrir (como hasta ahora).
export default function EntrarLlave({ alEntrar = () => { location.href = '/'; }, auto = false }) {
  const [ver, setVer] = useState(false);
  const [nombre, setNombre] = useState('llave de acceso');
  const [error, setError] = useState('');

  const [nativo, setNativo] = useState(false);

  async function entrar(autofill = false) {
    setError('');
    if (nativo) {
      try { const r = await entrarNativo(); if (r) alEntrar(r); }
      catch (e) { setError(e.message); }
      return;
    }
    try { alEntrar(await entrarConFaceId({ autofill })); }
    catch (e) { if (!autofill && e.name !== 'NotAllowedError' && e.name !== 'AbortError') setError(e.message); }
  }

  useEffect(() => {
    if (hayNativo()) {
      estadoNativo().then((e) => {
        if (!e?.disponible || !e.tiene) return;
        setNombre(nombreTipo(e.tipo)); setNativo(true); setVer(true);
        if (auto && !location.search.includes('salir')) entrarNativo().then((r) => r && alEntrar(r)).catch((x) => setError(x.message));
      });
      return;
    }
    if (!window.PublicKeyCredential) return;
    setNombre(nombreBiometria(navigator.userAgent));
    setVer(true);
    if (auto && localStorage.getItem(MARCA) && !location.search.includes('salir')) entrar();
    else autofillDisponible().then((ok) => ok && entrar(true));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ver) return null;
  return (
    <div className="entrar-llave">
      <p className="separador"><span>o</span></p>
      <button type="button" className="boton-llave" onClick={() => entrar()}>
        {nativo
          ? <svg viewBox="0 0 24 24" aria-hidden><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16s1 1 3 1 3-1 3-1" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden><circle cx="8" cy="12" r="4" /><path d="M12 12h9M18 12v3M21 12v2" /></svg>}
        Entrar con {nombre}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
