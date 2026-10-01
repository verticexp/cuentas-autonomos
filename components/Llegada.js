'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Avisa a la transición de que la pantalla nueva ya está pintada (va en el layout: vale para todas).
export default function Llegada() {
  const ruta = usePathname();
  const params = useSearchParams().toString();
  // Sin requestAnimationFrame: durante la transición el navegador no pinta y no lo llamaría.
  useEffect(() => { window.__vtLista?.(); }, [ruta, params]);
  return null;
}
