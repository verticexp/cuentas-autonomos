import Precios from '@/components/web/Precios';
import { Cta, Faq } from '@/components/web/Bloques';
import { FAQ_PRECIOS } from '@/components/web/datos';

export const metadata = { title: 'Precios · Kontix', description: 'Planes para autónomos desde 9 € y pymes desde 25 € al mes sin IVA, por empresa. Business a medida. Prueba 30 días sin tarjeta.' };

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
      <Faq preguntas={FAQ_PRECIOS} titulo="Dudas sobre los precios" />
      <Cta titulo="¿Aún dudas qué plan elegir?" sub="Cuéntanos cómo es tu negocio y te recomendamos el plan que te sale más a cuenta." otro={['/funciones', 'Ver funciones']} />
    </>
  );
}
