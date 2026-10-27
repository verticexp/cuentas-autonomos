'use client';

import { useEffect, useState } from 'react';
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
  if (!sinRed) return null;
  return <p className="sin-red" role="status">{tr('Sin conexión: lo que ves puede no estar al día y los cambios no se guardarán hasta que vuelva.')}</p>;
}
