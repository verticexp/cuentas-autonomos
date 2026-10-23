import Icono from '@/components/web/Icono';
import FormContacto from '@/components/web/FormContacto';
import { CONTACTO } from '@/components/web/datos';

export const metadata = { title: 'Programa para gestorías · Fisquo', description: 'Programa de gestorías partner: un panel con todos tus clientes, el trimestre revisado y cerrado, preguntas al cliente y exportación a A3, ContaPlus o ContaSol. Gratis para la gestoría y 3 meses gratis para sus clientes.' };

const PASOS = [
  ['Te apuntas', 'Nos dejas tus datos y te escribimos para conocer tu gestoría.'],
  ['Recibes tu código', 'Te damos tu panel Mi despacho, gratis, y un código propio para tus clientes.'],
  ['Se lo pasas a tus clientes', 'Con tu código tienen 3 meses gratis y te dan acceso a sus cuentas: llegan a tu panel con ingresos y gastos ordenados.'],
];

const VENTAJAS = [
  'Mi despacho: todos tus clientes en un panel, con lo que sale a pagar y lo que falta en cada trimestre.',
  'Revisas y cierras el trimestre: nadie cambia lo cerrado, y lo que cambie después lo ves marcado.',
  'Preguntas al cliente sobre un gasto o una factura, sin perseguirle por WhatsApp.',
  'Paquete trimestral y contabilidad para A3, ContaPlus o ContaSol, de un cliente o de todos.',
  'Acceso gratis para tu gestoría y Fisquo gratis para la empresa de tu despacho.',
  'Fisquo no sustituye a la gestoría: tú revisas y presentas, y el cliente ve todo lo que haces en sus cuentas.',
];

export default function Gestorias() {
  return (
    <section className="web-contacto">
      <div className="web-contacto-txt">
        <p className="web-kicker web-entra">Gestorías partner</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Tus autónomos, con las cuentas al día <em>antes de que se las pidas</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Fisquo ayuda a tus clientes a llevar sus ingresos y gastos durante el trimestre. Tú recibes la información ordenada y dedicas el tiempo a asesorar.</p>
        <ol className="web-contacto-pasos">
          {PASOS.map(([t, d], i) => <li key={t} className="web-entra" style={{ '--d': `${180 + i * 70}ms` }}><b>{t}</b><span>{d}</span></li>)}
        </ol>
        <ul className="web-gestorias-ventajas web-entra" style={{ '--d': '390ms' }}>
          {VENTAJAS.map((v) => <li key={v}><Icono n="tic" />{v}</li>)}
        </ul>
        <a className="web-contacto-mail web-entra" style={{ '--d': '440ms' }} href={`mailto:${CONTACTO}`}><Icono n="correo" />{CONTACTO}</a>
      </div>
      <div className="web-entra" style={{ '--d': '160ms' }}><FormContacto plan="Gestoría partner" gestoria /></div>
    </section>
  );
}
