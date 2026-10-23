import Vacio from '@/components/Vacio';
import { usarFuncion } from '@/lib/usoPlan';
import SinPlan from '@/components/SinPlan';
import Link from 'next/link';
import { requerir } from '@/lib/auth';
import { leer, redis } from '@/lib/redis';
import { costeGasto, importes, numeroFactura, r2 } from '@/lib/calculos';
import { amortizacionesAnio } from '@/lib/amortizaciones';
import { fiscalDe, usa303 } from '@/lib/empresa';
import { limpiarProyecto, rentabilidad } from '@/lib/proyectos';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import '@/app/modelos.css';
import '@/app/contabilidad.css';
import '@/app/mk.css';
import { delosAnios } from '@/lib/indices';

export const dynamic = 'force-dynamic';
const igual = (a, b) => limpiarProyecto(a).toLowerCase() === limpiarProyecto(b).toLowerCase();

// Rentabilidad por proyecto, obra o centro de coste (un local, un cliente grande…): lo facturado menos lo gastado en cada uno.
export default async function Proyectos({ searchParams }) {
  const u = await requerir('resumen');
  if (await usarFuncion(u, 'proyectos')) return <SinPlan usuario={u} funcion="proyectos" />;
  if (!redis) return <SinBD />;
  const sp = await searchParams;
  const h = hoy();
  const todo = sp.anio === 'todo';
  const anio = todo ? null : Number(sp.anio) || Number(h.slice(0, 4));
  // Informe de capacidad E01: un año (y los bienes de inversión) salvo que se pida «desde el principio».
  const { facturas, gastos } = todo ? { facturas: await leer(u, 'facturas'), gastos: await leer(u, 'gastos') } : await delosAnios(u, [anio]);
  const ivaCoste = !usa303(fiscalDe(u));
  const r = rentabilidad({ facturas, gastos: (gastos || []).filter((g) => !g.nomina) }, anio, { ivaCoste });
  // Lo que no se reparte por proyecto (auditoría D4-41): las nóminas y la amortización de los bienes de inversión. Con ellas,
  // el resultado de la empresa cuadra con Contabilidad (hasta hoy en el año en curso).
  const anios = todo ? [...new Set([...(facturas || []), ...(gastos || [])].map((x) => Number(x.fecha.slice(0, 4))))].filter((y) => y <= Number(h.slice(0, 4))) : [anio];
  const nominasCoste = r2((gastos || []).filter((g) => g.nomina && (todo || g.fecha.startsWith(`${anio}-`))).reduce((s, g) => s + costeGasto(g, { ivaCoste }), 0));
  const amortizacion = r2(anios.reduce((s, y) => s + amortizacionesAnio(gastos || [], y, { regimen: fiscalDe(u).tipo, ivaCoste, hasta: h }).reduce((t, x) => t + x.cuota, 0), 0));
  const resultado = r2(r.proyectos.reduce((s, p) => s + p.margen, 0) + r.general.margen - nominasCoste - amortizacion);
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
        <Link href={url({ anio: todo ? h.slice(0, 4) : 'todo' })} className="nota">{todo ? 'Por años' : 'Todos los años'}</Link>
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
                  <span className="imp-col"><span className={`imp${p.margen < 0 ? ' inv-rojo' : ''}`}>{eur(p.margen)}</span><small className="nota">{p.gastos ? (p.ingresos > 0 ? `margen ${p.margenPct.toLocaleString('es-ES')} %` : 'margen') : 'sin gastos asignados'}</small></span>
                </Link></li>
              ))}
              <li><div className="fila"><span className="txt"><strong>Sin proyecto (generales)</strong><small>Ingresos {eur(r.general.ingresos)} · gastos {eur(r.general.gastos)}</small></span><span className={`imp${r.general.margen < 0 ? ' inv-rojo' : ''}`}>{eur(r.general.margen)}</span></div></li>
              {(nominasCoste > 0 || amortizacion > 0) && <li><div className="fila"><span className="txt"><strong>Sin repartir por proyecto</strong><small>{[nominasCoste > 0 && `Nóminas ${eur(nominasCoste)}`, amortizacion > 0 && `amortización ${eur(amortizacion)}`].filter(Boolean).join(' · ')}</small></span><span className="imp inv-rojo">{eur(-r2(nominasCoste + amortizacion))}</span></div></li>}
              <li><div className="fila"><span className="txt"><strong>Resultado de la empresa</strong><small>{todo ? 'Todos los años' : Number(h.slice(0, 4)) === anio ? `De enero a hoy, como en Contabilidad` : `Año ${anio}, como en Contabilidad`}</small></span><strong className={`imp${resultado < 0 ? ' inv-rojo' : ''}`}>{eur(resultado)}</strong></div></li>
            </ul>
          ) : <Vacio icono="cliente" tipo={todo ? 'vacio' : 'resultados'} titulo="Mira lo que gana cada proyecto" accion={{ href: '/facturas/nueva', texto: 'Nueva factura' }} secundaria={!todo && { href: '/proyectos?anio=todo', texto: 'Ver todos los años' }}>Al hacer una factura, un cierre de caja o apuntar un gasto, escribe su proyecto, obra o local («Obra Calle Mayor», «Tienda Centro»…). Aquí verás lo que gana cada uno.</Vacio>}
          <p className="grupo-pie">Ingresos y gastos sin IVA{ivaCoste ? ' (los gastos, con el IVA, porque no lo recuperas)' : ''}. Las nóminas y la amortización de los bienes de inversión no se reparten por proyecto: van aparte, antes del resultado de la empresa.</p>
        </section>
      )}
    </main>
  );
}

export const metadata = { title: 'Proyectos' };
