'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { volverA } from '@/lib/transicion';

// «OK» de la hoja de Ajustes en el móvil: la hoja baja y se ve otra vez la pantalla de la que se vino (sin ella, «Más»).
// El gesto de volver desde el borde (components/GestoAtras.js) lo usa como el «‹ Atrás» de la hoja.
export default function CerrarAjustes() {
  const router = useRouter();
  return (
    <Link href="/mas" className="aj-ok" onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
      e.preventDefault();
      volverA(router, '/mas', 'bajar');
    }}>OK</Link>
  );
}
