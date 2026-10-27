import { notFound } from 'next/navigation';
import { redis, leerUno } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur, fechaCorta, fechaTexto, hoy } from '@/lib/formato';
import { baseSenal, caduca, enlaceCaducado, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { Responder } from '@/components/AccionesPresupuesto';
import Conceptos from '@/components/Conceptos';
import { textos } from '@/lib/idiomaServidor';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Presupuesto'), robots: { index: false } }; }

// Página pública del presupuesto: la ve el cliente sin cuenta, con el enlace que le enviaron.
export default async function PresupuestoCliente({ params }) {
  const { token } = await params;
  const tr = await textos();
  const enlace = redis && (await redis.hget('presupuesto-enlaces', token));
  const p = enlace && (await leerUno({ empresa: enlace.empresa }, 'presupuestos', enlace.id));
  if (!p || enlaceCaducado(p, hoy())) notFound();
  const empresa = (await redis.hget('empresas', enlace.empresa)) || {};
  const e = empresa.emisor || {};
  const estado = estadoDe(p, hoy());
  const i = importes(p);
  // Lo mismo que textoEvento (lib/formato.js), con sus textos traducidos.
  const evento = [p.evento?.fecha && p.evento.fecha !== p.fecha && tr('Fecha de la operación: {fecha}', { fecha: fechaCorta(p.evento.fecha) }), p.evento?.lugar && tr('Lugar: {lugar}', { lugar: p.evento.lugar })].filter(Boolean).join(' · ');
  return (
    <main className="pagina" style={{ '--acento': empresa.marca?.color }}>
      {empresa.marca?.logo && <img src={empresa.marca.logo} alt="" style={{ maxWidth: 140, maxHeight: 56 }} />}
      <p className="fh-num">{e.nombre || empresa.nombre}{e.nif ? ` · ${e.nif}` : ''}</p>
      <section className="factura-hero">
        <p className="fh-num">{tr('Presupuesto {numero} · {fecha}', { numero: numeroPresupuesto(p), fecha: fechaTexto(p.fecha) })}</p>
        <h1 className="fh-cliente">{p.concepto}</h1>
        <p className="fh-total">{eur(i.total)}</p>
        <dl className="fh-desglose">
          <div><dt>{tr('Base')}</dt><dd>{eur(i.base)}</dd></div>
          <div><dt>{tr('IVA {pct} %', { pct: p.ivaPct })}</dt><dd>{eur(i.iva)}</dd></div>
          {p.irpfPct > 0 && <div><dt>IRPF {p.irpfPct} %</dt><dd>−{eur(i.irpf)}</dd></div>}
        </dl>
        {evento && <div className="fh-pie"><span>{evento}</span></div>}
      </section>
      <Conceptos lineas={p.lineas} />
      <p className="nota">{tr('Para: {cliente}', { cliente: `${p.cliente.nombre}${p.cliente.nif ? ` (${p.cliente.nif})` : ''}` })}</p>
      {p.senalPct > 0 && <p className="nota">{p.evento?.fecha ? tr('Al aceptar se factura una señal del {pct} % ({importe} + IVA); el resto, después de la fecha de la operación.', { pct: p.senalPct, importe: eur(baseSenal(p)) }) : tr('Al aceptar se factura una señal del {pct} % ({importe} + IVA); el resto, al terminar el trabajo.', { pct: p.senalPct, importe: eur(baseSenal(p)) })}</p>}
      {p.nota && <p className="nota">{p.nota}</p>}
      {estado === 'pendiente' && <><p className="nota">{tr('Válido hasta el {fecha}.', { fecha: fechaTexto(caduca(p)) })}</p><Responder token={token} /></>}
      {estado === 'caducado' && <p className="nota">{tr('Este presupuesto caducó el {fecha}. Pide uno nuevo.', { fecha: fechaTexto(caduca(p)) })}</p>}
      {p.respuesta && <p className="nota"><strong>{p.estado === 'rechazado' ? tr('Rechazado') : tr('Aceptado')}</strong> {tr('por {nombre} el {fecha}.', { nombre: p.respuesta.nombre, fecha: fechaTexto(p.respuesta.fecha.slice(0, 10)) })}</p>}
    </main>
  );
}
