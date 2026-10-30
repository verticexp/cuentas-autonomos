import Link from '@/components/web/EnlacePublico';
import { Cta, Flecha } from '@/components/web/Bloques';
import { GUIAS, PUBLICOS, revisionDe } from '@/data/web-guias';
import { fechaLarga } from '@/lib/webCalendario';
import { metaPagina } from '@/lib/webMeta';

export const metadata = metaPagina({
  titulo: 'Guías fiscales para autónomos y pymes',
  descripcion: 'Guías claras y revisadas para autónomos y sociedades: IVA (303), IRPF (130), Impuesto sobre Sociedades (200 y 202), retenciones (111, 115, 190 y 180), cuentas anuales y calendarios fiscales 2026-2027, con la norma citada.',
  ruta: '/guias',
});

// Índice de las guías (data/web-guias.js), agrupadas por público: pymes y sociedades, autónomos y las que valen para los dos.
export default function Guias() {
  return (
    <>
      <section className="web-hero-pag">
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Los impuestos de tu negocio, <em>explicados sin rodeos</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Para autónomos y para sociedades: qué presentas, cuándo y cómo se calcula, con la norma citada y la fecha de revisión.</p>
      </section>

      {PUBLICOS.map(([id, titulo]) => {
        const lista = GUIAS.filter((g) => g.para === id);
        return lista.length ? (
          <section key={id} className="web-sec" aria-labelledby={`guias-${id}`}>
            <h2 id={`guias-${id}`} className="web-guias-t">{titulo}</h2>
            <div className="web-guias">
              {lista.map((g, k) => (
                <Link key={g.slug} href={`/guias/${g.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${(k % 2) * 70}ms` }}>
                  <h3>{g.titulo}</h3>
                  <p>{g.resumen}</p>
                  <small className="web-guia-meta">{g.minutos} min de lectura · Revisada el {fechaLarga(revisionDe(g), false)}</small>
                  <span className="web-enlace">Leer la guía<Flecha /></span>
                </Link>
              ))}
            </div>
          </section>
        ) : null;
      })}

      <section className="web-sec">
        <p className="web-nota">Las guías son informativas y no sustituyen el asesoramiento de un profesional. Fisquo calcula tus modelos; los presentas tú o tu gestoría.</p>
      </section>

      <Cta titulo="Pasa de la teoría a tus números" sub="Apunta tus facturas y gastos y Fisquo calcula tus modelos cada trimestre, seas autónomo o sociedad. 30 días gratis, sin tarjeta." otro={['/demo', 'Ver la demo sin registrarte']} />
    </>
  );
}
