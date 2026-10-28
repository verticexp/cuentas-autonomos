import { Encabezado } from '@/components/web/Bloques';
import { pruebaSocial } from '@/lib/webSocial';
import { textos } from '@/lib/idiomaServidor';

// Opiniones, casos, gestorías y nota del fundador. Todo sale de data/web-social.js y solo se pinta lo que tiene datos:
// con el archivo vacío (hoy), este componente no devuelve nada. No añadir textos de relleno aquí.
export default async function PruebaSocial() {
  const tr = await textos();
  const s = pruebaSocial();
  if (!s.hay) return null;
  return (
    <>
      {s.nota && (
        <section className="web-sec">
          <figure className="web-nota-fundador" data-r>
            {s.nota.foto && <img src={s.nota.foto} alt="" width="72" height="72" loading="lazy" decoding="async" />}
            <blockquote><p>{s.nota.texto}</p></blockquote>
            <figcaption><b>{s.nota.nombre}</b>{s.nota.cargo && <span>{s.nota.cargo}</span>}</figcaption>
          </figure>
        </section>
      )}

      {s.opiniones.length > 0 && (
        <section className="web-sec">
          <Encabezado kicker="Opiniones" titulo="Lo que cuentan quienes ya lo usan" />
          <div className="web-opiniones">
            {s.opiniones.map((o, i) => (
              <figure key={`${o.nombre}-${i}`} data-foco data-r style={{ '--d': `${(i % 3) * 70}ms` }}>
                <blockquote><p>{o.texto}</p></blockquote>
                <figcaption>
                  {o.foto && <img src={o.foto} alt="" width="44" height="44" loading="lazy" decoding="async" />}
                  <span><b>{o.nombre}</b>{[o.negocio, o.ciudad].filter(Boolean).join(' · ')}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {s.casos.length > 0 && (
        <section className="web-sec">
          <Encabezado kicker="Casos" titulo="Cómo les ha cambiado el día a día" />
          <div className="web-casos">
            {s.casos.map((c, i) => (
              <article key={`${c.empresa}-${i}`} data-foco data-r style={{ '--d': `${(i % 2) * 70}ms` }}>
                <h3>{c.empresa}</h3>
                {c.sector && <small>{c.sector}</small>}
                <p><b>{tr('Antes')}</b>{c.problema}</p>
                <p><b>{tr('Ahora')}</b>{c.resultado}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {s.gestorias.length > 0 && (
        <section className="web-sec">
          <div className="web-gestorias-logos" data-r>
            <p>{tr('Gestorías que trabajan con Fisquo')}</p>
            <ul>{s.gestorias.map((g, i) => <li key={`${g.nombre}-${i}`}>{g.logo ? <img src={g.logo} alt={g.nombre} height="32" loading="lazy" decoding="async" /> : g.nombre}</li>)}</ul>
          </div>
        </section>
      )}
    </>
  );
}
