'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Al tocar una factura, su fila se convierte en la cabecera de la factura (transición de vista del navegador).
// prefetch: las facturas que se ven en pantalla se cargan por adelantado, así se abren al instante.
export default function FilaFactura({ href, children }) {
  const router = useRouter();
  const abrir = (e) => {
    if (!document.startViewTransition || e.metaKey || e.ctrlKey || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    const fila = e.currentTarget;
    fila.style.viewTransitionName = 'factura-tarjeta';
    fila.querySelector('[data-vt="cliente"]')?.style.setProperty('view-transition-name', 'factura-cliente');
    fila.querySelector('[data-vt="total"]')?.style.setProperty('view-transition-name', 'factura-total');
    navigator.vibrate?.(6);
    const t = document.startViewTransition(() => new Promise((listo) => {
      window.__facturaLista = listo;
      setTimeout(listo, 450); // si aún no ha llegado, no se congela la pantalla esperando
      router.push(href);
    }));
    t.finished.finally(() => { window.__facturaLista = null; });
  };
  return <Link href={href} prefetch className="fila" onClick={abrir} onPointerDown={() => router.prefetch(href)}>{children}</Link>;
}
