import { textos } from '@/lib/idiomaServidor';
import Vacio from '@/components/Vacio';
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
const resumen = (d, tr) => (d.lineas.length > 1 ? tr('{concepto} y {n} más', { concepto: d.lineas[0].concepto, n: d.lineas.length - 1 }) : d.lineas[0].concepto);

// Circuito de venta con entrega: pedido del cliente → albarán (el stock sale al entregar) → factura de varios albaranes.
export default async function Albaranes({ searchParams }) {
  const tr = await textos();
  const u = await requerir('facturar');
  const docs = await leer(u, 'albaranes');
  if (!docs) return <SinBD />;
  const puedeOperar = !sinFuncion(u.plan, 'albaranes');
  const sp = await searchParams;
  const hay = docs.length > 0;
  const ver = hay && VISTAS.some(([v]) => v === sp.ver) ? sp.ver : 'pedidos';
  const orden = (a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero;
  const pedidos = docs.filter((d) => d.tipo === 'pedido').map((p) => ({ ...p, ...estadoPedido(p, docs) })).sort(orden);
  const albaranes = docs.filter((d) => d.tipo === 'albaran').sort(orden);
  const sinFacturar = albaranes.filter((a) => !a.factura);
  const grupos = [];
  for (const a of sinFacturar) {
    const clave = (a.cliente.nif || a.cliente.nombre).toUpperCase().trim();
    let g = grupos.find((x) => x.clave === clave);
    if (!g) grupos.push(g = { clave, nombre: a.cliente.nombre, albaranes: [] });
    g.albaranes.push({ id: a.id, numero: numeroDoc(a), fecha: fechaCorta(a.fecha), base: baseDoc(a), resumen: resumen(a, tr) });
  }
  const abiertos = pedidos.filter((p) => ['pendiente', 'parcial'].includes(p.estado));

  return (
    <main className="pagina mk-look">
      <Volver href="/facturas">{tr("Facturas")}</Volver>
      <header className="cabecera">
        <h1 className="titulo">{tr("Pedidos y albaranes")}</h1>
        {hay && puedeOperar && <Ir href={`/albaranes/nuevo?tipo=${ver === 'pedidos' ? 'pedido' : 'albaran'}`} tipo="subir" className="boton pequeno">{(ver === 'pedidos' ? tr("Nuevo pedido") : tr("Nuevo albarán"))}</Ir>}
      </header>
      {hay && <p className="resumen-linea"><span>{(tr("Pedidos abiertos") + " ")}<strong>{abiertos.length}</strong></span><span>{(tr("Por facturar") + " ")}<strong>{eur(sinFacturar.reduce((s, a) => s + baseDoc(a), 0))}</strong></span></p>}
      {hay && <nav className="segmentado" aria-label={tr("Vista de pedidos y albaranes")}>{VISTAS.map(([v, n]) => <Ir key={v} href={`/albaranes?ver=${v}`} tipo="fundido" className={v === ver ? 'activo' : ''}>{tr(n)}{(v === 'albaranes' && sinFacturar.length ? ` (${sinFacturar.length})` : "")}</Ir>)}</nav>}

      {ver === 'pedidos' && (pedidos.length ? (
        <ul className="grupo-lista">
          {pedidos.map((p) => (
            <li key={p.id}><Link href={`/albaranes/${p.id}`} className="fila">
              <span className="txt"><strong>{p.cliente.nombre}</strong><small>{numeroDoc(p)} · {fechaCorta(p.fecha)}{(p.entrega ? (" " + tr("· entrega {v1}", { v1: fechaCorta(p.entrega) })) : "")} · {resumen(p, tr)}</small></span>
              <span className="imp-col"><span className="imp">{eur(baseDoc(p))}</span><span className={`estado-txt e-${p.estado === 'servido' ? 'cobrada' : p.estado === 'cerrado' ? 'cobrada' : 'pendiente'}`}>{tr(ESTADO[p.estado])}</span></span>
            </Link></li>
          ))}
        </ul>
      ) : <Vacio icono="presupuesto" titulo={tr("Apunta tu primer pedido")} accion={puedeOperar && { href: '/albaranes/nuevo?tipo=pedido', texto: tr('Crear pedido') }}>{tr("Apunta lo que te piden; al entregarlo, haz el albarán desde el pedido (el stock sale entonces) y a final de mes factura todos los albaranes juntos.")}</Vacio>)}

      {puedeOperar && ver === 'albaranes' && (grupos.length ? <FacturarAlbaranes grupos={grupos} hoy={hoy()} actividades={actividadesDe(u)} />
        : <Vacio icono="factura" titulo={tr("Nada por facturar")} accion={{ href: '/albaranes/nuevo?tipo=albaran', texto: tr('Crear albarán') }}>{tr("Los albaranes restan el stock al entregar. Elige varios del mismo cliente y haz una sola factura: no vuelve a restar el stock.")}</Vacio>)}

      {ver === 'facturados' && (!albaranes.some((a) => a.factura) ? <Vacio icono="factura" titulo={tr("Aún no has facturado ningún albarán")} accion={{ href: '/albaranes?ver=albaranes', texto: tr('Ver por facturar') }} /> :
        <ul className="grupo-lista">
          {albaranes.filter((a) => a.factura).map((a) => <li key={a.id}><Link href={`/albaranes/${a.id}`} className="fila"><span className="txt"><strong>{a.cliente.nombre}</strong><small>{numeroDoc(a)} · {fechaCorta(a.fecha)} · {resumen(a, tr)}</small></span><span className="imp-col"><span className="imp">{eur(baseDoc(a))}</span><span className="estado-txt e-cobrada">{tr("Facturado")}</span></span></Link></li>)}
        </ul>
      )}
    </main>
  );
}

export async function generateMetadata() { return { title: (await textos())("Pedidos y albaranes") }; }
