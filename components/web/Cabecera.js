'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Logo from '@/components/Logo';
import Icono from '@/components/web/Icono';
import { FUNCIONES, SEGMENTOS } from '@/components/web/datos';

const MENUS = {
  producto: { t: 'Producto', items: FUNCIONES.map((f) => ({ href: `/funciones/${f.slug}`, icono: f.icono, t: f.nombre, d: f.corto })), pie: { href: '/funciones', t: 'Ver todas las funciones' } },
  soluciones: { t: 'Soluciones', items: SEGMENTOS.map((s) => ({ href: s.ruta, icono: s.icono, t: s.n, d: `Desde ${s.desde} €/mes` })), pie: { href: '/precios', t: 'Comparar planes' } },
};

export default function Cabecera() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(null); // menú desplegable en el ordenador
  const [movil, setMovil] = useState(false);
  const [fondo, setFondo] = useState(false);
  const cerrarT = useRef(null);

  useEffect(() => { setAbierto(null); setMovil(false); }, [ruta]);
  useEffect(() => {
    const f = () => setFondo(window.scrollY > 12);
    f();
    addEventListener('scroll', f, { passive: true });
    return () => removeEventListener('scroll', f);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('web-sin-scroll', movil);
    const esc = (e) => { if (e.key === 'Escape') { setAbierto(null); setMovil(false); } };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [movil]);

  // Pequeño margen al salir: pasar del botón al panel no lo cierra.
  const entrar = (k) => { clearTimeout(cerrarT.current); setAbierto(k); };
  const salir = () => { cerrarT.current = setTimeout(() => setAbierto(null), 140); };
  const activo = (href) => (href === '/' ? ruta === '/' : ruta.startsWith(href));
  const enMenu = (k) => MENUS[k].items.some((i) => activo(i.href)) || (k === 'producto' && ruta === '/funciones');

  return (
    <header className={`web-cab${fondo || abierto ? ' con-fondo' : ''}`} onMouseLeave={salir}>
      <div className="web-cab-in">
        <Link href="/" aria-label="Netto, inicio" className="web-marca"><Logo className="web-logo" /></Link>
        <nav className="web-nav" aria-label="Principal">
          {Object.entries(MENUS).map(([k, m]) => (
            <div key={k} className="web-nav-grupo" onMouseEnter={() => entrar(k)}>
              <button className={`web-nav-btn${enMenu(k) ? ' activo' : ''}`} aria-expanded={abierto === k} onClick={() => setAbierto(abierto === k ? null : k)}>
                {m.t}<Icono n="chevron" className="ico web-nav-chev" />
              </button>
            </div>
          ))}
          <Link href="/precios" className={`web-nav-btn${activo('/precios') ? ' activo' : ''}`} onMouseEnter={salir}>Precios</Link>
          <Link href="/seguridad" className={`web-nav-btn${activo('/seguridad') ? ' activo' : ''}`} onMouseEnter={salir}>Seguridad</Link>
        </nav>
        <div className="web-cab-acciones">
          <a href="/login" className="web-cab-entrar">Entrar</a>
          <Link href="/contacto" className="web-btn web-btn-peq">Pedir acceso</Link>
          <button className="web-hamburguesa" aria-label={movil ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={movil} onClick={() => setMovil(!movil)}>
            <Icono n={movil ? 'cerrar' : 'menu'} />
          </button>
        </div>
      </div>

      <div className={`web-mega${abierto ? ' abierto' : ''}`} onMouseEnter={() => clearTimeout(cerrarT.current)} aria-hidden={!abierto}>
        {Object.entries(MENUS).map(([k, m]) => (
          <div key={k} className={`web-mega-panel${abierto === k ? ' visible' : ''}${k === 'soluciones' ? ' estrecho' : ''}`}>
            <div className="web-mega-rejilla">
              {m.items.map((i, n) => (
                <Link key={i.href} href={i.href} className="web-mega-item" style={{ '--n': n }} tabIndex={abierto === k ? 0 : -1}>
                  <span className="web-mega-ico"><Icono n={i.icono} /></span>
                  <span><b>{i.t}</b><small>{i.d}</small></span>
                </Link>
              ))}
            </div>
            <Link href={m.pie.href} className="web-mega-pie" tabIndex={abierto === k ? 0 : -1}>{m.pie.t}<Icono n="flecha" className="ico web-flecha" /></Link>
          </div>
        ))}
      </div>

      <div className={`web-cajon${movil ? ' abierto' : ''}`} aria-hidden={!movil}>
        <div className="web-cajon-in">
          <p className="web-cajon-t">Producto</p>
          {FUNCIONES.map((f, n) => (
            <Link key={f.slug} href={`/funciones/${f.slug}`} style={{ '--n': n }} tabIndex={movil ? 0 : -1}><Icono n={f.icono} />{f.nombre}</Link>
          ))}
          <p className="web-cajon-t">Soluciones</p>
          {SEGMENTOS.map((s, n) => (
            <Link key={s.id} href={s.ruta} style={{ '--n': n + 7 }} tabIndex={movil ? 0 : -1}><Icono n={s.icono} />{s.n}</Link>
          ))}
          <p className="web-cajon-t">Más</p>
          <Link href="/precios" style={{ '--n': 10 }} tabIndex={movil ? 0 : -1}><Icono n="rayo" />Precios</Link>
          <Link href="/seguridad" style={{ '--n': 11 }} tabIndex={movil ? 0 : -1}><Icono n="escudo" />Seguridad</Link>
          <Link href="/contacto" style={{ '--n': 12 }} tabIndex={movil ? 0 : -1}><Icono n="correo" />Contacto</Link>
          <div className="web-cajon-cta">
            <a href="/login" className="web-btn web-btn-claro" tabIndex={movil ? 0 : -1}>Entrar</a>
            <Link href="/contacto" className="web-btn" tabIndex={movil ? 0 : -1}>Pedir acceso</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
