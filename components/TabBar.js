'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { alPulsar, navegar } from '@/lib/transicion';
import Logo from '@/components/Logo';
import '@/app/lateral.css';

const TABS = [
  { href: '/', permiso: 'resumen', nombre: 'Resumen', icono: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" /> },
  { href: '/facturas', permiso: 'facturas', nombre: 'Facturas', icono: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" /> },
  { href: '/gastos', permiso: 'gastos', nombre: 'Gastos', icono: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16" /></> },
  { href: '/ajustes', nombre: 'Ajustes', icono: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
];

// Solo en ordenador (app/lateral.css): el resto de pantallas en la barra lateral, por grupos.
const EXTRA = [
  { titulo: 'Ventas', enlaces: [
    { href: '/presupuestos', permiso: 'facturas', nombre: 'Presupuestos', icono: <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h3" /> },
    { href: '/facturas/recurrentes', permiso: 'facturas', nombre: 'Recurrentes', icono: <path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" /> },
    { href: '/facturas/catalogo', permiso: 'facturas', nombre: 'Catálogo', icono: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> },
  ] },
  { titulo: 'Finanzas', enlaces: [
    { href: '/asistente', nombre: 'Pregunta a Netto', icono: <path d="M4 5h16v11H9l-5 4zM8 10h8M8 13h5" /> },
    { href: '/tesoreria', permiso: 'resumen', nombre: 'Tesorería', icono: <path d="M3 17l5-5 4 4 8-8M15 8h5v5" /> },
    { href: '/banco', permiso: 'resumen', nombre: 'Banco', icono: <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /> },
    { href: '/modelos', permiso: 'resumen', nombre: 'Impuestos', icono: <path d="M4 21V9l8-6 8 6v12M9 21v-7h6v7" /> },
    { href: '/gastos/proveedores', permiso: 'gastos', nombre: 'Proveedores', icono: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /> },
    { href: '/nominas', permiso: 'nominas', nombre: 'Equipo y nóminas', icono: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c1-4 4-6 7-6s6 2 7 6M17 3a4 4 0 0 1 0 8M22 21c-.5-2.5-2-4.5-4-5.5" /> },
  ] },
  { titulo: 'Empresa', enlaces: [
    { href: '/ajustes/importar', permiso: 'empresa', nombre: 'Importar datos', icono: <path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3" /> },
    { href: '/usuarios', permiso: 'usuarios', nombre: 'Usuarios', icono: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /> },
    { href: '/ajustes', nombre: 'Ajustes', icono: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></> },
  ] },
];
// La pantalla extra en la que se está (la más concreta), para marcarla.
const extraDe = (path) => EXTRA.flatMap((g) => g.enlaces).filter((e) => path === e.href || path.startsWith(`${e.href}/`)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;

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

  if (path === '/login' || path.startsWith('/invitacion') || path.startsWith('/p/') || path.startsWith('/portal/') || path.startsWith('/pagar/') || path.endsWith('/pdf')) return null;

  const orden = (h) => tabs.findIndex((t) => t.href === h);
  const ir = (h) => { if (h !== path) { navegar(router, h, orden(h) > orden(activo) ? 'tab-der' : 'tab-izq'); setActivo(h); } };
  const tabEn = (x, y) => document.elementFromPoint(x, y)?.closest('[data-href]')?.dataset.href ?? null;
  const marcado = dedo ?? activo;
  // En presupuestos, el + crea un presupuesto; en el resto, una factura.
  const nuevo = path.startsWith('/presupuestos') ? '/presupuestos/nuevo' : '/facturas/nueva';

  return (
    <div className="tabbar">
      <Link href="/" className="tabbar-logo" aria-label="Netto, resumen" onClick={(e) => { e.preventDefault(); ir('/'); }}><Logo /></Link>
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
      <nav className="tabs-extra" aria-label="Más secciones">
        {EXTRA.map((g) => {
          const enlaces = g.enlaces.filter((e) => !e.permiso || permisos.includes(e.permiso));
          return enlaces.length > 0 && (
            <div key={g.titulo} className="tabs-grupo">
              <p className="tabs-grupo-t">{g.titulo}</p>
              {enlaces.map((e) => (
                <Link key={e.href} href={e.href} prefetch={false} className={extraDe(path) === e.href ? 'activo' : ''} aria-current={extraDe(path) === e.href ? 'page' : undefined}>
                  <svg viewBox="0 0 24 24" aria-hidden>{e.icono}</svg>
                  <span>{e.nombre}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </nav>
      {permisos.includes('facturar') && <Link href={nuevo} prefetch className={`mas${path === nuevo ? ' abierta' : ''}`} aria-label={path.startsWith('/presupuestos') ? 'Nuevo presupuesto' : 'Nueva factura'} onClick={(e) => { vibrar(); if (path !== nuevo) alPulsar(router, nuevo, 'subir')(e); }}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        <span className="mas-txt">{path.startsWith('/presupuestos') ? 'Nuevo presupuesto' : 'Nueva factura'}</span>
      </Link>}
    </div>
  );
}
