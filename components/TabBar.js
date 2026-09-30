'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', nombre: 'Resumen', icono: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" /> },
  { href: '/facturas', nombre: 'Facturas', icono: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" /> },
  { href: '/gastos', nombre: 'Gastos', icono: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16" /></> },
  { href: '/ajustes', nombre: 'Ajustes', icono: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
];

export default function TabBar() {
  const path = usePathname();
  if (path === '/login' || path.startsWith('/invitacion') || path.endsWith('/pdf')) return null;
  const activa = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  return (
    <nav className="tabbar cuatro">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={activa(t.href) ? 'activo' : ''}>
          <svg viewBox="0 0 24 24" aria-hidden>{t.icono}</svg>
          <span>{t.nombre}</span>
        </Link>
      ))}
    </nav>
  );
}
