import Vacio from '@/components/Vacio';
import { cupoEscaneos } from '@/lib/cuotasIA';
import { sinFuncion } from '@/lib/planes';
import { requerir } from '@/lib/auth';
import { nombresProyectos } from '@/lib/proyectos';
import { leer, redis } from '@/lib/redis';
import { contar, contarMarcados, documentos, fechaCursor, fichasRango, leerRango, pagina, totales } from '@/lib/indices';
import { agruparGastosNomina, veSueldos } from '@/lib/nominas';
import { candidatosConciliacion } from '@/lib/bancoServidor';
import { importes, origenGasto, r2 } from '@/lib/calculos';
import { partirIva } from '@/lib/ivaDeducible';
import { actividadesDe, fiscalDe, nombresActividad } from '@/lib/empresa';
import { DEDUCCIONES_GENERALES } from '@/lib/empresa';
import { DEDUCCIONES, cubierta } from '@/lib/deducciones';
import { eur, fechaCorta, hoy } from '@/lib/formato';
import SinBD from '@/components/SinBD';
import FormGasto from '@/components/FormGasto';
import Cuotas from '@/components/Cuotas';
import Dietas from '@/components/Dietas';
import Ir from '@/components/Ir';
import Buscar from '@/components/Buscar';
import Deslizable from '@/components/Deslizable';
import Deslizar from '@/components/Deslizar';
import { DETALLE, puede } from '@/lib/permisos';
import Link from 'next/link';
import { revisionGastos } from '@/lib/revisionGastos';
import RevisionGastos from '@/components/RevisionGastos';
import '@/app/proveedores.css';

import '@/app/mk.css';

export const dynamic = 'force-dynamic';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const diaMes = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

export default async function Gastos({ searchParams }) {
  const u = await requerir('gastos');
  // Informe de capacidad E01: la lista va por páginas sobre el índice; el año, lo pendiente y los bienes de inversión se
  // leen aparte (lib/indices.js), y la conciliación solo con lo que puede casar (candidatosConciliacion).
  if (!redis) return <SinBD />;
  const { q, estado, banco, desde, escanear } = await searchParams;
  const h = hoy();
  const anio = h.slice(0, 4);
  // E06: lo que se debe y lo que queda sin pagar salen de los totales precalculados.
  const [movs, productos, total, delAnioTodos, agr, nBienes, cupoIA] = await Promise.all([leer(u, 'banco'), leer(u, 'productos'), contar(u, 'gastos'), leerRango(u, 'gastos', `${anio}-01-01`, `${anio}-12-31`), totales(u, 'gastos', ['dc', 'sn']), contarMarcados(u, 'gastos', 'i'), puede(u, 'gastar') ? cupoEscaneos(u).catch(() => null) : null]);
  // Con inventario: los productos que llevan stock, para apuntar lo que entra con cada compra.
  const stockProductos = fiscalDe(u).inventario ? (productos || []).filter((p) => !p.servicio).sort((a, b) => a.nombre.localeCompare(b.nombre)) : [];
  // En revisión (lib/revisionGastos.js): cargos del banco sin gasto que parecen un gasto (no impuestos, nóminas, préstamos…).
  const sinPareja = (movs || []).filter((m) => (m.estado === 'pendiente' || !m.estado) && m.importe < 0);
  const cand = await candidatosConciliacion(u, movs || []);
  // Todos los que siguen pendientes, también los de sugerencia segura (si no, no se ven en ningún sitio hasta conciliarlos).
  const revision = revisionGastos(movs || [], cand.gastos, { autonomo: fiscalDe(u).tipo === 'autonomo' });
  const movimiento = !sinFuncion(u.plan, 'revision') && banco && sinPareja.find((m) => m.id === banco);
  const buscado = String(q || '').trim().toLowerCase();
  // Los bienes traídos de otro programa no son gastos de aquí: se ven en Contabilidad › Amortizaciones.
  // La búsqueda va por el índice de texto (revisión S06); el resto, por la ficha.
  // Sin el permiso «Nóminas», la de cada persona no sale (Codex H2): en su lugar, una fila por mes con las de todo el equipo.
  const privado = !veSueldos(u);
  const filtro = (f, id) => !f.mi && !(privado && String(id).startsWith('nomina-'));
  const pag = await pagina(u, 'gastos', { cursor: desde, marca: estado === 'sinpagar' ? 'p' : undefined, filtro, buscar: buscado });
  const lista = await documentos(u, 'gastos', pag.ids);
  if (privado && !buscado && estado !== 'sinpagar') {
    // Las de las fechas de esta página: hasta la del cursor (incluida) y, si hay más páginas, desde la última (sin incluir).
    const techo = (desde && fechaCursor(desde)) || '9999-12-31';
    const suelo = pag.siguiente && lista.length ? lista.at(-1).fecha : '';
    const nominas = (await leerRango(u, 'gastos', suelo || '2000-01-01', techo)).filter((g) => g.nomina && g.fecha > suelo && g.fecha <= techo);
    lista.push(...agruparGastosNomina(nominas));
    lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }
  const hay = total > 0 && (lista.length > 0 || Boolean(desde) || Boolean(buscado) || estado === 'sinpagar' || (await pagina(u, 'gastos', { limite: 1, filtro })).ids.length > 0);
  const actividades = actividadesDe(u);
  const NOMBRES = nombresActividad(actividades);
  // Lista de deducciones: la de DJ para las cuentas de antes; la general para el resto (sin la cuota si es sociedad).
  const LISTA = !actividades.some((a) => a.id === 'dj') ? DEDUCCIONES_GENERALES.filter((d) => !d.soloAutonomo || fiscalDe(u).tipo === 'autonomo') : DEDUCCIONES;
  const delAnio = delAnioTodos.filter((g) => !g.migrado);
  const pendientes = LISTA.filter((d) => !cubierta(d, delAnio)).length;
  // Lo que debes a proveedores: los gastos sin pagar (con proveedor), sean del año que sean.
  const debes = agr.dc;
  const hayProveedores = debes > 0 || delAnio.some((g) => g.proveedor) || lista.some((g) => g.proveedor);
  const sinPagar = Math.round(agr.sn * 100); // sn cuenta gastos: totales() lo da entre 100, como los céntimos
  const proyectos = nombresProyectos([...delAnio, ...lista]);
  const url = (cambios) => {
    const p = new URLSearchParams(Object.entries({ q, estado, ...cambios }).filter(([, v]) => v));
    return `/gastos${p.size ? `?${p}` : ''}`;
  };

  // Agrupados por mes, como las facturas (el total, del mes entero con el mismo filtro).
  const grupos = [];
  for (const g of lista) {
    const m = g.fecha.slice(0, 7);
    if (grupos.at(-1)?.m !== m) grupos.push({ m, gastos: [] });
    grupos.at(-1).gastos.push(g);
  }
  // E06: sin búsqueda, el total del mes es un total precalculado (todos o sin pagar).
  const campoMes = (m) => `${estado === 'sinpagar' ? 'mp' : 'm'}:${m}`;
  const delMes = !buscado ? await totales(u, 'gastos', grupos.map((g) => campoMes(g.m))) : {};
  const totalMes = !buscado ? Object.fromEntries(grupos.map((g) => [g.m, delMes[campoMes(g.m)]])) : Object.fromEntries(await Promise.all(grupos.map(async (g) => {
    const fichas = await fichasRango(u, 'gastos', `${g.m}-01`, `${g.m}-31`, { textos: Boolean(buscado) });
    return [g.m, fichas.filter((f) => filtro(f) && (!buscado || f.x.includes(buscado)) && (estado !== 'sinpagar' || f.pe)).reduce((s, f) => s + f.b, 0)];
  })));

  return (
    <main className="pagina mk-look gastos gastos-formulario">
      <header className="cabecera">
        <h1 className="titulo">Gastos</h1>
      </header>
      {/* Primero lo que más se hace: escanear el ticket. El formulario entero se abre al escanear o al pedirlo. */}
      {puede(u, 'gastar') && !movimiento && <FormGasto cupoInicial={cupoIA} hoy={h} actividades={actividades} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} regimen={fiscalDe(u).tipo} productos={stockProductos} plegado={hay} destacar={Boolean(escanear)} proyectos={proyectos} />}

      {(delAnio.length > 0 || hayProveedores) && (
        <p className="resumen-linea">
          {delAnio.length > 0 && <>
          <span>Este año, sin IVA <strong>{eur(r2(delAnio.reduce((s, g) => s + g.base, 0)))}</strong></span>
          <span>IVA que recuperas <strong>{eur(r2(delAnio.reduce((s, g) => s + importes(g).iva - (origenGasto(g) ? 0 : partirIva(g, importes(g).iva).noDeducible), 0)))}</strong></span>
          </>}
          {puede(u, DETALLE) && nBienes > 0 && <Link href="/contabilidad?ver=bienes" className="prov-enlace">Bienes de inversión ›</Link>}
          {hayProveedores && <Link href="/gastos/proveedores" className="prov-enlace">Proveedores{debes > 0 ? ` · debes ${eur(r2(debes))}` : ''} ›</Link>}
        </p>
      )}

      {puede(u, 'gastar') && movimiento && <FormGasto cupoInicial={cupoIA} key={movimiento.id} hoy={h} actividades={actividades} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} regimen={fiscalDe(u).tipo} productos={stockProductos} movimiento={movimiento} proyectos={proyectos} />}

      {!sinFuncion(u.plan, 'revision') && puede(u, 'gastar') && !movimiento && revision.total > 0 && <RevisionGastos items={revision.items} total={revision.total} />}

      {total > 5 && <Buscar action="/gastos" q={q} ocultos={{ estado }} placeholder="Buscar gastos" etiqueta="Buscar por proveedor o concepto" />}
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
            <h2><span>{MESES[m - 1]} {y !== h.slice(0, 4) ? y : ''}</span><small>{eur(r2(totalMes[gr.m] || 0))} sin IVA</small></h2>
            <ul className="grupo-lista">
              {gr.gastos.map((g) => (
                <li key={g.id}>
                  {(() => {
                    const fila = (
                      <Ir href={`/gastos/${encodeURIComponent(g.id)}`} className="fila">
                        <span className="txt">
                          <strong>{g.concepto}</strong>
                          <small>{g.proveedor && g.proveedor !== g.concepto ? `${g.proveedor} · ` : ''}{diaMes(g.fecha)}{actividades.length > 1 ? ` · ${NOMBRES[g.actividad] || g.actividad}` : ''}{importes(g).iva ? ` · IVA ${eur(importes(g).iva)}` : ''}</small>
                        </span>
                        <span className="imp-col">
                          <span className="imp">{eur(g.base)}</span>
                          {g.archivo?.clave && <span className="estado-txt">{g.archivo.tipo === 'application/pdf' ? 'PDF adjunto' : 'Foto adjunta'}</span>}
                          {g.pendiente && <span className="estado-txt e-pendiente">Sin pagar</span>}
                          {g.inversion && <span className="estado-txt">Bien de inversión</span>}
                        </span>
                      </Ir>
                    );
                    // Las nóminas agrupadas no tienen ficha propia: la fila no lleva a ningún sitio.
                    if (g.agrupado) return <div className="fila">{fila.props.children}</div>;
                    // Móvil: deslizar un gasto sin pagar deja marcarlo como pagado
                    return g.pendiente && puede(u, 'gastar') ? <Deslizar id={g.id} acciones={['pagada']}>{fila}</Deslizar> : fila;
                  })()}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {pag.siguiente && <p className="grupo-pie"><Link href={url({ desde: pag.siguiente })} className="boton sec">Ver más</Link></p>}

      {!lista.length && (hay || buscado || estado || desde
        ? <Vacio tipo="resultados" icono="gasto" titulo={buscado ? `Ningún gasto con «${q}»` : 'Ningún gasto con este filtro'} accion={{ href: buscado ? url({ q: null, desde: null }) : '/gastos', texto: buscado ? 'Quitar búsqueda' : 'Ver todos' }} />
        : <Vacio icono="gasto" titulo="Añade tu primer gasto" accion={puede(u, 'gastar') && { href: '#escanear-ticket', texto: 'Escanear ticket' }} secundaria={puede(u, 'gastar') && { href: '#apuntar-gasto', texto: 'Apuntar a mano' }}>Hazle una foto al ticket o apúntalo a mano: el IVA se resta del 303 y el gasto baja tu IRPF.</Vacio>)}

      <section className="gastos-mas">
        <h2 className="grupo-t">Más herramientas</h2>
        <details className="tarjeta bloque" open={pendientes > 0 && !hay}>
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

export const metadata = { title: 'Gastos' };
