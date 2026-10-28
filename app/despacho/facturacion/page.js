import { headers } from 'next/headers';
import { requerirDespacho } from '@/lib/despachoPagina';
import { clientesVisibles, usaEmpresaPropia } from '@/lib/despachos';
import { cuentaLicencias, tarifaDe, tipoLicencia } from '@/lib/licencias';
import { leerRango } from '@/lib/indices';
import { facturacionPorCliente } from '@/lib/facturacionDespacho';
import Ir from '@/components/Ir';
import Volver from '@/components/Volver';
import Vacio from '@/components/Vacio';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import { textos } from '@/lib/idiomaServidor';
import { esApp } from '@/lib/app';
import '@/app/mk.css';
import '@/app/despacho.css';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await textos())('Facturación · Mi despacho') }; }

const euros = (n) => eur(n);

// Lo que el despacho factura a cada cliente desde su propia empresa en Fisquo (lib/facturacionDespacho.js), lo pendiente y
// lo vencido, y lo que le cuesta Fisquo de los clientes a los que paga la licencia. Solo el titular.
export default async function Facturacion() {
  const tr = await textos();
  const { u, d } = await requerirDespacho({ titular: true });
  if (!usaEmpresaPropia(d)) return <main className="pagina mk-look despacho"><div className="volver-movil"><Volver href="/despacho/ajustes">Ajustes</Volver></div><h1 className="titulo">{tr('Facturación')}</h1><p className="desp-sub">{tr('Para ver aquí lo que facturas a cada cliente, lleva las cuentas de tu despacho en Fisquo: actívalo en Ajustes, en «Tu despacho».')}</p><Ir className="boton" href="/despacho/ajustes">{tr('Ir a Ajustes')}</Ir></main>;
  if (!d.empresa) return <main className="pagina mk-look despacho"><div className="volver-movil"><Volver href="/despacho/ajustes">Ajustes</Volver></div><h1 className="titulo">{tr('Facturación')}</h1><p className="desp-sub">{tr('Tu despacho aún no tiene su empresa en Fisquo: créala desde «Mi empresa» para facturar a tus clientes y verlo aquí.')}</p></main>;
  const dia = hoy();
  // Mismo día del año anterior; el 29 de febrero se limita al último día de febrero.
  const anio = Number(dia.slice(0, 4)) - 1, mes = Number(dia.slice(5, 7));
  const desde = `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(Number(dia.slice(8)), new Date(Date.UTC(anio, mes, 0)).getUTCDate())).padStart(2, '0')}`;
  const [visibles, facturas, tarifa] = await Promise.all([clientesVisibles(d, u.id), leerRango({ empresa: d.empresa }, 'facturas', desde, dia), tarifaDe(d, dia)]);
  const cuenta = cuentaLicencias(visibles.map(({ empresa }) => empresa), dia, tarifa);
  // En la app de iOS, sin lo que cuesta Fisquo (norma 3.1.1, lib/app.js).
  const app = esApp((await headers()).get('user-agent'));
  const clientes = visibles.map(({ id, empresa: e }) => {
    // El precio del tramo de todo el despacho; gratis mientras el cliente esté en sus días sin coste.
    const tipo = tipoLicencia(e);
    return { id, nombre: e.nombre || e.emisor?.nombre || tr('Cliente'), nif: e.emisor?.nif,
      licencia: !app && e.despachoCliente?.licencia ? { cent: cuentaLicencias([e], dia, tarifa)[tipo].facturables ? cuenta[tipo].precio : 0 } : null };
  });
  const { filas, totales, sinEmparejar } = facturacionPorCliente({ clientes, facturas, hoy: dia });
  return <main className="pagina mk-look despacho">
    <div className="volver-movil"><Volver href="/despacho/ajustes">Ajustes</Volver></div>
    <h1 className="titulo">{tr('Facturación')}</h1>
    <p className="desp-sub">{tr('Las facturas que tu despacho emite desde su propia empresa en Fisquo en los últimos 12 meses, emparejadas con cada cliente por su NIF. El coste de Fisquo es el de este mes por doce; el margen, las bases sin IVA menos ese coste.')}</p>
    <dl className="desp-cifras">{[
      ['Facturado en 12 meses', totales.facturado12m], ['Pendiente de cobro', totales.pendiente],
      ['Vencido', totales.vencido], !app && ['Te cuesta Fisquo al año', totales.costeFisquo12m],
    ].filter(Boolean).map(([nombre, importe]) => <div key={nombre}><dt>{tr(nombre)}</dt><dd className={nombre === 'Vencido' && importe > 0 ? 'rojo' : undefined}>{euros(importe)}</dd></div>)}</dl>
    <section className="grupo" aria-labelledby="fact-clientes">
      <h2 className="grupo-t" id="fact-clientes">{tr('Por cliente')}</h2>
      {filas.length ? <ul className="grupo-lista desp-facturacion">{filas.map((c) => <li key={c.id}><Ir prefetch={false} className="fila" href={`/despacho/${encodeURIComponent(c.id)}`}>
        <span className="txt">
          <strong>{c.nombre}</strong>
          <small>{[c.facturas ? [c.facturas === 1 ? tr('1 factura') : tr('{n} facturas', { n: c.facturas }), c.ultima && tr('última el {fecha}', { fecha: fechaCorta(c.ultima) })].filter(Boolean).join(' · ') : tr('Sin facturas en 12 meses'), c.licencia && tr('Fisquo {importe}/año', { importe: euros(c.costeFisquo12m) })].filter(Boolean).join(' · ')}</small>
          {c.sinFacturar3m && c.facturas > 0 && <small className="desp-aviso-mini">{tr('Sin facturar en 3 meses')}</small>}
        </span>
        <span className="v">
          <b>{euros(c.facturado12m)}</b>
          {c.pendiente > 0 && <small className={c.vencido > 0 ? 'rojo' : undefined}>{c.vencido > 0 ? tr('{importe} vencido', { importe: euros(c.vencido) }) : tr('{importe} pendiente', { importe: euros(c.pendiente) })}</small>}
          <small>{tr('Margen')} {euros(c.margen12m)}</small>
        </span>
      </Ir></li>)}</ul> : <Vacio icono="usuarios" titulo={tr('Aún no hay facturación que mostrar')} accion={{ href: '/despacho', texto: tr('Ver mis clientes') }}>{tr('Cuando tus clientes tengan facturas emitidas desde tu despacho, verás aquí cuánto has facturado, lo pendiente y el coste de Fisquo de cada uno.')}</Vacio>}
    </section>
    {sinEmparejar.numero > 0 && <p className="grupo-pie">{sinEmparejar.numero === 1 ? tr('1 factura ({importe}) de clientes que no están en Fisquo.', { importe: euros(sinEmparejar.total) }) : tr('{n} facturas ({importe}) de clientes que no están en Fisquo.', { n: sinEmparejar.numero, importe: euros(sinEmparejar.total) })}</p>}
  </main>;
}
