import Link from '@/components/web/EnlacePublico';
import Precios from '@/components/web/Precios';
import PruebaSocial from '@/components/web/PruebaSocial';
import { Confianza, Cta, Faq, Flecha } from '@/components/web/Bloques';
import { FAQ_PRECIOS } from '@/components/web/datos';

export const metadata = { title: 'Precios · Fisquo', description: 'Planes para autónomos desde 9 € y pymes desde 25 € al mes sin IVA, por empresa. Business a medida. Prueba 30 días sin tarjeta.' };

export default function PaginaPrecios() {
  return (
    <>
      <section className="web-hero-pag centro">
        <p className="web-kicker web-entra">Precios</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Paga por lo que usas. <em>Ni un euro más.</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Elige tu tipo de negocio y el plan que encaja. Sin cuotas de alta, sin permanencia y con 30 días de prueba sin tarjeta. Cada suscripción incluye una empresa.</p>
      </section>
      <section className="web-sec web-sec-pegada web-entra" style={{ '--d': '180ms' }}>
        <Precios tabla />
      </section>
      {/* Antes de pagar, quien no conoce Fisquo quiere comprobarlo con sus propios tickets: la prueba trae 50 páginas de
          lectura IA (lib/cuotasIAConfig.js) y, con el código de una gestoría, dura 90 días (lib/gestorias.js). */}
      <section className="web-sec">
        <div className="web-mudanza" data-r>
          <div>
            <p className="web-kicker">Antes de pagar</p>
            <h2>Pruébalo con tus propios papeles</h2>
            <p>La prueba incluye 50 páginas de lectura IA: de sobra para comprobar con tus tickets y facturas reales si te ahorra tiempo. Y si tu gestoría trabaja con Fisquo, con su código la prueba dura 3 meses, un trimestre entero.</p>
            <Link href="/registro" className="web-btn">Empieza gratis<Flecha /></Link>
          </div>
          <ol>
            <li><b>Sube 20 o 30 tickets y facturas</b><span>En foto o PDF, de los que ya tienes este trimestre.</span></li>
            <li><b>Revisa lo que ha leído</b><span>Te lo enseña antes de guardarlo y lo corriges si hace falta.</span></li>
            <li><b>Compáralo con tu trimestre</b><span>Mira el IVA y el IRPF que calcula frente a lo que ya sabes.</span></li>
          </ol>
        </div>
      </section>
      <PruebaSocial />
      <Confianza titulo="Tus datos, a salvo y siempre tuyos" />
      <Faq preguntas={FAQ_PRECIOS} titulo="Dudas sobre los precios" />
      <Cta titulo="¿Aún dudas qué plan elegir?" sub="Cuéntanos cómo es tu negocio y te recomendamos el plan que te sale más a cuenta." otro={['/funciones', 'Ver funciones']} />
    </>
  );
}
