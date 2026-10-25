import { notFound } from 'next/navigation';
import Link from '@/components/web/EnlacePublico';
import { CAMPOS_REGISTRO, identidadLegal } from '@/lib/webLegal';
import { metaPagina } from '@/lib/webMeta';

export const metadata = metaPagina({
  titulo: 'Aviso legal',
  descripcion: 'Datos del titular de fisquo.com según el artículo 10 de la Ley 34/2002 (LSSI): titular, NIF, domicilio, correo electrónico y datos registrales.',
  ruta: '/aviso-legal',
});

// Datos del titular que exige el art. 10 de la LSSI. Salen de data/empresa-legal.js: sin titular, NIF y domicilio no hay
// página (404), para no publicar nunca un aviso incompleto ni con datos inventados.
export default function AvisoLegal() {
  const e = identidadLegal();
  if (!e) notFound();
  return (
    <>
      <section className="web-hero-pag">
        <p className="web-kicker web-entra">Información legal</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Aviso legal</h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Datos del titular de fisquo.com, en cumplimiento del artículo 10 de la Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico.</p>
      </section>

      <section className="web-sec">
        <div className="web-legal">
          <h2>Titular del sitio web</h2>
          <dl>
            <div><dt>Titular</dt><dd>{e.titular}</dd></div>
            <div><dt>NIF</dt><dd>{e.nif}</dd></div>
            <div><dt>Domicilio</dt><dd>{e.domicilio}</dd></div>
            <div><dt>Correo electrónico</dt><dd><a href={`mailto:${e.email}`}>{e.email}</a></dd></div>
            {e.registro && CAMPOS_REGISTRO.filter(([k]) => e.registro[k]).map(([k, t]) => <div key={k}><dt>{t}</dt><dd>{e.registro[k]}</dd></div>)}
          </dl>

          <h2>Propiedad intelectual e industrial</h2>
          <p>Salvo que se indique otra cosa, los contenidos de esta web (textos, diseños, marca y logotipo) están protegidos por la normativa de propiedad intelectual e industrial. Para reutilizarlos, pide permiso por escrito al correo electrónico de arriba.</p>

          <h2>Más información</h2>
          <p>El tratamiento de tus datos personales está en la <a href="/privacidad">política de privacidad</a>, y las reglas de uso del servicio, en las <a href="/condiciones">condiciones</a>. La <Link href="/declaracion-responsable">declaración responsable</Link> del sistema informático de facturación (Verifactu) se publica en su propia página.</p>
        </div>
      </section>
    </>
  );
}
