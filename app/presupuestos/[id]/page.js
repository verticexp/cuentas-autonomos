import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { importes } from '@/lib/calculos';
import { eur, fechaTexto, hoy, textoEvento } from '@/lib/formato';
import { actividadesDe } from '@/lib/empresa';
import { puede } from '@/lib/permisos';
import { ESTADOS, baseResto, baseSenal, caduca, estadoDe, numeroPresupuesto } from '@/lib/presupuestos';
import { Borrar } from '@/components/Acciones';
import { Compartir, Facturar, MarcarAceptado } from '@/components/AccionesPresupuesto';
import { enlacePortal } from '@/lib/portal';
import '@/app/portal.css';
import FormPresupuesto from '@/components/FormPresupuesto';
import Volver from '@/components/Volver';
import Conceptos from '@/components/Conceptos';

export const dynamic = 'force-dynamic';

export default async function Presupuesto({ params }) {
  const u = await requerir('facturas');
  const { id } = await params;
  const [p, clientes] = await Promise.all([leerUno(u, 'presupuestos', id), leer(u, 'clientes')]);
  if (!p) notFound();
  const editar = puede(u, 'facturar');
  const portal = editar ? await enlacePortal(u, p.cliente.nombre) : null;
  const estado = estadoDe(p, hoy());
  const i = importes(p);
  const senal = p.facturas.find((f) => f.tipo === 'senal');
  return (
    <main className="pagina">
      <Volver href="/presupuestos">Presupuestos</Volver>
      <section className="factura-hero">
        <p className="fh-num">Presupuesto {numeroPresupuesto(p)}</p>
        <h1 className="fh-cliente">{p.cliente.nombre}</h1>
        <p className="fh-total">{eur(i.total)}</p>
        <dl className="fh-desglose">
          <div><dt>Base</dt><dd>{eur(i.base)}</dd></div>
          <div><dt>IVA {p.ivaPct} %</dt><dd>{eur(i.iva)}</dd></div>
          {p.senalPct > 0 && <div><dt>Señal {p.senalPct} %</dt><dd>{eur(baseSenal(p))} + IVA</dd></div>}
        </dl>
        <div className="fh-pie">
          <span className={`fh-estado ${ESTADOS[estado][1]}`}>{ESTADOS[estado][0]}{estado === 'pendiente' && ` · válido hasta el ${fechaTexto(caduca(p))}`}</span>
          {textoEvento(p) && <span>{textoEvento(p)}</span>}
        </div>
      </section>
      {p.estado !== 'pendiente' && <Conceptos lineas={p.lineas} />}
      {p.respuesta && <p className="nota">{p.estado === 'rechazado' ? 'Rechazado' : 'Aceptado'} por {p.respuesta.nombre} el {fechaTexto(p.respuesta.fecha.slice(0, 10))}.</p>}
      {p.facturas.length > 0 && <p className="nota">Facturas: {p.facturas.map((f, n) => <span key={f.id}>{n ? ', ' : ''}<Link href={`/facturas/${f.id}`}>{f.numero}</Link> ({f.tipo === 'senal' ? 'señal' : senal ? 'resto' : 'total'})</span>)}</p>}
      {editar && <div className="acciones-factura">
        {estado === 'pendiente' && <Compartir ruta={`/p/${p.token}`} texto={`Presupuesto ${numeroPresupuesto(p)}`} />}
        <Link href={`/p/${p.token}`} className="boton sec">Ver como el cliente</Link>
        {estado === 'pendiente' && <MarcarAceptado id={p.id} />}
        {['pendiente', 'aceptado'].includes(estado) && p.senalPct > 0 && !senal && <Facturar id={p.id} tipo="senal">Facturar señal ({eur(baseSenal(p))})</Facturar>}
        {['pendiente', 'aceptado'].includes(estado) && <Facturar id={p.id} tipo="resto">{senal ? `Facturar el resto (${eur(baseResto(p))})` : 'Facturar todo'}</Facturar>}
        {!p.facturas.length && <Borrar url={`/api/presupuestos?id=${p.id}`} pregunta={`¿Borrar el presupuesto ${numeroPresupuesto(p)}? El enlace del cliente dejará de funcionar.`} volver="/presupuestos" />}
      </div>}
      {portal && <section className="portal-enlace">
        <p className="nota">Portal de {p.cliente.nombre}: ve todas sus facturas y presupuestos, los descarga en PDF y paga.</p>
        <div className="portal-botones"><Compartir ruta={portal} texto={`Tus documentos de ${u.emisor?.nombre || ''}`.trim()} etiqueta="Enviar su portal" className="boton sec" /><Link href={portal} className="boton sec">Ver su portal</Link></div>
      </section>}
      {editar && p.estado === 'pendiente' && <FormPresupuesto key={JSON.stringify(p)} presupuesto={p} clientes={clientes} actividades={actividadesDe(u)} />}
    </main>
  );
}
