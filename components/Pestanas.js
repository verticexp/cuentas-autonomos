import Link from 'next/link';
import '@/app/pestanas.css';

// Pestañas de una pantalla (Gastos, Facturas): lo que ya está y lo pendiente, siempre a la vista y con su número, en el
// móvil y en el ordenador. items: [{ href, texto, n?, activo?, tono? ('aviso' | 'rojo') }]. El tono va como «tono-…»: la
// clase global .rojo (app/diseno.css) pinta el texto de rojo y dejaría el número invisible sobre el fondo rojo.
export default function Pestanas({ items, etiqueta }) {
  return (
    <nav className="pestanas" aria-label={etiqueta}>
      {items.map((x) => (
        <Link key={x.href} href={x.href} scroll={false} className={`pestana${x.activo ? ' activa' : ''}`} aria-current={x.activo ? 'page' : undefined}>
          <span>{x.texto}</span>
          {x.n > 0 && <span className={`pestana-n${x.tono ? ` tono-${x.tono}` : ''}`}>{x.n > 99 ? '99+' : x.n}</span>}
        </Link>
      ))}
    </nav>
  );
}
