import Icono from '@/components/web/Icono';
import FormContacto from '@/components/web/FormContacto';
import { CONTACTO } from '@/components/web/datos';

export const metadata = { title: 'Pide acceso · Netto', description: 'Prueba Netto 14 días gratis, sin tarjeta. Cuéntanos cómo es tu negocio y te damos acceso.' };

const PASOS = [
  ['Nos escribes', 'Con lo básico de tu negocio: a qué te dedicas y cuántos sois.'],
  ['Te damos acceso', 'Te creamos la cuenta y empiezan tus 14 días gratis, sin tarjeta.'],
  ['Traes tus datos', 'Te ayudamos a importar tus clientes y facturas desde Holded u otro programa.'],
];

export default async function Contacto({ searchParams }) {
  const { plan } = await searchParams;
  return (
    <section className="web-contacto">
      <div className="web-contacto-txt">
        <p className="web-kicker web-entra">Pide acceso</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Empieza tus 14 días <em>gratis</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Netto está abriendo plazas poco a poco para atender bien a cada negocio. Déjanos tus datos y te respondemos lo antes posible.</p>
        <ol className="web-contacto-pasos">
          {PASOS.map(([t, d], i) => <li key={t} className="web-entra" style={{ '--d': `${180 + i * 70}ms` }}><b>{t}</b><span>{d}</span></li>)}
        </ol>
        <a className="web-contacto-mail web-entra" style={{ '--d': '400ms' }} href={`mailto:${CONTACTO}`}><Icono n="correo" />{CONTACTO}</a>
      </div>
      <div className="web-entra" style={{ '--d': '160ms' }}><FormContacto plan={typeof plan === 'string' ? plan.slice(0, 60) : ''} /></div>
    </section>
  );
}
