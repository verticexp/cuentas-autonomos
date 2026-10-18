'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { transicionPublica } from '@/lib/transicionPublica';

// Next mantiene el historial, prefetch y modificadores. Solo coordinamos la navegación del mismo documento.
export default function EnlacePublico({ onClick, href, replace, scroll, prefetch = true, ...props }) {
  const router = useRouter();
  return <Link {...props} href={href} replace={replace} scroll={scroll} prefetch={prefetch} onClick={(e) => {
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) document.documentElement.dataset.publicoTeclado = e.detail === 0 ? '1' : '0';
    onClick?.(e);
  }} onNavigate={(e) => {
    if (typeof href !== 'string' || new URL(href, location.href).hash) return;
    e.preventDefault();
    transicionPublica(href, () => router[replace ? 'replace' : 'push'](href, { scroll }));
  }} />;
}
