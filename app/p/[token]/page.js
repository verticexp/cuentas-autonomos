import { notFound } from 'next/navigation';
import { redis, leerUno } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur, fechaTexto, hoy, textoEvento } from '@/lib/formato';
import { baseSenal, caduca, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { Responder } from '@/components/AccionesPresupuesto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Presupuesto', robots: { index: false } };

// Página pública del presupuesto: la ve el cliente sin cuenta, con el enlace que le enviaron.
export default async function PresupuestoCliente({ params }) {
  const { token } = await params;
  const enlace = redis && (await redis.hget('presupuesto-enlaces', token));
  const p = enlace && (await leerUno({ empresa: enlace.empresa }, 'presupuestos', enlace.id));
  if (!p) notFound();
  const empresa = (await redis.hget('empresas', enlace.empresa)) || {};
  const e = empresa.emisor || {};
  const estado = estadoDe(p, hoy());
  const i = importes(p);
  return (
    <main className="pagina" style={{ '--acento': empresa.marca?.color }}>
      {empresa.marca?.logo && <img src={empresa.marca.logo} alt="" style={{ maxWidth: 140, maxHeight: 56 }} />}
      <p className="fh-num">{e.nombre || empresa.nombre}{e.nif ? ` · ${e.nif}` : ''}</p>
      <section className="factura-hero">
        <p className="fh-num">Presupuesto {numeroPresupuesto(p)} · {fechaTexto(p.fecha)}</p>
        <h1 className="fh-cliente">{p.concepto}</h1>
        <p className="fh-total">{eur(i.total)}</p>
        <dl className="fh-desglose">
          <div><dt>Base</dt><dd>{eur(i.base)}</dd></div>
          <div><dt>IVA {p.ivaPct} %</dt><dd>{eur(i.iva)}</dd></div>
          {p.irpfPct > 0 && <div><dt>IRPF {p.irpfPct} %</dt><dd>−{eur(i.irpf)}</dd></div>}
        </dl>
        {textoEvento(p) && <div className="fh-pie"><span>{textoEvento(p)}</span></div>}
      </section>
      <p className="nota">Para: {p.cliente.nombre}{p.cliente.nif ? ` (${p.cliente.nif})` : ''}</p>
      {p.senalPct > 0 && <p className="nota">Al aceptar se factura una señal del {p.senalPct} % ({eur(baseSenal(p))} + IVA); el resto, después del evento.</p>}
      {p.nota && <p className="nota">{p.nota}</p>}
      {estado === 'pendiente' && <><p className="nota">Válido hasta el {fechaTexto(caduca(p))}.</p><Responder token={token} /></>}
      {estado === 'caducado' && <p className="nota">Este presupuesto caducó el {fechaTexto(caduca(p))}. Pide uno nuevo.</p>}
      {p.respuesta && <p className="nota"><strong>{p.estado === 'rechazado' ? 'Rechazado' : 'Aceptado'}</strong> por {p.respuesta.nombre} el {fechaTexto(p.respuesta.fecha.slice(0, 10))}.</p>}
    </main>
  );
}
