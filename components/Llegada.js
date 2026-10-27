'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { tomarCambios, vigilarCambios } from '@/lib/cambiosDatos';
import { quitarEspera } from '@/lib/transicion';

// Avisa a la transición de que la pantalla nueva ya está pintada (va en el layout: vale para todas).
// Si lo que hay es el esqueleto de carga (app/loading.js), espera al contenido de verdad: así se desliza la pantalla
// terminada en vez del esqueleto. En el móvil la transición no espera más de 100 ms (lib/transicion.js): si entró el
// esqueleto o la pantalla de espera, el contenido aparece después con un fundido corto, como en las apps.
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
    // La pantalla de espera (lib/transicion.js) deja ver la que ha llegado; si lo que ha llegado es el esqueleto de carga, se
    // queda encima (tiene la forma de lo que viene) hasta que llega lo de verdad (abajo, al irse .cargando).
    if (!document.querySelector('.cargando')) quitarEspera();
    if (!window.__vtTarde) return undefined;
    window.__vtTarde = false;
    const html = document.documentElement;
    html.dataset.llegaTarde = '1';
    const t = setTimeout(() => delete html.dataset.llegaTarde, 400);
    return () => { clearTimeout(t); delete html.dataset.llegaTarde; };
  }, [ruta, params]);
  // Sin requestAnimationFrame: durante la transición el navegador no pinta y no lo llamaría.
  useEffect(() => {
    if (!document.querySelector('.cargando')) { window.__vtLista?.(); return undefined; }
    const mo = new MutationObserver(() => {
      if (document.querySelector('.cargando')) return;
      mo.disconnect();
      quitarEspera(); // la espera con forma que tapaba el esqueleto (lib/transicion.js): ya está lo de verdad
      // La transición aún espera: entra la pantalla terminada. Ya entró el esqueleto: el contenido aparece con un fundido.
      if (window.__vtLista && !window.__vtLista.suelta) { window.__vtLista(); return; }
      const html = document.documentElement;
      html.dataset.llegaTarde = '1';
      clearTimeout(mo.t);
      mo.t = setTimeout(() => delete html.dataset.llegaTarde, 300);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ruta, params]);
  return null;
}
