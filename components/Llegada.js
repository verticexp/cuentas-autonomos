'use client';

import { useEffect } from 'react';

// Avisa a la transición de que la factura ya está pintada.
export default function Llegada() {
  useEffect(() => { requestAnimationFrame(() => window.__facturaLista?.()); }, []);
  return null;
}
