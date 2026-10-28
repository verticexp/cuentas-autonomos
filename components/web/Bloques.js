import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import { CONFIANZA } from '@/components/web/datos';
import { textos } from '@/lib/idiomaServidor';

// Piezas comunes de las páginas públicas.
export const Flecha = () => <Icono n="flecha" className="ico web-flecha" />;

export async function Encabezado({ titulo, sub, centro, claro }) {
  const tr = await textos();
  return (
    <div className={`web-enc${centro ? ' centro' : ''}${claro ? ' claro' : ''}`}>
      <h2 data-r style={{ '--d': '60ms' }}>{tr(titulo)}</h2>
      {sub && <p className="web-enc-sub" data-r style={{ '--d': '120ms' }}>{tr(sub)}</p>}
    </div>
  );
}

export async function Faq({ preguntas, titulo = 'Preguntas frecuentes' }) {
  const tr = await textos();
  return (
    <section className="web-sec web-faq">
      <div className="web-faq-in">
        <Encabezado titulo={titulo} />
        <div data-r>
          {preguntas.map(([q, a]) => (
            <details key={q}>
              <summary>{tr(q)}<span className="web-faq-mas"><Icono n="mas" /></span></summary>
              <div className="web-faq-r"><p>{tr(a)}</p></div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function Cta({ titulo = 'Empieza a ver tu dinero con claridad', sub = '30 días gratis, sin tarjeta y sin permanencia. Te ayudamos a traer tus datos.', otro = ['/precios', 'Ver precios'] }) {
  const tr = await textos();
  return (
    <section className="web-cta-final" data-r>
      <h2>{tr(titulo)}</h2>
      <p>{tr(sub)}</p>
      <div className="web-cta-btns">
        <Link href="/registro" className="web-btn web-btn-grande">{tr('Empieza gratis')} <Flecha /></Link>
        <Link href={otro[0]} className="web-btn web-btn-claro web-btn-grande">{tr(otro[1])}</Link>
      </div>
    </section>
  );
}

// Lo que pasa con sus datos y con la IA, donde se decide (portada y precios); el detalle está en /seguridad.
export async function Confianza({ titulo = 'Tus números, a salvo y siempre tuyos' }) {
  const tr = await textos();
  return (
    <section className="web-sec web-confianza">
      <div className="web-confianza-enc">
        <Encabezado titulo={titulo} sub="Es lo primero que nos preguntan antes de subir la primera factura. Esto es lo que hace Fisquo con ellos." />
        <Link href="/seguridad" className="web-enlace">{tr('Cómo protege Fisquo tus datos')}<Flecha /></Link>
      </div>
      <dl data-r>
        {CONFIANZA.map((c) => (
          <div key={c.t}><dt>{tr(c.t)}</dt><dd>{tr(c.d)}</dd></div>
        ))}
      </dl>
    </section>
  );
}

export async function Lista({ items, className = 'web-lista' }) {
  const tr = await textos();
  return <ul className={className}>{items.map((x) => <li key={x}><Icono n="tic" />{tr(x)}</li>)}</ul>;
}
