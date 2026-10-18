'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { avisarFin } from '@/lib/arranque';

const fmt = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

// Apariciones discretas y una sola cuenta por elemento. El contenido nunca depende del observador para verse.
export default function Interacciones() {
  const ruta = usePathname();
  useEffect(() => {
    const raiz = document.querySelector('.web');
    if (!raiz) return;
    document.documentElement.dataset.arranque = 'visto';
    document.documentElement.classList.add('web-js');
    avisarFin();
    const movimiento = matchMedia('(prefers-reduced-motion: reduce)');
    const raton = matchMedia('(hover: hover) and (pointer: fine)');
    const cuadros = new Set();
    let vivo = true, foco = null, punto = null, cuadroFoco = null;
    const cuadro = (fn) => {
      const id = requestAnimationFrame((t) => { cuadros.delete(id); if (vivo) fn(t); });
      cuadros.add(id);
      return id;
    };
    const contar = (el) => {
      if (el.dataset.contado) return;
      el.dataset.contado = '1';
      const fin = Number(el.dataset.contar);
      if (movimiento.matches || raiz.dataset.teclado === '1') { el.textContent = fmt.format(fin); return; }
      const t0 = performance.now();
      const paso = (t) => {
        if (!el.isConnected || movimiento.matches) { el.textContent = fmt.format(fin); return; }
        const k = Math.min(1, (t - t0) / 650);
        el.textContent = fmt.format(Math.round(fin * (1 - Math.pow(1 - k, 4))));
        if (k < 1) cuadro(paso);
      };
      cuadro(paso);
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      if (e.target.hasAttribute('data-contar')) contar(e.target);
      else e.target.classList.add('visto');
      io.unobserve(e.target);
    }), { rootMargin: '0px 0px -3% 0px', threshold: 0.02 });
    const SEL = '[data-r]:not(.visto), [data-contar]:not([data-contado])';
    const vigilar = (n) => {
      if (n.nodeType !== 1) return;
      if (n.matches(SEL)) io.observe(n);
      n.querySelectorAll(SEL).forEach((el) => io.observe(el));
    };
    vigilar(raiz);
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(vigilar)));
    mo.observe(raiz, { childList: true, subtree: true });
    const mover = (ev) => {
      if (movimiento.matches || !raton.matches || ev.pointerType !== 'mouse') return;
      const el = ev.target.closest?.('[data-foco]');
      if (!el) return;
      foco = el; punto = { x: ev.clientX, y: ev.clientY };
      if (cuadroFoco !== null) return;
      cuadroFoco = cuadro(() => {
        cuadroFoco = null;
        if (!foco?.isConnected || movimiento.matches) return;
        const r = foco.getBoundingClientRect();
        foco.style.setProperty('--mx', `${punto.x - r.left}px`);
        foco.style.setProperty('--my', `${punto.y - r.top}px`);
      });
    };
    const teclado = () => { raiz.dataset.teclado = '1'; };
    const puntero = () => { delete raiz.dataset.teclado; };
    const reducir = () => {
      if (!movimiento.matches) return;
      raiz.querySelectorAll('[data-contar]').forEach((el) => { el.textContent = fmt.format(Number(el.dataset.contar)); el.dataset.contado = '1'; });
    };
    raiz.addEventListener('pointermove', mover, { passive: true });
    document.addEventListener('keydown', teclado, true);
    document.addEventListener('pointerdown', puntero, true);
    movimiento.addEventListener('change', reducir);
    return () => {
      vivo = false;
      cuadros.forEach(cancelAnimationFrame);
      raiz.querySelectorAll('[data-contar][data-contado]').forEach((el) => { el.textContent = fmt.format(Number(el.dataset.contar)); });
      io.disconnect(); mo.disconnect();
      raiz.removeEventListener('pointermove', mover);
      document.removeEventListener('keydown', teclado, true);
      document.removeEventListener('pointerdown', puntero, true);
      movimiento.removeEventListener('change', reducir);
    };
  }, [ruta]);
  return null;
}
