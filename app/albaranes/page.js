import { sinFuncion } from '@/lib/planes';
import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { baseDoc, estadoPedido, numeroDoc } from '@/lib/albaranes';
import { actividadesDe } from '@/lib/empresa';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import { FacturarAlbaranes } from '@/components/Albaranes';
import '@/app/albaranes.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const VISTAS = [['pedidos', 'Pedidos'], ['albaranes', 'Por facturar'], ['facturados', 'Facturados']];
const ESTADO = { pendiente: 'Pendiente', parcial: 'Servido en parte', servido: 'Servido', cerrado: 'Cerrado' };
const resumen = (d) => (d.lineas.length > 1 ? `${d.lineas[0].concepto} y ${d.lineas.length - 1} más` : d.lineas[0].concepto);

// Circuito de venta con entrega: pedido del cliente → albarán (el stock sale al entregar) → factura de varios albaranes.
export default async function Albaranes({ searchParams }) {
  const u = await requerir('facturar');
  const docs = await leer(u, 'albaranes');
  if (!docs) return <SinBD />;
  const puedeOperar = !sinFuncion(u.plan, 'albaranes');
  const sp = await searchParams;
  const ver = VISTAS.some(([v]) => v === sp.ver) ? sp.ver : 'pedidos';
  const orden = (a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero;
  const pedidos = docs.filter((d) => d.tipo === 'pedido').map((p) => ({ ...p, ...estadoPedido(p, docs) })).sort(orden);
  const albaranes = docs.filter((d) => d.tipo === 'albaran').sort(orden);
  const sinFacturar = albaranes.filter((a) => !a.factura);
  const grupos = [];
  for (const a of sinFacturar) {
    const clave = (a.cliente.nif || a.cliente.nombre).toUpperCase().trim();
    let g = grupos.find((x) => x.clave === clave);
    if (!g) grupos.push(g = { clave, nombre: a.cliente.nombre, albaranes: [] });
    g.albaranes.push({ id: a.id, numero: numeroDoc(a), fecha: fechaCorta(a.fecha), base: baseDoc(a), resumen: resumen(a) });
  }
  const abiertos = pedidos.filter((p) => ['pendiente', 'parcial'].includes(p.estado));

  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">Facturas</Volver>
      <header className="cabecera">
        <h1 className="titulo">Pedidos y albaranes</h1>
        {puedeOperar && <Ir href={`/albaranes/nuevo?tipo=${ver === 'pedidos' ? 'pedido' : 'albaran'}`} tipo="subir" className="boton pequeno">{ver === 'pedidos' ? 'Nuevo pedido' : 'Nuevo albarán'}</Ir>}
      </header>
      <p className="resumen-linea"><span>Pedidos abiertos <strong>{abiertos.length}</strong></span><span>Por facturar <strong>{eur(sinFacturar.reduce((s, a) => s + baseDoc(a), 0))}</strong></span></p>
      <nav className="segmentado">{VISTAS.map(([v, n]) => <Link key={v} href={`/albaranes?ver=${v}`} className={v === ver ? 'activo' : ''}>{n}{v === 'albaranes' && sinFacturar.length ? ` (${sinFacturar.length})` : ''}</Link>)}</nav>

      {ver === 'pedidos' && (pedidos.length ? (
        <ul className="grupo-lista">
          {pedidos.map((p) => (
            <li key={p.id}><Link href={`/albaranes/${p.id}`} className="fila">
              <span className="txt"><strong>{p.cliente.nombre}</strong><small>{numeroDoc(p)} · {fechaCorta(p.fecha)}{p.entrega ? ` · entrega ${fechaCorta(p.entrega)}` : ''} · {resumen(p)}</small></span>
              <span className="imp-col"><span className="imp">{eur(baseDoc(p))}</span><span className={`estado-txt e-${p.estado === 'servido' ? 'cobrada' : p.estado === 'cerrado' ? 'cobrada' : 'pendiente'}`}>{ESTADO[p.estado]}</span></span>
            </Link></li>
          ))}
        </ul>
      ) : <div className="vacio"><p>Sin pedidos de clientes</p><p>Apunta lo que te piden; al entregarlo, haz el albarán desde el pedido (el stock sale entonces) y a final de mes factura todos los albaranes juntos.</p></div>)}

      {puedeOperar && ver === 'albaranes' && (grupos.length ? <FacturarAlbaranes grupos={grupos} hoy={hoy()} actividades={actividadesDe(u)} />
        : <div className="vacio"><p>Ningún albarán por facturar</p><p>Los albaranes restan el stock al entregar. Elige varios del mismo cliente y haz una sola factura: no vuelve a restar el stock.</p></div>)}

      {ver === 'facturados' && (
        <ul className="grupo-lista">
          {albaranes.filter((a) => a.factura).map((a) => <li key={a.id}><Link href={`/albaranes/${a.id}`} className="fila"><span className="txt"><strong>{a.cliente.nombre}</strong><small>{numeroDoc(a)} · {fechaCorta(a.fecha)} · {resumen(a)}</small></span><span className="imp-col"><span className="imp">{eur(baseDoc(a))}</span><span className="estado-txt e-cobrada">Facturado</span></span></Link></li>)}
        </ul>
      )}
    </main>
  );
}
