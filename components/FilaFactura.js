'use client';

import { useRouter } from 'next/navigation';

// Al tocar una factura, su fila se convierte en la cabecera de la factura (transición de vista del navegador).
// Donde no hay soporte, se navega normal y la cabecera entra con una animación propia.
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
      setTimeout(listo, 1500); // si tarda, se hace sin esperar
      router.push(href);
    }));
    t.finished.finally(() => { window.__facturaLista = null; });
  };
  return <a href={href} className="fila" onClick={abrir}>{children}</a>;
}
