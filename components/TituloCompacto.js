'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SIN_BARRA, subirArriba } from '@/lib/transicion';
import '@/app/titulo-compacto.css';

// Barra de título compacta del móvil, como la de las apps de iOS: al desplazar, cuando el título grande de la pantalla
// (el h1 de .pagina) se va por arriba, aparece una barra translúcida con el título pequeño en el centro y «‹ Atrás» a la
// izquierda (pulsa el «‹ Atrás» de la página: hace lo mismo, con su «¿Salir sin guardar?»). Tocar el título sube arriba.
// No sale en el Resumen (su cabecera oscura ya es la barra), en las conversaciones ni en la hoja de Ajustes (tienen la suya)
// ni en el ordenador. Mientras se ve, lo fijo arriba de las listas (resumen de Facturas, total de Caja) baja con ella
// (html[data-titulo-compacto], app/titulo-compacto.css).
const SIN_TITULO = (path) => path === '/' || SIN_BARRA.test(path);
const visible = (el) => el.getClientRects().length > 0;

export default function TituloCompacto() {
  const path = usePathname() || '/';
  const [estado, setEstado] = useState(null); // { titulo, atras } o null si la pantalla no tiene barra
  const [ver, setVer] = useState(false);
  const barra = useRef(null);
  const nombreAtras = useRef(null);
  const [soloFlecha, setSoloFlecha] = useState(false);
  const partes = useRef({ h1: null, volver: null });

  useEffect(() => {
    const movil = matchMedia('(max-width: 1023.98px)');
    let pendiente = 0;
    // Qué título y qué «‹ Atrás» tiene la pantalla (cambian al navegar y, en algunas, al cargar sus datos).
    const buscar = () => {
      const h1 = SIN_TITULO(path) || !movil.matches || document.querySelector('.aviso-lectura') ? null
        : [...document.querySelectorAll('main.pagina h1')].find(visible) || null;
      const volver = h1 ? [...document.querySelectorAll('main.pagina a.volver')].find(visible) || null : null;
      partes.current = { h1, volver };
      const titulo = h1?.textContent.replace(/\s+/g, ' ').trim() || '';
      const atras = volver?.querySelector('.volver-texto')?.textContent.trim() || (volver ? 'Atrás' : '');
      setEstado((e) => (!titulo ? null : e?.titulo === titulo && e?.atras === atras ? e : { titulo, atras }));
      medir();
    };
    // Sale cuando el título grande ya está entero debajo de la barra.
    const medir = () => {
      pendiente = 0;
      const { h1 } = partes.current;
      const alto = barra.current?.offsetHeight || 0;
      setVer(Boolean(h1 && h1.isConnected && alto && h1.getBoundingClientRect().bottom <= alto));
    };
    const pedir = () => { if (!pendiente) pendiente = requestAnimationFrame(medir); };
    buscar();
    const t = setTimeout(buscar, 400); // la pantalla nueva puede llegar un poco después de la dirección
    const mo = new MutationObserver(() => { clearTimeout(mo.t); mo.t = setTimeout(buscar, 120); });
    mo.observe(document.querySelector('main') || document.body, { childList: true, subtree: true, characterData: true });
    addEventListener('scroll', pedir, { passive: true });
    addEventListener('resize', buscar);
    movil.addEventListener('change', buscar);
    return () => {
      clearTimeout(t); clearTimeout(mo.t); mo.disconnect(); cancelAnimationFrame(pendiente);
      removeEventListener('scroll', pedir);
      removeEventListener('resize', buscar);
      movil.removeEventListener('change', buscar);
    };
  }, [path]);

  // Si el nombre de «‹ Atrás» no cabe junto al título, solo la flecha, como en iOS (no «‹ Fa…»). Se mide en el fotograma
  // siguiente y sin useLayoutEffect: un setState en un efecto de diseño dentro de una transición de vista encadenaba
  // repintados en WebKit hasta el error 185 de React (pantalla «No se ha podido cargar Fisquo»).
  useEffect(() => {
    const el = nombreAtras.current;
    const id = requestAnimationFrame(() => setSoloFlecha(Boolean(el) && el.scrollWidth > el.clientWidth + 1));
    return () => cancelAnimationFrame(id);
  }, [estado]);

  // Con la barra a la vista, lo fijo arriba de la página se coloca debajo de ella.
  const mostrada = Boolean(estado) && ver;
  useEffect(() => {
    const html = document.documentElement;
    if (mostrada) html.dataset.tituloCompacto = '1'; else delete html.dataset.tituloCompacto;
    return () => { delete html.dataset.tituloCompacto; };
  }, [mostrada]);

  return (
    <div ref={barra} className={`titulo-compacto${mostrada ? ' visible' : ''}`} aria-hidden={!mostrada}>
      {estado?.atras && (
        <button type="button" className={`tc-atras${soloFlecha ? ' solo-flecha' : ''}`} aria-label={`Volver a ${estado.atras}`} tabIndex={mostrada ? 0 : -1} onClick={() => partes.current.volver?.click()}>
          <svg viewBox="0 0 12 21" aria-hidden><path d="M10 2L2 10.5 10 19" /></svg>
          <span ref={nombreAtras}>{estado.atras}</span>
        </button>
      )}
      <button type="button" className="tc-titulo" tabIndex={-1} onClick={subirArriba}>{estado?.titulo}</button>
    </div>
  );
}
