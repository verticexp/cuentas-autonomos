import Link from '@/components/web/EnlacePublico';
import Icono from '@/components/web/Icono';
import TablaPreciosComparativa from '@/components/web/TablaPreciosComparativa';
import { Cta, Encabezado, Flecha } from '@/components/web/Bloques';
import { FECHA_VERIFICACION, RIVALES } from '@/data/web-comparativas';
import { fechaLarga } from '@/lib/webCalendario';
import { rellenar } from '@/lib/webComparativa';
import { metaPagina } from '@/lib/webMeta';

export const metadata = metaPagina({
  titulo: 'Comparativas de Fisquo: Holded y Quipu',
  descripcion: 'Fisquo frente a Holded y Quipu con sus precios publicados, verificados el 23 de octubre de 2026, y una guía honesta de cuándo te conviene cada uno.',
  ruta: '/comparativa',
});

export default function Comparativas() {
  return (
    <>
      <section className="web-hero-pag">
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Elige con los precios delante. <em>Y con honestidad.</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Comparamos Fisquo con otros programas usando solo lo que publican en su web de precios, con la fecha en que lo comprobamos. Si te conviene otro, te lo decimos.</p>
        <p className="web-art-meta web-entra" style={{ '--d': '180ms' }}>Precios verificados el <time dateTime={FECHA_VERIFICACION}>{fechaLarga(FECHA_VERIFICACION, false)}</time></p>
      </section>

      <section className="web-sec">
        <Encabezado titulo="Cuánto cuesta cada uno" sub="Importes tal como los publica cada programa en su web pública. Comprueba en la suya si el precio lleva IVA y qué incluye cada plan: no todos los planes incluyen lo mismo." />
        <TablaPreciosComparativa />
      </section>

      <section className="web-sec">
        <Encabezado titulo="Fisquo frente a cada programa" />
        <div className="web-relacionadas">
          {RIVALES.map((r, k) => (
            <Link key={r.slug} href={`/comparativa/${r.slug}`} data-foco data-r className="web-fcard" style={{ '--d': `${k * 70}ms` }}>
              <h3>{r.titulo}</h3>
              <p>{rellenar(r.intro)}</p>
              <span className="web-enlace">Ver la comparativa<Flecha /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="web-sec">
        <aside className="web-nota-info" role="note">
          <Icono n="ojo" />
          <p><b>Cómo comparamos.</b> De los demás programas solo publicamos lo que hemos comprobado en su web pública de precios, y siempre con la fecha. No valoramos sus funciones ni opinamos sobre su calidad. De Fisquo, solo lo que hace hoy. Si ves algo desactualizado o incorrecto, escríbenos a <a href="mailto:corporate@fisquo.com">corporate@fisquo.com</a> y lo corregimos.</p>
        </aside>
      </section>

      <Cta titulo="Pruébalo con tus propios papeles" sub="30 días gratis, sin tarjeta y sin permanencia. Y si vienes de otro programa, te ayudamos a traer tus datos." otro={['/precios', 'Ver los planes de Fisquo']} />
    </>
  );
}
