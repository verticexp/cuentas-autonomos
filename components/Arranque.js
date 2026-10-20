'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Logo from '@/components/Logo';
import { entrada } from '@/lib/transicion';
import { avisarFin } from '@/lib/arranque';

const ANIMACION = 1750; // ms desde que empieza a cargar la página: lo que dura la animación del logo (app/diseno.css)
const TOPE = 4500; // como mucho: si la red va lenta, se va igual (y a los 5 s el CSS la quita por si acaso)
const POR_PESTANA = 3000; // si una precarga no llega a verse, no bloquea el resto

const esperar = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

// Se resuelve cuando ya ha llegado la precarga de la pantalla `ruta` (Next la pide con ?_rsc=… al ver su enlace).
function precargada(ruta) {
  const es = (e) => { try { const u = new URL(e.name); return u.pathname === ruta && u.searchParams.has('_rsc'); } catch { return false; } };
  return new Promise((r) => {
    if (performance.getEntriesByType('resource').some(es)) return r();
    let o;
    try {
      o = new PerformanceObserver((l) => { if (l.getEntries().some(es)) { o.disconnect(); r(); } });
      o.observe({ type: 'resource', buffered: true });
    } catch { return r(); }
    esperar(POR_PESTANA).then(() => { o.disconnect(); r(); });
  });
}

// Pantalla de inicio: solo al abrir la app (una vez por sesión). Mientras dura, se prepara lo necesario para que la app
// abra sin esperas: la letra y las pantallas de las pestañas. La barrita de abajo acompaña a la animación pero nunca va
// por delante de lo que de verdad está listo; la pantalla se va cuando todo está listo y la animación ha acabado.
export default function Arranque() {
  const router = useRouter();
  const [fase, setFase] = useState('dentro');
  const barra = useRef(null);

  useEffect(() => {
    if (document.documentElement.dataset.arranque === 'visto') { setFase('fin'); avisarFin(); return; }
    // Se marca como vista al acabar, no al empezar: si el servidor manda a /bloqueo mientras tanto (recarga), vuelve a salir.
    const vista = () => { try { sessionStorage.setItem('fisquo-arranque', '1'); } catch {} };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { vista(); setFase('fin'); avisarFin(); return; }
    let vivo = true;
    let real = 0.35; // la app ya responde
    const desde = (ms) => ms - (performance.now() - (window.__arranque ?? 0));
    let cuadro = requestAnimationFrame(function pinta() {
      const reloj = 0.15 + 0.85 * Math.min(1, 1 - desde(ANIMACION) / ANIMACION);
      barra.current?.style.setProperty('--avance', Math.min(real, reloj));
      if (real < 1 || reloj < 1) cuadro = requestAnimationFrame(pinta);
    });
    const pestanas = [...new Set([...document.querySelectorAll('.tabs a[data-href]')].map((a) => a.dataset.href))].filter((h) => h !== location.pathname);
    pestanas.forEach((h) => router.prefetch(h));
    const tareas = [document.fonts?.ready ?? Promise.resolve(), ...pestanas.map(precargada)];
    let hechas = 0;
    tareas.forEach((t) => t.then(() => { hechas++; real = Math.max(real, 0.35 + 0.65 * (hechas / tareas.length)); }));
    // En el login, el verde se recoge junto al logo. El registro tiene otra composición y usa el fundido general.
    const panel = document.querySelector('.login-marca:not(.registro-marca)')?.getClientRects().length > 0 && matchMedia('(min-width: 900px)').matches;
    let b;
    Promise.all([Promise.race([Promise.all(tareas), esperar(desde(TOPE))]), esperar(desde(ANIMACION))])
      .then(() => { real = 1; barra.current?.style.setProperty('--avance', 1); return esperar(260); })
      .then(() => {
        if (!vivo) return;
        vista(); setFase(panel ? 'panel' : 'fuera'); avisarFin();
        if (document.documentElement.dataset.abierta) entrada();
        b = setTimeout(() => setFase('fin'), panel ? 700 : 400);
      });
    return () => { vivo = false; clearTimeout(b); cancelAnimationFrame(cuadro); };
  }, [router]);

  if (fase === 'fin') return null;
  return (
    <div id="arranque" className={fase === 'dentro' ? undefined : fase} aria-hidden>
      <div className="arr-centro">
        <Logo className="arr-logo" trazo />
      </div>
      <div className="arr-barra"><i ref={barra} /></div>
    </div>
  );
}
