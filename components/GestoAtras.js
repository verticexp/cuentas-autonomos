'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { anterior, instalarHistorial, volverA } from '@/lib/transicion';
import { hayAvisoEncima, hayCambiosSinGuardar, instalarSinGuardar, salirSinGuardar, soltarCambios } from './useCambiosSinGuardar';

// «Atrás» del móvil en toda la app (va en el layout):
// - Con una hoja o un diálogo abiertos ([aria-modal]): en Android, el botón o el gesto de atrás los cierra (como Escape) en
//   vez de salir de la pantalla; en la app de iOS, el gesto de volver se apaga mientras están abiertos, como en las apps
//   nativas (mobile/ios/App/App/FisquoViewController.swift). La pantalla de bloqueo no se cierra así.
// - Web guardada en la pantalla de inicio del iPhone: ahí iOS no tiene gesto de volver. Deslizar desde el borde izquierdo
//   lleva la pantalla con el dedo y, al soltar, vuelve como «‹ Atrás» (lib/transicion.js volverA).
const BORDE = 24; // px desde el borde izquierdo en los que empieza el gesto
const RAICES = ['/', '/facturas', '/gastos', '/mas', '/login', '/bloqueo', '/bienvenida', '/confirmar-email'];
const visible = (el) => el.getClientRects().length > 0;
const capas = () => [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].filter(visible);

// Adónde lleva el gesto: a la pantalla anterior (o al paso anterior de un formulario) o, si se abrió esta directamente,
// a la de su «‹ Atrás». Las pantallas principales (pestañas, entrada) no tienen gesto, como en iOS.
function destino() {
  const enlace = [...document.querySelectorAll('a.volver, a.legal-volver')].find(visible);
  if (anterior() && (enlace || Number.isInteger(history.state?.__paso) || !RAICES.includes(location.pathname))) return enlace?.getAttribute('href') || location.pathname;
  return enlace?.getAttribute('href') || null;
}

export default function GestoAtras() {
  const router = useRouter();

  // «¿Salir sin guardar?» (components/useCambiosSinGuardar.js): el atrás del sistema desde un formulario con cambios pregunta.
  useEffect(() => { instalarSinGuardar(router); }, [router]);

  // Hojas y diálogos: Android los cierra con atrás; la app de iOS deja sin gesto de volver la pantalla que tapan.
  useEffect(() => {
    instalarHistorial();
    const nativo = window.webkit?.messageHandlers?.gestoAtras;
    const conCierre = typeof window.CloseWatcher === 'function' && matchMedia('(pointer: coarse)').matches;
    if (!nativo && !conCierre) return undefined;
    let gestoActivo = null; // la primera vez se dice siempre (la página anterior pudo dejarlo apagado)
    let escape = -1e9; // un Escape de teclado de verdad ya cierra la capa: el cierre que llega detrás no repite
    const vigilantes = new Map();
    const vistas = new WeakSet();
    const repasar = () => {
      const abiertas = capas();
      const libre = abiertas.length === 0;
      if (nativo && libre !== gestoActivo) { gestoActivo = libre; nativo.postMessage(libre); }
      if (!conCierre) return;
      // Los <dialog> los cierra ya el navegador; la pantalla de bloqueo no se cierra.
      const cerrables = abiertas.filter((el) => !el.matches('dialog') && !el.closest('.pantalla-bloqueo'));
      for (const [el, w] of vigilantes) if (!cerrables.includes(el)) { w.destroy(); vigilantes.delete(el); }
      for (const el of cerrables) {
        if (vistas.has(el)) continue; // una por capa: si no se cerró, el siguiente atrás sale de la pantalla
        vistas.add(el);
        try {
          const w = new window.CloseWatcher();
          w.onclose = () => {
            vigilantes.delete(el);
            if (performance.now() - escape < 300) return;
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
          };
          vigilantes.set(el, w);
        } catch { /* el navegador no deja vigilar más sin un toque de por medio */ }
      }
    };
    const teclas = (e) => { if (e.key === 'Escape' && e.isTrusted) escape = performance.now(); };
    const mo = new MutationObserver(repasar);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'open'] });
    document.addEventListener('keydown', teclas, true);
    repasar();
    return () => {
      mo.disconnect();
      document.removeEventListener('keydown', teclas, true);
      vigilantes.forEach((w) => w.destroy());
      if (nativo && gestoActivo === false) nativo.postMessage(true);
    };
  }, []);

  // Deslizar desde el borde en la web guardada en el iPhone (en la app de iOS lo hace el propio WebView).
  useEffect(() => {
    let g = null; // { x, y, pagina, href, arrastre, dx, vel, t }
    const limpiar = (pagina) => {
      document.body.style.removeProperty('background-color');
      for (const p of ['transform', 'transition', 'box-shadow', 'background', 'min-height', 'will-change', 'visibility']) pagina?.style.removeProperty(p);
    };
    const quitar = () => {
      document.removeEventListener('touchmove', mover, { capture: true });
      document.removeEventListener('touchend', soltar, { capture: true });
      document.removeEventListener('touchcancel', soltar, { capture: true });
    };
    const empezar = (e) => {
      if (g || e.touches.length !== 1 || navigator.standalone !== true || document.documentElement.dataset.app) return;
      const t = e.touches[0];
      if (t.clientX > BORDE || e.target.closest?.('.tabbar') || capas().length) return;
      const href = destino();
      if (!href) return;
      g = { x: t.clientX, y: t.clientY, href, arrastre: false, dx: 0, vel: 0, t: e.timeStamp, pagina: document.querySelector('body > main:not(.pantalla-bloqueo), body > .pdf-fondo') };
      document.addEventListener('touchmove', mover, { passive: false, capture: true });
      document.addEventListener('touchend', soltar, { capture: true });
      document.addEventListener('touchcancel', soltar, { capture: true });
    };
    const mover = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x, dy = t.clientY - g.y;
      if (!g.arrastre) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; quitar(); return; } // es desplazar la pantalla
        if (dx < 8 || dx < Math.abs(dy)) return;
        g.arrastre = true;
        const p = g.pagina;
        if (p) {
          p.style.transition = 'none';
          p.style.willChange = 'transform';
          p.style.background = 'var(--paper)';
          p.style.minHeight = '100dvh';
          p.style.boxShadow = '-10px 0 30px rgba(0, 0, 0, 0.12)';
        }
        // Lo de detrás, un poco más oscuro: como la pantalla anterior en iOS.
        document.body.style.backgroundColor = 'color-mix(in srgb, var(--paper) 90%, #000)';
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - g.t;
      if (dt > 0) g.vel = (dx - g.dx) / dt;
      g.dx = Math.max(0, dx);
      g.t = e.timeStamp;
      if (g.pagina) g.pagina.style.transform = `translate3d(${g.dx}px, 0, 0)`;
    };
    const soltar = (e) => {
      if (!g) return;
      const { arrastre, pagina, href, dx } = g;
      const vel = e.timeStamp - g.t > 80 ? 0 : g.vel; // se paró antes de soltar: no es un lanzamiento
      g = null;
      quitar();
      if (!arrastre) return;
      if (e.type === 'touchend' && (dx > innerWidth * 0.35 || (vel > 0.35 && dx > 30))) {
        // Un formulario con cambios sin guardar: la pantalla vuelve a su sitio y se pregunta, como con «‹ Atrás».
        if (hayCambiosSinGuardar()) {
          devolver(pagina);
          salirSinGuardar(() => volverA(router, href, 'atras'));
          return;
        }
        // La entrada de «¿Salir sin guardar?» encima, ya sin nada que guardar: se quita antes, con la pantalla donde la dejó el dedo.
        if (hayAvisoEncima()) { soltarCambios().then(() => completar(pagina, href, dx)); return; }
        completar(pagina, href, dx);
        return;
      }
      devolver(pagina);
    };
    const devolver = (pagina) => {
      if (!pagina) { limpiar(); return; }
      pagina.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      pagina.style.transform = 'translate3d(0, 0, 0)';
      setTimeout(() => limpiar(pagina), 320);
    };
    const completar = (pagina, href, dx) => {
      // Sigue desde donde se soltó: la transición «gesto» (app/diseno.css) parte de --vt-x. Las páginas públicas (entrar,
      // registro) ya animan solas al volver (lib/transicionPublica.js): ahí, y sin transiciones, se aparta y se vuelve.
      const publica = document.querySelector('.web-main, main.login:not(.pantalla-bloqueo)');
      if (document.startViewTransition && !publica && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.style.setProperty('--vt-x', `${dx}px`);
        limpiar(pagina);
        volverA(router, href, 'gesto');
        return;
      }
      if (pagina) {
        pagina.style.transition = 'transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)';
        pagina.style.transform = 'translate3d(100%, 0, 0)';
      }
      setTimeout(() => {
        if (pagina) pagina.style.visibility = 'hidden';
        // Un paso anterior del mismo formulario reaparece en cuanto cambia; otra pantalla, cuando llega.
        const mismaPantalla = anterior() === `${location.pathname}${location.search}`;
        if (mismaPantalla) addEventListener('popstate', () => setTimeout(() => limpiar(pagina), 0), { once: true });
        if (anterior()) history.back(); else router.replace(href);
        if (!mismaPantalla) setTimeout(() => limpiar(pagina), 350);
      }, 200);
    };
    document.addEventListener('touchstart', empezar, { passive: true, capture: true });
    return () => { document.removeEventListener('touchstart', empezar, { capture: true }); quitar(); };
  }, [router]);

  return null;
}
