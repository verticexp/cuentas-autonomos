import { requerir } from '@/lib/auth';
import { leer, redis } from '@/lib/redis';
import { actividadesDe, ajustesIva, fiscalDe, hecho130, hecho303, modelosDe, usa130, usa303 } from '@/lib/empresa';
import { casillas303, liquidaciones303, minoracion130, prorrataAnio, prorrataProvisional, r2, limiteTrimestre, resumenAnual, situacionTrimestre } from '@/lib/calculos';
import { avisosFiscales } from '@/lib/revisionFiscal';
import Prorrata from '@/components/Prorrata';
import Rend130 from '@/components/Rend130';
import { modelo111 } from '@/lib/nominas';
import { borradorRenta, borradorSociedades, modelo115, modelo180, modelo190, modelo202, modelo347, modelo349, modelo390, retencionesProfesionales, MINIMO_PERSONAL, RET_ALQUILER } from '@/lib/modelos';
import CuotaIS from '@/components/CuotaIS';
import { Presentado, Presentado202 } from '@/components/Acciones';
import { eur, fechaTexto, hoy, textoResumenModelos, textoSituacion } from '@/lib/formato';
import PresentarAhora from '@/components/PresentarAhora';
import { modelosAPresentar } from '@/lib/presentar';
import Volver from '@/components/Volver';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import ModeloPlegable from '@/components/ModeloPlegable';
import '@/app/modelos.css';

import '@/app/mk.css';
import { datosImpuestos } from '@/lib/datosImpuestos';

export const dynamic = 'force-dynamic';
const T = [1, 2, 3, 4];
// Hasta cuándo se presenta cada trimestre: el 4T, en enero (303, 130 y 349 hasta el 30; las retenciones, 111 y 115, hasta el 20).
// Último día del plazo; si cae en sábado o domingo, el lunes siguiente (como el 303 y el 130, auditoría 10-2026).
const plazo = (t, anio, dia = 30) => { const l = limiteTrimestre(t, anio, dia); return fechaTexto(l) + (t === 4 ? ` de ${l.slice(0, 4)}` : ''); };

// Resta en un desglose; sin «−0,00 €» cuando es cero.
const menos = (v) => (v ? -v : 0);
// Fichero para el botón «Importar» del formulario de la Sede (app/api/aeat): sin NIF en Ajustes no se puede generar.
const Fichero = ({ modelo, anio, t, nif, aeat, aviso }) => (
  <p className="descargas">{aviso || (nif
    ? <><a href={`/api/aeat?modelo=${modelo}&anio=${anio}&t=${t}`} download>Descargar fichero para la Sede (.txt, para «Importar»)</a> · <a href={aeat} target="_blank" rel="noopener noreferrer">Abrir la Sede</a></>
    : <>Para descargar el fichero de la Sede, <a href="/ajustes">rellena tu NIF en Ajustes</a>.</>)}</p>
);
// Importe destacado arriba de cada tarjeta del 303/130; sin «0,00 €» cuando no hay nada que ingresar.
const Importe = ({ texto, v }) => <p className={`resumen-importe${v ? '' : ' cero'}`}>{v ? <><span>{texto}</span><strong>{eur(v)}</strong></> : <span>Sin importe a ingresar</span>}</p>;
// Página de cada modelo en la Sede de la AEAT (G414: 303 · IVA; G601: 130 · IRPF).
const AEAT = {
  m303: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G414.shtml',
  m130: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G601.shtml',
};
// Desglose por casillas plegado en el móvil (el importe ya se ve arriba); en el ordenador, siempre abierto.
const Plegable = ({ children }) => <details className="casillas-plegable"><summary>Ver las casillas</summary>{children}</details>;
const Casillas = ({ filas }) => <dl>{filas.filter(Boolean).map(([t, v, b]) => <div key={t} className={b ? 'fuerte' : ''}><dt>{t}</dt><dd>{typeof v === 'number' ? eur(v) : v}</dd></div>)}</dl>;

export default async function Modelos({ searchParams }) {
  const u = await requerir('resumen');
  if (!redis) return <SinBD />;
  const actual = Number(hoy().slice(0, 4));
  const anio = Number((await searchParams).anio) || actual;
  // Informe de capacidad E01: el año, el anterior (tipo del IS, rendimiento previo del 130) y los bienes de inversión.
  const f = fiscalDe(u);
  // La valoración del almacén requiere el histórico completo; las retenciones se imputan al pago,
  // que puede pertenecer a otro año que la factura de proveedor.
  const [{ facturas, gastos }, nominas, empleados, productos, ajustes, albaranes, manuales] = await Promise.all([
    datosImpuestos(u, anio), leer(u, 'nominas'), leer(u, 'empleados'), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes'), leer(u, 'asientos'),
  ]);
  const h = hoy();
  const iva = ajustesIva(u);
  const liquidaciones = liquidaciones303(facturas, gastos, anio, undefined, iva);
  // Se enseña cada modelo si le toca por su situación fiscal o si ya hay datos que lo piden.
  const hay115 = f.alquiler || gastos.some((g) => g.alquiler);
  const hay349 = f.intracom || modelo349(facturas, anio, undefined, gastos).total > 0;
  const m390 = usa303(f) && modelo390(facturas, gastos, anio, iva);
  const conRetencion = gastos.some((g) => Number(g.irpfPct) > 0);
  const m190 = (f.trabajadores || nominas?.length > 0 || conRetencion) && modelo190(nominas || [], empleados || [], anio, gastos);
  const is = f.tipo === 'sociedad' && borradorSociedades(facturas, gastos, anio, { pagos202: u.pagos202 || {}, ivaCoste: !usa303(f), productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [], manuales: manuales || [], hasta: h < `${anio}-12-31` ? h : `${anio}-12-31`, constitucion: f.constitucion, cuotaIS: u.cuotaIS || {} });
  const renta = f.tipo === 'autonomo' && borradorRenta(facturas, gastos, anio, u.pagos130?.[anio], { ivaCoste: !usa303(f), personal: f.renta || {}, iva });
  const m180 = hay115 && modelo180(gastos, anio);
  const m347 = modelo347(facturas, gastos, anio);
  const c303 = usa303(f);
  const ids = actividadesDe(u).map((a) => a.id);
  const rendAnterior = u.rend130?.[anio - 1];
  const r130 = usa130(f) && resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, ids, { ivaCoste: !c303, hasta: h < `${anio}-12-31` ? h : `${anio}-12-31`, minoracion: minoracion130(rendAnterior), iva });
  // Lo que Netto sabe del año anterior, como sugerencia (si ese año no está entero en Netto, no vale: lo confirma la persona).
  const conAnterior = usa130(f) && facturas.some((x) => x.fecha.startsWith(`${anio - 1}-`));
  const sugerido = conAnterior ? resumenAnual(facturas, gastos, anio - 1, {}, ids, { ivaCoste: !c303, iva }).trimestres[3].rendAcum : null;
  // El 303 y el 130 se marcan como presentados cada uno por su cuenta; el trimestre está hecho cuando lo están los dos.
  const p303 = (t, y = anio) => hecho303(u.pres303, u.pagos130, y, t);
  const p130 = (t, y = anio) => hecho130(u.pagos130, y, t);
  const presentado = (t, y = anio) => (!c303 || p303(t, y)) && (!r130 || p130(t, y));
  const hay111 = f.trabajadores || nominas?.length > 0 || conRetencion;
  // Estado de cada trimestre del 303/130 según la fecha de hoy (en curso, listo para presentar o fuera de plazo).
  const situacion = (t) => situacionTrimestre(t, anio, h);
  // Fecha límite real en texto (pasa al lunes si cae en fin de semana); con el año en el 4T y si no es el actual.
  const limite = (t) => { const l = limiteTrimestre(t, anio); return fechaTexto(l) + (t === 4 || Number(l.slice(0, 4)) !== actual ? ` de ${l.slice(0, 4)}` : ''); };

  // Fila plegada de cada modelo en el móvil: el trimestre que toca, cómo va y su importe.
  // 303 y 130: el primer trimestre cerrado sin presentar (listo o fuera de plazo); si no hay, el que está en curso.
  const tRef = (hecho) => T.find((t) => !hecho(t) && situacion(t).estado !== 'curso') ?? T.find((t) => !hecho(t) && situacion(t).estado === 'curso');
  // Estado corto para la fila (la tarjeta del trimestre ya lleva el texto entero).
  const corto = ({ estado, dias }, fecha) => (estado === 'fuera' ? `fuera de plazo · venció el ${fecha}`
    : `${estado === 'curso' ? 'en curso' : 'toca presentarlo'} · ${estado === 'listo' && dias === 0 ? 'hasta hoy' : estado === 'listo' && dias === 1 ? 'hasta mañana' : `hasta el ${fecha}`}`);
  const filaTrim = (t, extra) => {
    if (!t) return { estado: 'hecho', detalle: 'Todos los trimestres presentados' };
    const s = situacion(t);
    return { estado: s.estado === 'curso' ? undefined : s.estado, detalle: `${t}T${extra ? ` · ${extra}` : ''} · ${corto(s, limite(t))}` };
  };
  // 111, 115 y 349 (sin marca propia de presentado): el trimestre del próximo plazo; en un año ya pasado, el total.
  // `vacio`: texto para un trimestre sin nada que presentar (sin color de aviso).
  const tPlazo = (dia) => T.find((t) => limiteTrimestre(t, anio, dia) >= h);
  const filaPlazo = (t, dia, extra, vacio) => {
    if (!t) return { detalle: 'Total del año' };
    if (vacio) return { detalle: `${t}T · ${vacio}` };
    const s = { estado: situacion(t).estado === 'curso' ? 'curso' : 'listo', dias: Math.round((Date.parse(`${limiteTrimestre(t, anio, dia)}T12:00:00Z`) - Date.parse(`${h}T12:00:00Z`)) / 864e5) };
    return { estado: s.estado === 'curso' ? undefined : 'listo', detalle: `${t}T${extra ? ` · ${extra}` : ''} · ${corto(s, plazo(t, anio, dia))}` };
  };
  const importeFila = (v) => (v ? eur(v) : undefined);

  // Trimestre que toca presentar ya: el primero listo (cerrado y dentro de plazo) que aún no está marcado como presentado.
  const tAhora = (c303 || r130) ? T.find((t) => !presentado(t) && situacion(t).estado === 'listo') : undefined;
  let ahora = null;
  if (tAhora) {
    const c = c303 && casillas303(facturas, gastos, anio, tAhora, iva);
    const m303 = c && (c['46'] < 0 ? { importe: 0, compensar: -c['46'] } : { importe: liquidaciones[tAhora - 1].ingresar });
    const m130 = r130 && { importe: r130.trimestres[tAhora - 1].m130 };
    // Con el 303 y el 130, el resto de modelos que vencen a la vez (111, 115, 349 y el 202 de abril u octubre).
    const importes = modelosAPresentar(tAhora, {
      m303, m130,
      m111: hay111 ? r2(modelo111(nominas || [], anio, tAhora).retenciones + retencionesProfesionales(gastos, anio, tAhora).retenciones) : null,
      m115: hay115 ? modelo115(gastos, anio, tAhora).retenciones : null,
      m349: hay349 ? modelo349(facturas, anio, tAhora, gastos) : null,
      pagos202: f.tipo === 'sociedad' ? modelo202(u.cuotaIS, anio) : null, pagados202: u.pagos202?.[anio], constitucion: f.constitucion,
    }).map((m) => ({ ...m, aeat: AEAT[`m${m.num}`], ...(m.dia ? { plazo: plazo(tAhora, anio, m.dia) } : {}) }));
    ahora = (
      <PresentarAhora t={tAhora} anio={anio}
        aviso={textoSituacion(situacion(tAhora), limite(tAhora))}
        importes={importes}
        texto={textoResumenModelos({ t: tAhora, anio, plazo: limite(tAhora), m303, m130, otros: importes.filter((m) => !['303', '130'].includes(m.num)) })} />
    );
  } else if ((c303 || r130) && anio === actual) {
    // En enero toca el 4T del año anterior, que no sale en la vista del año en curso: aviso con enlace a ese año.
    const s4 = situacionTrimestre(4, anio - 1, h);
    const l4 = limiteTrimestre(4, anio - 1);
    if (!presentado(4, anio - 1) && s4.estado === 'listo') {
      ahora = (
        <section className="bloque presentar-ahora" aria-labelledby="presentar-t">
          <h2 className="grupo-t" id="presentar-t">Toca presentar el 4T {anio - 1}</h2>
          <div className="tarjeta">
            <p className="presentar-plazo">{textoSituacion(s4, `${fechaTexto(l4)} de ${l4.slice(0, 4)}`)}</p>
            <div className="presentar-acc"><Ir href={`/modelos?anio=${anio - 1}`} className="boton">Ver importes y pasos del 4T</Ir></div>
          </div>
        </section>
      );
    }
  }

  // Casos que Netto no resuelve solo (lib/revisionFiscal.js): presentar algo aparte o revisar antes del 4T.
  const a111 = (t) => r2(modelo111(nominas || [], anio, t).retenciones + retencionesProfesionales(gastos, anio, t).retenciones);
  const avisos = avisosFiscales({ facturas, gastos, anio, hoy: h, c303, c130: Boolean(r130), liquidaciones, r130, pagos130: u.pagos130?.[anio] || {}, a111: hay111 ? a111 : null });
  // Prorrata: se enseña si hay operaciones exentas este año o el anterior, o si se ha guardado un porcentaje.
  const prorrata = c303 && { guardado: u.prorrata?.[anio] ?? null, provisional: prorrataProvisional(facturas, anio, 4, iva), definitiva: prorrataAnio(facturas, anio), anterior: prorrataAnio(facturas, anio - 1) };
  const verProrrata = prorrata && (prorrata.guardado !== null || prorrata.definitiva !== null || prorrata.anterior !== null);

  return (
    <main className="pagina mk-look modelos">
      <Volver href="/">Resumen</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">Impuestos</h1>
        <nav className="anios">
          <Ir href={`/modelos?anio=${anio - 1}`} tipo="cifras" aria-label="Año anterior">‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={`/modelos?anio=${anio + 1}`} tipo="cifras" aria-label="Año siguiente">›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      <p className="grupo-pie arriba">Calculados con lo que hay en Netto. Son orientativos: revísalos con tu gestor antes de presentarlos.</p>

      {ahora}

      {avisos.length > 0 && (
        <section className="bloque" aria-labelledby="revisar-t">
          <h2 className="grupo-t" id="revisar-t">Para revisar</h2>
          <ul className="tarjeta avisos-fiscales">
            {avisos.map((a) => <li key={a.id}>{a.texto}{a.href && <> <Ir href={a.href}>Ver</Ir></>}</li>)}
          </ul>
        </section>
      )}

      <ModeloPlegable id="calendario" num={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>}
        nombre="Qué presentas y cuándo" detalle={`${modelosDe({ ...f, intracom: hay349 }).length} modelos y plazos según cómo trabajas`}>
        <h2 className="grupo-t">Qué presentas y cuándo</h2>
        <div className="grupo-c">
          {modelosDe({ ...f, intracom: hay349 }).map((m) => <div key={m.id} className="celda"><span className="modelo-num">{m.num || m.id}</span><span className="txt">{m.nombre}<small>{m.cuando}</small></span></div>)}
        </div>
        <p className="grupo-pie">Según cómo trabajas ({f.tipo === 'sociedad' ? 'sociedad' : 'autónomo'}). Si algo no encaja, cámbialo en Ajustes › Actividades y modelos.</p>
      </ModeloPlegable>

      {c303 && (() => {
        const t = tRef(p303); const c = t && casillas303(facturas, gastos, anio, t, iva); const comp = c && c['46'] < 0;
        return (
        <ModeloPlegable id="m303" num="303" nombre="IVA trimestral" {...filaTrim(t, comp && 'a compensar')} favor={comp}
          dato={c && importeFila(comp ? -c['46'] : liquidaciones[t - 1].ingresar)}>
          <h2 className="grupo-t">303 · IVA trimestral</h2>
          <p className="grupo-pie arriba">El IVA de tus facturas menos el de tus gastos. Si sale negativo, se compensa en los trimestres siguientes (durante cuatro años como máximo) o, en el 4T, puedes pedir que te lo devuelvan.</p>
          {verProrrata && <Prorrata anio={anio} {...prorrata} />}
          <div className="tarjetas">
            {T.map((t) => { const c = casillas303(facturas, gastos, anio, t, iva); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>
                {liquidaciones[t - 1].devolucion > 0 ? <Importe texto="A devolver" v={liquidaciones[t - 1].devolucion} /> : c['46'] < 0 ? <Importe texto="A compensar" v={-c['46']} /> : <Importe texto="A ingresar" v={liquidaciones[t - 1].ingresar} />}
                <Plegable><Casillas filas={[
                  c['01'] && ['01 · Base al 4 %', c['01']], c['03'] && ['03 · Cuota al 4 %', c['03']],
                  c['04'] && ['04 · Base al 10 %', c['04']], c['06'] && ['06 · Cuota al 10 %', c['06']],
                  ['07 · Base al 21 %', c['07']], ['09 · Cuota al 21 %', c['09']],
                  ...c.otros.flatMap((o) => [[`— · Base al ${o.pct} % (revisar casilla)`, o.base], [`— · Cuota al ${o.pct} % (revisar casilla)`, o.iva]]),
                  c['14'] && ['14 · Rectificativas: base', c['14']], c['15'] && ['15 · Rectificativas: cuota', c['15']],
                  ...[['16', '18', '0,5'], ['19', '21', '1,4'], ['22', '24', '5,2']].flatMap(([b, q, r]) => (c[b] ? [[`${b} · Recargo de equivalencia ${r} %: base`, c[b]], [`${q} · Recargo de equivalencia ${r} %: cuota`, c[q]]] : [])),
                  ...(c.reOtros || []).flatMap((o) => [[`— · Recargo ${String(o.re).replace('.', ',')} %: base (revisar casilla)`, o.base], [`— · Recargo ${String(o.re).replace('.', ',')} %: cuota (revisar casilla)`, o.recargo]]),
                  c['25'] && ['25 · Recargo de rectificativas: base', c['25']], c['26'] && ['26 · Recargo de rectificativas: cuota', c['26']],
                  c['10'] && ['10 · Compras a la UE: base', c['10']], c['11'] && ['11 · Compras a la UE: cuota', c['11']],
                  c['12'] && ['12 · Compras de fuera de la UE: base', c['12']], c['13'] && ['13 · Compras de fuera de la UE: cuota', c['13']],
                  ['27 · Total IVA devengado', c['27']], ['28 · Base del IVA soportado', c['28']], ['29 · IVA soportado', c['29']],
                  c['30'] && ['30 · Bienes de inversión: base', c['30']], c['31'] && ['31 · Bienes de inversión: cuota', c['31']],
                  c['36'] && ['36 · Compras a la UE: base deducible', c['36']], c['37'] && ['37 · Compras a la UE: cuota deducible', c['37']],
                  c['38'] && ['38 · Bienes de inversión de la UE: base', c['38']], c['39'] && ['39 · Bienes de inversión de la UE: cuota', c['39']],
                  c['40'] && ['40 · Abonos de proveedores: base', c['40']], c['41'] && ['41 · Abonos de proveedores: cuota', c['41']],
                  c.prorrata && ['Prorrata aplicada', `${c.prorrata.provisional} %`],
                  c['44'] && [`44 · Regularización de la prorrata (definitiva: ${c.prorrata.definitiva} %)`, c['44']],
                  c['59'] && ['59 · Empresas de otros países de la UE', c['59']],
                  [c['46'] < 0 ? '46 · A compensar' : '46 · Resultado', Math.abs(c['46']), true],
                  liquidaciones[t - 1].compensado > 0 && ['Cuotas anteriores compensadas', menos(liquidaciones[t - 1].compensado)],
                  c['46'] >= 0 && !liquidaciones[t - 1].devolucion && ['A ingresar tras compensación', liquidaciones[t - 1].ingresar, true],
                  liquidaciones[t - 1].devolucion > 0 && ['A devolver (todo el saldo a tu favor)', liquidaciones[t - 1].devolucion, true],
                ]} /></Plegable>
                {t === 4 && liquidaciones[3].pendiente > 0 && <p className="nota">Te quedan {eur(liquidaciones[3].pendiente)} a tu favor: puedes compensarlos en {anio + 1} y siguientes o pedir que te los devuelvan (al marcarlo como presentado, elige «pido la devolución»).</p>}
                <Fichero modelo="303" anio={anio} t={t} nif={u.emisor?.nif} aeat={AEAT.m303} aviso={c.otros.length > 0 && 'Con tipos de IVA distintos del 4, 10 y 21 % rellénalo a mano en la Sede.'} />
                <Presentado modelo="303" anio={anio} t={t} importe={0} pagado={t === 4 && u.pres303?.[anio]?.[4] === 'devolucion' ? 'devolucion' : p303(t)} con130={false} situacion={situacion(t)} plazo={limite(t)} devolucion={t === 4 && (liquidaciones[3].pendiente > 0 || liquidaciones[3].devolucion > 0)} />
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {r130 && (() => {
        const t = tRef(p130);
        return (
        <ModeloPlegable id="m130" num="130" nombre="Pago a cuenta del IRPF" {...filaTrim(t)} dato={t && importeFila(r130.trimestres[t - 1].m130)}>
          <h2 className="grupo-t">130 · Pago a cuenta del IRPF</h2>
          <p className="grupo-pie arriba">Acumulado desde enero: el 20 % de tu rendimiento, menos las retenciones de tus facturas y lo que ya pagaste en trimestres anteriores. Marca aquí cada trimestre cuando lo presentes: lo que no está presentado no cuenta en el siguiente.</p>
          <Rend130 anio={anio - 1} valor={rendAnterior ?? null} sugerido={sugerido} minoracion={minoracion130(rendAnterior)} />
          <div className="tarjetas">
            {r130.trimestres.map((q) => (
              <div key={q.t} className="tarjeta"><h3>{q.t}T {anio}</h3>
                <Importe texto="A ingresar" v={q.m130} />
                <Plegable><Casillas filas={[
                  ['01 · Ingresos', q.ingAcum], ['02 · Gastos (con el 5 % de difícil justificación)', q.gasAcum], ['03 · Rendimiento neto', q.rendAcum],
                  ['04 · 20 % de la 03', r2(0.2 * Math.max(0, q.rendAcum))], ['05 · Pagado en trimestres anteriores', q.pagosPrev],
                  ['06 · Retenciones de tus facturas', q.retAcum], ['07 · Resultado', q.c07],
                  q.minoracion && ['13 · Minoración por el rendimiento de ' + (anio - 1), q.minoracion], q.negPrev && ['15 · Negativos de trimestres anteriores', q.negPrev],
                  ['19 · A ingresar', q.m130, true],
                ]} /></Plegable>
                <Fichero modelo="130" anio={anio} t={q.t} nif={u.emisor?.nif} aeat={AEAT.m130} />
                <Presentado anio={anio} t={q.t} importe={q.m130} pagado={u.pagos130?.[anio]?.[q.t]} situacion={situacion(q.t)} plazo={limite(q.t)} />
              </div>
            ))}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay111 && (() => {
        const t = tPlazo(20);
        return (
        <ModeloPlegable id="m111" num="111" nombre="Retenciones de nóminas y profesionales" {...filaPlazo(t, 20, null, t && !a111(t) && 'sin nóminas ni profesionales con retención')}
          dato={importeFila(t ? a111(t) : r2(T.reduce((s, x) => s + a111(x), 0)))}>
          <h2 className="grupo-t">111 · Retenciones de trabajadores y profesionales</h2>
          <p className="grupo-pie arriba">Lo retenido en las nóminas del trimestre y en las facturas de profesionales (los gastos con retención, por ejemplo tu gestoría).</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo111(nominas || [], anio, t); const p = retencionesProfesionales(gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>
                {m.perceptores || p.perceptores ? <Casillas filas={[
                  m.perceptores && ['01 · Trabajadores', String(m.perceptores)], m.perceptores && ['02 · Sueldos pagados', m.percepciones], m.perceptores && ['03 · Retenciones', m.retenciones],
                  p.perceptores && ['07 · Profesionales', String(p.perceptores)], p.perceptores && ['08 · Lo que les pagaste (base)', p.base], p.perceptores && ['09 · Retenciones', p.retenciones],
                  ['28 · A ingresar', Math.max(0, r2(m.retenciones + p.retenciones)), true],
                ]} /> : <p className="nota">Sin nóminas ni profesionales con retención este trimestre.</p>}
                {r2(m.retenciones + p.retenciones) < 0 && <p className="nota">Sale negativo por un abono de un profesional con retención: el 111 no lo admite. Regularízalo con ese profesional.</p>}
                <p className="nota">Hasta el {plazo(t, anio, 20)}.{presentado(t) ? ' Marcado como presentado.' : ''}</p>
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {f.tipo === 'sociedad' && (() => {
        const pagos = modelo202(u.cuotaIS, anio);
        // El próximo pago por hacer; sin la cuota del año del que sale, se avisa de que falta.
        const x = pagos.find((y) => y.fecha >= h && (y.cuota === null || (y.pago > 0 && !u.pagos202?.[anio]?.[y.p])));
        const fila = !x ? { detalle: 'Sin pagos pendientes este año' }
          : x.cuota === null ? { estado: 'listo', detalle: `${x.p}P · falta la cuota del Impuesto sobre Sociedades de ${x.de}` }
          : { detalle: `${x.p}P · hasta el 20 de ${x.mes}` };
        return (
        <ModeloPlegable id="m202" num="202" nombre="Pagos a cuenta de Sociedades" {...fila} dato={x && importeFila(x.pago)}>
          <h2 className="grupo-t">202 · Pagos a cuenta del Impuesto sobre Sociedades</h2>
          <p className="grupo-pie arriba">El 18 % de la cuota del último Impuesto sobre Sociedades presentado (menos deducciones, bonificaciones y retenciones; sin restar los pagos a cuenta). Si salió a cero o es el primer año, no se presenta. Si facturas más de 6 millones, se calcula de otra forma: lo hace tu gestor.</p>
          <div className="tarjetas">
            <CuotaIS anio={anio - 2} valor={u.cuotaIS?.[anio - 2] ?? null} uso="el pago de abril" />
            <CuotaIS anio={anio - 1} valor={u.cuotaIS?.[anio - 1] ?? null} uso="los pagos de octubre y diciembre" />
          </div>
          <div className="tarjetas">
            {pagos.map((x) => (
              <div key={x.p} className="tarjeta"><div className="trim-cab"><h3>{x.p}P {anio} · {x.mes}</h3>{x.pago > 0 && <Presentado202 anio={anio} p={x.p} importe={x.pago} pagado={u.pagos202?.[anio]?.[x.p]} />}</div>
                {x.cuota === null ? <p className="nota">Falta la cuota del Impuesto sobre Sociedades de {x.de}.</p>
                  : x.pago ? <Casillas filas={[[`Cuota de ${x.de}`, x.cuota], ['18 % · A ingresar', x.pago, true]]} />
                  : <p className="nota">La cuota de {x.de} fue cero: no se presenta.</p>}
                <p className="nota">Hasta el 20 de {x.mes}.</p>
              </div>
            ))}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay115 && (() => {
        const t = tPlazo(20);
        return (
        <ModeloPlegable id="m115" num="115" nombre="Retenciones del alquiler" {...filaPlazo(t, 20, null, t && !modelo115(gastos, anio, t).base && 'sin alquiler')}
          dato={importeFila(t ? modelo115(gastos, anio, t).retenciones : r2(T.reduce((s, x) => s + modelo115(gastos, anio, x).retenciones, 0)))}>
          <h2 className="grupo-t">115 · Retenciones del alquiler</h2>
          <p className="grupo-pie arriba">El {RET_ALQUILER} % de la renta (sin IVA) de los gastos marcados como alquiler del local.</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo115(gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>{m.base ? <Casillas filas={[['01 · Perceptores', String(m.perceptores)], ['02 · Base de las retenciones', m.base], ['03 · Retenciones a ingresar', m.retenciones, true]]} /> : <p className="nota">Sin alquiler este trimestre.</p>}<p className="nota">Hasta el {plazo(t, anio, 20)}.</p></div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay349 && (() => {
        const t = tPlazo(30); const m = modelo349(facturas, anio, t, gastos);
        const fila = filaPlazo(t, 30, t && `${m.operadores.length} ${m.operadores.length === 1 ? 'empresa' : 'empresas'}`, t && !m.operadores.length && 'sin operaciones: no se presenta');
        return (
        <ModeloPlegable id="m349" num="349" nombre="Empresas de la UE" {...fila} dato={importeFila(m.total)}>
          <h2 className="grupo-t">349 · Empresas de la UE</h2>
          <p className="grupo-pie arriba">Facturas a clientes con NIF-IVA de otro país de la UE (clave S, servicios prestados) y gastos de proveedores de la UE con su NIF-IVA (clave I, servicios recibidos; si son bienes, la clave es A). Solo se presenta el trimestre en que haya alguna.</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo349(facturas, anio, t, gastos); return (
              <div key={t} className="tarjeta"><h3>{t}T {anio}</h3>
                {m.operadores.length ? <><Casillas filas={[...m.operadores.map((c) => [`${c.nif} · ${c.nombre} (${c.clave})`, c.base]), ['Total', m.total, true]]} /><p className="nota">Hasta el {plazo(t, anio)}.</p></> : <p className="nota">Sin operaciones: no se presenta.</p>}
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {m390 && (
        <ModeloPlegable id="m390" num="390" nombre="Resumen anual del IVA" detalle={`Del 1 al 30 de enero de ${anio + 1}`}>
          <h2 className="grupo-t">390 · Resumen anual del IVA</h2>
          <div className="tarjeta">
            <Casillas filas={[
              m390.base4 && ['Base al 4 %', m390.base4], m390.cuota4 && ['Cuota al 4 %', m390.cuota4],
              m390.base10 && ['Base al 10 %', m390.base10], m390.cuota10 && ['Cuota al 10 %', m390.cuota10],
              ['Base al 21 %', m390.base21], ['Cuota al 21 %', m390.cuota21],
              m390.baseRect && ['Rectificativas: base', m390.baseRect], m390.cuotaRect && ['Rectificativas: cuota', m390.cuotaRect],
              ...m390.otros.flatMap((o) => [[`Base al ${o.pct} % (revisar casilla)`, o.base], [`Cuota al ${o.pct} % (revisar casilla)`, o.iva]]),
              m390.baseUE && ['Compras a la UE (base)', m390.baseUE], m390.cuotaUE && ['Compras a la UE (cuota)', m390.cuotaUE],
              m390.baseFuera && ['Compras de fuera de la UE (base)', m390.baseFuera], m390.cuotaFuera && ['Compras de fuera de la UE (cuota)', m390.cuotaFuera],
              ['Total IVA devengado', m390.devengado, true],
              ['Base del IVA soportado', m390.baseDed], ['Total IVA deducible', m390.deducible, true],
              ['Resultado del año', m390.resultado, true],
              ...m390.trimestres.map((v, i) => [`303 del ${i + 1}T`, v]),
              m390.sinIva && ['Operaciones sin IVA', m390.sinIva], ['Volumen de operaciones', m390.volumen],
            ]} />
          </div>
        </ModeloPlegable>
      )}

      <ModeloPlegable id="m347" num="347" nombre="Operaciones con terceros"
        estado={m347.sinNif.length ? 'fuera' : undefined}
        detalle={m347.sinNif.length ? `Falta el NIF de ${m347.sinNif.length} ${m347.sinNif.length === 1 ? 'cliente o proveedor' : 'clientes o proveedores'}`
          : m347.ventas.length + m347.compras.length ? `${m347.ventas.length + m347.compras.length} clientes y proveedores · en febrero de ${anio + 1}` : 'Nadie pasa de 3.005,06 €: no se presenta'}>
        <h2 className="grupo-t">347 · Operaciones de más de 3.005,06 €</h2>
        <p className="grupo-pie arriba">Clientes y proveedores con los que pasas de 3.005,06 € en el año, IVA incluido. No entra lo que ya va en el 349, lo de fuera de la UE, lo que lleva retención (va en el 190 o el 180) ni los tickets sin proveedor. Se presenta en febrero de {anio + 1}.</p>
        {m347.ventas.length || m347.compras.length ? (
          <div className="tarjetas">
            {[['Clientes (clave B)', m347.ventas], ['Proveedores (clave A)', m347.compras]].filter(([, l]) => l.length).map(([t, l]) => (
              <div key={t} className="tarjeta"><h3>{t}</h3>
                <Casillas filas={l.map((o) => [`${o.nif ? `${o.nif} · ` : ''}${o.nombre} (${o.trimestres.map((x, i) => `${i + 1}T ${eur(x)}`).filter((_, i) => o.trimestres[i]).join(' · ')})`, o.total])} />
              </div>
            ))}
          </div>
        ) : <div className="tarjeta"><p className="nota">Nadie pasa de 3.005,06 € este año: no se presenta.</p></div>}
        {m347.sinNif.length > 0 && <p className="nota">Sin NIF: {m347.sinNif.map((o) => o.nombre).join(', ')}. Añádelo en sus facturas o gastos: sin él no se puede declarar.</p>}
      </ModeloPlegable>

      {m180 && (
        <ModeloPlegable id="m180" num="180" nombre="Resumen anual del alquiler" detalle={m180.arrendadores.length ? `Del 1 al 31 de enero de ${anio + 1}` : 'Sin alquileres este año'} dato={importeFila(m180.retenciones)}>
          <h2 className="grupo-t">180 · Resumen anual del alquiler</h2>
          <div className="tarjeta">
            {m180.arrendadores.length ? <Casillas filas={[...m180.arrendadores.map((p) => [`${p.nif ? `${p.nif} · ` : ''}${p.nombre}`, `${eur(p.base)} · ret. ${eur(p.retenciones)}`]), ['Retenciones del año', m180.retenciones, true]]} /> : <p className="nota">Sin alquileres este año.</p>}
          </div>
        </ModeloPlegable>
      )}

      {m190 && (
        <ModeloPlegable id="m190" num="190" nombre="Resumen anual de retenciones" detalle={m190.perceptores.length ? `Del 1 al 31 de enero de ${anio + 1}` : 'Sin nóminas este año'} dato={importeFila(m190.retenciones)}>
          <h2 className="grupo-t">190 · Resumen anual de retenciones</h2>
          <div className="tarjeta">
            {m190.perceptores.length ? <Casillas filas={[...m190.perceptores.map((p) => [`${p.nif ? `${p.nif} · ` : ''}${p.nombre} (${p.clave})`, `${eur(p.percepciones)} · ret. ${eur(p.retenciones)}`]), ['Percepciones del año', m190.percepciones], ['Retenciones del año', m190.retenciones, true]]} /> : <p className="nota">Sin nóminas este año.</p>}
          </div>
        </ModeloPlegable>
      )}

      {is && (
        <ModeloPlegable id="m200" num="200" nombre={`Impuesto de Sociedades ${anio}`} favor={is.resultado < 0}
          detalle={`Borrador · ${is.resultado >= 0 ? 'saldría a pagar' : 'saldría a devolver'} · del 1 al 25 de julio de ${anio + 1}`} dato={importeFila(Math.abs(is.resultado))}>
          <h2 className="grupo-t">Borrador del Impuesto sobre Sociedades {anio}</h2>
          <p className="grupo-pie arriba">Solo con lo que hay en Netto, con la amortización de tus bienes de inversión y sin otros ajustes (gastos no deducibles, pérdidas de años anteriores, reservas…): tómalo como una idea de cuánto saldrá. Se presenta del 1 al 25 de julio de {anio + 1}.</p>
          <div className="tarjeta">
            <Casillas filas={[
              ['Ingresos', is.ingresos], ['Gastos', menos(is.gastos)], is.amortizacion && ['de ellos, amortizaciones', menos(is.amortizacion)], is.ajustesContables && ['Ingresos y gastos de asientos manuales', is.ajustesContables], ['Base imponible (beneficio)', is.base, true],
              ...is.tramos.map((x) => [is.tramos.length > 1 ? `${x.pct} % de ${eur(x.base)}` : `Cuota al ${x.pct} %`, x.cuota]),
              ['Cuota', is.cuota, true], is.retenciones && ['Retenciones soportadas', menos(is.retenciones)], ['Pagos del 202 marcados', menos(is.pagos)],
              [is.resultado >= 0 ? 'Saldría a pagar' : 'Saldría a devolver', Math.abs(is.resultado), true],
            ]} />
            <p className="nota">Tipo de {is.tamano === 'micro' ? 'microempresa (facturación de menos de 1 millón)' : is.tamano === 'reducida' ? 'empresa de reducida dimensión (menos de 10 millones)' : 'general'}{is.conAnterior ? ` según lo facturado en ${anio - 1}` : ', con lo facturado este año (no hay datos del anterior)'}.{' '}
              {is.nuevaCreacion?.aplica ? `Sociedad de nueva creación: tributa al 15 % (primer año con beneficio, ${is.nuevaCreacion.primero}, y el siguiente). No vale si la actividad ya la hacía antes otra persona o sociedad vinculada, si es del mismo grupo o si es patrimonial: confírmalo con tu gestor.`
                : !f.constitucion ? 'Si la sociedad es de nueva creación, añade su fecha de constitución en Ajustes › Actividades y modelos: el primer año con beneficio y el siguiente tributa al 15 %.'
                : is.nuevaCreacion?.falta ? `No hay datos de ${is.nuevaCreacion.falta} en Netto para saber si aún toca el 15 % de nueva creación: confírmalo con tu gestor.`
                : is.nuevaCreacion?.primero && is.nuevaCreacion.primero < anio - 1 ? `El 15 % de nueva creación ya se aplicó en ${is.nuevaCreacion.primero} y ${is.nuevaCreacion.primero + 1}.` : ''}</p>
          </div>
        </ModeloPlegable>
      )}

      {renta && (
        <ModeloPlegable id="m100" num="100" nombre={`Renta ${anio}`} favor={renta.resultado < 0}
          detalle={`Borrador · ${renta.resultado >= 0 ? 'saldría a pagar' : 'saldría a devolver'} · de abril a junio de ${anio + 1}`} dato={importeFila(Math.abs(renta.resultado))}>
          <h2 className="grupo-t">Borrador de la renta {anio}</h2>
          <p className="grupo-pie arriba">Tu actividad (estimación directa simplificada){f.renta ? ', con los datos personales de Ajustes' : ''}. No incluye deducciones autonómicas, vivienda, planes de pensiones ni discapacidad: tómalo como una idea de cuánto te saldrá.{!f.renta && ' Añade tu situación familiar en Ajustes › Actividades y modelos para afinarlo.'}</p>
          <div className="tarjeta">
            <Casillas filas={[
              ['Ingresos de la actividad', renta.ingresos], ['Gastos deducibles', menos(renta.gastos)], renta.difJust > 0 && ['5 % gastos de difícil justificación', menos(renta.difJust)],
              renta.reduccion > 0 && [renta.tipoReduccion === 'dependiente' ? 'Reducción por cliente único (art. 32.2.1.º)' : 'Reducción por rentas bajas (art. 32.2.3.º)', menos(renta.reduccion)],
              ['Rendimiento neto', renta.rendimiento, true],
              renta.otrasRentas > 0 && ['Otras rentas (solo para el tipo)', renta.otrasRentas],
              [`Cuota (escala general, mínimos de ${eur(renta.minimos.total)}${renta.minimos.total > MINIMO_PERSONAL ? `: personal ${eur(renta.minimos.personal)}${renta.minimos.descendientes ? `, hijos ${eur(renta.minimos.descendientes)}` : ''}${renta.minimos.ascendientes ? `, ascendientes ${eur(renta.minimos.ascendientes)}` : ''}` : ''})`, renta.cuota],
              ['Retenciones de tus facturas', menos(renta.retenciones)], ['Pagos del 130 marcados', menos(renta.pagos130)],
              [renta.resultado >= 0 ? 'Saldría a pagar' : 'Saldría a devolver', Math.abs(renta.resultado), true],
            ]} />
            <p className="nota">Tipo medio: {String(renta.tipoMedio).replace('.', ',')} %.</p>
          </div>
        </ModeloPlegable>
      )}
    </main>
  );
}
