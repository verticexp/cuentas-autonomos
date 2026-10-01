'use client';

import { useEffect } from 'react';

// Avisa a la transición de que la factura ya está pintada.
export default function Llegada() {
  // Sin requestAnimationFrame: durante la transición el navegador no pinta y no lo llamaría.
  useEffect(() => { window.__facturaLista?.(); }, []);
  return null;
}
