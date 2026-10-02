'use client';

import { useEffect, useState } from 'react';

// Pantalla de inicio: solo al abrir la app (una vez por sesión). Se va cuando la app ya responde y la animación ha acabado.
export default function Arranque() {
  const [fase, setFase] = useState('dentro');

  useEffect(() => {
    if (document.documentElement.dataset.arranque === 'visto') { setFase('fin'); return; }
    try { sessionStorage.setItem('netto-arranque', '1'); } catch {}
    const espera = Math.max(0, (window.__arranque ?? 0) + 1050 - performance.now());
    const a = setTimeout(() => setFase('fuera'), espera);
    const b = setTimeout(() => setFase('fin'), espera + 400);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  if (fase === 'fin') return null;
  return (
    <div id="arranque" className={fase === 'fuera' ? 'fuera' : undefined} aria-hidden>
      <div className="arr-centro">
        <svg className="arr-logo" viewBox="0 0 100 100">
          <path className="arr-n" pathLength="1" d="M30 74V30l40 40V26" fill="none" stroke="currentColor" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" />
          <path className="arr-corte" d="M18 18l39 39" stroke="var(--verde)" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <p className="arr-nombre">{'netto'.split('').map((l, i) => <span key={i} style={{ '--i': i }}>{l}</span>)}</p>
      </div>
    </div>
  );
}
