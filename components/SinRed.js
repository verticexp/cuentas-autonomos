'use client';

import { useEffect, useState } from 'react';

// Aviso fijo cuando el móvil o el ordenador se queda sin red (eventos online/offline): lo que se ve puede no estar al día
// y lo que se guarde no llegará hasta que vuelva. reintentar: el botón de la página «Sin conexión» (app/sin-conexion).
export function Reintentar() {
  return <button type="button" className="boton" onClick={() => location.reload()}>Reintentar</button>;
}

export default function SinRed() {
  const [sinRed, setSinRed] = useState(false);
  useEffect(() => {
    const poner = () => setSinRed(!navigator.onLine);
    poner();
    addEventListener('online', poner);
    addEventListener('offline', poner);
    return () => { removeEventListener('online', poner); removeEventListener('offline', poner); };
  }, []);
  if (!sinRed) return null;
  return <p className="sin-red" role="status">Sin conexión: lo que ves puede no estar al día y los cambios no se guardarán hasta que vuelva.</p>;
}
