'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { instalarTransicionesPublicas, paginaPublica } from '@/lib/transicionPublica';
import '@/app/publico-motion.css';

// Notificamos el commit real, sin capturar cada fallback/revelado de Suspense como otra transición.
export default function TransicionPublica({ children }) {
  const ruta = usePathname();
  useLayoutEffect(() => {
    const pagina = paginaPublica();
    if (pagina) pagina.dataset.publicoRuta = ruta;
    instalarTransicionesPublicas();
  }, [ruta]);
  return children;
}
