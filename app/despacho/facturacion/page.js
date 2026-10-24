import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles } from '@/lib/despachos';
import { cuentaLicencias, tarifaDe, tipoLicencia } from '@/lib/licencias';
import { leerRango } from '@/lib/indices';
import { facturacionPorCliente } from '@/lib/facturacionDespacho';
import Ir from '@/components/Ir';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Facturación · Mi despacho' };

const euros = (n) => eur(n);

// Lo que el despacho factura a cada cliente desde su propia empresa en Fisquo (lib/facturacionDespacho.js), lo pendiente y
// lo vencido, y lo que le cuesta Fisquo de los clientes a los que paga la licencia. Solo el titular.
export default async function Facturacion() {
  const { u, d } = await requerirDespacho({ titular: true });
  if (!d.empresa) return <main className="pagina mk-look despacho"><h1 className="titulo">Facturación</h1><p className="desp-sub">Tu despacho aún no tiene su empresa en Fisquo: créala desde «Mi empresa» para facturar a tus clientes y verlo aquí.</p></main>;
  const dia = hoy();
  // Mismo día del año anterior; el 29 de febrero se limita al último día de febrero.
  const anio = Number(dia.slice(0, 4)) - 1, mes = Number(dia.slice(5, 7));
  const desde = `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(Number(dia.slice(8)), new Date(Date.UTC(anio, mes, 0)).getUTCDate())).padStart(2, '0')}`;
  const [visibles, facturas, tarifa] = await Promise.all([clientesVisibles(d, u.id), leerRango({ empresa: d.empresa }, 'facturas', desde, dia), tarifaDe(d, dia)]);
  const cuenta = cuentaLicencias(visibles.map(({ empresa }) => empresa), dia, tarifa);
  const clientes = visibles.map(({ id, empresa: e }) => {
    // El precio del tramo de todo el despacho; gratis mientras el cliente esté en sus días sin coste.
    const tipo = tipoLicencia(e);
    return { id, nombre: e.nombre || e.emisor?.nombre || 'Cliente', nif: e.emisor?.nif,
      licencia: e.despachoCliente?.licencia ? { cent: cuentaLicencias([e], dia, tarifa)[tipo].facturables ? cuenta[tipo].precio : 0 } : null };
  });
  const { filas, totales, sinEmparejar } = facturacionPorCliente({ clientes, facturas, hoy: dia });
  return <main className="pagina mk-look despacho">
    <h1 className="titulo">Facturación</h1>
    <p className="desp-sub">Las facturas que tu despacho emite desde su propia empresa en Fisquo en los últimos 12 meses, emparejadas con cada cliente por su NIF. El coste de Fisquo es el de este mes por doce; el margen, las bases sin IVA menos ese coste.</p>
    <dl className="desp-cifras">{[
      ['Facturado en 12 meses', totales.facturado12m], ['Pendiente de cobro', totales.pendiente],
      ['Vencido', totales.vencido], ['Te cuesta Fisquo al año', totales.costeFisquo12m],
    ].map(([nombre, importe]) => <div key={nombre}><dt>{nombre}</dt><dd className={nombre === 'Vencido' && importe > 0 ? 'rojo' : undefined}>{euros(importe)}</dd></div>)}</dl>
    <section className="grupo" aria-labelledby="fact-clientes">
      <h2 className="grupo-t" id="fact-clientes">Por cliente</h2>
      {filas.length ? <ul className="grupo-lista desp-facturacion">{filas.map((c) => <li key={c.id}><Ir prefetch={false} className="fila" href={`/despacho/${encodeURIComponent(c.id)}`}>
        <span className="txt">
          <strong>{c.nombre}</strong>
          <small>{c.facturas ? `${c.facturas === 1 ? '1 factura' : `${c.facturas} facturas`}${c.ultima ? ` · última el ${fechaCorta(c.ultima)}` : ''}` : 'Sin facturas en 12 meses'}{c.licencia ? ` · Fisquo ${euros(c.costeFisquo12m)}/año` : ''}</small>
          {c.sinFacturar3m && c.facturas > 0 && <small className="desp-aviso-mini">Sin facturar en 3 meses</small>}
        </span>
        <span className="v">
          <b>{euros(c.facturado12m)}</b>
          {c.pendiente > 0 && <small className={c.vencido > 0 ? 'rojo' : undefined}>{c.vencido > 0 ? `${euros(c.vencido)} vencido` : `${euros(c.pendiente)} pendiente`}</small>}
          <small>Margen {euros(c.margen12m)}</small>
        </span>
      </Ir></li>)}</ul> : <p className="nota">Cuando tengas clientes, aquí verás su facturación.</p>}
    </section>
    {sinEmparejar.numero > 0 && <p className="grupo-pie">{sinEmparejar.numero === 1 ? '1 factura' : `${sinEmparejar.numero} facturas`} ({euros(sinEmparejar.total)}) de clientes que no están en Fisquo.</p>}
  </main>;
}
