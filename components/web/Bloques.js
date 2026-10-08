import Link from 'next/link';
import Icono from '@/components/web/Icono';

// Piezas comunes de las páginas públicas.

export const Flecha = () => <Icono n="flecha" className="ico web-flecha" />;

export function Encabezado({ kicker, titulo, sub, centro, claro }) {
  return (
    <div className={`web-enc${centro ? ' centro' : ''}${claro ? ' claro' : ''}`}>
      {kicker && <p className="web-kicker" data-r>{kicker}</p>}
      <h2 data-r style={{ '--d': '60ms' }}>{titulo}</h2>
      {sub && <p className="web-enc-sub" data-r style={{ '--d': '120ms' }}>{sub}</p>}
    </div>
  );
}

export function Faq({ preguntas, titulo = 'Preguntas frecuentes' }) {
  return (
    <section className="web-sec web-faq">
      <div className="web-faq-in">
        <Encabezado kicker="Preguntas" titulo={titulo} />
        <div data-r>
          {preguntas.map(([q, a]) => (
            <details key={q}>
              <summary>{q}<span className="web-faq-mas"><Icono n="mas" /></span></summary>
              <div className="web-faq-r"><p>{a}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Cta({ titulo = 'Empieza a ver tu dinero con claridad', sub = '1 mes gratis, sin tarjeta y sin permanencia. Te ayudamos a traer tus datos.', otro = ['/precios', 'Ver precios'] }) {
  return (
    <section className="web-cta-final" data-r>
      <div className="web-cta-brillo" aria-hidden />
      <h2>{titulo}</h2>
      <p>{sub}</p>
      <div className="web-cta-btns">
        <Link href="/contacto" className="web-btn web-btn-grande">Pedir acceso <Flecha /></Link>
        <Link href={otro[0]} className="web-btn web-btn-claro web-btn-grande">{otro[1]}</Link>
      </div>
    </section>
  );
}

export function Lista({ items, className = 'web-lista' }) {
  return <ul className={className}>{items.map((x) => <li key={x}><Icono n="tic" />{x}</li>)}</ul>;
}
