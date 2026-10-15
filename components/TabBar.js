'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { alPulsar, instalarHistorial, navegar, posicion } from '@/lib/transicion';
import Logo from '@/components/Logo';
import CambiarEmpresa from '@/components/CambiarEmpresa';
import { EXTRA, extraDe } from '@/components/secciones';
import { atajosDe } from '@/lib/navegacion';
import { useHojaDeslizable } from '@/components/useHojaDeslizable';
import '@/app/empresas.css';
import '@/app/lateral.css';
import '@/app/hoja.css';

const TABS = [
  { href: '/', permiso: 'resumen', nombre: 'Resumen', icono: <path d="M5 20V11M10 20V5M15 20v-7M20 20V9" /> },
  { href: '/facturas', permiso: 'facturas', nombre: 'Facturas', icono: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" /> },
  { href: '/gastos', permiso: 'gastos', nombre: 'Gastos', icono: <><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16" /></> },
  { href: '/ajustes', nombre: 'Ajustes', icono: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></> },
  // Solo en el móvil (app/lateral.css): el resto de pantallas en una cuadrícula, con Ajustes dentro. En el ordenador, la barra lateral.
  { href: '/mas', nombre: 'Más', icono: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></> },
];

// Iconos de la hoja del «+» (móvil).
const ICONO_ATAJO = {
  ticket: <path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M4 12h16" />,
  factura: <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />,
  cierre: <><rect x="3" y="9" width="18" height="11" rx="2" /><path d="M7 9V5h10v4M7 14h4M15 14h2" /></>,
  albaran: <path d="M7 3h10l3 3v15H4V3zM8 9h8M8 13h8M8 17h5" />,
  presupuesto: <path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h3" />,
};

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

// Las pantallas de Facturas y Gastos (caja, catálogo, proveedores…) siguen contando como esas pestañas; el resto de las de «Más» y Ajustes, como «Más».
const deMas = (path) => path === '/mas' || path.startsWith('/ajustes') || extraDe(path) !== null;
const RAICES = ['/', '/facturas', '/gastos', '/mas', '/ajustes'];
const seccion = (path) => (path === '/' ? '/' : path.startsWith('/presupuestos') ? '/facturas'
  : ['/facturas', '/gastos'].some((h) => path.startsWith(h)) ? TABS.find((t) => t.href !== '/' && path.startsWith(t.href))?.href ?? null
  : deMas(path) ? '/mas' : null);

export default function TabBar({ permisos = [], empresas = [], empresa, admin = false, inventario = false, fiscal = {} }) {
  const tabs = TABS.filter((t) => !t.permiso || permisos.includes(t.permiso));
  const path = usePathname();
  const router = useRouter();
  const [activo, setActivo] = useState(seccion(path));
  const activoRef = useRef(activo);
  const visto = useRef({ idx: null, pestanas: {} });
  const [dedo, setDedo] = useState(null);
  const nav = useRef(null);
  // Móvil: el «+» abre una hoja con lo que se puede crear. En el ordenador sigue siendo el botón «Nueva factura» de siempre.
  const [movil, setMovil] = useState(false);
  const [hoja, setHoja] = useState(false);
  const botonMas = useRef(null);
  const panel = useRef(null);
  const cerrarHoja = useHojaDeslizable(panel, hoja && movil, () => setHoja(false));

  useEffect(() => { instalarHistorial(); }, []);
  // La pestaña marcada: las pantallas raíz marcan la suya; una de dentro (Presupuestos, Recurrentes, Caja, Banco…) mantiene la
  // pestaña con la que se entró (Más, Resumen, Facturas…), y al volver con «atrás» recupera la que tenía.
  useEffect(() => {
    const i = posicion(), v = visto.current;
    let r;
    if (RAICES.includes(path)) r = seccion(path);
    else if (v.idx !== null && i < v.idx && v.pestanas[i] !== undefined) r = v.pestanas[i];
    else r = activoRef.current ?? seccion(path);
    v.pestanas[i] = r; v.idx = i; activoRef.current = r;
    setActivo(r);
  }, [path]);
  useEffect(() => {
    const m = matchMedia('(max-width: 1023.98px)');
    const poner = () => setMovil(m.matches);
    poner();
    m.addEventListener('change', poner);
    return () => m.removeEventListener('change', poner);
  }, []);
  useEffect(() => { setHoja(false); }, [path]);
  // Hoja abierta: el fondo no se mueve, Escape la cierra y el foco entra en ella y vuelve al «+» al cerrar.
  useEffect(() => {
    if (!hoja || !movil) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const boton = botonMas.current;
    panel.current?.querySelector('a, button')?.focus();
    const teclas = (e) => {
      if (e.key === 'Escape') { cerrarHoja(); return; }
      if (e.key !== 'Tab') return;
      const dentro = [...panel.current.querySelectorAll('a, button')];
      const [primero, ultimo] = [dentro[0], dentro.at(-1)];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    };
    document.addEventListener('keydown', teclas);
    return () => { document.removeEventListener('keydown', teclas); document.body.style.overflow = anterior; boton?.focus?.({ preventScroll: true }); };
  }, [hoja, movil, cerrarHoja]);

  if (path === '/login' || path === '/privacidad' || path === '/condiciones' || path.startsWith('/invitacion') || path.startsWith('/p/') || path.startsWith('/portal/') || path.startsWith('/pagar/') || path.endsWith('/pdf')) return null;

  const orden = (h) => tabs.findIndex((t) => t.href === h);
  const ir = (h) => { if (h !== path) { activoRef.current = h; navegar(router, h, orden(h) > orden(activo) ? 'tab-der' : 'tab-izq'); setActivo(h); } };
  const tabEn = (x, y) => document.elementFromPoint(x, y)?.closest('[data-href]')?.dataset.href ?? null;
  const marcado = dedo ?? activo;
  // En presupuestos, el + crea un presupuesto; en el resto, una factura.
  const nuevo = path.startsWith('/presupuestos') ? '/presupuestos/nuevo' : '/facturas/nueva';
  const atajos = atajosDe({ permisos, fiscal, inventario, en: path });
  const abrirHoja = () => { vibrar(); setHoja(true); };
  const irAtajo = (e, href) => { setHoja(false); vibrar(); alPulsar(router, href, 'subir')(e); };

  return (
    <>
    <div className="tabbar">
      <Link href="/" className="tabbar-logo" aria-label="Netto, resumen" onClick={(e) => { e.preventDefault(); ir('/'); }}><Logo /></Link>
      {empresa && <CambiarEmpresa empresas={empresas} actual={empresa} variante="lateral" puedeCrear={admin} />}
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
          const enlaces = g.enlaces.filter((e) => (!e.permiso || permisos.includes(e.permiso)) && (!e.inventario || inventario));
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
      {permisos.includes('facturar')
        ? <Link ref={botonMas} href={nuevo} prefetch className={`mas${path === nuevo || (hoja && movil) ? ' abierta' : ''}`} aria-label={movil ? 'Crear' : path.startsWith('/presupuestos') ? 'Nuevo presupuesto' : 'Nueva factura'}
          aria-haspopup={movil ? 'dialog' : undefined} aria-expanded={movil ? hoja : undefined}
          onClick={(e) => { if (movil && atajos.length > 0) { e.preventDefault(); if (hoja) cerrarHoja(); else abrirHoja(); return; } vibrar(); if (path !== nuevo) alPulsar(router, nuevo, 'subir')(e); }}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          <span className="mas-txt">{path.startsWith('/presupuestos') ? 'Nuevo presupuesto' : 'Nueva factura'}</span>
        </Link>
        : atajos.length > 0 && <button ref={botonMas} type="button" className={`mas mas-solo-movil${hoja ? ' abierta' : ''}`} aria-label="Crear" aria-haspopup="dialog" aria-expanded={hoja} onClick={() => (hoja ? cerrarHoja() : abrirHoja())}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>}
    </div>
    {hoja && movil && atajos.length > 0 && (
      <div className="hoja">
        <button type="button" className="hoja-fondo" aria-label="Cerrar" tabIndex={-1} onClick={cerrarHoja} />
        <div className="hoja-panel" role="dialog" aria-modal="true" aria-label="Crear" ref={panel}>
          <span className="hoja-asa" aria-hidden />
          <p className="hoja-t">Crear</p>
          <ul className="hoja-lista">
            {atajos.map((a, i) => (
              <li key={a.id}>
                <Link href={a.href} prefetch={false} className={`hoja-fila${i === 0 ? ' principal' : ''}`} onClick={(e) => irAtajo(e, a.href)}>
                  <span className="hoja-ico"><svg viewBox="0 0 24 24" aria-hidden>{ICONO_ATAJO[a.id]}</svg></span>
                  <span className="txt"><strong>{a.nombre}</strong><small>{a.detalle}</small></span>
                </Link>
              </li>
            ))}
          </ul>
          <button type="button" className="hoja-cerrar" onClick={cerrarHoja}>Cerrar</button>
        </div>
      </div>
    )}
    </>
  );
}
