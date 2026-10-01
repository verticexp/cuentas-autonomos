'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { navegar } from '@/lib/transicion';

// Al tocar una fila (factura, presupuesto o gasto), se convierte en la cabecera de la pantalla que abre.
// prefetch: las que se ven en pantalla se cargan por adelantado, así se abren al instante.
export default function FilaFactura({ href, children }) {
  const router = useRouter();
  const abrir = (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const fila = e.currentTarget;
    navigator.vibrate?.(6);
    navegar(router, href, 'abrir', () => {
      fila.style.viewTransitionName = 'factura-tarjeta';
      fila.querySelector('[data-vt="cliente"]')?.style.setProperty('view-transition-name', 'factura-cliente');
      fila.querySelector('[data-vt="total"]')?.style.setProperty('view-transition-name', 'factura-total');
    });
  };
  return <Link href={href} prefetch className="fila" onClick={abrir} onPointerDown={() => router.prefetch(href)}>{children}</Link>;
}
