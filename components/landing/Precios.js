'use client';

import { useState } from 'react';

const CONTACTO = 'mark.ramirez.2005@gmail.com';
const acceso = (asunto) => `mailto:${CONTACTO}?subject=${encodeURIComponent(asunto)}`;
const DESCUENTO = 30;

const SEGMENTOS = [
  { id: 'aut', n: 'Autónomos' },
  { id: 'pym', n: 'Pymes' },
  { id: 'gra', n: 'Grandes empresas' },
];

// «Todo lo del plan anterior» va como `herencia`; cada plan solo lista lo que añade.
const PLANES = {
  aut: [
    {
      n: 'Esencial', p: 9, para: 'Facturar y declarar sin sustos',
      l: ['Facturas y presupuestos ilimitados', 'Verifactu: huella encadenada y QR', 'Clientes, productos y facturas recurrentes', 'Gastos y proveedores', 'Escaneo de tickets y PDF con IA', 'Modelos 303, 130 y 100 calculados', 'Extractos del banco (N43, CSV, Excel) y saldo', 'Importación desde Holded y otros', '1 empresa · 1 usuario'],
    },
    {
      n: 'Pro', p: 12, para: 'Que tu banco trabaje por ti', fuerte: true, herencia: 'Esencial',
      l: ['Banco conectado (PSD2, solo lectura)', 'Conciliación automática de cobros y pagos', 'Previsión de caja a 3, 6 y 12 meses', 'Asistente IA con tus cifras', 'Varias actividades, cada una con su IVA e IRPF', 'Acceso para tu gestoría, con permisos', 'Recordatorios y avisos push'],
    },
    {
      n: 'Plus', p: 20, para: 'Para quien lo lleva todo', herencia: 'Pro',
      l: ['Hasta 3 empresas', 'Hasta 3 usuarios con permisos por área', 'Nóminas y registro de jornada (2 empleados)', 'Escaneos IA ampliados', 'Soporte prioritario'],
    },
  ],
  pym: [
    {
      n: 'Esencial', p: 25, para: 'Equipo pequeño, finanzas claras',
      l: ['Todo lo de Autónomos Pro', 'Banco conectado y conciliación', 'Previsión de caja y modelos', '1 empresa · 3 usuarios con permisos', 'Nóminas y jornada (hasta 5 empleados)', 'Acceso para tu gestoría', 'Escaneo IA para todo el equipo', 'Soporte por email'],
    },
    {
      n: 'Pro', p: 35, para: 'Varias empresas, un solo panel', fuerte: true, herencia: 'Esencial',
      l: ['3 empresas · 8 usuarios', 'Nóminas y jornada (hasta 15 empleados)', 'Roles y permisos por área', 'Varias actividades por empresa', 'Escaneos IA ampliados', 'Soporte prioritario'],
    },
    {
      n: 'Plus', p: 55, para: 'Cuando el equipo ya es grande', herencia: 'Pro',
      l: ['5 empresas · 15 usuarios', 'Nóminas y jornada (hasta 30 empleados)', 'Incorporación guiada y ayuda con la migración'],
    },
  ],
  gra: [
    {
      n: 'Esencial', p: 45, para: 'Control para estructuras grandes',
      l: ['Todo lo de Pymes Plus', '5 empresas · 20 usuarios', 'Nóminas y jornada (hasta 50 empleados)', 'Roles y permisos por área', 'Acceso para gestorías y auditores', 'Soporte prioritario'],
    },
    {
      n: 'Pro', p: 75, para: 'Grupos de empresas', fuerte: true, herencia: 'Esencial',
      l: ['15 empresas · 50 usuarios', 'Nóminas y jornada (hasta 150 empleados)', 'Escaneos IA sin límite práctico', 'Incorporación guiada'],
    },
    {
      n: 'Plus', p: 110, para: 'Sin techos que te frenen', herencia: 'Pro',
      l: ['40 empresas · usuarios ilimitados', 'Nóminas y jornada (hasta 500 empleados)', 'Gestor de cuenta y soporte dedicado'],
    },
  ],
};

const PERSONALIZADO = ['Más empresas, usuarios o empleados', 'Plantillas de factura con tu marca', 'Migración de tus datos', 'Integraciones y funciones a medida'];

const Tic = () => (
  <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Flecha = () => (
  <svg viewBox="0 0 16 16" className="web-flecha" aria-hidden><path d="M3 8h9m-3.5-4L12.5 8 8.5 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function Precios() {
  const [seg, setSeg] = useState('aut');
  const [anual, setAnual] = useState(false);
  const i = SEGMENTOS.findIndex((s) => s.id === seg);
  const nombreSeg = SEGMENTOS[i].n;

  return (
    <div className="web-precios">
      <div className="web-controles">
        <div className="web-seg" role="tablist" aria-label="Tipo de negocio" style={{ '--i': i }}>
          <span className="web-seg-ind" aria-hidden />
          {SEGMENTOS.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === seg} className={s.id === seg ? 'on' : undefined} onClick={() => setSeg(s.id)}>{s.n}</button>
          ))}
        </div>
        <div className="web-ciclo">
          <button className={!anual ? 'on' : undefined} onClick={() => setAnual(false)}>Mensual</button>
          <button role="switch" aria-checked={anual} aria-label="Pago anual" className={`web-switch${anual ? ' on' : ''}`} onClick={() => setAnual(!anual)}><span /></button>
          <button className={anual ? 'on' : undefined} onClick={() => setAnual(true)}>Anual <em>−{DESCUENTO} %</em></button>
        </div>
      </div>

      <div className="web-planes" key={seg}>
        {PLANES[seg].map((p, k) => {
          const mes = anual ? Math.round((p.p * (100 - DESCUENTO)) / 100) : p.p;
          const año = Math.round((p.p * 12 * (100 - DESCUENTO)) / 100);
          return (
            <article key={p.n} data-foco className={`web-plan${p.fuerte ? ' web-plan-fuerte' : ''}`} style={{ '--k': k }}>
              {p.fuerte && <span className="web-etiqueta">El más elegido</span>}
              <h3>{p.n}</h3>
              <p className="web-para">{p.para}</p>
              <p className="web-precio" key={`${seg}${anual}${p.n}`}><strong>{mes} €</strong><span>/mes</span></p>
              <p className="web-pie-precio">{anual ? `${año} € al año, sin IVA` : 'Sin IVA · cancela cuando quieras'}</p>
              <a className={`web-btn${p.fuerte ? '' : ' web-btn-oscuro'}`} href={acceso(`Acceso a Netto · ${nombreSeg} ${p.n}`)}>Pedir acceso <Flecha /></a>
              <ul>
                {p.herencia && <li className="web-herencia">Todo lo de {p.herencia}, y además:</li>}
                {p.l.map((x) => <li key={x}><Tic />{x}</li>)}
              </ul>
            </article>
          );
        })}
      </div>

      <article data-foco className="web-medida">
        <div>
          <h3>Personalización</h3>
          <p>¿Tu caso no encaja en un plan? Montamos uno a tu medida, con precio cerrado.</p>
        </div>
        <ul>{PERSONALIZADO.map((x) => <li key={x}><Tic />{x}</li>)}</ul>
        <a className="web-btn web-btn-claro-oscuro" href={acceso('Plan personalizado en Netto')}>Hablemos <Flecha /></a>
      </article>

      <p className="web-nota">14 días de prueba sin tarjeta · Precio de fundador para los primeros usuarios · Pagando al año ahorras un {DESCUENTO} %.</p>
    </div>
  );
}
