import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import { Cta, Flecha } from '@/components/web/Bloques';
import { GUIAS, REVISION_GUIAS } from '@/data/web-guias';
import { fechaLarga } from '@/lib/webCalendario';
import { metaPagina } from '@/lib/webMeta';

export const metadata = metaPagina({
  titulo: 'Guías fiscales para autónomos',
  descripcion: 'Guías claras y revisadas sobre el modelo 303, el modelo 130, el calendario fiscal del autónomo 2026-2027 y la factura simplificada, con la norma citada.',
  ruta: '/guias',
});

export default function Guias() {
  return (
    <>
      <section className="web-hero-pag">
        <p className="web-kicker web-entra">Guías fiscales</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Los impuestos del autónomo, <em>explicados sin rodeos</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Cuatro guías prácticas con la norma citada y la fecha de revisión. Para entender qué presentas, cuándo y cómo se calcula.</p>
      </section>

      <section className="web-sec">
        <div className="web-guias">
          {GUIAS.map((g, k) => (
            <Link key={g.slug} href={`/guias/${g.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${(k % 2) * 70}ms` }}>
              <span className="web-fcard-ico"><Icono n="documento" /></span>
              <h2>{g.titulo}</h2>
              <p>{g.resumen}</p>
              <small className="web-guia-meta">{g.minutos} min de lectura · Revisada el {fechaLarga(REVISION_GUIAS, false)}</small>
              <span className="web-enlace">Leer la guía<Flecha /></span>
            </Link>
          ))}
        </div>
        <p className="web-nota">Las guías son informativas y no sustituyen el asesoramiento de un profesional. Fisquo calcula tus modelos; los presentas tú o tu gestoría.</p>
      </section>

      <Cta titulo="Pasa de la teoría a tus números" sub="Apunta tus facturas y gastos y Fisquo calcula tus modelos cada trimestre. 30 días gratis, sin tarjeta." otro={['/demo', 'Ver la demo sin registrarte']} />
    </>
  );
}
