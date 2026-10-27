'use client';

import { useEffect, useRef, useState } from 'react';

// Muestra el A4 a su tamaño real (794 × 1123 px) reducido para que quepa en la pantalla. Hasta medir su caja no se ve
// (si no, salía un instante a tamaño real), y se vuelve a medir cuando la caja cambia de ancho: también si aparece
// después de cargar, como la vista previa del detalle de factura tras la transición de entrada.
export default function VistaA4({ children }) {
  const caja = useRef(null);
  const [v, setV] = useState(null);
  useEffect(() => {
    const el = caja.current;
    const ajustar = () => {
      const w = el.clientWidth;
      if (!w) return; // oculta (la vista previa del detalle de factura, en pantallas estrechas)
      const k = Math.min(1, (w - 24) / 794);
      const x = Math.max(12, (w - 794 * k) / 2);
      setV((a) => (a && a.k === k && a.x === x ? a : { k, x }));
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const k = v?.k ?? 1;
  return (
    <div ref={caja} style={{ width: '100%', overflow: 'hidden', height: 1123 * k + 24, visibility: v ? undefined : 'hidden' }}>
      <div style={{ width: 794, transform: `translateX(${v?.x ?? 0}px) scale(${k})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}
