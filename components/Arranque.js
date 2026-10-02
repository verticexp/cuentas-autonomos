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
        <svg className="arr-logo" viewBox="0 0 64 64">
          <rect width="64" height="64" rx="14" className="arr-placa" />
          <g className="arr-doc">
            <path d="M17 11h20l10 10v31a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2V13a2 2 0 0 1 2-2z" fill="#fff" />
            <path d="M37 11v8a2 2 0 0 0 2 2h8z" fill="#C9D0DC" />
          </g>
          <rect x="21" y="27" width="17" height="3.5" rx="1.75" fill="#C9D0DC" className="arr-linea" />
          <rect x="21" y="34" width="11" height="3.5" rx="1.75" fill="#C9D0DC" className="arr-linea" style={{ '--i': 1 }} />
          <g className="arr-moneda">
            <circle cx="44" cy="45" r="12" fill="#1F9D74" strokeWidth="3" className="arr-borde" />
            <text x="44" y="50.5" textAnchor="middle" fontFamily="-apple-system, system-ui, sans-serif" fontWeight="700" fontSize="15" fill="#fff">€</text>
          </g>
        </svg>
        <p className="arr-nombre">{'Netto'.split('').map((l, i) => <span key={i} style={{ '--i': i }}>{l}</span>)}</p>
      </div>
    </div>
  );
}
