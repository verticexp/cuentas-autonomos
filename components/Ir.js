'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { alPulsar } from '@/lib/transicion';

// Enlace con transición (ver lib/transicion.js). Un onClick propio se suma a la transición, no la sustituye.
// Sin precarga (listas largas): la pantalla se pide en cuanto el dedo toca o el ratón pasa por encima, así llega antes de soltar.
export default function Ir({ href, tipo = 'adelante', prefetch = true, onClick, children, ...resto }) {
  const router = useRouter();
  const ir = alPulsar(router, href, tipo);
  const precargar = prefetch === false ? () => router.prefetch(href) : undefined;
  return (
    <Link href={href} prefetch={prefetch} onPointerDown={precargar} onMouseEnter={precargar} {...resto} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented) ir(e); }}>
      {children}
    </Link>
  );
}
