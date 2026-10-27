import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import Precios from '@/components/web/Precios';
import Pantalla from '@/components/web/demos/Pantallas';
import { Cta, Encabezado, Faq, Flecha } from '@/components/web/Bloques';
import { FAQ_GENERAL, funcion, segmento } from '@/components/web/datos';
import { GUIAS } from '@/data/web-guias';

const VISUAL = { aut: 'factura', pym: 'equipo', business: 'empresas' };

// Página de cada tipo de negocio: autónomos, pymes y Business.
export default function Solucion({ id }) {
  const s = segmento(id);
  return (
    <>
      <section className="web-hero-pag web-hero-sol">
        <div>
          <p className="web-chip-seg web-entra"><Icono n={s.icono} />{s.n === 'Business' ? 'Fisquo Business' : `Fisquo para ${s.n.toLowerCase()}`}</p>
          <h1 className="web-entra" style={{ '--d': '60ms' }}>{s.titulo}</h1>
          <p className="web-sub web-entra" style={{ '--d': '120ms' }}>{s.sub}</p>
          <div className="web-cta web-entra" style={{ '--d': '180ms' }}>
            <Link className="web-btn web-btn-grande" href={id === 'business' ? '/contacto?plan=Business' : `/registro?tipo=${s.id}`}>{id === 'business' ? 'Hablemos de tu negocio' : 'Pruébalo 30 días gratis'}<Flecha /></Link>
            <a className="web-btn web-btn-claro web-btn-grande" href="#planes">{id === 'business' ? 'Ver propuesta' : 'Ver planes'}</a>
          </div>
        </div>
        <div className="web-hero-sol-vis web-entra" style={{ '--d': '220ms' }}>
          <div className="web-marco-vis"><Pantalla tipo={VISUAL[id]} /></div>
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Lo que te quitamos de encima" titulo="Del caos de siempre a todo en orden" />
        <div className="web-dolores">
          {s.dolores.map(([mal, bien], i) => (
            <div key={mal} data-foco data-r style={{ '--d': `${(i % 2) * 80}ms` }}>
              <p className="web-dolor-antes"><Icono n="cerrar" />{mal}</p>
              <p className="web-dolor-despues"><Icono n="tic" />{bien}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <Encabezado kicker="Funciones clave" titulo={id === 'business' ? 'Qué incluye tu propuesta' : `Lo que más usan los ${s.n.toLowerCase()}`} />
        <div className="web-relacionadas cuatro">
          {s.funciones.map((slug, k) => {
            const f = funcion(slug);
            return (
              <Link key={slug} href={`/funciones/${slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${k * 60}ms` }}>
                <span className="web-fcard-ico"><Icono n={f.icono} /></span>
                <h3>{f.nombre}</h3>
                <p>{f.corto}</p>
                <span className="web-enlace">Descubrir<Flecha /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="web-sec" id="planes">
        {id === 'business' ? (
          <>
            <Encabezado kicker="Business" titulo="Un alcance acordado. Un precio cerrado." sub="Definimos contigo las sociedades, los equipos, los accesos y los servicios que necesitas." centro />
            <p className="web-centro">Los seis planes de Autónomos y Pymes incluyen una empresa por suscripción. Business permite acordar una propuesta para varias sociedades o equipos, con sus datos separados. La implantación, la personalización y el soporte se concretan en la oferta.</p>
            <p className="web-centro"><Link href="/contacto?plan=Business" className="web-btn">Solicitar propuesta<Flecha /></Link></p>
          </>
        ) : (
          <>
            <Encabezado kicker="Planes" titulo={`Planes para ${s.n.toLowerCase()}`} sub="Todos con 30 días gratis y sin permanencia." centro />
            <Precios inicial={id} solo />
            <p className="web-centro"><Link href="/precios" className="web-enlace">Ver la comparativa completa<Flecha /></Link></p>
          </>
        )}
      </section>

      {/* Guías del público de esta página (data/web-guias.js): de autónomos o de sociedades, más las que valen para los dos. */}
      <section className="web-sec">
        <Encabezado kicker="Guías fiscales" titulo={id === 'aut' ? 'Los impuestos del autónomo, explicados' : 'Los impuestos de tu sociedad, explicados'} sub="Con la norma citada y la fecha de revisión." />
        <div className="web-relacionadas cuatro">
          {[...GUIAS.filter((g) => g.para === (id === 'aut' ? 'autonomos' : 'pymes')), ...GUIAS.filter((g) => g.para === 'todos')].slice(0, 4).map((g, i) => (
            <Link key={g.slug} href={`/guias/${g.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${i * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n="documento" /></span>
              <h3>{g.corto}</h3>
              <p>{g.resumen}</p>
              <span className="web-enlace">Leer la guía<Flecha /></span>
            </Link>
          ))}
        </div>
        <p className="web-centro"><Link href="/guias" className="web-enlace">Todas las guías<Flecha /></Link></p>
      </section>

      <Faq preguntas={FAQ_GENERAL} />
      {id !== 'business' && <Cta />}
    </>
  );
}
