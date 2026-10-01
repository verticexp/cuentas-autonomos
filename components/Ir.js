'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { alPulsar } from '@/lib/transicion';

// Enlace con transición (ver lib/transicion.js).
export default function Ir({ href, tipo = 'adelante', prefetch = true, children, ...resto }) {
  const router = useRouter();
  return <Link href={href} prefetch={prefetch} onClick={alPulsar(router, href, tipo)} {...resto}>{children}</Link>;
}
