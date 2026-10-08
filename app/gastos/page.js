import { requerir } from '@/lib/auth';
import { leer } from '@/lib/redis';
import { importes, r2 } from '@/lib/calculos';
import { actividadesDe, fiscalDe, nombresActividad } from '@/lib/empresa';
import { DEDUCCIONES_GENERALES } from '@/lib/empresa';
import { DEDUCCIONES, cubierta } from '@/lib/deducciones';
import { eur, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import FormGasto from '@/components/FormGasto';
import Cuotas from '@/components/Cuotas';
import Dietas from '@/components/Dietas';
import Ir from '@/components/Ir';
import Buscar from '@/components/Buscar';
import Deslizable from '@/components/Deslizable';
import { puede } from '@/lib/permisos';
import Link from 'next/link';
import { proveedores } from '@/lib/proveedores';
import '@/app/proveedores.css';

export const dynamic = 'force-dynamic';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const diaMes = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export default async function Gastos({ searchParams }) {
  const u = await requerir('gastos');
  const gastos = await leer(u, 'gastos');
  if (!gastos) return <SinBD />;
  const { q, estado } = await searchParams;
  const buscado = String(q || '').trim().toLowerCase();
  const h = hoy();
  const todos = gastos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lista = todos
    .filter((g) => estado !== 'sinpagar' || g.pendiente)
    .filter((g) => !buscado || [g.concepto, g.proveedor, g.proveedorNif].some((t) => String(t || '').toLowerCase().includes(buscado)));
  const actividades = actividadesDe(u);
  const NOMBRES = nombresActividad(actividades);
  // Lista de deducciones: la de DJ para las cuentas de antes; la general para el resto (sin la cuota si es sociedad).
  const LISTA = !actividades.some((a) => a.id === 'dj') ? DEDUCCIONES_GENERALES.filter((d) => !d.soloAutonomo || fiscalDe(u).tipo === 'autonomo') : DEDUCCIONES;
  const delAnio = todos.filter((g) => g.fecha.startsWith(h.slice(0, 4)));
  const pendientes = LISTA.filter((d) => !cubierta(d, delAnio)).length;
  const provs = proveedores(todos);
  const debes = provs.reduce((s, p) => s + p.debe, 0);
  const sinPagar = todos.filter((g) => g.pendiente).length;
  const url = (cambios) => {
    const p = new URLSearchParams(Object.entries({ q, estado, ...cambios }).filter(([, v]) => v));
    return `/gastos${p.size ? `?${p}` : ''}`;
  };

  // Agrupados por mes, como las facturas.
  const grupos = [];
  for (const g of lista) {
    const m = g.fecha.slice(0, 7);
    if (grupos.at(-1)?.m !== m) grupos.push({ m, gastos: [] });
    grupos.at(-1).gastos.push(g);
  }

  return (
    <main className="pagina gastos">
      <header className="cabecera">
        <h1 className="titulo">Gastos</h1>
      </header>
      {(delAnio.length > 0 || provs.length > 0) && (
        <p className="resumen-linea">
          {delAnio.length > 0 && <>
          <span>Este año, sin IVA <strong>{eur(r2(delAnio.reduce((s, g) => s + g.base, 0)))}</strong></span>
          <span>IVA que recuperas <strong>{eur(r2(delAnio.reduce((s, g) => s + importes(g).iva, 0)))}</strong></span>
          </>}
          {provs.length > 0 && <Link href="/gastos/proveedores" className="prov-enlace">Proveedores{debes > 0 ? ` · debes ${eur(r2(debes))}` : ''} ›</Link>}
        </p>
      )}

      {/* Primero lo que más se hace: escanear el ticket. El formulario entero se abre al escanear o al pedirlo. */}
      {puede(u, 'gastar') && <FormGasto hoy={h} actividades={actividades} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} plegado={todos.length > 0} />}

      {todos.length > 5 && <Buscar action="/gastos" q={q} ocultos={{ estado }} placeholder="Buscar proveedor o concepto" />}
      {sinPagar > 0 && (
        <Deslizable className="chips">
          <Link href={url({ estado: null })} className={estado !== 'sinpagar' ? 'activo' : ''}>Todos</Link>
          <Link href={url({ estado: estado === 'sinpagar' ? null : 'sinpagar' })} className={estado === 'sinpagar' ? 'activo' : ''}>Sin pagar · {sinPagar}</Link>
        </Deslizable>
      )}

      {grupos.map((gr) => {
        const [y, m] = gr.m.split('-');
        return (
          <section key={gr.m} className="grupo-mes">
            <h2><span>{MESES[m - 1]} {y !== h.slice(0, 4) ? y : ''}</span><small>{eur(r2(gr.gastos.reduce((s, g) => s + g.base, 0)))} sin IVA</small></h2>
            <ul className="grupo-lista">
              {gr.gastos.map((g) => (
                <li key={g.id}>
                  <Ir href={`/gastos/${encodeURIComponent(g.id)}`} className="fila">
                    <span className="txt">
                      <strong>{g.concepto}</strong>
                      <small>{g.proveedor && g.proveedor !== g.concepto ? `${g.proveedor} · ` : ''}{diaMes(g.fecha)}{actividades.length > 1 ? ` · ${NOMBRES[g.actividad] || g.actividad}` : ''}{importes(g).iva ? ` · IVA ${eur(importes(g).iva)}` : ''}</small>
                    </span>
                    <span className="imp-col">
                      <span className="imp">{eur(g.base)}</span>
                      {g.pendiente && <span className="estado-txt e-pendiente">Sin pagar</span>}
                    </span>
                  </Ir>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!lista.length && (todos.length
        ? <div className="vacio"><p>{buscado ? `Nada con «${q}»` : 'Nada con este filtro'}</p><p>Prueba con otra palabra o quita el filtro.</p></div>
        : <div className="vacio"><p>Aún no hay gastos</p><p>Haz una foto al ticket o apúntalo arriba: el IVA se resta del 303 y el gasto baja tu IRPF.</p></div>)}

      <section className="gastos-mas">
        <h2 className="grupo-t">Más herramientas</h2>
        <details className="tarjeta bloque" open={pendientes > 0 && !todos.length}>
          <summary><strong>Deducciones que no deberías olvidar</strong> <span className="nota">· {pendientes ? `${pendientes} sin ningún gasto este año` : 'todas cubiertas'}</span></summary>
          <div style={{ marginTop: 12 }}>
            {LISTA.map((d) => {
              const ok = cubierta(d, delAnio);
              return (
                <div key={d.t} className="deduccion">
                  <span className={ok ? 'ok' : 'no'}>{ok ? '✓' : '○'}</span>
                  <div><strong>{d.t}</strong><p>{d.d}</p></div>
                </div>
              );
            })}
            <p className="nota">Solo cuenta lo que tenga factura a tu nombre y esté ligado a tu actividad. Ante la duda, confírmalo con tu gestor.</p>
          </div>
        </details>
        {puede(u, 'gastar') && <>
          {fiscalDe(u).tipo === 'autonomo' && <Cuotas desde={`${h.slice(0, 4)}-01`} />}
          <Dietas hoy={h} actividades={actividades} autonomo={fiscalDe(u).tipo === 'autonomo'} />
        </>}
      </section>
    </main>
  );
}
