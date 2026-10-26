import Vacio from '@/components/Vacio';
import { sinFuncion } from '@/lib/planes';
import SinPlan from '@/components/SinPlan';
import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { leer } from '@/lib/redis';
import { datosStock } from '@/lib/stockServidor';
import { enCamino, numeroDoc, totalPedidoProv } from '@/lib/albaranes';
import { fiscalDe, usaIgic } from '@/lib/empresa';
import { inventario, quePedir } from '@/lib/inventario';
import { eur, fechaCorta, hoy, pctCorto } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import { CopiarPedido, HacerPedido, RecibirPedido } from '@/components/Inventario';
import '@/app/modelos.css';
import '@/app/contabilidad.css';
import '@/app/inventario.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const VISTAS = [['stock', 'Stock'], ['pedir', 'Qué pedir'], ['pedidos', 'Pedidos'], ['informes', 'Informes']];
const ud = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n);

export default async function Inventario({ searchParams }) {
  const u = await requerir('facturas');
  if (u.plan?.version >= 2 && sinFuncion(u.plan, 'inventario')) return <SinPlan usuario={u} funcion="inventario" />;
  if (!fiscalDe(u).inventario) return (
    <main className="pagina mk-look modelos contabilidad inventario">
      <Volver href="/facturas">Facturas</Volver>
      <h1 className="titulo">Inventario</h1>
      {/* Se activa en «Actividades e impuestos» (Vendo productos y quiero controlar el stock), que es de quien administra. */}
      <Vacio icono="datos" titulo="El inventario está desactivado" accion={puede(u, 'empresa') && { href: '/bienvenida?editar=1', texto: 'Activar inventario' }}>Actívalo si vendes productos y quieres saber cuántos te quedan: cada factura resta stock y cada compra lo suma.{puede(u, 'empresa') ? '' : ' Pídeselo a quien administra la empresa.'}</Vacio>
    </main>
  );
  const [datos, pedidosProv] = await Promise.all([datosStock(u), leer(u, 'pedidosProv')]);
  if (datos.sinBD) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const ver = VISTAS.some(([v]) => v === sp.ver) ? sp.ver : 'stock';
  const anio = Number(sp.anio) || Number(h.slice(0, 4));
  const q = String(sp.q || '').trim().toLowerCase();
  const inv = inventario(datos, { hoy: anio < Number(h.slice(0, 4)) ? `${anio}-12-31` : h, desde: `${anio}-01-01` });
  const lista = inv.productos.filter((p) => !q || [p.nombre, p.sku, p.codigo, p.proveedor].some((t) => String(t || '').toLowerCase().includes(q)))
    .sort((a, b) => Number(b.bajo) - Number(a.bajo) || a.nombre.localeCompare(b.nombre));
  const pedidosP = (pedidosProv || []).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero);
  const pedidos = quePedir(inv.productos, enCamino(pedidosP));
  const abiertos = pedidosP.filter((p) => !p.recibido && !p.cancelado);
  const url = (c) => { const p = new URLSearchParams(Object.entries({ ver, ...c }).filter(([, v]) => v)); return `/inventario?${p}`; };
  const top = (k, n = 10) => [...inv.productos].filter((p) => p[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n);

  return (
    <main className="pagina mk-look modelos contabilidad inventario">
      <Volver href="/facturas">Facturas</Volver>
      <h1 className="titulo">Inventario</h1>
      {!inv.productos.length ? <Vacio icono="datos" titulo="Añade tu primer producto" accion={{ href: '/facturas/catalogo', texto: 'Añadir producto' }}>Añádelo en el catálogo con su coste y su stock mínimo. Después, cada factura lo resta y cada compra lo suma.</Vacio> : <>

      <div className="cont-resumen">
        <div><span>Valor del almacén</span><strong>{eur(inv.valor)}</strong></div>
        <div><span>Productos</span><strong>{inv.productos.length}</strong></div>
        <div><span>Bajo mínimo</span><strong className={inv.bajos.length ? 'inv-rojo' : ''}>{inv.bajos.length}</strong></div>
      </div>
      <nav className="segmentado" aria-label="Vista del inventario">{VISTAS.map(([v, n]) => <Ir key={v} href={url({ ver: v })} tipo="fundido" className={v === ver ? 'activo' : ''}>{n}</Ir>)}</nav>

      {ver === 'stock' && (
        <section className="bloque">
          <form action="/inventario" className="cont-buscar"><input className="campo" name="q" type="search" aria-label="Buscar productos" defaultValue={q} placeholder="Buscar por nombre, referencia o proveedor" /></form>
          {lista.length ? (
            <ul className="grupo-lista">
              {lista.map((p) => (
                <li key={p.id}>
                  <Ir href={`/inventario/${p.id}`} className="fila">
                    <span className="txt"><strong>{p.nombre}</strong><small>{[p.sku, p.minimo ? `mínimo ${ud(p.minimo)}` : '', `coste medio ${eur(p.costeMedio)}`].filter(Boolean).join(' · ')}</small></span>
                    <span className="imp-col">
                      <span className="imp">{ud(p.stock)} ud.</span>
                      {p.agotado ? <span className="estado-txt e-pendiente">Agotado</span> : p.bajo ? <span className="estado-txt e-pendiente">Bajo mínimo</span> : <small className="nota">{eur(p.valor)}</small>}
                    </span>
                  </Ir>
                </li>
              ))}
            </ul>
          ) : <Vacio icono="datos" tipo={q ? 'resultados' : 'vacio'} titulo={q ? `Ningún producto con «${sp.q}»` : 'Añade tu primer producto'} accion={q ? { href: '/inventario', texto: 'Quitar búsqueda' } : { href: '/facturas/catalogo', texto: 'Añadir producto' }}>{!q && 'Añádelo en el catálogo con su coste y su stock mínimo. Después, cada factura lo resta y cada compra lo suma.'}</Vacio>}
          <p className="grupo-pie">Restan del stock las facturas, los albaranes y las unidades de los cierres de caja (las rectificativas lo devuelven); las compras (gastos con productos) lo suman; los recuentos, roturas y consumos se apuntan en cada producto. Valorado a coste medio ponderado.</p>
        </section>
      )}

      {ver === 'pedir' && (
        <section className="bloque">
          {pedidos.length ? pedidos.map((g) => (
            <div key={g.proveedor} className="tarjeta inv-pedido">
              <div className="inv-pedido-cab"><strong>{g.proveedor}</strong><span>{eur(g.total)}</span></div>
              <ul>{g.items.map((x) => <li key={x.id}><span>{x.nombre}{x.sku ? ` (${x.sku})` : ''}<small>quedan {ud(x.stock)} · mínimo {ud(x.minimo)}</small></span><b>{ud(x.cantidad)} ud.</b></li>)}</ul>
              <div className="inv-acciones">{puede(u, 'gastar') && <HacerPedido proveedor={g.proveedor} items={g.items} hoy={h} />}<CopiarPedido texto={`Hola, os quería pedir:\n${g.items.map((x) => `- ${ud(x.cantidad)} × ${x.nombre}${x.sku ? ` (${x.sku})` : ''}`).join('\n')}\nGracias.`} /></div>
            </div>
          )) : <Vacio icono="datos" titulo="No hace falta pedir nada">Aquí salen los productos que llegan a su stock mínimo, agrupados por proveedor.</Vacio>}
          <p className="grupo-pie">Se propone pedir hasta el «pedir hasta» de cada producto (o el doble del mínimo), al coste medio actual. Lo que ya está pedido y sin recibir cuenta como si estuviera.</p>
        </section>
      )}

      {ver === 'pedidos' && (
        <section className="bloque">
          {pedidosP.length ? pedidosP.slice(0, 60).map((p) => (
            <div key={p.id} className="tarjeta inv-pedido">
              <div className="inv-pedido-cab"><strong>{p.proveedor}</strong><span>{eur(totalPedidoProv(p))}</span></div>
              <p className="nota">{numeroDoc({ ...p, tipo: 'proveedor' })} · {fechaCorta(p.fecha)} · {p.recibido ? <>recibido el {fechaCorta(p.recibido)}{p.gasto && <> · <Link href={`/gastos/${p.gasto}`}>ver la compra</Link></>}</> : p.cancelado ? (p.recepciones?.length ? 'resto cancelado' : 'cancelado') : p.recepciones?.length ? <>recibido en parte · {p.recepciones.map((r) => <Link key={r.id} href={`/gastos/${r.gasto}`}>ver la compra del {fechaCorta(r.fecha)}</Link>).reduce((a, x) => (a.length ? [...a, ' · ', x] : [x]), [])}</> : 'en camino'}</p>
              <ul>{p.lineas.map((x, i) => <li key={i}><span>{x.concepto}{x.sku ? ` (${x.sku})` : ''}<small>{eur(x.coste)}/ud.</small></span><b>{ud(x.cantidad)} ud.</b></li>)}</ul>
              {!p.recibido && !p.cancelado && puede(u, 'gastar') && <RecibirPedido igic={usaIgic(fiscalDe(u))} pedido={p} hoy={h} />}
              {!p.recibido && <CopiarPedido texto={`Hola, os quería pedir:\n${p.lineas.map((x) => `- ${ud(x.cantidad)} × ${x.concepto}${x.sku ? ` (${x.sku})` : ''}`).join('\n')}\nGracias.`} />}
            </div>
          )) : <Vacio icono="gasto" titulo="Sin pedidos a proveedores" accion={{ href: '/inventario?ver=pedir', texto: 'Ver qué pedir' }}>Hazlos desde «Qué pedir». Al recibirlos, se apunta la compra con su stock.</Vacio>}
          {abiertos.length > 0 && <p className="grupo-pie">{abiertos.length === 1 ? '1 pedido en camino' : `${abiertos.length} pedidos en camino`}: no vuelven a salir en «Qué pedir».</p>}
        </section>
      )}

      {ver === 'informes' && (
        <section className="bloque">
          <nav className="anios inv-anios" aria-label="Año">
            <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label="Año anterior">‹</Ir><strong>{anio}</strong>
            {anio < Number(h.slice(0, 4)) ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
          </nav>
          <h2 className="grupo-t">Más vendidos</h2>
          <ul className="grupo-lista">{top('ventas').map((p) => <li key={p.id}><Ir href={`/inventario/${p.id}`} className="fila"><span className="txt"><strong>{p.nombre}</strong><small>{eur(p.ingresos)} en ventas</small></span><span className="imp">{ud(p.ventas)} ud.</span></Ir></li>)}</ul>
          {!top('ventas').length && <Vacio compacto icono="beneficio" titulo={`Sin ventas de productos en ${anio}`} />}
          <h2 className="grupo-t">Margen por producto</h2>
          {!top('margen').length && <Vacio compacto icono="beneficio" titulo={`Sin ventas con coste en ${anio}`} />}
          <ul className="grupo-lista">{top('margen').map((p) => <li key={p.id}><Ir href={`/inventario/${p.id}`} className="fila"><span className="txt"><strong>{p.nombre}</strong><small>Ventas {eur(p.ingresos)} · coste {eur(p.costeVentas)}</small></span><span className="imp-col"><span className="imp">{eur(p.margen)}</span><small className="nota">{pctCorto(p.margenPct)}</small></span></Ir></li>)}</ul>
          {inv.productos.some((p) => p.consumo > 0) && <>
            <h2 className="grupo-t">Consumo en servicios</h2>
            <ul className="grupo-lista">{top('costeConsumo').map((p) => <li key={p.id}><Ir href={`/inventario/${p.id}`} className="fila"><span className="txt"><strong>{p.nombre}</strong><small>{ud(p.consumo)} ud. gastadas en servicios</small></span><span className="imp">{eur(p.costeConsumo)}</span></Ir></li>)}</ul>
          </>}
          <h2 className="grupo-t">Parados (sin ventas en 90 días)</h2>
          <ul className="grupo-lista">{inv.productos.filter((p) => p.parado).map((p) => <li key={p.id}><Ir href={`/inventario/${p.id}`} className="fila"><span className="txt"><strong>{p.nombre}</strong><small>{p.ultimaVenta ? `Última venta el ${fechaCorta(p.ultimaVenta)}` : 'Nunca vendido'}</small></span><span className="imp-col"><span className="imp">{ud(p.stock)} ud.</span><small className="nota">{eur(p.valor)} parados</small></span></Ir></li>)}</ul>
          {!inv.productos.some((p) => p.parado) && <Vacio compacto icono="datos" titulo="Nada parado: todo se mueve" />}
        </section>
      )}

      {puede(u, 'resumen') && <a className="boton sec cont-excel" href={`/api/inventario${anio < Number(h.slice(0, 4)) ? `?fecha=${anio}-12-31` : ''}`} download>Descargar en Excel</a>}
      </>}
      <details className="como-se-calcula"><summary>Cómo se calcula</summary><p className="grupo-pie arriba">A fin de año, el valor del almacén entra solo en la contabilidad (variación de existencias) y en los libros registro.</p></details>
    </main>
  );
}

export const metadata = { title: 'Inventario' };
