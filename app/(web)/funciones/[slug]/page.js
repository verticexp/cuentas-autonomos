import Link from 'next/link';
import { notFound } from 'next/navigation';
import Icono from '@/components/web/Icono';
import Demo from '@/components/web/demos/Demos';
import Pantalla from '@/components/web/demos/Pantallas';
import { Cta, Encabezado, Faq, Flecha, Lista } from '@/components/web/Bloques';
import { FUNCIONES, funcion } from '@/components/web/datos';

export const dynamicParams = false;
export const generateStaticParams = () => FUNCIONES.map((f) => ({ slug: f.slug }));

export async function generateMetadata({ params }) {
  const f = funcion((await params).slug);
  return f ? { title: `${f.nombre} · Netto`, description: f.sub } : {};
}

export default async function PaginaFuncion({ params }) {
  const f = funcion((await params).slug);
  if (!f) notFound();
  const i = FUNCIONES.indexOf(f);
  const otras = [1, 2, 3].map((k) => FUNCIONES[(i + k) % FUNCIONES.length]);

  return (
    <>
      <section className="web-hero-pag">
        <nav className="web-migas web-entra" aria-label="Estás en"><Link href="/funciones">Funciones</Link><Icono n="chevron" /><span>{f.nombre}</span></nav>
        <span className="web-fcard-ico grande web-entra" style={{ '--d': '40ms' }}><Icono n={f.icono} /></span>
        <h1 className="web-entra" style={{ '--d': '80ms' }}>{f.titulo}</h1>
        <p className="web-sub web-entra" style={{ '--d': '140ms' }}>{f.sub}</p>
        <div className="web-cta web-entra" style={{ '--d': '200ms' }}>
          <Link className="web-btn web-btn-grande" href="/contacto">Pruébalo gratis<Flecha /></Link>
          <Link className="web-btn web-btn-claro web-btn-grande" href="/precios">Ver precios</Link>
        </div>
      </section>

      <section className="web-escaparate web-entra" style={{ '--d': '260ms' }}>
        <div className="web-escaparate-brillo" aria-hidden />
        <Demo tipo={f.demo} />
        <p className="web-escaparate-pie"><Icono n="rayo" />Demo interactiva con datos de ejemplo</p>
      </section>

      <section className="web-sec">
        <div className="web-puntos">
          {f.puntos.map((p, k) => (
            <div key={p.t} data-r style={{ '--d': `${k * 80}ms` }}>
              <span className="web-puntos-n">0{k + 1}</span>
              <h3>{p.t}</h3>
              <p>{p.d}</p>
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
                  <h2>{s.t}</h2>
                  <p>{s.d}</p>
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
          <div className="web-pronto" data-r><span className="web-pronto-tag">Próximamente</span><p>{f.proximamente}</p></div>
        </section>
      )}

      <Faq preguntas={f.faqs} titulo={`Preguntas sobre ${f.nombre}`} />

      <section className="web-sec">
        <Encabezado kicker="Sigue explorando" titulo="Funciona mejor junto" />
        <div className="web-relacionadas">
          {otras.map((o, k) => (
            <Link key={o.slug} href={`/funciones/${o.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${k * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n={o.icono} /></span>
              <h3>{o.nombre}</h3>
              <p>{o.corto}</p>
              <span className="web-enlace">Descubrir<Flecha /></span>
            </Link>
          ))}
        </div>
      </section>

      <Cta />
    </>
  );
}
