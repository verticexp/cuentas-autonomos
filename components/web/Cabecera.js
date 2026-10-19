'use client';

import Link from '@/components/web/EnlacePublico';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Logo from '@/components/Logo';
import Icono from '@/components/web/Icono';
import { FUNCIONES, SEGMENTOS } from '@/components/web/datos';

const MENUS = {
  producto: { t: 'Producto', items: FUNCIONES.map((f) => ({ href: `/funciones/${f.slug}`, icono: f.icono, t: f.nombre, d: f.corto })), pie: { href: '/funciones', t: 'Ver todas las funciones' } },
  soluciones: { t: 'Soluciones', items: SEGMENTOS.map((s) => ({ href: s.ruta, icono: s.icono, t: s.n, d: s.id === 'business' ? 'Alcance y precio a medida' : `Desde ${s.desde} €/mes sin IVA` })), pie: { href: '/precios', t: 'Comparar planes' } },
};

export default function Cabecera() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(null); // menú desplegable en el ordenador
  const [movil, setMovil] = useState(false);
  const [fondo, setFondo] = useState(false);
  const cerrarT = useRef(null);
  const rutaAnterior = useRef(ruta);
  const cabecera = useRef(null);
  const hamburguesa = useRef(null);
  const gatillos = useRef({});

  useEffect(() => { if (rutaAnterior.current !== ruta) { setAbierto(null); setMovil(false); rutaAnterior.current = ruta; } }, [ruta]);
  useEffect(() => {
    const f = () => setFondo(window.scrollY > 12);
    f();
    addEventListener('scroll', f, { passive: true });
    return () => removeEventListener('scroll', f);
  }, []);
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('web-sin-scroll', movil);
    const contenido = [...document.querySelectorAll('.web-main, .web-pie')];
    contenido.forEach((el) => { el.inert = movil; });
    const esc = (e) => {
      if (e.key === 'Escape') {
        if (movil) hamburguesa.current?.focus();
        else if (abierto) gatillos.current[abierto]?.focus();
        setAbierto(null); setMovil(false);
      }
      if (e.key === 'Tab' && movil) {
        const elementos = [...cabecera.current.querySelectorAll('a[href], button:not(:disabled)')].filter((el) => el.tabIndex >= 0 && el.getClientRects().length);
        const primero = elementos[0], ultimo = elementos.at(-1);
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo?.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero?.focus(); }
      }
    };
    addEventListener('keydown', esc);
    return () => { removeEventListener('keydown', esc); document.documentElement.classList.remove('web-sin-scroll'); contenido.forEach((el) => { el.inert = false; }); };
  }, [movil, abierto]);
  useEffect(() => {
    const fuera = (e) => { if (!cabecera.current?.contains(e.target)) setAbierto(null); };
    const escritorio = matchMedia('(min-width: 981px)');
    const ajustar = () => { setMovil(false); setAbierto(null); };
    document.addEventListener('pointerdown', fuera);
    escritorio.addEventListener('change', ajustar);
    return () => { clearTimeout(cerrarT.current); document.removeEventListener('pointerdown', fuera); escritorio.removeEventListener('change', ajustar); };
  }, []);

  // Pequeño margen al salir: pasar del botón al panel no lo cierra.
  const entrar = (k) => { if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return; clearTimeout(cerrarT.current); setAbierto(k); };
  const salir = () => { cerrarT.current = setTimeout(() => setAbierto(null), 140); };
  const activo = (href) => (href === '/' ? ruta === '/' : ruta.startsWith(href));
  const enMenu = (k) => MENUS[k].items.some((i) => activo(i.href)) || (k === 'producto' && ruta === '/funciones');

  return (
    <header ref={cabecera} className={`web-cab${fondo || abierto ? ' con-fondo' : ''}${movil ? ' menu-abierto' : ''}`} onMouseLeave={salir}>
      <div className="web-cab-in">
        <Link href="/" aria-label="Netto, inicio" className="web-marca"><Logo className="web-logo" /></Link>
        <nav className="web-nav" aria-label="Principal">
          {Object.entries(MENUS).map(([k, m]) => (
            <div key={k} className="web-nav-grupo" onMouseEnter={() => entrar(k)}>
              <button ref={(el) => { gatillos.current[k] = el; }} className={`web-nav-btn${enMenu(k) ? ' activo' : ''}`} aria-expanded={abierto === k} aria-controls={`web-menu-${k}`} onClick={() => setAbierto(abierto === k ? null : k)}>
                {m.t}<Icono n="chevron" className="ico web-nav-chev" />
              </button>
            </div>
          ))}
          <Link href="/precios" className={`web-nav-btn${activo('/precios') ? ' activo' : ''}`} onMouseEnter={salir}>Precios</Link>
          <Link href="/seguridad" className={`web-nav-btn${activo('/seguridad') ? ' activo' : ''}`} onMouseEnter={salir}>Seguridad</Link>
        </nav>
        <div className="web-cab-acciones">
          <Link href="/login" className="web-cab-entrar">Entrar</Link>
          <Link href="/registro" className="web-btn web-btn-peq">Empieza gratis</Link>
          <button ref={hamburguesa} className="web-hamburguesa" aria-controls="web-menu-movil" aria-label={movil ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={movil} onClick={() => setMovil(!movil)}>
            <Icono n={movil ? 'cerrar' : 'menu'} />
          </button>
        </div>
      </div>

      <div className={`web-mega${abierto ? ' abierto' : ''}`} onMouseEnter={() => clearTimeout(cerrarT.current)} aria-hidden={!abierto}>
        {Object.entries(MENUS).map(([k, m]) => (
          <div key={k} id={`web-menu-${k}`} inert={abierto !== k} className={`web-mega-panel${abierto === k ? ' visible' : ''}${k === 'soluciones' ? ' estrecho' : ''}`}>
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

      <div id="web-menu-movil" inert={!movil} className={`web-cajon${movil ? ' abierto' : ''}`} aria-hidden={!movil}>
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
          <Link href="/verificado" style={{ '--n': 12 }} tabIndex={movil ? 0 : -1}><Icono n="tic" />Cálculos verificados</Link>
          <Link href="/contacto" style={{ '--n': 13 }} tabIndex={movil ? 0 : -1}><Icono n="correo" />Contacto</Link>
          <div className="web-cajon-cta">
            <Link href="/login" className="web-btn web-btn-claro" tabIndex={movil ? 0 : -1}>Entrar</Link>
            <Link href="/registro" className="web-btn" tabIndex={movil ? 0 : -1}>Empieza gratis</Link>
          </div>
        </div>
      </div>
    </header>
  );
}
