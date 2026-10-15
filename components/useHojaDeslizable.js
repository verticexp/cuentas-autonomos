'use client';

import { useCallback, useEffect, useRef } from 'react';

// Hoja inferior como las de iOS: se arrastra hacia abajo con el dedo (desde el asa o con la lista arriba del todo) y, al
// soltarla, se cierra si se ha bajado bastante o se ha lanzado rápido; si no, vuelve a su sitio. Cerrar (Escape, el fondo,
// «Cerrar») también la baja en vez de hacerla desaparecer de golpe. Con movimiento reducido se cierra sin animar.
// panel: ref del .hoja-panel (el .hoja-fondo es su hermano anterior). alCerrar: lo que la quita de la pantalla.
const SALIDA_MS = 240;
const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useHojaDeslizable(panel, abierta, alCerrar) {
  const cerrando = useRef(false);
  const fin = useRef(alCerrar);
  fin.current = alCerrar;

  const fondoDe = (p) => p?.parentElement?.querySelector('.hoja-fondo');

  const cerrar = useCallback(() => {
    const p = panel.current;
    if (!p || cerrando.current || quieto()) { fin.current(); return; }
    cerrando.current = true;
    const fondo = fondoDe(p);
    p.style.transition = `transform ${SALIDA_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`;
    p.style.transform = 'translateY(100%)';
    if (fondo) { fondo.style.transition = `opacity ${SALIDA_MS}ms ease`; fondo.style.opacity = '0'; }
    p.parentElement.style.pointerEvents = 'none';
    setTimeout(() => fin.current(), SALIDA_MS);
  }, [panel]);

  useEffect(() => {
    if (!abierta) return undefined;
    cerrando.current = false;
    const p = panel.current;
    if (!p) return undefined;
    const fondo = fondoDe(p);
    let inicio = null; // { y, t, desdeAsa }
    let arrastrando = false;
    let ultimo = { y: 0, t: 0 }, vel = 0;

    const mover = (dy) => {
      p.style.transform = `translateY(${Math.max(0, dy)}px)`;
      if (fondo) fondo.style.opacity = String(1 - Math.min(1, Math.max(0, dy) / p.offsetHeight));
    };
    const empieza = (e) => {
      if (e.touches.length !== 1 || cerrando.current) return;
      const desdeAsa = !!e.target.closest('.hoja-asa, .hoja-t');
      if (!desdeAsa && p.scrollTop > 0) return; // con la lista desplazada, el dedo desplaza la lista
      const y = e.touches[0].clientY;
      inicio = { y, desdeAsa };
      ultimo = { y, t: e.timeStamp };
      vel = 0;
    };
    const sigue = (e) => {
      if (!inicio) return;
      const y = e.touches[0].clientY;
      const dy = y - inicio.y;
      if (!arrastrando) {
        if (dy < -4) { inicio = null; return; } // hacia arriba: es desplazar la lista
        if (dy > 0 && e.cancelable) e.preventDefault(); // con la lista arriba, bajar no desplaza nada: que no empiece a hacerlo
        if (dy < 6) return;
        arrastrando = true;
        p.style.transition = 'none';
        if (fondo) fondo.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - ultimo.t;
      if (dt > 0) vel = (y - ultimo.y) / dt;
      ultimo = { y, t: e.timeStamp };
      mover(dy - 6);
    };
    const suelta = (e) => {
      if (!inicio) return;
      if (e.timeStamp - ultimo.t > 80) vel = 0; // se detuvo antes de soltar: no es un lanzamiento
      const estaba = arrastrando;
      inicio = null;
      arrastrando = false;
      if (!estaba) return;
      // Que el «toque» del final del arrastre no abra el enlace que quedó debajo del dedo
      // (si no llega ningún clic, se retira enseguida para no tragarse el siguiente toque)
      const tragar = (e) => { e.preventDefault(); e.stopPropagation(); };
      p.addEventListener('click', tragar, { capture: true, once: true });
      setTimeout(() => p.removeEventListener('click', tragar, { capture: true }), 350);
      const bajado = new DOMMatrixReadOnly(getComputedStyle(p).transform).m42;
      if (vel > 0.5 || bajado > p.offsetHeight * 0.3) { cerrar(); return; }
      // Vuelve a su sitio con un pequeño rebote
      p.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.3, 0.64, 1)';
      p.style.transform = '';
      if (fondo) { fondo.style.transition = 'opacity 0.3s ease'; fondo.style.opacity = ''; }
    };

    p.addEventListener('touchstart', empieza, { passive: true });
    p.addEventListener('touchmove', sigue, { passive: false });
    p.addEventListener('touchend', suelta);
    p.addEventListener('touchcancel', suelta);
    return () => {
      p.removeEventListener('touchstart', empieza);
      p.removeEventListener('touchmove', sigue);
      p.removeEventListener('touchend', suelta);
      p.removeEventListener('touchcancel', suelta);
    };
  }, [abierta, panel, cerrar]);

  return cerrar;
}
