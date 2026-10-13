import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes, numeroFactura } from '@/lib/calculos';
import { fiscalDe, usa303 } from '@/lib/empresa';
import { limpiarProyecto, rentabilidad } from '@/lib/proyectos';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import '@/app/modelos.css';
import '@/app/contabilidad.css';
import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const igual = (a, b) => limpiarProyecto(a).toLowerCase() === limpiarProyecto(b).toLowerCase();

// Rentabilidad por proyecto, obra o centro de coste (un local, un cliente grande…): lo facturado menos lo gastado en cada uno.
export default async function Proyectos({ searchParams }) {
  const u = await requerir('resumen');
  const [facturas, gastos] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos')]);
  if (!facturas) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const todo = sp.anio === 'todo';
  const anio = todo ? null : Number(sp.anio) || Number(h.slice(0, 4));
  const ivaCoste = !usa303(fiscalDe(u));
  const r = rentabilidad({ facturas, gastos: (gastos || []).filter((g) => !g.nomina) }, anio, { ivaCoste });
  const elegido = sp.p ? r.proyectos.find((p) => igual(p.proyecto, sp.p)) : null;
  const url = (c) => { const q = new URLSearchParams(Object.entries({ anio: todo ? 'todo' : anio, p: sp.p, ...c }).filter(([, v]) => v)); return `/proyectos?${q}`; };
  const delAnio = (x) => todo || x.fecha.startsWith(`${anio}-`);

  return (
    <main className="pagina mk-look modelos contabilidad">
      <Volver href={elegido ? url({ p: null }) : '/'}>{elegido ? 'Proyectos' : 'Resumen'}</Volver>
      <h1 className="titulo">{elegido ? elegido.proyecto : 'Proyectos y centros de coste'}</h1>
      <nav className="anios inv-anios">
        {!todo && <Ir href={url({ anio: anio - 1 })} tipo="cifras" aria-label="Año anterior">‹</Ir>}
        <strong>{todo ? 'Desde el principio' : anio}</strong>
        {!todo && (anio < Number(h.slice(0, 4)) ? <Ir href={url({ anio: anio + 1 })} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>)}
        <Link href={url({ anio: todo ? h.slice(0, 4) : 'todo' })} className="nota">{todo ? 'Por años' : 'Todo'}</Link>
      </nav>

      {elegido ? (
        <>
          <div className="cont-resumen">
            <div><span>Ingresos</span><strong>{eur(elegido.ingresos)}</strong></div>
            <div><span>Gastos</span><strong>{eur(elegido.gastos)}</strong></div>
            <div><span>Margen</span><strong className={elegido.margen < 0 ? 'inv-rojo' : ''}>{eur(elegido.margen)}{elegido.ingresos ? ` · ${elegido.margenPct.toLocaleString('es-ES')} %` : ''}</strong></div>
          </div>
          <section className="bloque">
            <h2 className="grupo-t">Facturas y cierres</h2>
            <ul className="grupo-lista">{facturas.filter((f) => delAnio(f) && igual(f.proyecto, elegido.proyecto)).sort((a, b) => b.fecha.localeCompare(a.fecha)).map((f) => <li key={f.id}><Link href={`/facturas/${f.id}`} className="fila"><span className="txt"><strong>{f.caja ? 'Cierre de caja' : f.cliente?.nombre}</strong><small>{numeroFactura(f)} · {fechaCorta(f.fecha)}</small></span><span className="imp">{eur(f.base)}</span></Link></li>)}</ul>
            <h2 className="grupo-t">Gastos</h2>
            <ul className="grupo-lista">{(gastos || []).filter((g) => delAnio(g) && !g.inversion && igual(g.proyecto, elegido.proyecto)).sort((a, b) => b.fecha.localeCompare(a.fecha)).map((g) => { const i = importes(g); return <li key={g.id}><Link href={`/gastos/${g.id}`} className="fila"><span className="txt"><strong>{g.concepto}</strong><small>{g.proveedor ? `${g.proveedor} · ` : ''}{fechaCorta(g.fecha)}</small></span><span className="imp">{eur(ivaCoste ? i.base + i.iva : i.base)}</span></Link></li>; })}</ul>
          </section>
        </>
      ) : (
        <section className="bloque">
          {r.proyectos.length ? (
            <ul className="grupo-lista">
              {r.proyectos.map((p) => (
                <li key={p.proyecto}><Link href={url({ p: p.proyecto })} className="fila">
                  <span className="txt"><strong>{p.proyecto}</strong><small>Ingresos {eur(p.ingresos)} · gastos {eur(p.gastos)} · {p.facturas} {p.facturas === 1 ? 'factura' : 'facturas'}, {p.apuntes} {p.apuntes === 1 ? 'gasto' : 'gastos'}</small></span>
                  <span className="imp-col"><span className={`imp${p.margen < 0 ? ' inv-rojo' : ''}`}>{eur(p.margen)}</span>{p.ingresos > 0 && <small className="nota">{p.margenPct.toLocaleString('es-ES')} %</small>}</span>
                </Link></li>
              ))}
              <li><div className="fila"><span className="txt"><strong>Sin proyecto (generales)</strong><small>Ingresos {eur(r.general.ingresos)} · gastos {eur(r.general.gastos)}</small></span><span className="imp">{eur(r.general.margen)}</span></div></li>
            </ul>
          ) : <div className="vacio"><p>Aún no hay proyectos</p><p>Al hacer una factura, un cierre de caja o apuntar un gasto, escribe su proyecto, obra o local («Obra Calle Mayor», «Tienda Centro»…). Aquí verás lo que gana cada uno.</p></div>}
          <p className="grupo-pie">Ingresos y gastos sin IVA{ivaCoste ? ' (los gastos, con el IVA, porque no lo recuperas)' : ''}. No incluye nóminas ni bienes de inversión: quedan como gastos generales.</p>
        </section>
      )}
    </main>
  );
}
