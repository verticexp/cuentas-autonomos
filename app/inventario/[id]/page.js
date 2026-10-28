import { fiscalDe, usaIgic } from '@/lib/empresa';
import { leerUno } from '@/lib/redis';
import Vacio from '@/components/Vacio';
import { sinFuncion } from '@/lib/planes';
import SinPlan from '@/components/SinPlan';
import Link from 'next/link';
import { textos } from '@/lib/idiomaServidor';
import { conHuecos } from '@/lib/huecos';
import { notFound } from 'next/navigation';
import { requerir } from '@/lib/auth';
import { puede } from '@/lib/permisos';
import { datosStock } from '@/lib/stockServidor';
import { MOTIVOS, inventario } from '@/lib/inventario';
import { numeroFactura } from '@/lib/calculos';
import { numeroDoc } from '@/lib/albaranes';
import { eur, fechaCorta, hoy, pctCorto } from '@/lib/formato';
import Volver from '@/components/Volver';
import { Ajuste } from '@/components/Inventario';
import { Borrar } from '@/components/Acciones';
import '@/app/contabilidad.css';
import '@/app/inventario.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const ud = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(n);
const TIPO = { venta: 'Venta', devolucion: 'Devolución', compra: 'Compra', ajuste: 'Ajuste' };

export default async function Producto({ params }) {
  const u = await requerir('facturas');
  const tr = await textos();
  if (u.plan?.version >= 2 && sinFuncion(u.plan, 'inventario')) return <SinPlan usuario={u} funcion="inventario" />;
  const id = (await params).id;
  const datos = await datosStock(u);
  const { facturas, gastos, albaranes } = datos;
  const h = hoy();
  const inv = inventario(datos, { hoy: h });
  const p = inv.productos.find((x) => x.id === id);
  if (!p) notFound();
  const fPorId = Object.fromEntries(facturas.map((f) => [f.id, f]));
  const gPorId = Object.fromEntries(gastos.map((g) => [g.id, g]));
  const aPorId = Object.fromEntries(albaranes.map((a) => [a.id, a]));
  const movs = inv.movimientos.filter((m) => m.producto === id).reverse().slice(0, 200);
  const detalle = (m) => {
    if (m.doc.tipo === 'factura') { const f = fPorId[m.doc.id]; return { texto: f ? (f.caja ? tr('Cierre de caja {numero}', { numero: numeroFactura(f) }) : tr('Factura {numero} · {cliente}', { numero: numeroFactura(f), cliente: f.cliente?.nombre || '' })) : tr('Factura'), url: `/facturas/${encodeURIComponent(m.doc.id)}` }; }
    if (m.doc.tipo === 'albaran') { const a = aPorId[m.doc.id]; return { texto: a ? tr('Albarán {numero} · {cliente}', { numero: numeroDoc(a), cliente: a.cliente?.nombre || '' }) : tr('Albarán'), url: `/albaranes/${encodeURIComponent(m.doc.id)}` }; }
    if (m.doc.tipo === 'gasto') { const g = gPorId[m.doc.id]; return { texto: g ? `${g.proveedor || g.concepto}` : tr('Compra'), url: `/gastos/${encodeURIComponent(m.doc.id)}` }; }
    return { texto: tr(MOTIVOS[m.motivo] || 'Ajuste') };
  };

  return (
    <main className="pagina mk-look contabilidad inventario">
      <Volver href="/inventario">Inventario</Volver>
      <h1 className="titulo">{p.nombre}</h1>
      <p className="grupo-pie arriba">{[p.sku, p.proveedor, p.codigo].filter(Boolean).join(' · ') || tr('Sin referencia')} · <Link href="/facturas/catalogo">{tr('Editar en el catálogo')}</Link></p>
      <div className="cont-resumen">
        <div><span>{tr('Stock')}</span><strong className={p.bajo ? 'inv-rojo' : ''}>{tr('{cantidad} ud.', { cantidad: ud(p.stock) })}</strong></div>
        <div><span>{tr('Coste medio')}</span><strong>{eur(p.costeMedio)}</strong></div>
        <div><span>{tr('Valor')}</span><strong>{eur(p.valor)}</strong></div>
      </div>
      {p.bajo && <p className="cont-alerta">{conHuecos(p.agotado ? tr('Agotado: está en {enlace}.') : tr('Bajo mínimo ({minimo}): está en {enlace}.', { minimo: ud(p.minimo) }), { enlace: <Link href="/inventario?ver=pedir">{tr('Qué pedir')}</Link> })}</p>}
      <p className="grupo-pie">{[
        p.ingresos ? tr('Este año: {vendidas} vendidas por {ingresos}, margen {margen} ({pct}).', { vendidas: ud(p.ventas), ingresos: eur(p.ingresos), margen: eur(p.margen), pct: pctCorto(p.margenPct) }) : tr('Este año: {vendidas} vendidas por {ingresos}, margen {margen}.', { vendidas: ud(p.ventas), ingresos: eur(p.ingresos), margen: eur(p.margen) }),
        p.consumo > 0 ? tr('Consumidas en servicios: {cantidad} ({coste} a coste).', { cantidad: ud(p.consumo), coste: eur(p.costeConsumo) }) : '',
        tr('Precio de venta {precio}.', { precio: eur(p.precio) }),
      ].filter(Boolean).join(' ')}</p>

      {puede(u, 'gastar') && <div id="ajustar-stock"><Ajuste igic={usaIgic(fiscalDe(u))} producto={p.id} hoy={h} coste={p.costeMedio} consumo={p.consumo > 0} /></div>}

      <section className="bloque">
        <h2 className="grupo-t">{tr('Movimientos')}</h2>
        <ul className="grupo-lista">
          {movs.map((m, i) => {
            const d = detalle(m);
            const fila = (
              <>
                <span className="txt"><strong>{tr(TIPO[m.tipo])}{m.tipo === 'ajuste' ? `: ${d.texto}` : ''}</strong><small>{m.tipo !== 'ajuste' ? tr('{fecha} · {detalle} · queda {stock}', { fecha: fechaCorta(m.fecha), detalle: d.texto, stock: ud(m.stock) }) : tr('{fecha} · queda {stock}', { fecha: fechaCorta(m.fecha), stock: ud(m.stock) })}</small></span>
                <span className="imp-col"><span className={`imp${m.cantidad < 0 ? ' inv-sale' : ''}`}>{m.cantidad > 0 ? '+' : '−'}{ud(Math.abs(m.cantidad))}</span><small className="nota">{tr('{importe}/ud.', { importe: eur(m.costeUnitario || 0) })}</small></span>
              </>
            );
            return (
              <li key={i}>
                {d.url ? <Link href={d.url} className="fila">{fila}</Link> : <div className="fila">{fila}</div>}
                {m.tipo === 'ajuste' && puede(u, 'gastar') && <div className="inv-borrar"><Borrar url={`/api/inventario?id=${encodeURIComponent(m.doc.id)}`} pregunta={tr('¿Borrar este ajuste?')} /></div>}
              </li>
            );
          })}
        </ul>
        {!movs.length && <Vacio compacto icono="datos" titulo={tr('Apunta el stock inicial')} accion={puede(u, 'gastar') && { href: '#ajustar-stock', texto: tr('Apuntar stock') }}>{tr('Indica cuántas unidades tienes para empezar a seguirlas.')}</Vacio>}
      </section>
    </main>
  );
}

export async function generateMetadata({ params }) {
  const u = await requerir('facturas');
  const tr = await textos();
  if (u.plan?.version >= 2 && sinFuncion(u.plan, 'inventario')) return { title: tr('Inventario') };
  const d = await leerUno(u, 'productos', (await params).id);
  return { title: d?.nombre || tr('Producto') };
}
