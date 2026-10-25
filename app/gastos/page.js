import Vacio from '@/components/Vacio';
import { cupoEscaneos } from '@/lib/cuotasIA';
import { sinFuncion } from '@/lib/planes';
import { requerir } from '@/lib/auth';
import { nombresProyectos } from '@/lib/proyectos';
import { leer, redis } from '@/lib/redis';
import { contar, contarMarcados, documentos, fechaCursor, fichasRango, leerMarcados, leerRango, pagina, totales } from '@/lib/indices';
import { agendaPagos, aPagar, estadoPago, textoVence } from '@/lib/pagos';
import { agruparGastosNomina, veSueldos } from '@/lib/nominas';
import { candidatosConciliacion } from '@/lib/bancoServidor';
import { importes, origenGasto, r2 } from '@/lib/calculos';
import { partirIva } from '@/lib/ivaDeducible';
import { usaIgic, actividadesDe, fiscalDe, nombresActividad } from '@/lib/empresa';
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
import { ordenar, paraPantalla, resumen as resumenBandeja } from '@/lib/bandeja';
import { adelantarLecturas, documentosBandeja } from '@/lib/bandejaServidor';
import { correoEntranteListo } from '@/lib/correoEntrante';
import { buzonDe, confirmacionVigente, direccionDe } from '@/lib/buzon';
import Bandeja from '@/components/Bandeja';
import BuzonCorreo from '@/components/BuzonCorreo';
import Pestanas from '@/components/Pestanas';
import '@/app/pestanas.css';
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
  const { q, estado, banco, desde, escanear, subir, ver, aviso } = await searchParams;
  // Tres vistas con sus pestañas: los gastos ya apuntados, las facturas que esperan revisión y lo que hay que pagar.
  const vista = ver === 'revisar' ? 'revisar' : ['sinpagar', 'vencidos'].includes(estado) ? 'pagar' : 'gastos';
  const h = hoy();
  const anio = h.slice(0, 4);
  // E06: lo que se debe y lo que queda sin pagar salen de los totales precalculados.
  const [movs, productos, total, delAnioTodos, agr, nBienes, cupoIA, bandeja, sinPagarDocs] = await Promise.all([leer(u, 'banco'), leer(u, 'productos'), contar(u, 'gastos'), leerRango(u, 'gastos', `${anio}-01-01`, `${anio}-12-31`), totales(u, 'gastos', ['dc', 'sn']), contarMarcados(u, 'gastos', 'i'), puede(u, 'gastar') ? cupoEscaneos(u).catch(() => null) : null, documentosBandeja(u), leerMarcados(u, 'gastos', 'p')]);
  // «Por revisar» (lib/bandeja.js): las facturas subidas o reenviadas que esperan, en esta misma pantalla.
  await adelantarLecturas(u, bandeja || []);
  const porRevisar = { docs: ordenar(bandeja || []).map(paraPantalla), resumen: resumenBandeja(bandeja || []) };
  const buzon = buzonDe(u);
  const correo = { listo: correoEntranteListo(), direccion: direccionDe(buzon) };
  // Con inventario: los productos que llevan stock, para apuntar lo que entra con cada compra.
  const stockProductos = fiscalDe(u).inventario ? (productos || []).filter((p) => !p.servicio).sort((a, b) => a.nombre.localeCompare(b.nombre)) : [];
  // En revisión (lib/revisionGastos.js): cargos del banco sin gasto que parecen un gasto (no impuestos, nóminas, préstamos…).
  const sinPareja = (movs || []).filter((m) => (m.estado === 'pendiente' || !m.estado) && m.importe < 0);
  const cand = await candidatosConciliacion(u, movs || []);
  // Todos los que siguen pendientes, también los de sugerencia segura (si no, no se ven en ningún sitio hasta conciliarlos).
  const revision = revisionGastos(movs || [], cand.gastos, { autonomo: fiscalDe(u).tipo === 'autonomo', u });
  const movimiento = !sinFuncion(u.plan, 'revision') && banco && sinPareja.find((m) => m.id === banco);
  const buscado = String(q || '').trim().toLowerCase();
  // Los bienes traídos de otro programa no son gastos de aquí: se ven en Contabilidad › Amortizaciones.
  // La búsqueda va por el índice de texto (revisión S06); el resto, por la ficha.
  // Sin el permiso «Nóminas», la de cada persona no sale (Codex H2): en su lugar, una fila por mes con las de todo el equipo.
  const privado = !veSueldos(u);
  const filtro = (f, id) => !f.mi && !(privado && String(id).startsWith('nomina-'));
  // Pagos a proveedores (lib/pagos.js): lo que queda por pagar, por vencimiento. Solo los gastos sin pagar (pocos).
  const agenda = agendaPagos((sinPagarDocs || []).filter((g) => !g.migrado && !(privado && String(g.id).startsWith('nomina-'))), h);
  const verAgenda = vista === 'pagar' && !buscado;
  const pag = await pagina(u, 'gastos', { cursor: desde, marca: ['sinpagar', 'vencidos'].includes(estado) ? 'p' : undefined, filtro, buscar: buscado });
  const lista = await documentos(u, 'gastos', pag.ids);
  if (privado && !buscado && !['sinpagar', 'vencidos'].includes(estado)) {
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

  // Una fila de la lista: en la agenda de pagos, con su vencimiento y lo que se paga (con IVA y sin la retención).
  const fila = (g, { agenda: enAgenda = false } = {}) => {
    const e = estadoPago(g, h);
    const contenido = (
      <Ir href={`/gastos/${encodeURIComponent(g.id)}`} className="fila">
        <span className="txt">
          <strong>{enAgenda && g.proveedor ? g.proveedor : g.concepto}</strong>
          <small>{enAgenda ? `${g.proveedor && g.proveedor !== g.concepto ? `${g.concepto} · ` : ''}factura del ${diaMes(g.fecha)}${g.numero ? ` · nº ${g.numero}` : ''}` : <>{g.proveedor && g.proveedor !== g.concepto ? `${g.proveedor} · ` : ''}{diaMes(g.fecha)}{actividades.length > 1 ? ` · ${NOMBRES[g.actividad] || g.actividad}` : ''}{importes(g).iva ? ` · IVA ${eur(importes(g).iva)}` : ''}</>}</small>
        </span>
        <span className="imp-col">
          <span className="imp">{eur(enAgenda ? aPagar(g) : g.base)}</span>
          {!enAgenda && g.archivo?.clave && <span className="estado-txt">{g.archivo.tipo === 'application/pdf' ? 'PDF adjunto' : g.archivo.tipo === 'application/xml' ? 'Factura electrónica' : 'Foto adjunta'}</span>}
          {g.pendiente && <span className={`estado-txt ${e === 'vencido' ? 'e-vencida' : 'e-pendiente'}`}>{textoVence(g, h, fechaCorta)}</span>}
          {g.inversion && <span className="estado-txt">Bien de inversión</span>}
        </span>
      </Ir>
    );
    // Las nóminas agrupadas no tienen ficha propia: la fila no lleva a ningún sitio.
    if (g.agrupado) return <div className="fila">{contenido.props.children}</div>;
    // Móvil: deslizar un gasto sin pagar deja marcarlo como pagado
    return g.pendiente && puede(u, 'gastar') ? <Deslizar id={g.id} acciones={['pagada']}>{contenido}</Deslizar> : contenido;
  };

  return (
    <main className="pagina mk-look gastos gastos-formulario">
      <header className="cabecera">
        <h1 className="titulo">Gastos</h1>
      </header>
      {!movimiento && <Pestanas etiqueta="Gastos" items={[
        { href: '/gastos', texto: 'Gastos', activo: vista === 'gastos' },
        { href: '/gastos?ver=revisar', texto: 'Por revisar', n: porRevisar.resumen.pendientes, tono: 'aviso', activo: vista === 'revisar' },
        { href: '/gastos?estado=sinpagar', texto: 'Por pagar', n: agenda.n, tono: agenda.vencidos ? 'rojo' : undefined, activo: vista === 'pagar' },
      ]} />}

      {/* Lo de cada pestaña: al cambiar de una a otra, solo se mueve esto (components/Pestanas.js). */}
      <div className="pestanas-panel">
        {/* Por revisar: las facturas subidas, reenviadas por correo o compartidas, hasta que se aprueban (lib/bandeja.js). */}
        {vista === 'revisar' && <>
          {aviso === 'banco' && <p className="nota" role="status">Gasto guardado, pero el cargo del banco ya no casaba: emparéjalo desde Gastos › Cargos del banco sin gasto.</p>}
          <p className="nota">Aquí llegan las facturas que subes o reenvías por correo. Fisquo las lee y esperan a que las revises: nada se guarda como gasto hasta que lo apruebas.</p>
          <Bandeja inicial={porRevisar.docs} resumenInicial={porRevisar.resumen} puedeGastar={puede(u, 'gastar')} />
          {!porRevisar.docs.length && <Vacio icono="gasto" titulo="No tienes facturas por revisar">Sube arriba las facturas que te llegan (PDF, fotos o facturas electrónicas, todas a la vez) {correo.listo ? 'o reenvíalas a tu dirección de correo' : ''} y aparecerán aquí.</Vacio>}
          <BuzonCorreo inicial={{ listo: correo.listo, direccion: correo.direccion, remitentes: buzon?.remitentes || [], confirmacion: confirmacionVigente(buzon) }} admin={Boolean(u.admin)} puedeGastar={puede(u, 'gastar')} />
        </>}

        {/* Por pagar: como una agenda de pagos, de lo vencido a lo que vence más tarde, con el total de cada grupo. */}
        {vista === 'pagar' && <>
          {agenda.vencidos > 0 && (
            <Deslizable className="chips">
              <Link href="/gastos?estado=sinpagar" className={estado !== 'vencidos' ? 'activo' : ''}>Todo lo pendiente · {agenda.n}</Link>
              <Link href="/gastos?estado=vencidos" className={`${estado === 'vencidos' ? 'activo ' : ''}rojo`}>Vencidos · {agenda.vencidos}</Link>
            </Deslizable>
          )}
          {agenda.n > 0 && <p className="resumen-linea"><span>Por pagar <strong>{eur(agenda.total)}</strong></span>{agenda.totalVencido > 0 && <span className="prov-debe">Vencido <strong>{eur(agenda.totalVencido)}</strong></span>}</p>}
          {agenda.grupos.filter((gr) => estado !== 'vencidos' || gr.id === 'vencido').map((gr) => (
            <section key={gr.id} className="grupo-mes">
              <h2><span className={gr.id === 'vencido' ? 'rojo' : ''}>{gr.titulo}</span><small>{eur(gr.total)}</small></h2>
              <ul className="grupo-lista">{gr.gastos.map((g) => <li key={g.id}>{fila(g, { agenda: true })}</li>)}</ul>
            </section>
          ))}
          {!agenda.n && <Vacio tipo="resultados" icono="gasto" titulo="No tienes nada por pagar" accion={{ href: '/gastos', texto: 'Ver los gastos' }}>Los gastos que marques como «Aún no lo he pagado» salen aquí, ordenados por su vencimiento.</Vacio>}
        </>}

        {vista === 'gastos' && <>
          {/* Primero lo que más se hace: escanear el ticket o subir las facturas. El formulario entero se abre al escanear o al pedirlo. */}
          {puede(u, 'gastar') && !movimiento && <FormGasto igic={usaIgic(fiscalDe(u))} especial={Object.values(u.prorrata?.especial || {}).some(Boolean)} cupoInicial={cupoIA} hoy={h} actividades={actividades} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} regimen={fiscalDe(u).tipo} productos={stockProductos} plegado destacar={Boolean(escanear || subir)} proyectos={proyectos} correo={correo} />}

          {/* Si hay facturas esperando, se dice aquí también, bien a la vista. */}
          {!movimiento && porRevisar.resumen.pendientes > 0 && (
            <Ir href="/gastos?ver=revisar" tipo="pestana-der" scroll={false} className="aviso-revisar">
              <span><strong>{porRevisar.resumen.pendientes === 1 ? 'Tienes 1 factura por revisar' : `Tienes ${porRevisar.resumen.pendientes} facturas por revisar`}</strong>
                <small>{porRevisar.resumen.cuadran ? (porRevisar.resumen.cuadran === 1 ? '1 cuadra y se puede aprobar con un toque' : `${porRevisar.resumen.cuadran} cuadran y se pueden aprobar de golpe`) : 'Ábrelas para revisarlas y guardarlas como gasto'}</small></span>
              <span className="aviso-revisar-ir">Revisar ›</span>
            </Ir>
          )}

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

          {puede(u, 'gastar') && movimiento && <FormGasto igic={usaIgic(fiscalDe(u))} especial={Object.values(u.prorrata?.especial || {}).some(Boolean)} cupoInicial={cupoIA} key={movimiento.id} hoy={h} actividades={actividades} alquiler={fiscalDe(u).alquiler} retenciones={fiscalDe(u).trabajadores} regimen={fiscalDe(u).tipo} productos={stockProductos} movimiento={movimiento} proyectos={proyectos} />}

          {!sinFuncion(u.plan, 'revision') && puede(u, 'gastar') && !movimiento && revision.total > 0 && <RevisionGastos items={revision.items} total={revision.total} />}

          {total > 5 && <Buscar action="/gastos" q={q} placeholder="Buscar gastos" etiqueta="Buscar por proveedor o concepto" />}

          {grupos.map((gr) => {
            const [y, m] = gr.m.split('-');
            return (
              <section key={gr.m} className="grupo-mes">
                <h2><span>{MESES[m - 1]} {y !== h.slice(0, 4) ? y : ''}</span><small>{eur(r2(totalMes[gr.m] || 0))} sin IVA</small></h2>
                <ul className="grupo-lista">
                  {gr.gastos.map((g) => <li key={g.id}>{fila(g)}</li>)}
                </ul>
              </section>
            );
          })}

          {pag.siguiente && <p className="grupo-pie"><Link href={url({ desde: pag.siguiente })} className="boton sec">Ver más</Link></p>}

          {/* Sin ningún gasto, el estado vacío es la tarjeta plegada del formulario (escanear, subir o apuntar a mano, D8-23). */}
          {!lista.length && (hay || buscado || desde) && <Vacio tipo="resultados" icono="gasto" titulo={buscado ? `Ningún gasto con «${q}»` : 'Ningún gasto con este filtro'} accion={{ href: buscado ? url({ q: null, desde: null }) : '/gastos', texto: buscado ? 'Quitar búsqueda' : 'Ver todos' }} />}

          <details className="gastos-mas" open={hay}>
            <summary className="grupo-t">Más herramientas</summary>
            <details className="tarjeta bloque" open={false}>
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
          </details>
        </>}
      </div>
    </main>
  );
}

export const metadata = { title: 'Gastos' };
