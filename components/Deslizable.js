'use client';

import { useEffect, useRef } from 'react';

// Fila que se desliza en horizontal cuando no cabe; al abrir, centra la opción elegida.
export default function Deslizable({ className, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector('.activo')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, []);
  return <div ref={ref} className={`${className} deslizable`}>{children}</div>;
}
