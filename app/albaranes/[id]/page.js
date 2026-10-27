import { sinFuncion } from '@/lib/planes';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { leer, leerUno } from '@/lib/redis';
import { baseDoc, estadoPedido, numeroDoc } from '@/lib/albaranes';
import { baseLinea, numeroFactura } from '@/lib/calculos';
import { eur, fechaTexto, hoy, pctCorto } from '@/lib/formato';
import { inventario } from '@/lib/inventario';
import { datosStock } from '@/lib/stockServidor';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import FormDoc from '@/components/FormDoc';
import { Borrar } from '@/components/Acciones';
import { CerrarPedido, FacturarAlbaranes } from '@/components/Albaranes';
import { actividadesDe } from '@/lib/empresa';
import '@/app/albaranes.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const ud = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n);

export default async function Doc({ params }) {
  const u = await requerir('facturar');
  const { id } = await params;
  const d = await leerUno(u, 'albaranes', id);
  if (!d) notFound();
  const datos = await datosStock(u);
  const clientes = ((await leer(u, 'clientes')) || []).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const factura = d.factura ? datos.facturas.find((f) => f.id === d.factura) : null;
  const pedido = d.pedido ? datos.albaranes.find((x) => x.id === d.pedido) : null;
  const est = d.tipo === 'pedido' ? estadoPedido(d, datos.albaranes) : null;
  const entregas = est ? datos.albaranes.filter((a) => est.albaranes.includes(a.id)).sort((a, b) => a.fecha.localeCompare(b.fecha)) : [];
  const h = hoy();
  const stock = Object.fromEntries(inventario(datos, { hoy: h }).productos.map((p) => [p.id, p.stock]));
  const puedeOperar = !sinFuncion(u.plan, 'albaranes');
  const editable = puedeOperar && !d.factura && !(d.tipo === 'pedido' && entregas.length);
  return (
    <main className="pagina mk-look">
      <Volver href={`/albaranes${d.tipo === 'albaran' ? `?ver=${d.factura ? 'facturados' : 'albaranes'}` : ''}`}>Pedidos y albaranes</Volver>
      <section className="factura-hero">
        <p className="fh-num">{d.tipo === 'proveedor' ? 'Pedido a proveedor' : d.tipo === 'pedido' ? 'Pedido' : 'Albarán'} {numeroDoc(d)}</p>
        <h1 className="fh-cliente">{d.cliente.nombre}</h1>
        <p className="fh-total">{eur(baseDoc(d))} <small>sin IVA</small></p>
        <div className="fh-pie"><span>{est ? { pendiente: 'Pendiente de servir', parcial: 'Servido en parte', servido: 'Servido', cerrado: 'Cerrado' }[est.estado] : d.factura ? 'Facturado' : 'Por facturar'}</span><span>{fechaTexto(d.fecha)}</span></div>
      </section>
      <div className="acciones-factura">
        <Ir href={`/albaranes/${d.id}/pdf`} className="boton">Ver / descargar PDF</Ir>
        {puedeOperar && est && ['pendiente', 'parcial'].includes(est.estado) && <Ir href={`/albaranes/nuevo?pedido=${d.id}`} tipo="subir" className="boton">Entregar (hacer albarán)</Ir>}
        {puedeOperar && est && est.estado !== 'servido' && <CerrarPedido id={d.id} cerrado={Boolean(d.cerrado)} />}
        {factura && <Link href={`/facturas/${factura.id}`} className="boton sec">Ver la factura {numeroFactura(factura)}</Link>}
        {puedeOperar && !d.factura && <Borrar url={`/api/albaranes?id=${d.id}`} pregunta={`¿Borrar ${d.tipo === 'pedido' ? 'el pedido' : 'el albarán'} ${numeroDoc(d)}?${d.tipo === 'albaran' ? ' Su mercancía vuelve al stock.' : ''}`} volver="/albaranes" />}
      </div>
      {pedido && <p className="nota">Entrega del pedido <Link href={`/albaranes/${pedido.id}`}>{numeroDoc(pedido)}</Link>.</p>}
      {est && (
        <section className="bloque">
          <h2 className="grupo-t">Servido</h2>
          <ul className="alb-lineas">{est.lineas.map((l, i) => <li key={i}><span>{l.concepto}<small>pedido {ud(l.cantidad)} · servido {ud(l.servido)}</small></span><b className={l.pendiente ? 'falta' : ''}>{l.pendiente ? `faltan ${ud(l.pendiente)}` : '✓'}</b></li>)}</ul>
          {entregas.length > 0 && <p className="nota">Albaranes: {entregas.map((a, i) => <span key={a.id}>{i ? ', ' : ''}<Link href={`/albaranes/${a.id}`}>{numeroDoc(a)}</Link></span>)}</p>}
        </section>
      )}
      {puedeOperar && d.tipo === 'albaran' && !d.factura && (
        <FacturarAlbaranes grupos={[{ clave: 'x', nombre: 'Facturar este albarán', albaranes: [{ id: d.id, numero: numeroDoc(d), fecha: d.fecha, base: baseDoc(d), resumen: `${d.lineas.length} ${d.lineas.length === 1 ? 'línea' : 'líneas'}` }] }]} hoy={h} actividades={actividadesDe(u)} />
      )}
      {editable ? (
        <FormDoc tipo={d.tipo} doc={d} clientes={clientes} productos={datos.productos.sort((a, b) => a.nombre.localeCompare(b.nombre))} stock={stock} hoy={h} numero={numeroDoc(d)} />
      ) : (
        <section className="bloque">
          <h2 className="grupo-t">Líneas</h2>
          <ul className="alb-lineas">{d.lineas.map((l, i) => <li key={i}><span>{l.concepto}<small>{ud(l.cantidad)} × {eur(l.precio)}{l.dto ? ` · −${pctCorto(l.dto)}` : ''} · IVA {pctCorto(l.ivaPct)}</small></span><b>{eur(baseLinea(l))}</b></li>)}</ul>
          {d.nota && <p className="nota">{d.nota}</p>}
        </section>
      )}
    </main>
  );
}

export async function generateMetadata({ params }) {
  const u = await requerir('facturar');
  const d = await leerUno(u, 'albaranes', (await params).id);
  return { title: d ? `${d.tipo === 'proveedor' ? 'Pedido a proveedor' : d.tipo === 'pedido' ? 'Pedido' : 'Albarán'} ${numeroDoc(d)}` : 'Albarán' };
}
