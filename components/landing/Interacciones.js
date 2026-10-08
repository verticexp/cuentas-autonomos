'use client';

import { useEffect } from 'react';

// Pequeños detalles de la web pública: cabecera con fondo al bajar, aparición al hacer scroll y foco de luz en los paneles.
export default function Interacciones() {
  useEffect(() => {
    const raiz = document.querySelector('.web');
    if (!raiz) return;
    const cab = raiz.querySelector('.web-cab');
    const alBajar = () => cab?.classList.toggle('web-cab-fondo', window.scrollY > 24);
    alBajar();
    addEventListener('scroll', alBajar, { passive: true });

    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    raiz.querySelectorAll('[data-r]').forEach((el) => io.observe(el));

    const mover = (ev) => {
      const el = ev.target.closest?.('[data-foco]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${ev.clientX - r.left}px`);
      el.style.setProperty('--my', `${ev.clientY - r.top}px`);
    };
    raiz.addEventListener('pointermove', mover, { passive: true });

    return () => { removeEventListener('scroll', alBajar); io.disconnect(); raiz.removeEventListener('pointermove', mover); };
  }, []);
  return null;
}
