'use client';

import { useEffect, useRef } from 'react';
import { useTrasArranque } from '@/lib/arranque';
import { eurSin } from '@/lib/formato';

// Cifra grande del resumen que cuenta hasta su valor, solo la primera vez que se abre la app en la sesión
// (si se viera en cada visita al resumen, cansaría). Sin JavaScript o con movimiento reducido, la cifra tal cual.
const VISTO = 'netto-cifras';
let decidido = null; // { animar, desde } compartido por todas las cifras de la pantalla

export default function Cifra({ v }) {
  const ref = useRef(null);
  const listo = useTrasArranque();
  useEffect(() => {
    if (!listo || !ref.current) return undefined;
    if (!decidido) {
      let visto = true;
      try { visto = Boolean(sessionStorage.getItem(VISTO)); sessionStorage.setItem(VISTO, '1'); } catch {}
      decidido = { animar: !visto && !matchMedia('(prefers-reduced-motion: reduce)').matches, desde: performance.now() };
    }
    if (!decidido.animar || performance.now() - decidido.desde > 1500) return undefined;
    const el = ref.current;
    const t0 = performance.now();
    let raf;
    const paso = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      el.textContent = eurSin(v * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => { cancelAnimationFrame(raf); el.textContent = eurSin(v); };
  }, [listo, v]);
  return <span ref={ref}>{eurSin(v)}</span>;
}
