import Icono from '@/components/web/Icono';
import FormContacto from '@/components/web/FormContacto';
import { CONTACTO } from '@/components/web/datos';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';

export async function generateMetadata() {
  const tr = await textos();
  return { title: tr('Contacto · Fisquo'), description: tr('Cuéntanos qué necesitas para tu negocio. Propuestas de Fisquo Business, implantación y consultas.') };
}

const PASOS = [
  ['Nos escribes', 'Con lo básico de tu negocio: a qué te dedicas y cuántos sois.'],
  ['Te respondemos', 'Normalmente en el mismo día laborable, con lo que necesitas saber.'],
  ['Traes tus datos', 'Te ayudamos a importar tus clientes, facturas y contabilidad desde Holded, A3, Sage u otro programa.'],
];

export default async function Contacto({ searchParams }) {
  const tr = await textos();
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
        <h1 className="web-entra" style={{ '--d': '60ms' }}>{ampliacion ? conHuecos(tr('Más páginas para {resalte}'), { resalte: <em>{tr('tu negocio')}</em> }) : business ? conHuecos(tr('Una propuesta para {resalte}'), { resalte: <em>{tr('tu negocio')}</em> }) : conHuecos(tr('Cuéntanos qué {resalte}'), { resalte: <em>{tr('necesitas')}</em> })}</h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>{ampliacion ? tr('Solicita una ampliación de tu bolsa de lectura IA. Te confirmaremos el precio y las condiciones antes de que decidas contratarla.') : business ? tr('Cuéntanos cómo trabajáis y qué necesitáis. Te responderemos para definir una propuesta a medida.') : conHuecos(tr('Resolvemos dudas de planes, implantación y cómo traer tus datos. Si ya quieres probar Fisquo, {enlace}: tienes 30 días sin tarjeta.'), { enlace: <a href="/registro">{tr('crea tu cuenta gratis')}</a> })}</p>
        <ol className="web-contacto-pasos">
          {pasos.map(([t, d], i) => <li key={t} className="web-entra" style={{ '--d': `${180 + i * 70}ms` }}><b>{tr(t)}</b><span>{tr(d)}</span></li>)}
        </ol>
        <a className="web-contacto-mail web-entra" style={{ '--d': '400ms' }} href={`mailto:${CONTACTO}`}><Icono n="correo" />{CONTACTO}</a>
      </div>
      <div className="web-entra" style={{ '--d': '160ms' }}><FormContacto plan={typeof plan === 'string' ? plan.slice(0, 60) : ''} /></div>
    </section>
  );
}
