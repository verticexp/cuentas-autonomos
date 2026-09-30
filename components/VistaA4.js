'use client';

import { useEffect, useRef, useState } from 'react';

// Muestra el A4 a su tamaño real (794 × 1123 px) reducido para que quepa en la pantalla.
export default function VistaA4({ children }) {
  const caja = useRef(null);
  const [v, setV] = useState({ k: 1, x: 0 });
  useEffect(() => {
    const ajustar = () => {
      const w = caja.current.clientWidth;
      const k = Math.min(1, (w - 24) / 794);
      setV({ k, x: Math.max(12, (w - 794 * k) / 2) });
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, []);
  return (
    <div ref={caja} style={{ width: '100%', overflow: 'hidden', height: 1123 * v.k + 24 }}>
      <div style={{ width: 794, transform: `translateX(${v.x}px) scale(${v.k})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}
