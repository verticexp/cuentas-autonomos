'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { volverA } from '@/lib/transicion';

// «Atrás»: si la pantalla de destino es de la que se viene, retrocede en el historial (como el botón de atrás del móvil);
// si no, va a ella. Sin JavaScript sigue siendo un enlace.
export default function Volver({ href, children = 'Atrás' }) {
  const router = useRouter();
  const alPulsar = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    volverA(router, href);
  };
  return <Link href={href} className="volver" onClick={alPulsar}>‹ {children}</Link>;
}
