import Icono from '@/components/web/Icono';
import FormContacto from '@/components/web/FormContacto';
import { CONTACTO } from '@/components/web/datos';

export const metadata = { title: 'Contacto · Kontix', description: 'Cuéntanos qué necesitas para tu negocio. Propuestas de Kontix Business, implantación y consultas.' };

const PASOS = [
  ['Nos escribes', 'Con lo básico de tu negocio: a qué te dedicas y cuántos sois.'],
  ['Te damos acceso', 'Te creamos la cuenta y empieza tu mes gratis, sin tarjeta.'],
  ['Traes tus datos', 'Te ayudamos a importar tus clientes, facturas y contabilidad desde Holded, A3, Sage u otro programa.'],
];

export default async function Contacto({ searchParams }) {
  const { plan } = await searchParams;
  const ampliacion = typeof plan === 'string' && plan.startsWith('Ampliación');
  const business = typeof plan === 'string' && plan.startsWith('Business');
  const pasos = ampliacion ? [
    ['Cuéntanos tu volumen', 'Indica tu empresa, plan y las páginas adicionales que necesitas.'],
    ['Te enviamos una propuesta', 'Concretamos capacidad, periodo y precio antes de hacer ningún cambio.'],
    ['Tú decides', 'No se aplica ninguna ampliación ni cargo de forma automática.'],
  ] : business ? [
    ['Cuéntanos tu caso', 'Sociedades, usuarios, empleados y lo que necesitas gestionar.'],
    ['Definimos la propuesta', 'Acordamos el alcance, los servicios y un precio cerrado.'],
    ['Preparamos la puesta en marcha', 'Concretamos contigo la migración, los accesos y el acompañamiento.'],
  ] : PASOS;
  return (
    <section className="web-contacto">
      <div className="web-contacto-txt">
        <p className="web-kicker web-entra">{ampliacion ? 'Lectura de documentos' : business ? 'Kontix Business' : 'Pide acceso'}</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>{ampliacion ? <>Más páginas para <em>tu negocio</em></> : business ? <>Una propuesta para <em>tu negocio</em></> : <>Empieza tu mes <em>gratis</em></>}</h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>{ampliacion ? 'Solicita una ampliación de tu bolsa de lectura IA. Te confirmaremos el precio y las condiciones antes de que decidas contratarla.' : business ? 'Cuéntanos cómo trabajáis y qué necesitáis. Te responderemos para definir una propuesta a medida.' : 'Kontix está abriendo plazas poco a poco para atender bien a cada negocio. Déjanos tus datos y te respondemos lo antes posible.'}</p>
        <ol className="web-contacto-pasos">
          {pasos.map(([t, d], i) => <li key={t} className="web-entra" style={{ '--d': `${180 + i * 70}ms` }}><b>{t}</b><span>{d}</span></li>)}
        </ol>
        <a className="web-contacto-mail web-entra" style={{ '--d': '400ms' }} href={`mailto:${CONTACTO}`}><Icono n="correo" />{CONTACTO}</a>
      </div>
      <div className="web-entra" style={{ '--d': '160ms' }}><FormContacto plan={typeof plan === 'string' ? plan.slice(0, 60) : ''} /></div>
    </section>
  );
}
