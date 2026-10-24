'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { alPulsar } from '@/lib/transicion';

// Dónde trabaja quien es de un despacho: «Mi despacho» (sus clientes) o «Mi empresa» (la contabilidad del propio
// despacho). Dos botones siempre en el mismo sitio: arriba de la barra lateral en el ordenador y arriba del panel en el
// móvil. Ir a la empresa pasa por /api/despacho/salir (deja su empresa como la activa).
export default function Espacio({ actual, className = '' }) {
  const router = useRouter();
  const despacho = actual === 'despacho';
  return (
    <div className={`espacio ${className}`} role="group" aria-label="Dónde trabajas">
      {despacho
        ? <span className="espacio-op activo" aria-current="page">Mi despacho</span>
        : <Link href="/despacho" className="espacio-op" onClick={alPulsar(router, '/despacho', 'tab-izq')}>Mi despacho</Link>}
      {despacho
        ? <form method="post" action="/api/despacho/salir?a=empresa"><button type="submit" className="espacio-op">Mi empresa</button></form>
        : <span className="espacio-op activo" aria-current="page">Mi empresa</span>}
    </div>
  );
}
