import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import { CONFIANZA } from '@/components/web/datos';

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

export function Cta({ titulo = 'Empieza a ver tu dinero con claridad', sub = '30 días gratis, sin tarjeta y sin permanencia. Te ayudamos a traer tus datos.', otro = ['/precios', 'Ver precios'] }) {
  return (
    <section className="web-cta-final" data-r>
      <div className="web-cta-brillo" aria-hidden />
      <h2>{titulo}</h2>
      <p>{sub}</p>
      <div className="web-cta-btns">
        <Link href="/registro" className="web-btn web-btn-grande">Empieza gratis <Flecha /></Link>
        <Link href={otro[0]} className="web-btn web-btn-claro web-btn-grande">{otro[1]}</Link>
      </div>
    </section>
  );
}

// Lo que pasa con sus datos y con la IA, donde se decide (portada y precios); el detalle está en /seguridad.
export function Confianza({ titulo = 'Tus números, a salvo y siempre tuyos' }) {
  return (
    <section className="web-sec">
      <Encabezado kicker="Tus datos" titulo={titulo} sub="Es lo primero que nos preguntan antes de subir la primera factura. Esto es lo que hace Fisquo con ellos." />
      <div className="web-extras cuatro">
        {CONFIANZA.map((c, k) => (
          <div key={c.t} data-foco data-r style={{ '--d': `${k * 70}ms` }}>
            <span className="web-fcard-ico"><Icono n={c.i} /></span>
            <b>{c.t}</b><p>{c.d}</p>
          </div>
        ))}
      </div>
      <p className="web-centro"><Link href="/seguridad" className="web-enlace">Cómo protege Fisquo tus datos<Flecha /></Link></p>
    </section>
  );
}

export function Lista({ items, className = 'web-lista' }) {
  return <ul className={className}>{items.map((x) => <li key={x}><Icono n="tic" />{x}</li>)}</ul>;
}
