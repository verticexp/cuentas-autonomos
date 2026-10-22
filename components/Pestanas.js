'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { navegar } from '@/lib/transicion';
import '@/app/pestanas.css';

// Pestañas de una pantalla (Gastos, Facturas): lo que ya está y lo pendiente, siempre a la vista y con su número, en el
// móvil y en el ordenador. items: [{ href, texto, n?, activo?, tono? ('aviso' | 'rojo') }]. El tono va como «tono-…»: la
// clase global .rojo (app/diseno.css) pinta el texto de rojo y dejaría el número invisible sobre el fondo rojo.
// Al cambiar, la pastilla viaja hasta la pestaña tocada y lo de debajo (lo que va en .pestanas-panel) entra por ese lado;
// la cabecera y las pestañas no se mueven (app/diseno.css; en el ordenador, app/pulido.css). Una sola por pantalla: los
// nombres de la transición son fijos.
export default function Pestanas({ items, etiqueta }) {
  const router = useRouter();
  const activa = items.findIndex((x) => x.activo);
  const pulsar = (i) => (e) => {
    // cmd/ctrl-clic abre otra pestaña del navegador; con el teclado (detail 0) cambia sin animar; la activa no se desliza.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0 || e.detail === 0 || activa < 0 || i === activa) return;
    e.preventDefault();
    navegar(router, items[i].href, i > activa ? 'pestana-der' : 'pestana-izq', undefined, false, { scroll: false });
  };
  return (
    <nav className="pestanas" aria-label={etiqueta}>
      {activa >= 0 && <span className="pestanas-indicador" style={{ gridColumn: activa + 1 }} aria-hidden />}
      {items.map((x, i) => (
        <Link key={x.href} href={x.href} scroll={false} onClick={pulsar(i)} style={{ gridColumn: i + 1, '--pestana': `pestana-${i}` }}
          className={`pestana${x.activo ? ' activa' : ''}`} aria-current={x.activo ? 'page' : undefined}>
          <span>{x.texto}</span>
          {x.n > 0 && <span className={`pestana-n${x.tono ? ` tono-${x.tono}` : ''}`}>{x.n > 99 ? '99+' : x.n}</span>}
        </Link>
      ))}
    </nav>
  );
}
