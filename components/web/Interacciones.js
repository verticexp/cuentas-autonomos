'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const fmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

// Detalles de movimiento de la web pública: aparición al hacer scroll, contadores y foco de luz en los paneles.
export default function Interacciones() {
  const ruta = usePathname();

  useEffect(() => {
    const raiz = document.querySelector('.web');
    if (!raiz) return;
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const contar = (el) => {
      const fin = Number(el.dataset.contar);
      if (quieto) { el.textContent = fmt.format(fin); return; }
      const t0 = performance.now();
      const paso = (t) => {
        const k = Math.min(1, (t - t0) / 1100);
        el.textContent = fmt.format(Math.round(fin * (1 - Math.pow(1 - k, 4))));
        if (k < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    };

    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      if (e.target.dataset.contar) contar(e.target);
      else e.target.classList.add('visto');
      io.unobserve(e.target);
    }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    const SEL = '[data-r]:not(.visto), [data-contar]';
    const vigilar = (n) => {
      if (n.nodeType !== 1) return;
      if (n.matches(SEL)) io.observe(n);
      n.querySelectorAll(SEL).forEach((el) => io.observe(el));
    };
    vigilar(raiz);
    // El contenido de la página puede llegar después (streaming tras app/(web)/loading.js).
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(vigilar)));
    mo.observe(raiz, { childList: true, subtree: true });

    const mover = (ev) => {
      const el = ev.target.closest?.('[data-foco]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${ev.clientX - r.left}px`);
      el.style.setProperty('--my', `${ev.clientY - r.top}px`);
    };
    raiz.addEventListener('pointermove', mover, { passive: true });

    return () => { io.disconnect(); mo.disconnect(); raiz.removeEventListener('pointermove', mover); };
  }, [ruta]);

  return null;
}
