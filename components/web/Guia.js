import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import { Cta, Encabezado, Faq, Flecha } from '@/components/web/Bloques';
import { guia, revisionDe } from '@/data/web-guias';
import { calendarioSociedad, diaMes, fechaLarga, plazoTrimestre, plazosAnuales } from '@/lib/webCalendario';
import JsonLd from '@/components/web/JsonLd';
import { WEB } from '@/lib/web';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';

const ORDINAL = ['1.er', '2.º', '3.er', '4.º'];

// **Negrita** dentro de un texto de data/web-guias.js.
export const Rico = ({ t }) => t.split('**').map((x, i) => (i % 2 ? <b key={i}>{x}</b> : x));

// Las tablas se deslizan en horizontal en pantallas estrechas; la región es enfocable para poder moverla con el teclado.
export function TablaSimple({ cab, filas, etiqueta }) {
  return (
    <div className="web-art-tabla" role="region" aria-label={etiqueta} tabIndex={0}>
      <table>
        <thead><tr>{cab.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{filas.map(([cabeza, ...celdas]) => <tr key={String(cabeza)}><th scope="row">{cabeza}</th>{celdas.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const Fecha = ({ f, limite, trasladado }) => (
  <>
    <b>{fechaLarga(f)}</b>
    {trasladado && <small>El plazo acababa el {fechaLarga(limite)}</small>}
  </>
);

function Plazos({ anios }) {
  const filas = anios.flatMap((anio) => [1, 2, 3, 4].map((t) => {
    const p = plazoTrimestre(anio, t);
    return [`${ORDINAL[t - 1]} trimestre de ${anio}`, <Fecha key="f" f={p.fin} limite={p.limite} trasladado={p.trasladado} />, <b key="d">{fechaLarga(p.domicilia)}</b>];
  }));
  return <TablaSimple etiqueta="Plazos trimestrales" cab={['Trimestre', 'Último día para presentar', 'Último día con domiciliación']} filas={filas} />;
}

function Anuales({ anio }) {
  const filas = plazosAnuales(anio).map((p) => [`Modelo ${p.modelo}`, p.nombre, <Fecha key="f" f={p.fin} limite={p.limite} trasladado={p.trasladado} />]);
  return <TablaSimple etiqueta="Resúmenes anuales" cab={['Modelo', 'Qué recoge', 'Último día para presentar']} filas={filas} />;
}

// Calendario de una sociedad, mes a mes (lib/webCalendario.js calendarioSociedad: las fechas de la app).
const primeraMayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
async function CalendarioSociedad({ anio }) {
  const filas = (await calendarioSociedad(anio)).map((p) => [fechaLarga(p.fecha), primeraMayuscula(p.texto), p.domicilia ? diaMes(p.domicilia) : '—']);
  return <TablaSimple etiqueta={`Calendario de una sociedad en ${anio}`} cab={['Último día', 'Qué se presenta o se hace', 'Domiciliado, hasta']} filas={filas} />;
}

function Bloque({ b, tabla, tr }) {
  if (b.p) return <p><Rico t={b.p} /></p>;
  if (b.ul) return <ul className="web-art-lista">{b.ul.map((x) => <li key={x}><Icono n="tic" /><span><Rico t={x} /></span></li>)}</ul>;
  if (b.ol) return <ol className="web-art-num">{b.ol.map((x) => <li key={x}><Rico t={x} /></li>)}</ol>;
  if (b.pasos) return <ol className="web-pasos">{b.pasos.map((p) => <li key={p.t}><h3>{p.t}</h3><p><Rico t={p.d} /></p></li>)}</ol>;
  if (b.nota) return <aside className="web-nota-info" role="note"><Icono n="ojo" /><p><Rico t={b.nota} /></p></aside>;
  if (b.tabla) return <TablaSimple etiqueta={tabla} cab={b.tabla.cab} filas={b.tabla.filas} />;
  if (b.plazos) return <Plazos anios={b.plazos} />;
  if (b.anuales) return <Anuales anio={b.anuales} />;
  if (b.calendarioSociedad) return <CalendarioSociedad anio={b.calendarioSociedad} />;
  if (b.ejemplo) {
    const e = b.ejemplo;
    return (
      <figure className="web-ejemplo">
        <figcaption><span>{tr('Ejemplo')}</span>{e.titulo}</figcaption>
        <dl>{e.filas.map(([k, v, fuerte]) => <div key={k} className={fuerte ? 'total' : undefined}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {e.pie && <p>{e.pie}</p>}
      </figure>
    );
  }
  return null;
}

// Guía fiscal: cabecera, índice lateral, artículo, norma citada, preguntas, guías relacionadas y llamada a probar Fisquo.
export default async function Guia({ g }) {
  const tr = await textos();
  const otras = g.relacionadas.map(guia).filter(Boolean);
  const url = `${WEB}/guias/${g.slug}`;
  const revision = revisionDe(g);
  const datos = {
    '@context': 'https://schema.org', '@type': 'Article', headline: g.titulo, description: g.descripcion, inLanguage: 'es-ES',
    datePublished: revision, dateModified: revision, mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'Fisquo', url: WEB }, publisher: { '@type': 'Organization', name: 'Fisquo', url: WEB },
  };
  return (
    <>
      <JsonLd datos={datos} />
      <section className="web-hero-pag">
        <nav className="web-migas web-entra" aria-label={tr('Estás en')}><Link href="/guias">{tr('Guías fiscales')}</Link><Icono n="chevron" /><span>{g.corto}</span></nav>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>{g.titulo}</h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>{g.resumen}</p>
        <p className="web-art-meta web-entra" style={{ '--d': '180ms' }}>{conHuecos(tr('Revisada el {fecha} · {minutos} min de lectura'), { fecha: <time dateTime={revision}>{tr(fechaLarga(revision, false))}</time>, minutos: g.minutos })}</p>
      </section>

      <section className="web-sec web-art-sec">
        <div className="web-art-grid">
          <nav className="web-toc" aria-label={tr('En esta guía')}>
            <p>{tr('En esta guía')}</p>
            <ol>
              {g.secciones.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.t}</a></li>)}
              <li><a href="#normas">{tr('Norma en la que se apoya')}</a></li>
            </ol>
          </nav>
          <article className="web-art">
            {g.secciones.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`}>
                <h2 id={`${s.id}-t`}>{s.t}</h2>
                {s.bloques.map((b, i) => <Bloque key={i} b={b} tabla={s.t} tr={tr} />)}
              </section>
            ))}
            <section id="normas" aria-labelledby="normas-t" className="web-art-normas">
              <h2 id="normas-t">{tr('Norma en la que se apoya')}</h2>
              <ul>{g.normas.map((n) => <li key={n}>{n}</li>)}</ul>
              <p>{g.aviso}</p>
              <p><b>{tr('Revisada el {fecha}.', { fecha: tr(fechaLarga(revision, false)) })}</b> {tr('Las normas y los plazos pueden cambiar: comprueba siempre la fecha de revisión.')}</p>
            </section>
          </article>
        </div>
      </section>

      <Faq preguntas={g.faqs} titulo={tr('Preguntas sobre {tema}', { tema: g.corto.toLowerCase() })} />

      <section className="web-sec">
        <Encabezado titulo="Otras guías" />
        <div className="web-relacionadas">
          {otras.map((o, k) => (
            <Link key={o.slug} href={`/guias/${o.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${k * 70}ms` }}>
              <h3>{o.titulo}</h3>
              <p>{o.resumen}</p>
              <span className="web-enlace">{tr('Leer la guía')}<Flecha /></span>
            </Link>
          ))}
        </div>
      </section>

      <Cta titulo={g.cta.titulo} sub={g.cta.sub} otro={['/demo', 'Ver la demo sin registrarte']} />
    </>
  );
}
