'use client';

import { useEffect, useRef } from 'react';

// Fila que se desliza en horizontal cuando no cabe; al abrir, centra la opción elegida.
export default function Deslizable({ className, children }) {
  const ref = useRef(null);
  // Solo en horizontal, dentro de la fila: scrollIntoView movía también la página hacia abajo.
  useEffect(() => {
    const fila = ref.current;
    const a = fila?.querySelector('.activo');
    if (a) fila.scrollLeft = a.offsetLeft - fila.offsetLeft - (fila.clientWidth - a.offsetWidth) / 2;
  }, []);
  return <div ref={ref} className={`${className} deslizable`}>{children}</div>;
}
