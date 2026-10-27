'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cerrarHoja } from '@/lib/transicion';
import { ponerFondo } from '@/lib/hojaAjustes';
import { salirSinGuardar } from './useCambiosSinGuardar';

// Ajustes en el móvil es una hoja (app/ajustes.css .aj-marco): como en iOS, se arrastra hacia abajo para cerrarla, desde su
// cabecera o con la hoja arriba del todo, y mientras baja la pantalla de detrás (components/HojaAjustes.js) recupera su
// tamaño. Al soltar, se cierra si ha bajado bastante o se ha lanzado rápido (lib/transicion.js cerrarHoja sigue desde donde
// la dejó el dedo) y vuelve a la pantalla de antes de abrir Ajustes; si no, vuelve a su sitio. Hacia arriba es desplazar la
// hoja y de lado, el gesto de volver. Con cambios sin guardar se pregunta antes (components/useCambiosSinGuardar.js) y, si
// la persona se queda, la hoja vuelve a su sitio.
const UMBRAL = 8; // px antes de decidir si el gesto es arrastrar la hoja
const RESORTE = 'cubic-bezier(0.34, 1.2, 0.64, 1)';

export default function ArrastrarAjustes() {
  const router = useRouter();
  useEffect(() => {
    const movil = matchMedia('(max-width: 1023.98px)');
    let g = null; // { x, y, t, arrastre, dy, vel, marco, fondo, alto }
    const limpiar = (marco, fondo) => {
      for (const p of ['transform', 'transition', 'will-change']) marco?.style.removeProperty(p);
      fondo?.style.removeProperty('transition');
      ponerFondo(fondo);
    };
    const empieza = (e) => {
      const marco = e.target.closest?.('.aj-marco');
      if (!marco || !movil.matches || e.touches.length !== 1) return;
      if (document.documentElement.dataset.hojaSaliendo) return;
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return; // un diálogo encima: es suyo
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!e.target.closest('.aj-hoja-cab') && marco.querySelector('.aj-desliza')?.scrollTop > 0) return; // desplazada, el dedo desplaza la hoja
      const t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, t: e.timeStamp, arrastre: false, dy: 0, vel: 0, marco, fondo: document.querySelector('.aj-fondo'), alto: innerHeight - marco.getBoundingClientRect().top };
    };
    const sigue = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (!g.arrastre) {
        if (dy < -4 || Math.abs(dx) > Math.abs(dy)) { g = null; return; }
        if (dy > 0 && e.cancelable) e.preventDefault(); // arriba del todo, bajar no desplaza: que no rebote
        if (dy < UMBRAL) return;
        g.arrastre = true;
        g.marco.style.transition = 'none';
        g.marco.style.willChange = 'transform';
        if (g.fondo) g.fondo.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      const d = Math.max(0, dy - UMBRAL);
      const dt = e.timeStamp - g.t;
      if (dt > 0) g.vel = (d - g.dy) / dt;
      g.dy = d;
      g.t = e.timeStamp;
      g.marco.style.transform = `translate3d(0, ${d}px, 0)`;
      ponerFondo(g.fondo, Math.min(1, d / g.alto));
    };
    const suelta = (e) => {
      if (!g) return;
      const { arrastre, marco, fondo, dy, alto } = g;
      const vel = e.timeStamp - g.t > 80 ? 0 : g.vel; // se paró antes de soltar: no es un lanzamiento
      g = null;
      if (!arrastre) return;
      // El toque del final del arrastre no abre lo que quedó debajo del dedo.
      const tragar = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      addEventListener('click', tragar, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', tragar, { capture: true }), 350);
      if (e.type === 'touchend' && (dy > alto * 0.25 || (vel > 0.5 && dy > 30))) {
        // Mientras se pregunta, la hoja se queda donde la dejó el dedo; si no se sale, vuelve a su sitio.
        salirSinGuardar(() => cerrarHoja(router, vel)).then((salio) => { if (!salio) devolver(marco, fondo); });
        return;
      }
      devolver(marco, fondo);
    };
    const devolver = (marco, fondo) => {
      marco.style.transition = `transform 0.4s ${RESORTE}`;
      marco.style.transform = 'translate3d(0, 0, 0)';
      if (fondo) {
        fondo.style.transition = `transform 0.4s ${RESORTE}, filter 0.4s, border-radius 0.4s`;
        ponerFondo(fondo, 0);
      }
      setTimeout(() => limpiar(marco, fondo), 420);
    };
    document.addEventListener('touchstart', empieza, { passive: true });
    document.addEventListener('touchmove', sigue, { passive: false });
    document.addEventListener('touchend', suelta);
    document.addEventListener('touchcancel', suelta);
    return () => {
      document.removeEventListener('touchstart', empieza);
      document.removeEventListener('touchmove', sigue);
      document.removeEventListener('touchend', suelta);
      document.removeEventListener('touchcancel', suelta);
    };
  }, [router]);
  return null;
}
