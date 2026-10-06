'use client';

import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { entrada } from '@/lib/transicion';
import { avisarFin } from '@/lib/arranque';

// Pantalla de inicio: solo al abrir la app (una vez por sesión). Se va cuando la app ya responde y la animación ha acabado.
export default function Arranque() {
  const [fase, setFase] = useState('dentro');

  useEffect(() => {
    if (document.documentElement.dataset.arranque === 'visto') { setFase('fin'); avisarFin(); return; }
    // Se marca como vista al acabar, no al empezar: si el servidor manda a /bloqueo mientras tanto (recarga), vuelve a salir.
    const vista = () => { try { sessionStorage.setItem('netto-arranque', '1'); } catch {} };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { vista(); setFase('fin'); avisarFin(); return; }
    // En el ordenador, si debajo está la pantalla de entrar, el verde se recoge en su panel izquierdo con el logo.
    const panel = document.querySelector('.login-marca')?.getClientRects().length > 0 && matchMedia('(min-width: 900px)').matches;
    const espera = Math.max(0, (window.__arranque ?? 0) + 2000 - performance.now());
    const a = setTimeout(() => { vista(); setFase(panel ? 'panel' : 'fuera'); avisarFin(); if (document.documentElement.dataset.abierta) entrada(); }, espera);
    const b = setTimeout(() => setFase('fin'), espera + (panel ? 700 : 400));
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  if (fase === 'fin') return null;
  return (
    <div id="arranque" className={fase === 'dentro' ? undefined : fase} aria-hidden>
      <div className="arr-centro">
        <Logo className="arr-logo" />
      </div>
    </div>
  );
}
