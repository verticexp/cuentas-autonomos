'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { alPulsar } from '@/lib/transicion';
import Logo from '@/components/Logo';
import '@/app/lateral.css';

// Barra de «Mi despacho» (app/despacho), en lugar de la de una empresa: en el móvil, las cuatro pestañas abajo; en el
// ordenador, la barra lateral con «Mi empresa» y «Cerrar sesión» debajo.
const TABS = [
  { href: '/despacho', nombre: 'Clientes', icono: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18.5 14.8c1.4.9 2.4 2.6 3 5.2" /></> },
  { href: '/despacho/mensajes', nombre: 'Mensajes', icono: <path d="M5 5h14a2 2 0 012 2v9a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V7a2 2 0 012-2z" /> },
  { href: '/despacho/plazos', nombre: 'Plazos', icono: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3" /></> },
  { href: '/despacho/equipo', nombre: 'Equipo', icono: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
  { href: '/despacho/ajustes', nombre: 'Ajustes', icono: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></> },
];
const activa = (path, href) => (href === '/despacho' ? path === '/despacho' || /^\/despacho\/(?!plazos|equipo|ajustes|mensajes)[^/]+$/.test(path) : path.startsWith(href));

// noLeidos: mensajes de clientes sin leer (su número va sobre «Mensajes»).
export default function NavDespacho({ nombre, noLeidos = 0 }) {
  const path = usePathname();
  const router = useRouter();
  return (
    <div className="tabbar tabbar-despacho">
      <Link href="/despacho" className="tabbar-logo" aria-label={`${nombre}, clientes`}><Logo /></Link>
      <nav className="tabs" aria-label="Mi despacho">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} data-href={t.href} className={activa(path, t.href) ? 'activo' : ''} aria-current={activa(path, t.href) ? 'page' : undefined} onClick={alPulsar(router, t.href, 'tab-der')}>
            <svg viewBox="0 0 24 24" aria-hidden>{t.icono}</svg>
            <span>{t.nombre}</span>
            {t.href === '/despacho/mensajes' && noLeidos > 0 && <b className="tab-n" aria-label={`${noLeidos} sin leer`}>{noLeidos > 99 ? '99+' : noLeidos}</b>}
          </Link>
        ))}
      </nav>
      <nav className="tabs-extra" aria-label="Más">
        <div className="tabs-grupo">
          <p className="tabs-grupo-t">{nombre}</p>
          <form method="post" action="/api/despacho/salir?a=empresa" className="tabs-salir">
            <button type="submit">
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 20V11M10 20V5M15 20v-7M20 20V9" /></svg>
              <span>Mi empresa en Fisquo</span>
            </button>
          </form>
        </div>
        <form method="post" action="/api/logout" className="tabs-salir">
          <button type="submit">
            <svg viewBox="0 0 24 24" aria-hidden><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></svg>
            <span>Cerrar sesión</span>
          </button>
        </form>
      </nav>
    </div>
  );
}
