'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { salirDe } from '@/lib/transicion';
import { salirSinGuardar } from './useCambiosSinGuardar';

// Ajustes en el móvil es una hoja (app/ajustes.css .aj-marco): como en iOS, se arrastra hacia abajo para cerrarla, desde su
// cabecera o con la pantalla arriba del todo. Al soltar, se cierra si ha bajado bastante o se ha lanzado rápido (la
// transición «bajar» sigue desde donde la dejó el dedo) y vuelve a la pantalla de antes de abrir Ajustes; si no, vuelve a
// su sitio. Hacia arriba es desplazar la pantalla y de lado, el gesto de volver. Con cambios sin guardar se pregunta antes
// (components/useCambiosSinGuardar.js) y, si la persona se queda, la hoja vuelve a su sitio.
const UMBRAL = 8; // px antes de decidir si el gesto es arrastrar la hoja

export default function ArrastrarAjustes() {
  const router = useRouter();
  useEffect(() => {
    const movil = matchMedia('(max-width: 1023.98px)');
    let g = null; // { x, y, t, arrastre, dy, vel, marco }
    const limpiar = (marco) => {
      for (const p of ['transform', 'transition', 'will-change']) marco?.style.removeProperty(p);
      document.body.style.removeProperty('background');
    };
    const empieza = (e) => {
      const marco = e.target.closest?.('.aj-marco');
      if (!marco || !movil.matches || e.touches.length !== 1) return;
      if (document.querySelector('[aria-modal="true"], dialog[open]')) return; // un diálogo encima: es suyo
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (!e.target.closest('.aj-hoja-cab') && scrollY > 0) return; // desplazada, el dedo desplaza la pantalla
      const t = e.touches[0];
      g = { x: t.clientX, y: t.clientY, t: e.timeStamp, arrastre: false, dy: 0, vel: 0, marco };
    };
    const sigue = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (!g.arrastre) {
        if (dy < -4 || Math.abs(dx) > Math.abs(dy)) { g = null; return; }
        if (dy > 0 && e.cancelable) e.preventDefault(); // arriba del todo, bajar no desplaza: que no rebote ni recargue
        if (dy < UMBRAL) return;
        g.arrastre = true;
        g.marco.style.transition = 'none';
        g.marco.style.willChange = 'transform';
        document.body.style.background = 'var(--hoja-fondo)'; // detrás de la hoja, el fondo oscurecido entero
      }
      if (e.cancelable) e.preventDefault();
      const d = Math.max(0, dy - UMBRAL);
      const dt = e.timeStamp - g.t;
      if (dt > 0) g.vel = (d - g.dy) / dt;
      g.dy = d;
      g.t = e.timeStamp;
      g.marco.style.transform = `translate3d(0, ${d}px, 0)`;
    };
    const suelta = (e) => {
      if (!g) return;
      const { arrastre, marco, dy } = g;
      const vel = e.timeStamp - g.t > 80 ? 0 : g.vel; // se paró antes de soltar: no es un lanzamiento
      g = null;
      if (!arrastre) return;
      // El toque del final del arrastre no abre lo que quedó debajo del dedo.
      const tragar = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      addEventListener('click', tragar, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', tragar, { capture: true }), 350);
      if (e.type === 'touchend' && (dy > innerHeight * 0.22 || (vel > 0.5 && dy > 30))) {
        // Mientras se pregunta, la hoja se queda donde la dejó el dedo; si no se sale, vuelve a su sitio.
        salirSinGuardar(() => {
          salirDe(router, '/ajustes', '/mas', 'bajar');
          setTimeout(() => { if (marco.isConnected) limpiar(marco); }, 1500); // si la navegación no llegó, la hoja vuelve
        }).then((salio) => { if (!salio) devolver(marco); });
        return;
      }
      devolver(marco);
    };
    const devolver = (marco) => {
      marco.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.2, 0.64, 1)';
      marco.style.transform = 'translate3d(0, 0, 0)';
      setTimeout(() => limpiar(marco), 420);
    };
    document.addEventListener('touchstart', empieza, { passive: true });
    document.addEventListener('touchmove', sigue, { passive: false });
    document.addEventListener('touchend', suelta);
    document.addEventListener('touchcancel', suelta);
    return () => {
      document.body.style.removeProperty('background'); // fuera de Ajustes, el fondo de siempre
      document.removeEventListener('touchstart', empieza);
      document.removeEventListener('touchmove', sigue);
      document.removeEventListener('touchend', suelta);
      document.removeEventListener('touchcancel', suelta);
    };
  }, [router]);
  return null;
}
