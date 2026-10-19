import Icono from '@/components/web/Icono';
import FormContacto from '@/components/web/FormContacto';
import { CONTACTO } from '@/components/web/datos';

export const metadata = { title: 'Netto para gestorías · Netto', description: 'Programa de gestorías partner: tus clientes autónomos llegan con las cuentas al día. Acceso gratis para la gestoría y 3 meses gratis para sus clientes.' };

const PASOS = [
  ['Te apuntas', 'Nos dejas tus datos y te escribimos para conocer tu gestoría.'],
  ['Recibes tu código', 'Te damos acceso gratis a Netto y un código propio para tus clientes.'],
  ['Se lo pasas a tus clientes', 'Con tu código tienen 3 meses gratis y llegan a ti con ingresos y gastos ordenados.'],
];

const VENTAJAS = [
  'Menos tiempo persiguiendo tickets y facturas cada trimestre.',
  'Clientes que saben cuánto apartar para Hacienda.',
  'Acceso gratis a Netto para tu gestoría.',
  'Netto no sustituye a la gestoría: tú sigues llevando sus impuestos.',
];

export default function Gestorias() {
  return (
    <section className="web-contacto">
      <div className="web-contacto-txt">
        <p className="web-kicker web-entra">Gestorías partner</p>
        <h1 className="web-entra" style={{ '--d': '60ms' }}>Tus autónomos, con las cuentas al día <em>antes de que se las pidas</em></h1>
        <p className="web-sub web-entra" style={{ '--d': '120ms' }}>Netto ayuda a tus clientes a llevar sus ingresos y gastos durante el trimestre. Tú recibes la información ordenada y dedicas el tiempo a asesorar.</p>
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
