import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import Recorrido from '@/components/web/demos/Recorrido';
import { Cta, Encabezado, Flecha } from '@/components/web/Bloques';
import { PLANES } from '@/components/web/datos';
import { metaPagina } from '@/lib/webMeta';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';

export async function generateMetadata() {
  const tr = await textos();
  return metaPagina({
    titulo: tr('Demo de Fisquo sin registrarte'),
    descripcion: tr('Recorre Fisquo en cinco pasos con datos de ejemplo, sin registrarte y como autónomo o como sociedad: factura, gasto leído con IA, impuestos, banco y gestoría.'),
    ruta: '/demo',
  });
}

export default async function Demo() {
  const tr = await textos();
  return (
    <>
      <section className="web-hero-pag">
        <p className="web-kicker web-entra">{tr('Demo')}</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>{conHuecos(tr('Recorre Fisquo {resalte}'), { resalte: <em>{tr('sin registrarte')}</em> })}</h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>{tr('Cinco pasos, dos minutos y datos de ejemplo, como autónomo o como sociedad. Prueba a hacer una factura, leer un ticket con IA, ver tus impuestos, cuadrar el banco y compartirlo con tu gestoría.')}</p>
        <ul className="web-micro web-entra" style={{ '--d': '180ms' }}><li><Icono n="tic" />{tr('Sin registro ni tarjeta')}</li><li><Icono n="tic" />{tr('Datos de ejemplo')}</li><li><Icono n="tic" />{tr('No se guarda nada')}</li></ul>
      </section>

      <section className="web-sec web-sec-pegada">
        <Recorrido />
      </section>

      <section className="web-sec">
        <Encabezado kicker="Y mucho más" titulo="Esto es solo el principio" sub="Fisquo también lleva la contabilidad, el inventario, las nóminas y la previsión de caja. Míralo con calma en las funciones o aprende lo básico en nuestras guías." />
        <div className="web-relacionadas">
          <Link href="/funciones" data-foco data-r className="web-fcard">
            <span className="web-fcard-ico"><Icono n="rayo" /></span>
            <h3>{tr('Todas las funciones')}</h3>
            <p>{tr('Nueve áreas que trabajan juntas, de la factura a la cuenta de resultados.')}</p>
            <span className="web-enlace">{tr('Ver funciones')}<Flecha /></span>
          </Link>
          <Link href="/guias" data-foco data-r className="web-fcard" style={{ '--d': '70ms' }}>
            <span className="web-fcard-ico"><Icono n="documento" /></span>
            <h3>{tr('Guías fiscales')}</h3>
            <p>{tr('IVA, IRPF, Impuesto sobre Sociedades, retenciones, cuentas anuales y calendarios, para autónomos y sociedades.')}</p>
            <span className="web-enlace">{tr('Leer las guías')}<Flecha /></span>
          </Link>
          <Link href="/precios" data-foco data-r className="web-fcard" style={{ '--d': '140ms' }}>
            <span className="web-fcard-ico"><Icono n="tienda" /></span>
            <h3>{tr('Precios')}</h3>
            <p>{tr('Desde {importe} € al mes, sin permanencia y con 30 días de prueba sin tarjeta.', { importe: PLANES.aut[0].p })}</p>
            <span className="web-enlace">{tr('Ver precios')}<Flecha /></span>
          </Link>
        </div>
      </section>

      <Cta titulo="¿Te convence? Pruébalo con tus datos" sub="30 días gratis, sin tarjeta y sin permanencia. Te ayudamos a traer tus datos." />
    </>
  );
}
