import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { leer } from '@/lib/redis';
import { fiscalDe } from '@/lib/empresa';
import { inventario, quePedir } from '@/lib/inventario';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import { CopiarPedido } from '@/components/Inventario';
import '@/app/modelos.css';
import '@/app/contabilidad.css';
import '@/app/inventario.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const VISTAS = [['stock', 'Stock'], ['pedir', 'Qué pedir'], ['informes', 'Informes']];
const ud = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n);

export default async function Inventario({ searchParams }) {
  const u = await requerir('facturas');
  const [productos, facturas, gastos, ajustes] = await Promise.all([leer(u, 'productos'), leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'stock')]);
  if (!facturas) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const ver = VISTAS.some(([v]) => v === sp.ver) ? sp.ver : 'stock';
  const anio = Number(sp.anio) || Number(h.slice(0, 4));
  const q = String(sp.q || '').trim().toLowerCase();
  const activo = Boolean(fiscalDe(u).inventario);
  const inv = inventario({ productos: productos || [], facturas, gastos: gastos || [], ajustes: ajustes || [] }, { hoy: anio < Number(h.slice(0, 4)) ? `${anio}-12-31` : h, desde: `${anio}-01-01` });
  const lista = inv.productos.filter((p) => !q || [p.nombre, p.sku, p.codigo, p.proveedor].some((t) => String(t || '').toLowerCase().includes(q)))
    .sort((a, b) => Number(b.bajo) - Number(a.bajo) || a.nombre.localeCompare(b.nombre));
  const pedidos = quePedir(inv.productos);
  const url = (c) => { const p = new URLSearchParams(Object.entries({ ver, ...c }).filter(([, v]) => v)); return `/inventario?${p}`; };
  const top = (k, n = 10) => [...inv.productos].filter((p) => p[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n);

  return (
    <main className="pagina mk-look modelos contabilidad inventario">
      <Volver href="/facturas">Facturas</Volver>
      <h1 className="titulo">Inventario</h1>
      {!activo && <p className="cont-alerta">El inventario está apagado. Actívalo en Ajustes › Actividades y modelos («Vendo productos y quiero controlar el stock»).</p>}

      <div className="cont-resumen">
        <div><span>Valor del almacén</span><strong>{eur(inv.valor)}</strong></div>
        <div><span>Productos</span><strong>{inv.productos.length}</strong></div>
        <div><span>Bajo mínimo</span><strong className={inv.bajos.length ? 'inv-rojo' : ''}>{inv.bajos.length}</strong></div>
      </div>
      <nav className="segmentado">{VISTAS.map(([v, n]) => <Ir key={v} href={url({ ver: v })} tipo="fundido" className={v === ver ? 'activo' : ''}>{n}</Ir>)}</nav>

      {ver === 'stock' && (
        <section className="bloque">
          <form action="/inventario" className="cont-buscar"><input className="campo" name="q" defaultValue={q} placeholder="Buscar por nombre, referencia o proveedor" /></form>
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
          ) : <div className="vacio"><p>Aún no hay productos con stock</p><p>Añádelos en <Link href="/facturas/catalogo">Facturas › Catálogo</Link> con su coste y su stock mínimo. Después, cada factura los resta y cada compra los suma.</p></div>}
          <p className="grupo-pie">Las facturas restan del stock y las rectificativas lo devuelven; las compras (gastos con productos) lo suman; los recuentos y roturas se apuntan en cada producto. Valorado a coste medio ponderado.</p>
        </section>
      )}

      {ver === 'pedir' && (
        <section className="bloque">
          {pedidos.length ? pedidos.map((g) => (
            <div key={g.proveedor} className="tarjeta inv-pedido">
              <div className="inv-pedido-cab"><strong>{g.proveedor}</strong><span>{eur(g.total)}</span></div>
              <ul>{g.items.map((x) => <li key={x.id}><span>{x.nombre}{x.sku ? ` (${x.sku})` : ''}<small>quedan {ud(x.stock)} · mínimo {ud(x.minimo)}</small></span><b>{ud(x.cantidad)} ud.</b></li>)}</ul>
              <CopiarPedido texto={`Hola, os quería pedir:\n${g.items.map((x) => `- ${ud(x.cantidad)} × ${x.nombre}${x.sku ? ` (${x.sku})` : ''}`).join('\n')}\nGracias.`} />
            </div>
          )) : <div className="vacio"><p>No hace falta pedir nada</p><p>Aquí salen los productos que llegan a su stock mínimo, agrupados por proveedor.</p></div>}
          <p className="grupo-pie">Se propone pedir hasta el «pedir hasta» de cada producto (o el doble del mínimo), al coste medio actual.</p>
        </section>
      )}

      {ver === 'informes' && (
        <section className="bloque">
          <nav className="anios inv-anios">
            <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label="Año anterior">‹</Ir><strong>{anio}</strong>
            {anio < Number(h.slice(0, 4)) ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
          </nav>
          <h2 className="grupo-t">Más vendidos</h2>
          <ul className="grupo-lista">{top('ventas').map((p) => <li key={p.id}><Ir href={`/inventario/${p.id}`} className="fila"><span className="txt"><strong>{p.nombre}</strong><small>{eur(p.ingresos)} en ventas</small></span><span className="imp">{ud(p.ventas)} ud.</span></Ir></li>)}</ul>
          {!top('ventas').length && <p className="nota">Sin ventas de productos en {anio}.</p>}
          <h2 className="grupo-t">Margen por producto</h2>
          <ul className="grupo-lista">{top('margen').map((p) => <li key={p.id}><Ir href={`/inventario/${p.id}`} className="fila"><span className="txt"><strong>{p.nombre}</strong><small>Ventas {eur(p.ingresos)} · coste {eur(p.costeVentas)}</small></span><span className="imp-col"><span className="imp">{eur(p.margen)}</span><small className="nota">{p.margenPct.toLocaleString('es-ES')} %</small></span></Ir></li>)}</ul>
          <h2 className="grupo-t">Parados (sin ventas en 90 días)</h2>
          <ul className="grupo-lista">{inv.productos.filter((p) => p.parado).map((p) => <li key={p.id}><Ir href={`/inventario/${p.id}`} className="fila"><span className="txt"><strong>{p.nombre}</strong><small>{p.ultimaVenta ? `Última venta el ${fechaCorta(p.ultimaVenta)}` : 'Nunca vendido'}</small></span><span className="imp-col"><span className="imp">{ud(p.stock)} ud.</span><small className="nota">{eur(p.valor)} parados</small></span></Ir></li>)}</ul>
          {!inv.productos.some((p) => p.parado) && <p className="nota">Nada parado: todo se mueve.</p>}
        </section>
      )}

      {puede(u, 'resumen') && <a className="boton sec cont-excel" href={`/api/inventario${anio < Number(h.slice(0, 4)) ? `?fecha=${anio}-12-31` : ''}`} download>Descargar en Excel</a>}
      <p className="grupo-pie arriba">A fin de año, el valor del almacén entra solo en la contabilidad (variación de existencias) y en los libros registro.</p>
    </main>
  );
}
