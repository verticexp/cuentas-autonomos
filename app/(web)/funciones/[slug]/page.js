import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icono from '@/components/web/Icono';
import Demo from '@/components/web/demos/Demos';
import Pantalla from '@/components/web/demos/Pantallas';
import { Cta, Encabezado, Faq, Flecha, Lista } from '@/components/web/Bloques';
import { FUNCIONES, funcion } from '@/components/web/datos';
import { textos } from '@/lib/idiomaServidor';

export const dynamicParams = false;
export const generateStaticParams = () => FUNCIONES.map((f) => ({ slug: f.slug }));

export async function generateMetadata({ params }) {
  const f = funcion((await params).slug);
  const tr = await textos();
  return f ? { title: tr('{funcion} · Fisquo', { funcion: tr(f.nombre) }), description: tr(f.sub) } : {};
}

export default async function PaginaFuncion({ params }) {
  const tr = await textos();
  const f = funcion((await params).slug);
  if (!f) notFound();
  const i = FUNCIONES.indexOf(f);
  const otras = [1, 2, 3].map((k) => FUNCIONES[(i + k) % FUNCIONES.length]);

  return (
    <>
      <section className="web-hero-pag">
        <nav className="web-migas web-entra" aria-label={tr('Estás en')}><Link href="/funciones">{tr('Funciones')}</Link><Icono n="chevron" /><span>{tr(f.nombre)}</span></nav>
        <h1 className="web-entra" style={{ '--d': '80ms' }}>{tr(f.titulo)}</h1>
        <p className="web-sub web-entra" style={{ '--d': '140ms' }}>{tr(f.sub)}</p>
        <div className="web-cta web-entra" style={{ '--d': '200ms' }}>
          <Link className="web-btn web-btn-grande" href="/registro">{tr('Pruébalo gratis')}<Flecha /></Link>
          <Link className="web-btn web-btn-claro web-btn-grande" href="/precios">{tr('Ver precios')}</Link>
        </div>
      </section>

      <section className="web-escaparate web-entra" style={{ '--d': '260ms' }}>
        <div className="web-escaparate-brillo" aria-hidden />
        <Demo tipo={f.demo} />
        <p className="web-escaparate-pie"><Icono n="rayo" />{tr('Demo interactiva con datos de ejemplo')}</p>
      </section>

      <section className="web-sec">
        <div className="web-puntos">
          {f.puntos.map((p, k) => (
            <div key={p.t} data-r style={{ '--d': `${k * 80}ms` }}>
              <h3>{tr(p.t)}</h3>
              <p>{tr(p.d)}</p>
            </div>
          ))}
        </div>
      </section>

      {f.secciones.length > 0 && (
        <section className="web-sec">
          <div className="web-filas">
            {f.secciones.map((s, k) => (
              <article key={s.t} className={`web-fila${k % 2 ? ' invertida' : ''}`}>
                <div className="web-fila-txt" data-r>
                  <h2>{tr(s.t)}</h2>
                  <p>{tr(s.d)}</p>
                  <Lista items={s.l} />
                </div>
                <div className="web-fila-vis" data-r style={{ '--d': '100ms' }}>
                  <div className="web-marco-vis"><Pantalla tipo={s.visual} /></div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {f.proximamente && (
        <section className="web-sec">
          <div className="web-pronto" data-r><span className="web-pronto-tag">{tr('Próximamente')}</span><p>{tr(f.proximamente)}</p></div>
        </section>
      )}

      <Faq preguntas={f.faqs} titulo={tr('Preguntas sobre {tema}', { tema: tr(f.nombre) })} />

      <section className="web-sec">
        <Encabezado titulo="Funciona mejor junto" />
        <div className="web-relacionadas">
          {otras.map((o, k) => (
            <Link key={o.slug} href={`/funciones/${o.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${k * 70}ms` }}>
              <h3>{tr(o.nombre)}</h3>
              <p>{tr(o.corto)}</p>
              <span className="web-enlace">{tr('Descubrir')}<Flecha /></span>
            </Link>
          ))}
        </div>
      </section>

      <Cta />
    </>
  );
}
