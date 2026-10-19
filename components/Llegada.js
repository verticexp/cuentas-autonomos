'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

// Avisa a la transición de que la pantalla nueva ya está pintada (va en el layout: vale para todas).
// Si lo que hay es el esqueleto de carga (app/loading.js), espera al contenido de verdad: así se desliza la pantalla
// terminada en vez del esqueleto y luego un salto. La transición no espera nunca más de 700 ms (lib/transicion.js).
export default function Llegada() {
  const ruta = usePathname();
  const params = useSearchParams().toString();
  // Sin requestAnimationFrame: durante la transición el navegador no pinta y no lo llamaría.
  useEffect(() => {
    if (!window.__vtLista) return;
    if (!document.querySelector('.cargando')) { window.__vtLista(); return; }
    const mo = new MutationObserver(() => { if (!document.querySelector('.cargando')) { mo.disconnect(); window.__vtLista?.(); } });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ruta, params]);
  return null;
}
