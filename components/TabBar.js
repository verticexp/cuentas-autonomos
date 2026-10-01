'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { alPulsar, navegar } from '@/lib/transicion';

const TABS = [
  { href: '/', permiso: 'resumen', nombre: 'Resumen', icono: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" /> },
  { href: '/facturas', permiso: 'facturas', nombre: 'Facturas', icono: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" /> },
  { href: '/gastos', permiso: 'gastos', nombre: 'Gastos', icono: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16" /></> },
  { href: '/ajustes', nombre: 'Ajustes', icono: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
];

// Vibración suave: Android con vibrate; iPhone (iOS 18+) con el truco del interruptor nativo.
let interruptor;
function vibrar() {
  if (navigator.vibrate) { navigator.vibrate(8); return; }
  if (!interruptor) {
    interruptor = document.createElement('label');
    interruptor.style.display = 'none';
    const i = document.createElement('input');
    i.type = 'checkbox'; i.setAttribute('switch', '');
    interruptor.appendChild(i);
    document.body.appendChild(interruptor);
  }
  interruptor.click();
}

const seccion = (path) => (path === '/' ? '/' : path.startsWith('/presupuestos') ? '/facturas' : TABS.find((t) => t.href !== '/' && path.startsWith(t.href))?.href ?? null);

export default function TabBar({ permisos = [] }) {
  const tabs = TABS.filter((t) => !t.permiso || permisos.includes(t.permiso));
  const path = usePathname();
  const router = useRouter();
  const [activo, setActivo] = useState(seccion(path));
  const [dedo, setDedo] = useState(null);
  const nav = useRef(null);

  useEffect(() => { setActivo(seccion(path)); }, [path]);

  if (path === '/login' || path.startsWith('/invitacion') || path.startsWith('/p/') || path.endsWith('/pdf')) return null;

  const ir = (h) => { if (h !== path) { setActivo(h); navegar(router, h, 'fundido'); } };
  const tabEn = (x, y) => document.elementFromPoint(x, y)?.closest('[data-href]')?.dataset.href ?? null;
  const marcado = dedo ?? activo;
  // En presupuestos, el + crea un presupuesto; en el resto, una factura.
  const nuevo = path.startsWith('/presupuestos') ? '/presupuestos/nuevo' : '/facturas/nueva';

  return (
    <div className="tabbar">
      <nav
        ref={nav}
        className="tabs"
        onPointerDown={(e) => {
          const h = tabEn(e.clientX, e.clientY);
          if (!h) return;
          nav.current.setPointerCapture(e.pointerId);
          setDedo(h);
          if (h !== activo) vibrar();
        }}
        onPointerMove={(e) => {
          if (dedo === null) return;
          const h = tabEn(e.clientX, e.clientY);
          if (h && h !== dedo) { setDedo(h); vibrar(); }
        }}
        onPointerUp={() => { if (dedo === null) return; const h = dedo; setDedo(null); ir(h); }}
        onPointerCancel={() => setDedo(null)}
      >
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} prefetch draggable={false} data-href={t.href}
            className={marcado === t.href ? 'activo' : ''} aria-current={activo === t.href ? 'page' : undefined} aria-label={t.nombre}
            onClick={(e) => { e.preventDefault(); if (e.detail === 0) ir(t.href); }}>
            <svg viewBox="0 0 24 24" aria-hidden>{t.icono}</svg>
            <span>{t.nombre}</span>
          </Link>
        ))}
      </nav>
      {permisos.includes('facturar') && <Link href={nuevo} prefetch className={`mas${path === nuevo ? ' abierta' : ''}`} aria-label={path.startsWith('/presupuestos') ? 'Nuevo presupuesto' : 'Nueva factura'} onClick={(e) => { vibrar(); if (path !== nuevo) alPulsar(router, nuevo, 'subir')(e); }}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </Link>}
    </div>
  );
}
