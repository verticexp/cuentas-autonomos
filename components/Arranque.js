'use client';

import { useEffect, useState } from 'react';
import Logo from '@/components/Logo';
import { entrada } from '@/lib/transicion';

// Pantalla de inicio: solo al abrir la app (una vez por sesión). Se va cuando la app ya responde y la animación ha acabado.
export default function Arranque() {
  const [fase, setFase] = useState('dentro');

  useEffect(() => {
    if (document.documentElement.dataset.arranque === 'visto') { setFase('fin'); return; }
    try { sessionStorage.setItem('netto-arranque', '1'); } catch {}
    const espera = Math.max(0, (window.__arranque ?? 0) + 2000 - performance.now());
    const a = setTimeout(() => { setFase('fuera'); if (document.documentElement.dataset.abierta) entrada(); }, espera);
    const b = setTimeout(() => setFase('fin'), espera + 400);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  if (fase === 'fin') return null;
  return (
    <div id="arranque" className={fase === 'fuera' ? 'fuera' : undefined} aria-hidden>
      <div className="arr-centro">
        <Logo className="arr-logo" />
      </div>
    </div>
  );
}
