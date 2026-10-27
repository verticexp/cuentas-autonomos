'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { abrirFila, navegar } from '@/lib/transicion';
import { vibrar } from '@/lib/haptica';

// Al tocar una fila (factura, presupuesto o gasto), se convierte en la cabecera de la pantalla que abre. Si la pantalla
// tarda, se convierte en la de la pantalla de espera, con el cliente y el total de la fila (lib/transicion.js ponerEspera).
// Se precarga al tocarla (o al pasar el ratón), no al verse: precargar todas las filas visibles pedía la pantalla entera de
// cada documento, con sus consultas a la base de datos, y en el móvil frenaba la que sí se abría.
export default function FilaFactura({ href, children }) {
  const router = useRouter();
  const abrir = (e) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const fila = e.currentTarget;
    vibrar();
    navegar(router, href, 'abrir', () => {
      abrirFila(fila);
      fila.style.viewTransitionName = 'factura-tarjeta';
      fila.querySelector('[data-vt="cliente"]')?.style.setProperty('view-transition-name', 'factura-cliente');
      fila.querySelector('[data-vt="total"]')?.style.setProperty('view-transition-name', 'factura-total');
    });
  };
  const precargar = () => router.prefetch(href);
  return <Link href={href} prefetch={false} className="fila" onClick={abrir} onPointerDown={precargar} onMouseEnter={precargar}>{children}</Link>;
}
