'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { destinoHoja, instalarHistorial } from '@/lib/transicion';
import { fondoDe, fondoGenerico } from '@/lib/hojaAjustes';

// Lo que rodea la hoja de Ajustes en el móvil (app/ajustes/layout.js):
// - Detrás, la pantalla a la que vuelve al cerrarse, encogida y oscurecida como en iOS: la copia que se hizo al abrirla
//   (lib/hojaAjustes.js) o, si no la hay (se abrió Ajustes directamente o se recargó), un esqueleto.
// - La hoja se desplaza por dentro (app/ajustes.css): cada ajuste que se abre empieza arriba del todo y, al volver a la
//   lista, está donde se dejó. Next desplazaba la página entera hasta el ajuste y la hoja quedaba subida bajo la hora.
// - Con el teclado fuera, la hoja llega hasta el teclado y la ventana no se mueve: iOS la desplazaba para enseñar el campo y
//   la hoja se metía bajo la hora. Lo que se escribe se ve encima del teclado, dentro de la hoja.
let alturaLista = 0;

export default function HojaAjustes() {
  const ref = useRef(null);
  const ruta = usePathname();
  const dondeIba = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!matchMedia('(max-width: 1023.98px)').matches) return undefined;
    instalarHistorial();
    const copia = fondoDe(destinoHoja());
    el.replaceChildren(...(copia?.nodo || fondoGenerico()).childNodes);
    if (copia) el.dataset.y = String(copia.y);
    else delete el.dataset.y;
    const hoja = el.parentElement.querySelector('.aj-desliza');
    const recordar = () => { if (dondeIba.current === '/ajustes') alturaLista = hoja.scrollTop; };
    hoja?.addEventListener('scroll', recordar, { passive: true });
    return () => hoja?.removeEventListener('scroll', recordar);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    const movil = matchMedia('(max-width: 1023.98px)');
    if (!vv) return undefined;
    const html = document.documentElement;
    let marco = 0;
    const ajustar = () => {
      cancelAnimationFrame(marco);
      // La ventana no se desplaza (todo está en la hoja): si iOS la sube para enseñar el campo, vuelve a su sitio.
      if (movil.matches && scrollY !== 0) scrollTo(0, 0);
      marco = requestAnimationFrame(() => {
        if (movil.matches && scrollY !== 0) scrollTo(0, 0);
        const teclado = movil.matches && vv.height < screen.height * 0.85;
        if (!teclado) { html.style.removeProperty('--vv-alto'); return; }
        html.style.setProperty('--vv-alto', `${Math.round(vv.height)}px`);
        // El campo, a la vista dentro de la hoja (no con scrollIntoView: también desplazaría la ventana).
        const hoja = ref.current?.parentElement.querySelector('.aj-desliza');
        const campo = document.activeElement;
        if (!hoja?.contains(campo)) return;
        const r = campo.getBoundingClientRect(), h = hoja.getBoundingClientRect();
        if (r.bottom > h.bottom - 16) hoja.scrollTop += r.bottom - h.bottom + 16;
        else if (r.top < h.top + 56) hoja.scrollTop -= h.top + 56 - r.top;
      });
    };
    vv.addEventListener('resize', ajustar);
    vv.addEventListener('scroll', ajustar);
    addEventListener('scroll', ajustar, { passive: true });
    document.addEventListener('focusin', ajustar);
    return () => {
      cancelAnimationFrame(marco);
      vv.removeEventListener('resize', ajustar);
      vv.removeEventListener('scroll', ajustar);
      removeEventListener('scroll', ajustar);
      document.removeEventListener('focusin', ajustar);
      html.style.removeProperty('--vv-alto');
    };
  }, []);

  useLayoutEffect(() => {
    const hoja = ref.current?.parentElement.querySelector('.aj-desliza');
    const antes = dondeIba.current;
    dondeIba.current = ruta;
    if (!hoja || antes === null || antes === ruta) return;
    const y = ruta === '/ajustes' ? alturaLista : 0;
    const lista = hoja.querySelector('.ajustes-lista');
    if (!y || !document.documentElement.dataset.vt || !lista) { hoja.scrollTop = y; return; }
    // Volver a la lista con una transición: WebKit captura mal una hoja desplazada justo antes (la imagen salía corrida
    // y con la pantalla de detrás encima). Mientras dura, la lista se ve en su sitio movida con transform (la cabecera,
    // fija, no) y al acabar se desplaza de verdad: queda igual.
    hoja.scrollTop = 0;
    const movidos = [...lista.children].filter((el) => !el.classList.contains('aj-hoja-cab'));
    for (const el of movidos) el.style.transform = `translate3d(0, ${-y}px, 0)`;
    const soltar = () => {
      if (document.documentElement.dataset.vt) { setTimeout(soltar, 50); return; }
      for (const el of movidos) el.style.removeProperty('transform');
      hoja.scrollTop = y;
    };
    setTimeout(soltar, 50);
  }, [ruta]);

  return <div ref={ref} className="aj-fondo" aria-hidden="true" inert />;
}
