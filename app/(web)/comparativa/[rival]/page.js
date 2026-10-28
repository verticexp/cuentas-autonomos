import { notFound } from 'next/navigation';
import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import { Cta, Encabezado, Faq, Flecha } from '@/components/web/Bloques';
import { FECHA_VERIFICACION, RIVALES, rival } from '@/data/web-comparativas';
import { PLANES } from '@/components/web/datos';
import { fechaLarga } from '@/lib/webCalendario';
import { rellenar } from '@/lib/webComparativa';
import { metaPagina } from '@/lib/webMeta';

export const dynamicParams = false;
export const generateStaticParams = () => RIVALES.map((r) => ({ rival: r.slug }));

export async function generateMetadata({ params }) {
  const r = rival((await params).rival);
  return r ? metaPagina({ titulo: `${r.titulo}: precios y cuándo elegir cada uno`, descripcion: r.descripcion, ruta: `/comparativa/${r.slug}` }) : {};
}

const importe = (n) => n.toLocaleString('es-ES');

function Conviene({ titulo, items, destacado }) {
  return (
    <div className={`web-conviene${destacado ? ' fisquo' : ''}`} data-r>
      <h3>{titulo}</h3>
      <ul>
        {items.map(([a, b]) => <li key={a}><Icono n="tic" /><span><b>{rellenar(a)}</b> {rellenar(b)}</span></li>)}
      </ul>
    </div>
  );
}

export default async function PaginaComparativa({ params }) {
  const r = rival((await params).rival);
  if (!r) notFound();
  const otro = RIVALES.find((x) => x.slug !== r.slug);
  return (
    <>
      <section className="web-hero-pag">
        <nav className="web-migas web-entra" aria-label="Estás en"><Link href="/comparativa">Comparativas</Link><Icono n="chevron" /><span>{r.nombre}</span></nav>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>{r.titulo}: <em>cuándo te conviene cada uno</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>{rellenar(r.intro)}</p>
        <p className="web-art-meta web-entra" style={{ '--d': '180ms' }}>Precios verificados el <time dateTime={FECHA_VERIFICACION}>{fechaLarga(FECHA_VERIFICACION, false)}</time> en las webs públicas de precios</p>
      </section>

      <section className="web-sec">
        <Encabezado titulo="Cuánto cuesta cada uno" sub={`Los importes de ${r.nombre} son los que publica en su web; revisa allí si llevan IVA y qué incluye cada plan. Los de Fisquo no incluyen IVA.`} />
        <div className="web-duo">
          <div data-foco data-r>
            <h3>Fisquo</h3>
            <dl className="web-precios-lista">
              {['aut', 'pym'].map((seg) => (
                <div key={seg}>
                  <dt>{seg === 'aut' ? 'Autónomos' : 'Pymes'}</dt>
                  <dd>{PLANES[seg].map((p) => `${p.n} ${importe(p.p)} €`).join(' · ')} <small>al mes</small></dd>
                </div>
              ))}
            </dl>
            <p className="web-duo-nota">30 días de prueba sin tarjeta, sin permanencia y una empresa por suscripción.</p>
            <Link href="/precios" className="web-enlace">Ver todos los planes<Flecha /></Link>
          </div>
          <div data-foco data-r style={{ '--d': '70ms' }}>
            <h3>{r.nombre}</h3>
            <ul className="web-art-lista">{r.publicado.map((x) => <li key={x}><Icono n="tic" /><span>{x}</span></li>)}</ul>
            <p className="web-duo-nota">Según su web pública de precios, el {fechaLarga(FECHA_VERIFICACION, false)}.</p>
            <a href={r.web} className="web-enlace" target="_blank" rel="noopener noreferrer">Ver los precios actuales en su web<span className="oculto"> (se abre en otra pestaña)</span><Flecha /></a>
          </div>
        </div>
      </section>

      <section className="web-sec">
        <Encabezado titulo="¿Cuál te conviene?" />
        <div className="web-conviene-par">
          <Conviene titulo={`Te conviene ${r.nombre} si…`} items={r.convieneRival} />
          <Conviene titulo="Te conviene Fisquo si…" items={r.convieneFisquo} destacado />
        </div>
        <aside className="web-nota-info" role="note">
          <Icono n="ojo" />
          <p><b>Lo que no hemos comparado.</b> De {r.nombre} solo recogemos lo que publica en su página de precios. Sus funciones, su soporte y su calidad no los valoramos aquí: míralos en su web y pruébalo antes de decidir. {r.nombre} es una marca de su titular y no tiene relación con Fisquo.</p>
        </aside>
      </section>

      <Faq preguntas={r.faqs.map(([q, a]) => [q, rellenar(a)])} titulo={`Dudas sobre Fisquo y ${r.nombre}`} />

      <section className="web-sec">
        <Encabezado titulo="Más para decidir" />
        <div className="web-relacionadas">
          <Link href={`/comparativa/${otro.slug}`} data-foco data-r className="web-fcard">
            <h3>{otro.titulo}</h3>
            <p>{rellenar(otro.intro)}</p>
            <span className="web-enlace">Ver la comparativa<Flecha /></span>
          </Link>
          <Link href="/demo" data-foco data-r className="web-fcard" style={{ '--d': '70ms' }}>
            <h3>Recorre Fisquo sin registrarte</h3>
            <p>Cinco pasos con datos de ejemplo: factura, gasto leído con IA, impuestos, banco y gestoría.</p>
            <span className="web-enlace">Ver la demo<Flecha /></span>
          </Link>
          <Link href="/contacto" data-foco data-r className="web-fcard" style={{ '--d': '140ms' }}>
            <h3>Cámbiate a Fisquo</h3>
            <p>Importa clientes, facturas, gastos, saldos contables y bienes de inversión. Te ayudamos a traer tus datos.</p>
            <span className="web-enlace">Quiero cambiarme<Flecha /></span>
          </Link>
        </div>
      </section>

      <Cta titulo="Pruébalo con tus propios papeles" sub="30 días gratis, sin tarjeta y sin permanencia. Si no te convence, te llevas tus datos." otro={['/precios', 'Ver los planes de Fisquo']} />
    </>
  );
}
