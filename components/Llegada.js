'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { tomarCambios, vigilarCambios } from '@/lib/cambiosDatos';

// Avisa a la transición de que la pantalla nueva ya está pintada (va en el layout: vale para todas).
// Si lo que hay es el esqueleto de carga (app/loading.js), espera al contenido de verdad: así se desliza la pantalla
// terminada en vez del esqueleto y luego un salto. La transición no espera nunca más de 600 ms (lib/transicion.js).
export default function Llegada() {
  const ruta = usePathname();
  const params = useSearchParams().toString();
  const router = useRouter();
  useEffect(vigilarCambios, []);
  // Se llegó por un enlace sin transición después de guardar algo: lo recordado puede ser viejo, se pide de nuevo.
  useEffect(() => { if (tomarCambios()) router.refresh(); }, [ruta, params]); // eslint-disable-line react-hooks/exhaustive-deps
  // Llegó después de que la transición se soltara (lib/transicion.js): entra con un fundido corto en vez de aparecer de golpe.
  // Antes de pintar, para que no se vea un instante sin el fundido.
  useLayoutEffect(() => {
    if (!window.__vtTarde) return undefined;
    window.__vtTarde = false;
    const html = document.documentElement;
    html.dataset.llegaTarde = '1';
    const t = setTimeout(() => delete html.dataset.llegaTarde, 400);
    return () => { clearTimeout(t); delete html.dataset.llegaTarde; };
  }, [ruta, params]);
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
