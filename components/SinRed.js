'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/components/Idioma';

// Aviso fijo cuando el móvil o el ordenador se queda sin red (eventos online/offline): lo que se ve puede no estar al día
// y lo que se guarde no llegará hasta que vuelva. reintentar: el botón de la página «Sin conexión» (app/sin-conexion).
export function Reintentar() {
  const tr = useT();
  return <button type="button" className="boton" onClick={() => location.reload()}>{tr('Reintentar')}</button>;
}

// navigator.onLine no basta: el WebView de la app de iOS dice «sin red» teniéndola. Antes de avisar se pregunta al
// servidor (una petición pequeña y sin caché); sin respuesta, sí es que no hay red.
const responde = () => fetch('/manifest.webmanifest', { method: 'HEAD', cache: 'no-store' }).then(() => true, () => false);

export default function SinRed() {
  const tr = useT();
  const [sinRed, setSinRed] = useState(false);
  // Al volver la red, un momento «Conexión recuperada» y se va: como las apps del iPhone, sin dejar al usuario con la duda.
  const [vuelta, setVuelta] = useState(false);
  const antes = useRef(false);
  useEffect(() => {
    let vivo = true;
    const mirar = async () => {
      const red = navigator.onLine || await responde();
      if (vivo) setSinRed(!red);
    };
    mirar();
    addEventListener('online', mirar);
    addEventListener('offline', mirar);
    return () => { vivo = false; removeEventListener('online', mirar); removeEventListener('offline', mirar); };
  }, []);
  // Con el aviso puesto, se vuelve a mirar cada 15 segundos: en la app el evento «online» puede no llegar.
  useEffect(() => {
    if (!sinRed) return undefined;
    const t = setInterval(() => { responde().then((red) => { if (red) setSinRed(false); }); }, 15000);
    return () => clearInterval(t);
  }, [sinRed]);
  useEffect(() => {
    if (sinRed) { antes.current = true; setVuelta(false); return undefined; }
    if (!antes.current) return undefined;
    antes.current = false;
    setVuelta(true);
    const t = setTimeout(() => setVuelta(false), 2200);
    return () => clearTimeout(t);
  }, [sinRed]);
  if (!sinRed && !vuelta) return null;
  return (
    <p className={`sin-red${sinRed ? '' : ' sin-red-vuelve'}`} role="status">
      <svg viewBox="0 0 24 24" aria-hidden>
        {sinRed
          ? <><path d="M2.2 9.2a14.5 14.5 0 0 1 19.6 0M5.4 12.6a10 10 0 0 1 13.2 0M8.7 16a5.2 5.2 0 0 1 6.6 0M4.5 3.5l16 16" /><circle cx="12" cy="19.4" r="1.3" /></>
          : <path d="M5 12.5l4.5 4.5L19 7.5" />}
      </svg>
      <span>
        <strong>{sinRed ? tr('Sin conexión') : tr('Conexión recuperada')}</strong>
        {sinRed && <small>{tr('Lo que ves puede no estar al día')}</small>}
      </span>
    </p>
  );
}
