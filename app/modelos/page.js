import Termino from '@/components/Termino';
import { GLOSARIO } from '@/lib/glosario';
import { requerir } from '@/lib/auth';
import { clave, leer, redis } from '@/lib/redis';
import { panelDe } from '@/lib/panelCache';
import { actividadesDe, ajustesIva, fiscalDe, hecho130, hecho303, marcaRet, modelosDe, usa130, usa131, usa303, usaSimplificado, usaIgic } from '@/lib/empresa';
import { modelos131, simplificado } from '@/lib/estimacionObjetiva';
import ModulosActividad from '@/components/ModulosActividad';
import { liquidaciones420, modelo425, plazo420 } from '@/lib/igic';
import { datosTerritorio, esForal, foralDe, pagosIrpfForal, plazoForal, situacionForal, territorioDe } from '@/lib/territorios';
import { AvisoHaciendaForal } from '@/components/AvisoTerritorio';
import { casillas303, emitidasDespues, habil, liquidaciones303, numeroFactura, minoracion130, opciones130, origenGasto, pendienteCaja, prorrataAnio, prorrataProvisional, r2, limiteTrimestre, resumenAnual, situacionTrimestre } from '@/lib/calculos';
import { NOMBRES_UE, modelo369, plazo369 } from '@/lib/oss';
import { TIPOS_RENDIMIENTO, casillas123, modelo123, modelo193 } from '@/lib/capitalMobiliario';
import PagosCapital from '@/components/PagosCapital';
import { avisosFiscales } from '@/lib/revisionFiscal';
import Prorrata from '@/components/Prorrata';
import Rend130 from '@/components/Rend130';
import SaldoIva from '@/components/SaldoIva';
import { modelo111, MESES } from '@/lib/nominas';
import { borradorRenta, borradorSociedades, TIPOS_DEDUCCION_IS, modelo232, TIPOS_OPERACION_232, PARAISOS_FISCALES, LIMITE_232, LIMITE_232_ESPECIFICAS, PCT_232_CIFRA, modelo115, modelo180, modelo190, modelo309, modelo202, modelo202Art403, modelo347, modelo349, periodos349, modelo390, ETIQUETAS390, ORDEN390, TOTALES390, retencionesProfesionales, MINIMO_PERSONAL, RET_ALQUILER, modelo216, modelo296 } from '@/lib/modelos';
import { SUBCLAVES_296, nombrePais } from '@/lib/noResidentes';
import { nombreVinculo } from '@/lib/terceros';
import CuotaIS, { ImporteAnio } from '@/components/CuotaIS';
import DeduccionesIS from '@/components/DeduccionesIS';
import { Presentado, Presentado202, PresentadoRet } from '@/components/Acciones';
import { eur, fechaTexto, hoy, pctCorto, textoResumenModelos, textoSituacion } from '@/lib/formato';
import { conPagoDomiciliable, finDomiciliacion } from '@/lib/domiciliacion';
import PresentarAhora from '@/components/PresentarAhora';
import CalendarioFiscal from '@/components/CalendarioFiscal';
import RectificativaIva from '@/components/RectificativaIva';
import { modelosAPresentar } from '@/lib/presentar';
import Volver from '@/components/Volver';
import Vacio from '@/components/Vacio';
import Ir from '@/components/Ir';
import SinBD from '@/components/SinBD';
import ModeloPlegable from '@/components/ModeloPlegable';
import '@/app/modelos.css';

import '@/app/mk.css';
import { datosImpuestos } from '@/lib/datosImpuestos';
import { puede } from '@/lib/permisos';
import { textos } from '@/lib/idiomaServidor';

// Los tres pagos del 202 por su nombre, no «3P»
const PAGO_202 = { 1: '1.er pago', 2: '2.º pago', 3: '3.er pago' };
export const dynamic = 'force-dynamic';
const T = [1, 2, 3, 4];
// Sede de la Agencia Tributaria Canaria (420 y 425).
const SEDE_ATC = 'https://sede.gobiernodecanarias.org/tributos/';
// Casillas del 420 (instrucciones de la Agencia Tributaria Canaria).
const ETIQUETAS420 = {
  '01': 'Base imponible', '02': 'Tipo de IGIC', '03': 'Cuota devengada',
  '04': 'Base imponible', '05': 'Tipo de IGIC', '06': 'Cuota devengada',
  '07': 'Base imponible', '08': 'Tipo de IGIC', '09': 'Cuota devengada',
  '10': 'Base imponible', '11': 'Tipo de IGIC', '12': 'Cuota devengada',
  '13': 'Base imponible', '14': 'Tipo de IGIC', '15': 'Cuota devengada',
  '16': 'Base imponible', '17': 'Tipo de IGIC', '18': 'Cuota devengada',
  '19': 'ISP: base', '20': 'ISP: cuota', '21': 'Rectificaciones: base',
  '22': 'Rectificaciones: cuota', '23': 'Viajeros: base', '24': 'Viajeros: cuota',
  '25': 'Total IGIC devengado', '26': 'Adquisiciones corrientes: base', '27': 'Adquisiciones corrientes: cuota deducible',
  '28': 'Bienes de inversión: base', '29': 'Bienes de inversión: cuota deducible', '30': 'Importaciones corrientes: base',
  '31': 'Importaciones corrientes: cuota deducible', '32': 'Importaciones de inversión: base', '33': 'Importaciones de inversión: cuota deducible',
  '34': 'Rectificaciones de deducciones: base', '35': 'Rectificaciones de deducciones: cuota', '36': 'Compensaciones agrarias',
  '37': 'Regularización de bienes de inversión', '38': 'Regularización previa al inicio', '39': 'Regularización de deducciones',
  '40': 'Total IGIC deducible', '41': 'Diferencia', '42': 'Cuotas no deducidas por modificación de base',
  '43': 'Cuotas anteriores a compensar', '44': 'Resultado de la anterior autoliquidación', '45': 'Resultado',
  '46': 'Exportaciones y exentas con derecho a deducción', '47': 'No sujetas con derecho a deducción e ISP',
};
const DEDUCCIONES425 = { corrientes: 'adquisiciones corrientes', bienesInversion: 'bienes de inversión', importacionesCorrientes: 'importaciones corrientes', importacionesInversion: 'importaciones de inversión', rectificaciones: 'rectificaciones', compensaciones: 'compensaciones agrarias', total: 'total' };
// Hasta cuándo se presenta cada trimestre: el 4T, en enero (303, 130 y 349 hasta el 30; las retenciones, 111 y 115, hasta el 20).
// Último día del plazo; si cae en sábado o domingo, el lunes siguiente (como el 303 y el 130, auditoría 10-2026).
const plazo = (t, anio, dia = 30) => { const l = limiteTrimestre(t, anio, dia); return fechaTexto(l) + (t === 4 ? ` de ${l.slice(0, 4)}` : ''); };

// Resta en un desglose; sin «−0,00 €» cuando es cero.
const menos = (v) => (v ? -v : 0);
// Fichero para el botón «Importar» del formulario de la Sede (app/api/aeat): sin NIF en Ajustes no se puede generar.
// Sin t, un modelo anual; con mes, un 349 mensual. boe: declaración informativa, que se presenta con el fichero entero
// («Presentación mediante fichero» de la Sede) en lugar de importarlo en el formulario.
const Fichero = async ({ modelo, anio, t, mes, nif, aeat, aviso, foral, boe = false }) => {
  const tr = await textos();
  return foral ? <p className="descargas"><a href={foral.sede} target="_blank" rel="noopener noreferrer">{tr('Abrir la sede de la {hacienda}', { hacienda: tr(foral.hacienda) })}</a></p> : (
    <p className="descargas">{aviso ? tr(aviso) : (nif
      ? <><a href={`/api/aeat?${new URLSearchParams({ modelo, anio: String(anio), ...(t ? { t: String(t) } : {}), ...(mes ? { mes: String(mes) } : {}) })}`} download>{boe ? tr('Descargar fichero para presentar (formato BOE)') : tr('Descargar fichero para la Sede (.txt, para «Importar»)')}</a>{aeat && <> · <a href={aeat} target="_blank" rel="noopener noreferrer">{tr('Abrir la Sede')}</a></>}</>
      : <>{tr('Para descargar el fichero de la Sede,')} <a href="/ajustes">{tr('rellena tu NIF en Ajustes')}</a>.</>)}</p>
  );
};
// Importe destacado arriba de cada tarjeta del 303/130; sin «0,00 €» cuando no hay nada que ingresar.
const Importe = async ({ texto, v }) => {
  const tr = await textos();
  return <p className={`resumen-importe${v ? '' : ' cero'}`}>{v ? <><span>{tr(texto)}</span><strong>{eur(v)}</strong></> : <span>{tr('Sin importe a ingresar')}</span>}</p>;
};
// Página de cada modelo en la Sede de la AEAT (G414: 303 · IVA; G601: 130 · IRPF).
const AEAT = {
  m303: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G414.shtml',
  m130: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G601.shtml',
  m131: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/G602.shtml',
  m216: 'https://sede.agenciatributaria.gob.es/Sede/procedimientoini/GF05.shtml',
};
// Desglose por casillas plegado en el móvil (el importe ya se ve arriba); en el ordenador, siempre abierto.
const Plegable = async ({ children }) => <details className="casillas-plegable"><summary>{(await textos())('Ver las casillas')}</summary>{children}</details>;
// sinNumeros: en una Hacienda foral (lib/territorios.js) su modelo numera distinto: solo el concepto, sin la casilla de la AEAT.
// Informativos (180, 190 y 347): una fila por persona y una columna por cifra; en el móvil, las cifras debajo del nombre
// con su etiqueta (app/modelos.css). Los trimestres a cero se ven como 0,00 € (auditoría D4-11); una cifra que ese
// registro no lleva (null), como —.
const TablaPersonas = async ({ titulo, columnas, filas, total }) => {
  const tr = await textos();
  return (
    <table className="tabla-modelo">
      {titulo && <caption>{tr(titulo)}</caption>}
      <thead><tr><th scope="col">{tr('Nombre')}</th>{columnas.map((c) => <th key={c} scope="col" className="n">{tr(c)}</th>)}</tr></thead>
      <tbody>{filas.map((f) => <tr key={f.clave}><th scope="row">{f.nombre}{f.detalle && <small>{f.detalle}</small>}</th>{f.cifras.map((v, i) => <td key={columnas[i]} className="n" data-et={tr(columnas[i])}>{v == null ? '—' : eur(v)}</td>)}</tr>)}</tbody>
      {total && <tfoot><tr><th scope="row">{tr('Total')}</th>{total.map((v, i) => <td key={columnas[i]} className="n" data-et={tr(columnas[i])}>{eur(v)}</td>)}</tr></tfoot>}
    </table>
  );
};
const CLAVES_190 = { A: 'trabajador', E: 'consejero o administrador', G: 'profesional', H: 'módulos o agricultura', I: 'otras rentas', L: 'indemnización por despido exenta' };
// Datos adicionales del 190 (clave A, lib/modelos.js), en palabras.
const SITUACION_190 = { 1: 'sin pareja, con hijos', 2: 'casado, cónyuge con pocas rentas', 3: 'otra situación familiar' };
const datos190 = (p, tr) => [
  p.nacimiento && tr('nacido en {nacimiento}', { nacimiento: p.nacimiento }),
  p.situacionFamiliar && `${tr(SITUACION_190[p.situacionFamiliar])} (${p.situacionFamiliar})${p.nifConyuge ? `, ${tr('cónyuge {nif}', { nif: p.nifConyuge })}` : ''}`,
  p.discapacidad && tr('discapacidad {n}', { n: p.discapacidad }),
  p.contrato && `${tr('contrato {n}', { n: p.contrato })}${p.contrato === 2 ? ` ${tr('(menos de un año)')}` : ''}`,
  p.movilidad && tr('movilidad geográfica'),
  p.hijos && (p.hijos.menores3.total || p.hijos.resto.total) && tr('hijos: {a} menores de 3 ({b} por entero) y {c} más ({d} por entero)', { a: p.hijos.menores3.total, b: p.hijos.menores3.porEntero, c: p.hijos.resto.total, d: p.hijos.resto.porEntero }),
].filter(Boolean);
// El número de casilla («01 · Base al 4 %») se queda y solo se traduce el texto; sinNumeros (Hacienda foral) lo quita.
const etiquetaCasilla = (t, tr, sinNumeros) => {
  const s = String(t);
  const num = /^(\d{2,3}|—) · /.exec(s)?.[0] || '';
  return `${sinNumeros ? '' : num}${tr(s.slice(num.length))}`;
};
const Casillas = async ({ filas, sinNumeros = false }) => {
  const tr = await textos();
  return <dl>{filas.filter(Boolean).map(([t, v, b]) => <div key={t} className={b ? 'fuerte' : ''}><dt>{etiquetaCasilla(t, tr, sinNumeros)}</dt><dd>{typeof v === 'number' ? eur(v) : tr(v)}</dd></div>)}</dl>;
};

export default async function Modelos({ searchParams }) {
  const tr = await textos();
  // «4T» en castellano y catalán; «Q4» en inglés.
  const tt = (n) => tr('{t}T', { t: n });
  // «enero 2026»: el mes en el idioma de la app.
  const nombreMes = (mes) => `${tr(MESES[Number(mes.slice(5, 7)) - 1])} ${mes.slice(0, 4)}`;
  const u = await requerir('resumen');
  // Sin «Contabilidad», los estados y los datos de los impuestos se ven pero no se cambian (Codex H3).
  const soloLectura = !puede(u, 'contabilidad');
  if (!redis) return <SinBD />;
  const actual = Number(hoy().slice(0, 4));
  const anio = Number((await searchParams).anio) || actual;
  // Informe de capacidad E01: el año, el anterior (tipo del IS, rendimiento previo del 130) y los bienes de inversión.
  const f = fiscalDe(u);
  const igic = usaIgic(f);
  // Navarra y el País Vasco (lib/territorios.js): su Hacienda, su sede y sus plazos.
  const foralT = esForal(f) ? datosTerritorio(f) : null;
  const terr = territorioDe(f), dForal = foralDe(f);
  const c420 = igic && usa303(f);
  // La valoración del almacén requiere el histórico completo; las retenciones se imputan al pago,
  // que puede pertenecer a otro año que la factura de proveedor.
  const [{ facturas, gastos }, nominas, empleados, productos, ajustes, albaranes, manuales, capitalLeido, recurrentes, saldo, fichasCli, fichasProv] = await Promise.all([
    datosImpuestos(u, anio), leer(u, 'nominas'), leer(u, 'empleados'), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes'), leer(u, 'asientos'), leer(u, 'capital'),
    anio === actual ? leer(u, 'recurrentes') : null, anio === actual ? redis.get(clave(u, 'saldo')) : null,
    // Las fichas solo hacen falta para el 232 (la vinculación marcada en cada una): no se leen en un autónomo.
    f.tipo === 'sociedad' ? leer(u, 'clientes') : null, f.tipo === 'sociedad' ? leer(u, 'fichasProv') : null,
  ]);
  const capital = capitalLeido || [];
  const h = hoy();
  const iva = ajustesIva(u);
  const liquidaciones = c420 ? liquidaciones420(facturas, gastos, anio, iva) : liquidaciones303(facturas, gastos, anio, undefined, iva);
  const m425 = c420 && modelo425(facturas, gastos, anio, iva);
  // Se enseña cada modelo si le toca por su situación fiscal o si ya hay datos que lo piden.
  const hay115 = f.alquiler || gastos.some((g) => g.alquiler);
  // 309: sin 303 (exento, recargo, agricultura), el IVA de las compras a la UE o con inversión del sujeto pasivo del año.
  const hay309 = !igic && !usa303(f) && gastos.some((g) => g.fecha.startsWith(`${anio}-`) && origenGasto(g));
  const m309 = (t) => modelo309(gastos, anio, t, { regimen: f.iva });
  const m349anio = modelo349(facturas, anio, undefined, gastos);
  const hay349 = !igic && (f.intracom || m349anio.total > 0 || m349anio.rectificaciones.length > 0);
  // Ventanilla única (369) y dividendos e intereses (123 y 193): si la empresa los tiene marcados o ya hay datos del año.
  const hay369 = !igic && ((usa303(f) && f.oss) || facturas.some((x) => x.oss && x.fecha.startsWith(`${anio}-`)));
  const capitalAnio = capital.filter((p) => p.fecha.startsWith(`${anio}-`)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hay123 = Boolean(f.capital) || capitalAnio.length > 0;
  const m193 = hay123 && modelo193(capital, anio);
  const m390 = !igic && usa303(f) && !(dForal && !dForal.ivaAnual) && modelo390(facturas, gastos, anio, iva);
  const conRetencion = gastos.some((g) => Number(g.irpfPct) > 0);
  const m190 = (f.trabajadores || nominas?.length > 0 || conRetencion) && modelo190(nominas || [], empleados || [], anio, gastos);
  // Sin el permiso «Nóminas», lo de cada trabajador no se ve: una línea con todos (los profesionales sí, son facturas).
  if (m190 && !puede(u, 'nominas')) {
    const juntos = (clave, uno, varios) => {
      const l = m190.perceptores.filter((p) => p.clave === clave);
      const suma = (k) => r2(l.reduce((s, p) => s + (p[k] || 0), 0));
      return l.length ? [{ nombre: `${l.length} ${tr(l.length === 1 ? uno : varios)}`, nif: '', clave, subclave: '', percepciones: suma('percepciones'), retenciones: suma('retenciones'), ...(l.some((p) => 'gastosDeducibles' in p) ? { gastosDeducibles: suma('gastosDeducibles') } : {}) }] : [];
    };
    m190.perceptores = [...juntos('A', 'trabajador', 'trabajadores'), ...juntos('E', 'administrador', 'administradores'), ...juntos('L', 'indemnización exenta', 'indemnizaciones exentas'), ...m190.perceptores.filter((p) => !['A', 'E', 'L'].includes(p.clave))];
  }
  // Impuesto sobre Sociedades: con las bases negativas de antes de Fisquo y el incremento de los fondos propios apuntados.
  const opIS = { ivaCoste: !usa303(f), iva, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [], manuales: manuales || [], capital, constitucion: f.constitucion, cuotaIS: u.cuotaIS || {}, territorio: f.territorio, binsPrevias: u.binsPrevias || {}, fondosPropios: u.fondosPropios || {}, deduccionesIS: u.deduccionesIS || [], pagos202: u.pagos202 || {} };
  const is = f.tipo === 'sociedad' && borradorSociedades(facturas, gastos, anio, { ...opIS, hasta: h < `${anio}-12-31` ? h : `${anio}-12-31` });
  // Hubo algo que restar de la cuota íntegra: la tabla separa entonces la cuota íntegra de la líquida.
  const conDeducciones = Boolean(is) && (is.ddi > 0 || is.bonificaciones > 0 || is.donativos > 0 || is.deduccionesCapIV > 0);
  // 202: con más de 6 M de cifra de negocios, el del art. 40.3 (sobre la base de los 3, 9 y 11 primeros meses); si no, el
  // del art. 40.2 (el 18 % de la cuota apuntada). Lo que sale del borrador de cada año en Fisquo se propone como esa cuota.
  const pagos202 = f.tipo === 'sociedad' && !dForal ? (is.obligado403 ? modelo202Art403(facturas, gastos, anio, opIS) : modelo202(u.cuotaIS, anio)) : null;
  const cuotaSugerida = (y) => (f.tipo === 'sociedad' && !dForal && [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`)) ? borradorSociedades(facturas, gastos, y, opIS).cuotaEjercicio : null);
  const renta = f.tipo === 'autonomo' && !dForal && borradorRenta(facturas, gastos, anio, u.pagos130?.[anio], { ivaCoste: !usa303(f), personal: f.renta || {}, iva, rendimientos: u.rend130 || {}, normal: f.irpf === 'normal' });
  const m180 = hay115 && modelo180(gastos, anio);
  // No residentes (216 y 296): si hay gastos marcados «no reside en España» (lib/noResidentes.js).
  const hay216 = gastos.some((g) => g.noResidente);
  const m296 = hay216 && modelo296(gastos, anio);
  const m347 = modelo347(facturas, gastos, anio, { recc: iva.recc });
  // 232: operaciones con los terceros marcados como vinculados en su ficha y operaciones con paraísos fiscales.
  const m232 = f.tipo === 'sociedad' && modelo232(facturas, gastos, anio, { clientes: fichasCli || [], proveedores: fichasProv || [] });
  const c303 = !igic && usa303(f);
  const ids = actividadesDe(u).map((a) => a.id);
  const rendAnterior = u.rend130?.[anio - 1];
  const r130 = usa130(f) && !dForal && resumenAnual(facturas, gastos, anio, u.pagos130?.[anio] || {}, ids, { ivaCoste: !usa303(f), hasta: h < `${anio}-12-31` ? h : `${anio}-12-31`, ...opciones130(f, u.rend130, anio), iva });
  // Pago fraccionado del IRPF foral (lib/territorios.js): su cálculo y sus plazos; en Álava lo liquida la Diputación.
  const pf = usa130(f) && dForal && pagosIrpfForal(f, { facturas, gastos, anio, rend130: u.rend130 || {}, actividades: ids, ivaCoste: !usa303(f), iva });
  const pfPresenta = Boolean(pf?.pagos) && !pf.deOficio;
  // Lo que Fisquo sabe del año anterior, como sugerencia (si ese año no está entero en Fisquo, no vale: lo confirma la persona).
  const conAnterior = usa130(f) && facturas.some((x) => x.fecha.startsWith(`${anio - 1}-`));
  const sugerido = conAnterior ? resumenAnual(facturas, gastos, anio - 1, {}, ids, { ivaCoste: !usa303(f), ...opciones130(f, u.rend130, anio - 1, false), iva }).trimestres[3].rendAcum : null;
  // Módulos (lib/estimacionObjetiva.js): el 131 y, en el régimen simplificado, el 303 salen de los datos de cada actividad.
  const c131 = usa131(f), cSimp = usaSimplificado(f);
  const modAnio = u.modulos?.[anio] || {};
  const r131 = c131 && modelos131({ modulos: modAnio, facturas, rendAnterior, vivienda: Boolean(f.renta?.vivienda) }, anio);
  const simp = cSimp && T.map((t) => simplificado({ modulos: modAnio, gastos, anio, t }));
  // El 303 y el 130 se marcan como presentados cada uno por su cuenta; el trimestre está hecho cuando lo están los dos.
  const p303 = (t, y = anio) => hecho303(u.pres303, u.pagos130, y, t);
  const p130 = (t, y = anio) => hecho130(u.pagos130, y, t);
  const p131 = (t, y = anio) => u.pagos131?.[y]?.[t] !== undefined && u.pagos131?.[y]?.[t] !== null;
  const presentado = (t, y = anio) => (!(c303 || c420 || cSimp) || p303(t, y)) && (!(r130 || pfPresenta) || p130(t, y)) && (!c131 || p131(t, y));
  const hay111 = f.trabajadores || nominas?.length > 0 || conRetencion;
  // Estado de cada trimestre del 303/130 según la fecha de hoy (en curso, listo para presentar o fuera de plazo).
  const situacion = (t) => (dForal ? situacionForal(terr, 'iva', t, anio, h) : situacionTrimestre(t, anio, h));
  // Fecha límite real en texto (pasa al lunes si cae en fin de semana); con el año en el 4T y si no es el actual.
  const conAnio = (l, t) => fechaTexto(l) + (t === 4 || Number(l.slice(0, 4)) !== actual ? ` de ${l.slice(0, 4)}` : '');
  const limite = (t) => conAnio(dForal ? plazoForal(terr, 'iva', t, anio) : limiteTrimestre(t, anio), t);
  // Plazos anuales del año siguiente (390, 347, 180, 190, 193, 200): último día, pasado al día hábil si cae en fin de semana o festivo.
  const plazoAnual = (mesDia) => conAnio(habil(`${anio + 1}-${mesDia}`), 4);
  const finFebrero = new Date(Date.UTC(anio + 1, 2, 0)).toISOString().slice(5, 10);
  // Territorio foral: el pago fraccionado (irpf) y las retenciones (ret) tienen sus propios plazos; dia 20 son las retenciones.
  const fechaLimite = (t, dia = 30) => (dForal ? plazoForal(terr, dia === 20 ? 'ret' : 'iva', t, anio) : limiteTrimestre(t, anio, dia));
  const plazoT = (t, dia = 30) => conAnio(fechaLimite(t, dia), t);
  const limiteIrpf = (t) => conAnio(plazoForal(terr, 'irpf', t, anio), t);
  // Hasta cuándo se puede domiciliar el pago del trimestre que toca (AEAT, lib/domiciliacion.js; ni foral ni IGIC): el 303
  // y el 130 por un lado y, en el 4T, el 111, el 115 y el 123, que acaban antes, por otro.
  const domiciliarAhora = (importes) => {
    if (dForal || igic || !importes.some((m) => m.importe > 0 && conPagoDomiciliable(m.num))) return '';
    const dia = (d) => conAnio(finDomiciliacion(fechaLimite(tAhora, d)), tAhora);
    const antes = importes.filter((m) => m.dia === 20 && m.importe > 0).map((m) => m.num);
    return tAhora === 4 && antes.length ? tr('Si domicilias el pago, hasta el {d}; {n}, hasta el {e}.', { d: tr(dia(30)), n: antes.map((m) => tr('el {modelo}', { modelo: m })).join(', '), e: tr(dia(20)) }) : tr('Si domicilias el pago, hasta el {d}.', { d: tr(dia(30)) });
  };
  const situacionIrpf = (t) => situacionForal(terr, 'irpf', t, anio, h);

  // Fila plegada de cada modelo en el móvil: el trimestre que toca, cómo va y su importe.
  // 303 y 130: el primer trimestre cerrado sin presentar (listo o fuera de plazo); si no hay, el que está en curso.
  // Un trimestre ya vencido sin nada apuntado en Fisquo (por ejemplo, anterior a empezar a usarlo) no se señala como
  // «fuera de plazo»: no hay con qué calcularlo y una cuenta nueva lo veía en rojo (auditoría 23-10-2026).
  const conDatos = (t) => [...facturas, ...gastos].some((d) => String(d.fecha || '').startsWith(`${anio}-`) && Math.ceil(Number(d.fecha.slice(5, 7)) / 3) === t);
  const tRef = (hecho) => T.find((t) => !hecho(t) && situacion(t).estado !== 'curso' && (situacion(t).estado !== 'fuera' || conDatos(t))) ?? T.find((t) => !hecho(t) && situacion(t).estado === 'curso');
  // Estado corto para la fila (la tarjeta del trimestre ya lleva el texto entero).
  const corto = ({ estado, dias }, fecha) => (estado === 'fuera' ? tr('fuera de plazo · venció el {fecha}', { fecha: tr(fecha) })
    : `${tr(estado === 'curso' ? 'en curso' : 'toca presentarlo')} · ${estado === 'listo' && dias === 0 ? tr('hoy es el último día') : estado === 'listo' && dias === 1 ? tr('hasta mañana') : tr('hasta el {fecha}', { fecha: tr(fecha) })}`);
  const filaTrim = (t, extra) => {
    if (!t) return { estado: 'hecho', detalle: tr('Todos los trimestres presentados') };
    const s = situacion(t);
    return { estado: s.estado === 'curso' ? undefined : s.estado, parcial: s.estado === 'curso', detalle: `${tt(t)}${extra ? ` · ${tr(extra)}` : ''} · ${corto(s, limite(t))}` };
  };
  // 111, 115 y 349: el trimestre del próximo plazo; en un año ya pasado, el total (el 111 y el 115 se marcan en cada tarjeta).
  // `vacio`: texto para un trimestre sin nada que presentar (sin color de aviso).
  const tPlazo = (dia) => T.find((t) => fechaLimite(t, dia) >= h);
  const filaPlazo = (t, dia, extra, vacio) => {
    if (!t) return { detalle: tr('Total del año') };
    if (vacio) return { detalle: `${tt(t)} · ${tr(vacio)}` };
    const s = { estado: situacion(t).estado === 'curso' ? 'curso' : 'listo', dias: Math.round((Date.parse(`${fechaLimite(t, dia)}T12:00:00Z`) - Date.parse(`${h}T12:00:00Z`)) / 864e5) };
    return { estado: s.estado === 'curso' ? undefined : 'listo', parcial: s.estado === 'curso', detalle: `${tt(t)}${extra ? ` · ${tr(extra)}` : ''} · ${corto(s, plazoT(t, dia))}` };
  };
  const importeFila = (v) => (v ? eur(v) : undefined);
  // Modelos anuales del año en curso: lo que enseñan es lo apuntado hasta hoy, no el año entero (auditoría D4-07).
  const notaHastaHoy = anio === actual ? ` ${tr('Con lo apuntado hasta hoy: el año aún no ha terminado.')}` : '';

  // Trimestre que toca presentar ya: el primero listo (cerrado y dentro de plazo) que aún no está marcado como presentado.
  const tAhora = (c303 || c420 || r130 || pfPresenta || c131 || cSimp) ? T.find((t) => !presentado(t) && (situacion(t).estado === 'listo' || (c420 && !p303(t) && situacionTrimestre(t, anio, h, 31).estado === 'listo'))) : undefined;
  // «Toca presentar» en territorio foral: los números de su Hacienda y el plazo de cada modelo.
  const foralizar = (m, t) => {
    const num = { 303: t === 4 && dForal.iva.cuarto ? dForal.iva.cuarto : dForal.iva.num, 111: dForal.ret.num, 115: dForal.ret.alquiler }[m.num] || m.num;
    const plazo = m.num === '130' ? limiteIrpf(t) : ['111', '115', '123', '216'].includes(m.num) ? plazoT(t, 20) : m.num === '303' ? limite(t) : m.plazo;
    return { ...m, num, modelo: String(m.modelo).replace(m.num, num), ...(plazo ? { plazo } : {}) };
  };
  let ahora = null;
  if (tAhora) {
    const c = c303 && casillas303(facturas, gastos, anio, tAhora, iva);
    const m303 = c ? (c['46'] < 0 ? { importe: 0, compensar: -c['46'] } : { importe: liquidaciones[tAhora - 1].ingresar })
      : simp ? (simp[tAhora - 1].resultado < 0 ? { importe: 0, compensar: -simp[tAhora - 1].resultado } : { importe: simp[tAhora - 1].resultado }) : null;
    const l420 = c420 && !p303(tAhora) && liquidaciones[tAhora - 1];
    const m130 = r130 ? { importe: r130.trimestres[tAhora - 1].m130 } : pfPresenta ? { importe: pf.pagos[tAhora - 1] ?? 0 } : null;
    const m131 = r131 && { importe: Math.max(0, r131[tAhora - 1]['15']) };
    // Con el 303 y el 130, el resto de modelos que vencen a la vez (111, 115, 349 y el 202 de abril u octubre).
    const importes = modelosAPresentar(tAhora, {
      m303, m130, m131,
      m111: hay111 && !marcaRet(u.pres111, anio, tAhora) ? r2(modelo111(nominas || [], anio, tAhora).retenciones + retencionesProfesionales(gastos, anio, tAhora).retenciones) : null,
      negativa111: modelo111(nominas || [], anio, tAhora).perceptores > 0,
      m115: hay115 && !marcaRet(u.pres115, anio, tAhora) ? modelo115(gastos, anio, tAhora).retenciones : null,
      m123: hay123 && !u.pres123?.[anio]?.[tAhora] ? modelo123(capital, anio, tAhora).retenciones : null,
      m216: hay216 && !u.pres216?.[anio]?.[tAhora] ? modelo216(gastos, anio, tAhora).retenciones : null,
      negativa216: modelo216(gastos, anio, tAhora).negativa,
      m349: hay349 ? modelo349(facturas, anio, tAhora, gastos) : null,
      m309: hay309 ? m309(tAhora).ingresar : null,
      pagos202, pagados202: u.pagos202?.[anio], constitucion: f.constitucion,
    }).map((m) => ({ ...m, ...(foralT ? { aeat: foralT.sede, sede: foralT.hacienda } : { aeat: AEAT[`m${m.num}`] }), ...(m.dia ? { plazo: plazoT(tAhora, m.dia) } : {}) })).map((m) => (dForal ? foralizar(m, tAhora) : m));
    if (l420) importes.unshift({ num: '420', modelo: '420 · IGIC', href: '#m420', texto: l420['45'] < 0 ? `A compensar ${eur(-l420['45'])}` : `A ingresar ${eur(l420.ingresar)}`, importe: l420.ingresar, aeat: SEDE_ATC, sede: 'ATC', plazo: fechaTexto(plazo420(anio, tAhora)) });
    ahora = (
      <PresentarAhora t={tAhora} anio={anio} hacienda={foralT?.hacienda}
        aviso={textoSituacion(situacion(tAhora), limite(tAhora))}
        domiciliar={domiciliarAhora(importes)}
        importes={importes}
        texto={igic || dForal ? [`${tAhora}T ${anio}`, ...importes.map((m) => `${m.modelo}: ${m.texto}${m.plazo ? ` · hasta el ${m.plazo}` : ''}`)].join('\n') : textoResumenModelos({ t: tAhora, anio, plazo: limite(tAhora), m303, m130, otros: importes.filter((m) => !['303', '130'].includes(m.num)) })} />
    );
  } else if ((c303 || c420 || r130 || pfPresenta || c131 || cSimp) && anio === actual) {
    // En enero toca el 4T del año anterior, que no sale en la vista del año en curso: aviso con enlace a ese año.
    const s4 = dForal ? situacionForal(terr, 'iva', 4, anio - 1, h) : situacionTrimestre(4, anio - 1, h, c420 ? 31 : 30);
    const l4 = dForal ? plazoForal(terr, 'iva', 4, anio - 1) : limiteTrimestre(4, anio - 1, c420 ? 31 : 30);
    if (!presentado(4, anio - 1) && s4.estado === 'listo') {
      ahora = (
        <section className="bloque presentar-ahora" aria-labelledby="presentar-t">
          <h2 className="grupo-t" id="presentar-t">{tr('Toca presentar el {t}T {anio}', { t: 4, anio: anio - 1 })}</h2>
          <div className="tarjeta">
            <p className="presentar-plazo">{tr(textoSituacion(s4, `${fechaTexto(l4)} de ${l4.slice(0, 4)}`))}</p>
            <div className="presentar-acc"><Ir href={`/modelos?anio=${anio - 1}`} className="boton">{tr('Ver importes y pasos del 4T')}</Ir></div>
          </div>
        </section>
      );
    }
  }

  // Lo próximo (auditoría D4-06 y D4-07): sin un trimestre que presentar ya, los siguientes pagos a Hacienda por fecha, con
  // lo que prevé Tesorería (el trimestre en curso, estimado con lo apuntado hasta hoy). El panel ya calculado se reutiliza.
  const proximos = !ahora && anio === actual
    ? ((await panelDe(u, { anio, hoy: h, recurrentes: recurrentes || [], nominas: nominas || [], saldo })).teso?.movimientos || []).filter((m) => m.tipo === 'hacienda' && !m.vencido && m.importe < 0).slice(0, 4)
    : [];

  // Casos que Fisquo no resuelve solo (lib/revisionFiscal.js): presentar algo aparte o revisar antes del 4T.
  const a111 = (t) => r2(modelo111(nominas || [], anio, t).retenciones + retencionesProfesionales(gastos, anio, t).retenciones);
  const avisos = avisosFiscales({ facturas, gastos, anio, hoy: h, c303, c130: Boolean(r130), retenidas: f.tipo === 'autonomo' && !usa131(f) && !dForal ? Boolean(f.retenidas) : null, liquidaciones, r130, pagos130: u.pagos130?.[anio] || {}, a111: hay111 ? a111 : null });
  // Prorrata: se enseña si hay operaciones exentas este año o el anterior, o si se ha guardado un porcentaje.
  const prorrata = c303 && { especial: Boolean(u.prorrata?.especial?.[anio]), guardado: u.prorrata?.[anio] ?? null, provisional: prorrataProvisional(facturas, anio, 4, iva), definitiva: prorrataAnio(facturas, anio), anterior: prorrataAnio(facturas, anio - 1) };
  const verProrrata = prorrata && (prorrata.guardado !== null || prorrata.definitiva !== null || prorrata.anterior !== null);
  // Saldo del IVA de antes de Fisquo: en el primer año con datos o en el que empieza a descontarse el ya guardado.
  const primerAnio = [...facturas, ...gastos].reduce((min, x) => Math.min(min, Number(x.fecha.slice(0, 4)) || min), anio);
  const verSaldoIva = c303 && !dForal && (u.saldoIva ? anio === u.saldoIva.anio + (u.saldoIva.t === 4 ? 1 : 0) : anio <= primerAnio);

  return (
    <main className="pagina mk-look modelos">
      <Volver href="/">{tr('Resumen')}</Volver>
      <header className="cabecera modelos-cab">
        <h1 className="titulo">{tr('Impuestos')}</h1>
        <nav className="anios" aria-label={tr('Año')}>
          <Ir href={`/modelos?anio=${anio - 1}`} tipo="cifras" aria-label={tr('Año anterior')}>‹</Ir>
          <strong>{anio}</strong>
          {anio < actual ? <Ir href={`/modelos?anio=${anio + 1}`} tipo="cifras" aria-label={tr('Año siguiente')}>›</Ir> : <span className="off">›</span>}
        </nav>
      </header>
      {/* A la gestoría, dentro de un cliente, no se le pide que lo revise «con tu gestor» */}
      <p className="grupo-pie arriba">{u.viaDespacho ? tr('Calculados con lo que ha apuntado en Fisquo hasta hoy.') : tr('Calculados con lo que hay en Fisquo. Son orientativos: revísalos con tu gestor antes de presentarlos.')}</p>
      <AvisoHaciendaForal fiscal={f} />

      {ahora}

      {proximos.length > 0 && (
        <section className="bloque" aria-labelledby="proximo-t">
          <h2 className="grupo-t" id="proximo-t">{tr('Lo próximo')}</h2>
          <ul className="grupo-lista proximos">
            {proximos.map((m) => (
              <li key={`${m.fecha}-${m.concepto}`}><div className="fila">
                <span className="txt"><strong>{tr(m.concepto)}</strong><small>{tr('Hasta el {fecha}', { fecha: tr(`${fechaTexto(m.fecha)}${m.fecha.slice(0, 4) !== String(anio) ? ` de ${m.fecha.slice(0, 4)}` : ''}`) })}{m.estimado ? ` · ${tr('previsión del trimestre')}` : ''}{!dForal && !igic && conPagoDomiciliable(m.concepto) && finDomiciliacion(m.fecha) >= h ? ` · ${tr('domiciliado, hasta el {fecha}', { fecha: tr(fechaTexto(finDomiciliacion(m.fecha))) })}` : ''}</small></span>
                <span className="imp">{eur(-m.importe)}</span>
              </div></li>
            ))}
          </ul>
        </section>
      )}

      {!facturas.length && !gastos.length && !nominas?.length && !capitalAnio.length && (
        <Vacio icono="hacienda" titulo={tr('Aún no hay nada que declarar en {anio}', { anio })}
          accion={puede(u, 'facturar') && { href: '/facturas/nueva', texto: tr('Nueva factura') }} secundaria={puede(u, 'gastar') && { href: '/gastos#apuntar-gasto', texto: tr('Añadir gasto') }}>
          {tr('Fisquo calcula los modelos con tus facturas y gastos. Cuando apuntes los primeros, verás aquí cuánto toca ingresar cada trimestre. Abajo tienes qué modelos te tocan y sus plazos.')}
        </Vacio>
      )}

      {avisos.length > 0 && (
        <section className="bloque" aria-labelledby="revisar-t">
          <h2 className="grupo-t" id="revisar-t">{tr('Para revisar')}</h2>
          <ul className="tarjeta avisos-fiscales">
            {avisos.map((a) => <li key={a.id}>{tr(a.texto)}{a.href && <> <Ir href={a.href}>{tr('Ver')}</Ir></>}</li>)}
          </ul>
        </section>
      )}

      <ModeloPlegable id="calendario" num={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>}
        nombre={tr('Qué presentas y cuándo')} detalle={tr('{n} modelos y plazos según cómo trabajas', { n: modelosDe({ ...f, intracom: hay349, trabajadores: f.trabajadores || hay111, alquiler: f.alquiler || hay115, noResidentes: hay216 }).length })}>
        <h2 className="grupo-t">{tr('Qué presentas y cuándo')}</h2>
        <div className="grupo-c">
          {modelosDe({ ...f, intracom: hay349, trabajadores: f.trabajadores || hay111, alquiler: f.alquiler || hay115, noResidentes: hay216 }).map((m) => <div key={m.id} className="celda"><span className="modelo-num">{GLOSARIO[`m${m.id}`] ? <Termino id={`m${m.id}`}>{m.num || m.id}</Termino> : m.num || m.id}</span><span className="txt">{tr(m.nombre)}<small>{tr(m.cuando)}</small></span></div>)}
        </div>
        <p className="grupo-pie">{tr('Según cómo trabajas ({tipo}). Si algo no encaja, cámbialo en Ajustes › Actividades e impuestos.', { tipo: tr(f.tipo === 'sociedad' ? 'sociedad' : 'autónomo') })}</p>
        <CalendarioFiscal ruta={u.calendario ? `/api/calendario/${u.calendario}.ics` : null} />
      </ModeloPlegable>

      {c420 && (
        <ModeloPlegable id="m420" num="420" nombre={tr('IGIC trimestral')} detalle={tr('Cuatro autoliquidaciones del año')}>
          <h2 className="grupo-t">420 · {tr('IGIC trimestral')}</h2>
          <p className="grupo-pie arriba">{tr('El IGIC de tus facturas menos el deducible de tus gastos, con las cuotas pendientes de compensar. En el 4T puedes pedir la devolución del saldo a tu favor.')}</p>
          <div className="tarjetas">
            {liquidaciones.map((c) => {
              const t = c.t;
              return <div key={t} className="tarjeta"><h3>{tt(t)} {anio}</h3>
                <Importe texto={c.devolucion ? 'A devolver' : c['45'] < 0 ? 'A compensar' : 'A ingresar'} v={c.devolucion || (c['45'] < 0 ? -c['45'] : c.ingresar)} />
                <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0')).filter((k) => c[k] !== 0).map((k) => [`${k} · ${ETIQUETAS420[k]}`, [2, 5, 8, 11, 14, 17].includes(Number(k)) ? `${String(c[k]).replace('.', ',')} %` : c[k], ['25', '40', '45'].includes(k)])} /></Plegable>
                {c.demasiadosTipos && <p className="nota">{tr('Hay más de seis tipos. Revisa cómo declarar los tipos restantes con tu gestor: {lista}.', { lista: c.otros.map((d) => tr('{pct}: base {base}, cuota {cuota}', { pct: pctCorto(d.pct), base: eur(d.base), cuota: eur(d.cuota) })).join('; ') })}</p>}
                <p className="nota">{tr('Hasta el {fecha}.', { fecha: tr(`${fechaTexto(plazo420(anio, t))}${t === 4 ? ` de ${anio + 1}` : ''}`) })}</p>
                <p className="descargas"><a href={SEDE_ATC} target="_blank" rel="noopener noreferrer">{tr('Abrir la Sede de la Agencia Tributaria Canaria')}</a></p>
                <Presentado soloLectura={soloLectura} modelo="420" anio={anio} t={t} importe={0} pagado={t === 4 && u.pres303?.[anio]?.[4] === 'devolucion' ? 'devolucion' : p303(t)} con130={false} situacion={situacionTrimestre(t, anio, h, 31)} plazo={fechaTexto(plazo420(anio, t))} devolucion={t === 4 && (c.pendiente > 0 || c.devolucion > 0)} />
              </div>;
            })}
          </div>
        </ModeloPlegable>
      )}

      {c303 && (() => {
        const t = tRef(p303); const c = t && casillas303(facturas, gastos, anio, t, iva); const comp = c && c['46'] < 0;
        return (
        <ModeloPlegable id="m303" num={dForal ? dForal.iva.num : '303'} nombre={tr('IVA trimestral')} {...filaTrim(t, comp && 'a compensar')} favor={comp}
          dato={c && importeFila(comp ? -c['46'] : liquidaciones[t - 1].ingresar)}>
          <h2 className="grupo-t">{dForal ? dForal.iva.num : '303'} · {tr('IVA trimestral')}</h2>
          <p className="grupo-pie arriba">{tr('El IVA de tus facturas menos el de tus gastos. Si sale negativo, se compensa en los trimestres siguientes (durante cuatro años como máximo) o, en el 4T, puedes pedir que te lo devuelvan.')}</p>
          {verProrrata && <Prorrata soloLectura={soloLectura} anio={anio} {...prorrata} titulo={<Termino id="prorrata">{tr('Prorrata del IVA')}</Termino>} />}
          {verSaldoIva && <SaldoIva soloLectura={soloLectura} anio={anio} valor={u.saldoIva || null} />}
          {iva.recc && (() => {
            const corte = anio < actual ? `${anio}-12-31` : h;
            const pendiente = pendienteCaja(facturas, iva.recc, corte);
            return <p className="nota bloque">{tr('Estás en el')} <strong>{tr('criterio de caja')}</strong> {iva.recc.hasta ? tr('desde el {desde} hasta el {hasta}', { desde: tr(fechaTexto(iva.recc.desde)), hasta: tr(fechaTexto(iva.recc.hasta)) }) : tr('desde el {desde}', { desde: tr(fechaTexto(iva.recc.desde)) })}: {tr('el IVA de tus facturas cuenta en el trimestre en que las cobras y el de tus gastos, en el que los pagas (o el 31 de diciembre del año siguiente, si para entonces no se ha cobrado o pagado).')} {pendiente > 0 ? tr('IVA de facturas aún sin cobrar: {importe}.', { importe: eur(pendiente) }) : ''} {tr('Las casillas 62-63 y 74-75 recogen lo facturado y comprado en el trimestre, se cobre o no.')}</p>;
          })()}
          <div className="tarjetas">
            {T.map((t) => { const c = casillas303(facturas, gastos, anio, t, iva); return (
              <div key={t} className="tarjeta"><h3>{tt(t)} {anio}</h3>
                {liquidaciones[t - 1].devolucion > 0 ? <Importe texto="A devolver" v={liquidaciones[t - 1].devolucion} /> : c['46'] < 0 ? <Importe texto="A compensar" v={-c['46']} /> : <Importe texto="A ingresar" v={liquidaciones[t - 1].ingresar} />}
                {dForal && t === 4 && <p className="nota">{dForal.iva.cuarto ? tr('El 4T no se presenta aparte: va en el {num}, la autoliquidación final del año, hasta el {plazo}.', { num: dForal.iva.cuarto, plazo: tr(limite(4)) }) : tr('Con la del 4T va la declaración-resumen anual del IVA.')}</p>}
                <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={[
                  // En el orden del formulario de 2026 (diseño DR303e26v101): devengado, deducible, resultado y liquidación.
                  c['01'] && ['01 · Base al 4 %', c['01']], c['03'] && ['03 · Cuota al 4 %', c['03']],
                  c['04'] && ['04 · Base al 10 %', c['04']], c['06'] && ['06 · Cuota al 10 %', c['06']],
                  ['07 · Base al 21 %', c['07']], ['09 · Cuota al 21 %', c['09']],
                  ...c.otros.flatMap((o) => [[`— · Base al ${pctCorto(o.pct)} (revisar casilla)`, o.base], [`— · Cuota al ${pctCorto(o.pct)} (revisar casilla)`, o.iva]]),
                  c['10'] && ['10 · Compras a la UE (adquisiciones intracomunitarias): base', c['10']], c['11'] && ['11 · Compras a la UE: cuota', c['11']],
                  c['12'] && ['12 · Inversión del sujeto pasivo (servicios de fuera de la UE y otras): base', c['12']], c['13'] && ['13 · Inversión del sujeto pasivo: cuota', c['13']],
                  c['14'] && ['14 · Rectificativas: base', c['14']], c['15'] && ['15 · Rectificativas: cuota', c['15']],
                  ...[['168', '170', '0,5'], ['19', '21', '1,4'], ['22', '24', '5,2']].flatMap(([b, q, r]) => (c[b] ? [[`${b} · Recargo de equivalencia ${r} %: base`, c[b]], [`${q} · Recargo de equivalencia ${r} %: cuota`, c[q]]] : [])),
                  ...(c.reOtros || []).flatMap((o) => [[`— · Recargo ${String(o.re).replace('.', ',')} %: base (revisar casilla)`, o.base], [`— · Recargo ${String(o.re).replace('.', ',')} %: cuota (revisar casilla)`, o.recargo]]),
                  c['25'] && ['25 · Recargo de rectificativas: base', c['25']], c['26'] && ['26 · Recargo de rectificativas: cuota', c['26']],
                  ['27 · Total IVA devengado', c['27'], true],
                  ['28 · Base del IVA soportado', c['28']], ['29 · IVA soportado deducible', c['29']],
                  c['30'] && ['30 · Bienes de inversión: base', c['30']], c['31'] && ['31 · Bienes de inversión: cuota', c['31']],
                  c['32'] && ['32 · Importaciones (IVA pagado en la aduana): base', c['32']], c['33'] && ['33 · Importaciones: cuota deducible', c['33']],
                  c['34'] && ['34 · Importaciones de bienes de inversión: base', c['34']], c['35'] && ['35 · Importaciones de bienes de inversión: cuota', c['35']],
                  c['36'] && ['36 · Compras a la UE: base deducible', c['36']], c['37'] && ['37 · Compras a la UE: cuota deducible', c['37']],
                  c['38'] && ['38 · Bienes de inversión de la UE: base', c['38']], c['39'] && ['39 · Bienes de inversión de la UE: cuota', c['39']],
                  c['40'] && ['40 · Rectificativas de proveedores: base', c['40']], c['41'] && ['41 · Rectificativas de proveedores: cuota', c['41']],
                  c['42'] && ['42 · Compensaciones del régimen agrario', c['42']],
                  c.prorrata && [c.prorrata.especial ? 'Prorrata especial aplicada a lo común' : 'Prorrata aplicada', `${c.prorrata.provisional} %`],
                  c['44'] && [`44 · Regularización de la prorrata (definitiva: ${c.prorrata.definitiva} %)`, c['44']],
                  ['45 · Total a deducir', c['45'], true],
                  ['46 · Resultado del régimen general', c['46'], true],
                  c['59'] && ['59 · Ventas y servicios a empresas de la UE (intracomunitarias)', c['59']],
                  c['60'] && ['60 · Exportaciones', c['60']],
                  c['120'] && ['120 · Servicios no sujetos por localizarse fuera de España', c['120']],
                  c['122'] && ['122 · Ventas con inversión del sujeto pasivo (lo declara el cliente)', c['122']],
                  c['123'] && ['123 · Ventas de la ventanilla única (van en el 369)', c['123']],
                  c['62'] && ['62 · Criterio de caja: base de lo facturado', c['62']], c['63'] && ['63 · Criterio de caja: cuota de lo facturado', c['63']],
                  c['74'] && ['74 · Criterio de caja: base de lo comprado', c['74']], c['75'] && ['75 · Criterio de caja: cuota de lo comprado', c['75']],
                  liquidaciones[t - 1].anterior > 0 && ['110 · A compensar de trimestres anteriores', liquidaciones[t - 1].anterior],
                  liquidaciones[t - 1].compensado > 0 && ['78 · Aplicado en este trimestre', menos(liquidaciones[t - 1].compensado)],
                  liquidaciones[t - 1].anterior > 0 && !liquidaciones[t - 1].devolucion && ['87 · Sigue a tu favor para más adelante', r2(liquidaciones[t - 1].anterior - liquidaciones[t - 1].compensado)],
                  liquidaciones[t - 1].devolucion > 0 ? ['71 · A devolver (todo el saldo a tu favor)', liquidaciones[t - 1].devolucion, true]
                    : c['46'] < 0 ? ['71 · Resultado: a compensar en los próximos trimestres', c['46'], true]
                    : ['71 · Resultado: a ingresar', liquidaciones[t - 1].ingresar, true],
                ]} /></Plegable>
                {t === 4 && liquidaciones[3].pendiente > 0 && <p className="nota">{tr('Te quedan {importe} a tu favor: puedes compensarlos en {anio} y siguientes o pedir que te los devuelvan (al marcarlo como presentado, elige «pido la devolución»).', { importe: eur(liquidaciones[3].pendiente), anio: anio + 1 })}</p>}
                {p303(t) && <EmitidasDespues facturas={emitidasDespues(facturas, anio, t, iva.recc)} />}
                {p303(t) && !foralT && <RectificativaIva anio={anio} t={t} c69={r2(c['46'] - (liquidaciones[t - 1].compensado || 0))} abierta={emitidasDespues(facturas, anio, t, iva.recc).length > 0} />}
                <Fichero foral={foralT} modelo="303" anio={anio} t={t} nif={u.emisor?.nif} aeat={AEAT.m303} aviso={c.otros.length > 0 && 'Con tipos de IVA distintos del 4, 10 y 21 % rellénalo a mano en la Sede.'} />
                <Presentado soloLectura={soloLectura} modelo="303" anio={anio} t={t} importe={0} pagado={t === 4 && u.pres303?.[anio]?.[4] === 'devolucion' ? 'devolucion' : p303(t)} con130={false} situacion={situacion(t)} plazo={limite(t)} devolucion={t === 4 && (liquidaciones[3].pendiente > 0 || liquidaciones[3].devolucion > 0)} />
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {r130 && (() => {
        const t = tRef(p130);
        return (
        <ModeloPlegable id="m130" num="130" nombre={tr('Pago a cuenta del IRPF')} {...filaTrim(t)} dato={t && importeFila(r130.trimestres[t - 1].m130)}>
          <h2 className="grupo-t">130 · {tr('Pago a cuenta del IRPF')}</h2>
          <p className="grupo-pie arriba">{tr('Acumulado desde enero: el 20 % de tu rendimiento, menos las retenciones de tus facturas y lo ya declarado en los 130 anteriores del año. Marca aquí cada trimestre cuando lo presentes, lo pagues o no: lo que no está presentado no se descuenta en el siguiente.')}</p>
          <Rend130 soloLectura={soloLectura} anio={anio - 1} valor={rendAnterior ?? null} sugerido={sugerido} minoracion={opciones130(f, u.rend130, anio).minoracion} />
          <div className="tarjetas">
            {r130.trimestres.map((q) => (
              <div key={q.t} className="tarjeta"><h3>{tt(q.t)} {anio}</h3>
                {q.c19 < 0 && q.t < 4 ? <Importe texto="A deducir en los siguientes" v={-q.c19} /> : <Importe texto="A ingresar" v={q.m130} />}
                <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={[
                  ...(q.c08 !== undefined ? [
                    ['08 · Ingresos del trimestre (actividad agrícola, ganadera o forestal)', q.c08], ['09 · 2 % de la 08', q.c09],
                    ['10 · Retenciones del trimestre', q.c10], ['11 · Resultado', q.c11], ['12 · Suma de resultados', q.c12],
                  ] : [
                    ['01 · Ingresos', q.ingAcum], [q.difJust ? '02 · Gastos (con el 5 % de difícil justificación)' : '02 · Gastos', q.gasAcum], ['03 · Rendimiento neto', q.rendAcum],
                    ['04 · 20 % de la 03', r2(0.2 * Math.max(0, q.rendAcum))], ['05 · Casillas 07 de los 130 anteriores del año', q.pagosPrev],
                    ['06 · Retenciones de tus facturas', q.retAcum], ['07 · Resultado', q.c07],
                  ]),
                  q.minoracion && [`13 · Minoración por el rendimiento de ${anio - 1}`, q.minoracion], q.negPrev && ['15 · Negativos de trimestres anteriores', q.negPrev], q.c16 && ['16 · Préstamo de la vivienda habitual (antes de 2013)', q.c16],
                  ['19 · Resultado', q.c19, true],
                ]} /></Plegable>
                <Fichero foral={foralT} modelo="130" anio={anio} t={q.t} nif={u.emisor?.nif} aeat={AEAT.m130} />
                <Presentado soloLectura={soloLectura} anio={anio} t={q.t} importe={q.m130} pagado={u.pagos130?.[anio]?.[q.t]} situacion={situacion(q.t)} plazo={limite(q.t)} />
              </div>
            ))}
          </div>
        </ModeloPlegable>
        );
      })()}

      {pf && (() => {
        const t = T.find((q) => !p130(q) && situacionIrpf(q).estado !== 'curso') ?? T.find((q) => !p130(q) && situacionIrpf(q).estado === 'curso');
        const s = t && situacionIrpf(t);
        return (
        <ModeloPlegable id="m130" num={dForal.irpf.num} nombre={pf.deOficio ? tr('Pago fraccionado del IRPF (de oficio)') : tr('Pago fraccionado del IRPF')}
          {...(pf.deOficio || !t ? { detalle: pf.deOficio ? tr('Lo calcula y te lo cobra la Diputación') : tr('Todos los trimestres presentados') } : { estado: s.estado === 'curso' ? undefined : s.estado, detalle: `${tt(t)} · ${corto(s, limiteIrpf(t))}` })}
          dato={t && pf.pagos ? importeFila(pf.pagos[t - 1]) : undefined}>
          <h2 className="grupo-t">{dForal.irpf.num} · {tr('Pago fraccionado del IRPF')}</h2>
          <p className="grupo-pie arriba">{tr(pf.texto)}.{pf.deOficio ? ` ${tr('En Álava no lo presentas tú: la Diputación lo calcula y te lo cobra en cada plazo.')}` : ''}{pf.origen === 'fisquo' ? ` ${tr('El rendimiento de {anio} sale de lo que hay en Fisquo.', { anio: pf.penultimo })}` : ''}</p>
          {(pf.metodo === 'sin-datos' || pf.origen === 'escrito') && <Rend130 soloLectura={soloLectura} anio={anio - 2} valor={u.rend130?.[anio - 2] ?? null} sugerido={null} minoracion={0}
            texto={`Es la base del pago fraccionado de ${anio}: pon el rendimiento neto de tu actividad de tu declaración de la renta de ${anio - 2}.`} />}
          {pf.pagos && <div className="tarjetas">
            {T.map((q) => (
              <div key={q} className="tarjeta"><h3>{tt(q)} {anio}</h3>
                <Importe texto={pf.deOficio ? 'Te cobrarán' : 'A ingresar'} v={pf.pagos[q - 1] || 0} />
                {pf.exonerados?.includes(q) && <p className="nota">{tr('Exonerado por la norma foral de urgencia de abril de {anio}: no se paga.', { anio })}</p>}
                {pf.deOficio ? <p className="nota">{tr('Hasta el {fecha}.', { fecha: tr(limiteIrpf(q)) })}</p>
                  : <Presentado soloLectura={soloLectura} anio={anio} t={q} importe={pf.pagos[q - 1] || 0} pagado={u.pagos130?.[anio]?.[q]} situacion={situacionIrpf(q)} plazo={limiteIrpf(q)} />}
              </div>
            ))}
          </div>}
          <p className="descargas"><a href={foralT.sede} target="_blank" rel="noopener noreferrer">{tr('Abrir la sede de la {hacienda}', { hacienda: tr(foralT.hacienda) })}</a></p>
        </ModeloPlegable>
        );
      })()}

      {c131 && (() => {
        const t = tRef(p131);
        return (
        <ModeloPlegable id="m131" num="131" nombre={tr('Pago a cuenta del IRPF (módulos)')} {...filaTrim(t)} dato={t && importeFila(Math.max(0, r131[t - 1]['15']))}>
          <h2 className="grupo-t">131 · {tr('Pago a cuenta en módulos')}</h2>
          <p className="grupo-pie arriba">{tr('Cada trimestre, el 4 % del rendimiento neto de tus módulos (el 3 % si tienes como mucho una persona asalariada y el 2 % si no tienes ninguna) y el 2 % de lo que ingresas en las actividades agrícolas o sin datos-base, menos las retenciones de tus facturas. Pon de cada actividad lo que sale de la Orden de módulos de {anio} con tus datos a 1 de enero.', { anio })}</p>
          {actividadesDe(u).map((a) => <ModulosActividad key={`${a.id}-${anio}`} anio={anio} actividad={a.id} nombre={a.nombre} datos={modAnio[a.id]} simplificado={cSimp} soloLectura={soloLectura} />)}
          <Rend130 soloLectura={soloLectura} modelo="131" anio={anio - 1} valor={rendAnterior ?? null} sugerido={null} minoracion={minoracion130(rendAnterior)} />
          <div className="tarjetas">
            {r131.map((c, i) => { const q = i + 1; return (
              <div key={q} className="tarjeta"><h3>{tt(q)} {anio}</h3>
                {c['15'] < 0 ? <Importe texto="A deducir en los siguientes" v={-c['15']} /> : <Importe texto="A ingresar" v={c['15']} />}
                <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={[
                  c['01'] && ['01 · Rendimiento neto de los módulos', c['01']], c['02'] && ['02 · Pago fraccionado (4, 3 o 2 %)', c['02']],
                  c['03'] && ['03 · Ingresos sin datos-base', c['03']], c['04'] && ['04 · 2 % de la 03', c['04']],
                  c['05'] && ['05 · Ingresos agrícolas, ganaderos o forestales', c['05']], c['06'] && ['06 · 2 % de la 05', c['06']],
                  ['07 · Suma', c['07']], ['08 · Retenciones de tus facturas', c['08']], c['09'] && [`09 · Minoración por el rendimiento de ${anio - 1}`, c['09']],
                  ['10 · Resultado', c['10']], c['11'] && ['11 · Negativos de trimestres anteriores', c['11']], c['12'] && ['12 · Deducción por la vivienda', c['12']],
                  ['15 · Resultado', c['15'], true],
                ]} /></Plegable>
                <Presentado soloLectura={soloLectura} modelo="131" anio={anio} t={q} importe={Math.max(0, c['15'])} pagado={u.pagos131?.[anio]?.[q]} situacion={situacion(q)} plazo={limite(q)} />
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {cSimp && (() => {
        const t = tRef(p303);
        const sinDatos = actividadesDe(u).filter((a) => !modAnio[a.id]?.iva);
        return (
        <ModeloPlegable id="m303" num="303" nombre={tr('IVA trimestral (régimen simplificado)')} {...filaTrim(t)} dato={t && importeFila(Math.max(0, simp[t - 1].resultado))}>
          <h2 className="grupo-t">303 · {tr('IVA en el régimen simplificado')}</h2>
          <p className="grupo-pie arriba">{tr('En los tres primeros trimestres ingresas el porcentaje de la Orden sobre la cuota anual de tus módulos. En el 4T se liquida el año: la cuota de cada actividad menos el IVA de sus gastos corrientes y un 1 % por gastos de difícil justificación (nunca menos que la cuota mínima), menos lo ya ingresado, más el IVA de las compras a otros países. El IVA de los activos fijos (maquinaria, mobiliario…) se resta en el trimestre de la compra.')}{sinDatos.length ? ` ${tr('Falta la cuota de {nombres}: ponla arriba, en el 131.', { nombres: sinDatos.map((a) => a.nombre).join(', ') })}` : ''}</p>
          <div className="tarjetas">
            {simp.map((x) => (
              <div key={x.t} className="tarjeta"><h3>{tt(x.t)} {anio}</h3>
                {x.resultado < 0 ? <Importe texto="A compensar" v={-x.resultado} /> : <Importe texto="A ingresar" v={x.resultado} />}
                <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={x.t < 4 ? [...x.actividades.map((a) => [`${actividadesDe(u).find((b) => b.id === a.id)?.nombre || a.id} · ingreso a cuenta`, a.ingreso]), ['Total ingresos a cuenta', x.ingreso], x.activosFijos && ['IVA de los activos fijos', x.activosFijos], x.compensar && ['A compensar de trimestres anteriores', x.compensar], ['Resultado', x.resultado, true]] : [
                  ...x.actividades.flatMap((a) => [[`${actividadesDe(u).find((b) => b.id === a.id)?.nombre || a.id} · cuota devengada`, a.cuota], ['IVA soportado de gastos corrientes', a.corrientes], ['1 % de difícil justificación', a.dificil], ['Cuota mínima', a.minima], ['Cuota del régimen simplificado', a.derivada, true]]),
                  ['Ingresado en el 1T-3T', x.ingresado], x.autoDevengado && ['IVA de compras a otros países (devengado)', x.autoDevengado], x.autoDeducible && ['IVA de compras a otros países (deducible)', x.autoDeducible],
                  x.activosFijos && ['IVA de los activos fijos', x.activosFijos], x.compensar && ['A compensar de trimestres anteriores', x.compensar], ['Resultado', x.resultado, true],
                ]} /></Plegable>
                <Presentado soloLectura={soloLectura} modelo="303" anio={anio} t={x.t} importe={0} pagado={p303(x.t)} con130={false} situacion={situacion(x.t)} plazo={limite(x.t)} />
              </div>
            ))}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay111 && (() => {
        const t = tPlazo(20);
        return (
        <ModeloPlegable id="m111" num={dForal ? dForal.ret.num : '111'} nombre={tr('Retenciones de nóminas y profesionales')} {...filaPlazo(t, 20, null, t && !a111(t) && !modelo111(nominas || [], anio, t).perceptores && 'sin nóminas ni profesionales con retención')}
          dato={importeFila(t ? a111(t) : r2(T.reduce((s, x) => s + a111(x), 0)))}>
          <h2 className="grupo-t">{dForal ? dForal.ret.num : '111'} · {tr('Retenciones de trabajadores y profesionales')}</h2>
          <p className="grupo-pie arriba">{tr('Lo retenido en las nóminas del trimestre y en las facturas de profesionales (los gastos con retención, por ejemplo tu gestoría).')}</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo111(nominas || [], anio, t); const p = retencionesProfesionales(gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{tt(t)} {anio}</h3>
                {m.perceptores || p.perceptores ? <Casillas sinNumeros={Boolean(foralT)} filas={[
                  m.perceptores && ['01 · Trabajadores', String(m.perceptores)], m.perceptores && ['02 · Sueldos pagados', m.percepciones], m.perceptores && ['03 · Retenciones', m.retenciones],
                  p.perceptores && ['07 · Profesionales', String(p.perceptores)], p.perceptores && ['08 · Lo que les pagaste (base)', p.base], p.perceptores && ['09 · Retenciones', p.retenciones],
                  ['28 · Total de retenciones', r2(m.retenciones + p.retenciones)],
                  ['30 · A ingresar', Math.max(0, r2(m.retenciones + p.retenciones)), true],
                ]} /> : <p className="nota">{tr('Sin nóminas ni profesionales con retención este trimestre.')}</p>}
                {r2(m.retenciones + p.retenciones) < 0 && <p className="nota">{tr('Sale negativo por un abono de un profesional con retención: el 111 no lo admite. Regularízalo con ese profesional.')}</p>}
                {m.perceptores > 0 && r2(m.retenciones + p.retenciones) === 0 && <p className="nota">{tr('Sin retenciones, pero con nóminas pagadas: el 111 se presenta igual, como negativo.')}</p>}
                <p className="nota">{tr('Hasta el {fecha}.', { fecha: tr(plazoT(t, 20)) })}</p>
                {(m.perceptores || p.perceptores) ? <Fichero foral={foralT} modelo="111" anio={anio} t={t} nif={u.emisor?.nif} aeat={AEAT.m111} /> : null}
                {(m.perceptores || p.perceptores) ? <PresentadoRet modelo="111" anio={anio} t={t} hecho={marcaRet(u.pres111, anio, t) ?? presentado(t)} soloLectura={soloLectura} /> : null}
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {f.tipo === 'sociedad' && dForal && (() => {
        // País Vasco (203): el 5 % de la base imponible del último periodo, del 1 al 25 de octubre; no lo pagan las micro y
        // pequeñas empresas. Navarra (S-91): el 30 % de la cuota efectiva del último periodo, del 1 al 20 de octubre.
        const pg = dForal.is.pago;
        const [mes, dia] = pg.plazo;
        const fecha = fechaTexto(habil(`${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`));
        const pyme = pg.exentaPyme && is && is.incn <= dForal.is.pequena;
        const anterior = pg.sobre === 'base' && !pyme ? borradorSociedades(facturas, gastos, anio - 1, { ivaCoste: !usa303(f), iva, territorio: f.territorio }) : null;
        const cuota = u.cuotaIS?.[anio - 1];
        const pago = pyme ? 0 : pg.sobre === 'cuota' ? (cuota > 0 ? r2(cuota * pg.pct / 100) : null) : anterior ? r2(anterior.base * pg.pct / 100) : null;
        return (
        <ModeloPlegable id="m202" num={pg.num} nombre={tr('Pago fraccionado de Sociedades')} detalle={pyme ? tr('No lo pagan las micro y pequeñas empresas') : tr('Hasta el {fecha}', { fecha: tr(fecha) })} dato={pago ? importeFila(pago) : undefined}>
          <h2 className="grupo-t">{pg.num} · {tr('Pago fraccionado del Impuesto sobre Sociedades')}</h2>
          <p className="grupo-pie arriba">{pg.sobre === 'cuota' ? tr('El {pct} de la cuota efectiva del último Impuesto sobre Sociedades, menos las retenciones, hasta el {fecha}.', { pct: pctCorto(pg.pct), fecha: tr(fecha) }) : tr('El {pct} de la base imponible del último periodo, menos las retenciones, hasta el {fecha}. No lo pagan las micro y pequeñas empresas.', { pct: pctCorto(pg.pct), fecha: tr(fecha) })}</p>
          {pg.sobre === 'cuota' && <div className="tarjetas"><CuotaIS foral soloLectura={soloLectura} anio={anio - 1} valor={cuota ?? null} uso="el pago de octubre" /></div>}
          <div className="tarjeta">
            {pyme ? <p className="nota">{tr('Con {importe} de cifra de negocios eres micro o pequeña empresa: no lo pagas (si además cumples los requisitos de plantilla y activo).', { importe: eur(is.incn) })}</p>
              : pago !== null ? <Casillas filas={[[pg.sobre === 'cuota' ? `Cuota de ${anio - 1}` : `Base imponible de ${anio - 1}`, pg.sobre === 'cuota' ? cuota : anterior.base], [`${pctCorto(pg.pct)} · A ingresar`, pago, true]]} />
              : <p className="nota">{pg.sobre === 'cuota' ? tr('Falta la cuota del Impuesto sobre Sociedades de {anio}.', { anio: anio - 1 }) : tr('No hay datos de {anio} en Fisquo para calcularlo.', { anio: anio - 1 })}</p>}
          </div>
        </ModeloPlegable>
        );
      })()}

      {f.tipo === 'sociedad' && !dForal && (() => {
        const pagos = pagos202;
        const art403 = Boolean(is?.obligado403);
        // El próximo pago por hacer; sin la cuota del año del que sale, se avisa de que falta.
        const x = pagos.find((y) => y.fecha >= h && (y.cuota === null || (y.pago > 0 && !u.pagos202?.[anio]?.[y.p])));
        const fila = !x ? { detalle: tr('Sin pagos pendientes este año') }
          : x.cuota === null ? { estado: 'listo', detalle: `${tr(PAGO_202[x.p])} · ${tr('falta la cuota del Impuesto sobre Sociedades de {anio}', { anio: x.de })}` }
          : { detalle: `${tr(PAGO_202[x.p])} · ${tr('hasta el {fecha}', { fecha: tr(conAnio(x.fecha, 0)) })}` };
        // Art. 40.3: 5/7 del tipo redondeado por defecto (con 10 M o más, 19/20 por exceso) sobre la base de los 3, 9 y 11 meses.
        const fin = { 1: '31 de marzo', 2: '30 de septiembre', 3: '30 de noviembre' };
        return (
        <ModeloPlegable id="m202" num="202" nombre={tr('Pagos a cuenta de Sociedades')} {...fila} dato={x && importeFila(x.pago)}>
          <h2 className="grupo-t">202 · {tr('Pagos a cuenta del Impuesto sobre Sociedades')}</h2>
          {art403 ? <p className="grupo-pie arriba">{tr('Con más de 6 millones de cifra de negocios en {anio} ({importe}) va por la modalidad del artículo 40.3: un porcentaje de la base imponible de lo que va de año (los 3, 9 y 11 primeros meses), menos las retenciones y los pagos ya hechos este año.', { anio: anio - 1, importe: eur(is.incn) })}{is.incn >= 1e7 ? ` ${tr('Con 10 millones o más, el porcentaje es 19/20 del tipo y el pago no baja del 23 % del resultado contable.')}` : ` ${tr('El porcentaje es 5/7 del tipo, redondeado hacia abajo.')}`} {tr('Con lo apuntado en Fisquo: confírmalo con tu gestor.')}</p>
            : <p className="grupo-pie arriba">{tr('El 18 % de la «cuota del ejercicio a ingresar o devolver» del último Impuesto sobre Sociedades presentado: la cuota íntegra menos deducciones, bonificaciones y retenciones, sin restar los pagos a cuenta. Si salió a cero o es el primer año, no se presenta. Si facturas más de 6 millones, se calcula sobre lo que va de año (artículo 40.3).')}</p>}
          {!art403 && <div className="tarjetas">
            <CuotaIS soloLectura={soloLectura} anio={anio - 2} valor={u.cuotaIS?.[anio - 2] ?? null} sugerido={cuotaSugerida(anio - 2)} uso="el pago de abril" />
            <CuotaIS soloLectura={soloLectura} anio={anio - 1} valor={u.cuotaIS?.[anio - 1] ?? null} sugerido={cuotaSugerida(anio - 1)} uso="los pagos de octubre y diciembre" />
          </div>}
          <div className="tarjetas">
            {pagos.map((x) => (
              <div key={x.p} className="tarjeta"><div className="trim-cab"><h3>{tr(PAGO_202[x.p])} {anio} · {tr(x.mes)}</h3>{x.pago > 0 && <Presentado202 soloLectura={soloLectura} anio={anio} p={x.p} importe={x.pago} pagado={u.pagos202?.[anio]?.[x.p]} />}</div>
                {x.modalidad === '40.3' ? <Casillas filas={[
                  ['13 · Base imponible previa', x.basePrevia], x.compensacion > 0 && ['14 · Bases negativas de años anteriores', menos(x.compensacion)], [`16 · Base hasta el ${fin[x.p]}`, x.base],
                  ...x.tramos.map((t) => [tr('{pct} % de {importe}', { pct: t.pct, importe: eur(t.base) }), t.cuota]),
                  x.retenciones > 0 && ['28 · Retenciones', menos(x.retenciones)], x.anteriores > 0 && ['30 · Pagos anteriores de este año', menos(x.anteriores)],
                  x.minimo > 0 && ['33 · Mínimo (23 % del resultado contable)', x.minimo],
                  ['A ingresar', x.pago, true],
                ]} />
                  : x.cuota === null ? <p className="nota">{tr('Falta la cuota del Impuesto sobre Sociedades de {anio}.', { anio: x.de })}</p>
                  : x.pago ? <Casillas sinNumeros={Boolean(foralT)} filas={[[`Cuota de ${x.de} (menos retenciones)`, x.cuota], ['18 % · A ingresar', x.pago, true]]} />
                  : <p className="nota">{tr('La cuota de {anio} fue cero: no se presenta.', { anio: x.de })}</p>}
                {x.modalidad === '40.3' && x.resultado < 0 && <p className="nota">{tr('Sale negativo: con más de 6 millones se presenta igual, sin importe.')}</p>}
                <p className="nota">{tr('Hasta el {fecha}.', { fecha: tr(conAnio(x.fecha, 0)) })}</p>
              </div>
            ))}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay115 && (() => {
        const t = tPlazo(20);
        return (
        <ModeloPlegable id="m115" num={dForal ? dForal.ret.alquiler : '115'} nombre={tr('Retenciones del alquiler')} {...filaPlazo(t, 20, null, t && !modelo115(gastos, anio, t).base && 'sin alquiler')}
          dato={importeFila(t ? modelo115(gastos, anio, t).retenciones : r2(T.reduce((s, x) => s + modelo115(gastos, anio, x).retenciones, 0)))}>
          <h2 className="grupo-t">{dForal ? dForal.ret.alquiler : '115'} · {tr('Retenciones del alquiler')}</h2>
          <p className="grupo-pie arriba">{tr('El {pct} % de la renta (sin IVA) de los gastos marcados como alquiler del local.', { pct: RET_ALQUILER })}</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo115(gastos, anio, t); return (
              <div key={t} className="tarjeta"><h3>{tt(t)} {anio}</h3>{m.base ? <Casillas sinNumeros={Boolean(foralT)} filas={[['01 · Perceptores', String(m.perceptores)], ['02 · Base de las retenciones', m.base], ['03 · Retenciones', m.retenciones], ['05 · A ingresar', m.retenciones, true]]} /> : <p className="nota">{tr('Sin alquiler este trimestre.')}</p>}<p className="nota">{tr('Hasta el {fecha}.', { fecha: tr(plazoT(t, 20)) })}</p>{m.base ? <Fichero foral={foralT} modelo="115" anio={anio} t={t} nif={u.emisor?.nif} aeat={AEAT.m115} /> : null}{m.base ? <PresentadoRet modelo="115" anio={anio} t={t} hecho={marcaRet(u.pres115, anio, t) ?? presentado(t)} soloLectura={soloLectura} /> : null}</div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay309 && (() => {
        const t = tPlazo(30);
        const HECHO = { 1: tr('Adquisición intracomunitaria de bienes'), 3: tr('Inversión del sujeto pasivo (servicios de la UE o de fuera, y compras de España sin IVA)') };
        return (
        <ModeloPlegable id="m309" num="309" nombre={tr('IVA de compras a la UE o con inversión del sujeto pasivo')} {...filaPlazo(t, 30, null, t && !m309(t).declaraciones.length && 'sin compras de este tipo')}
          dato={importeFila(t ? m309(t).ingresar : r2(T.reduce((s, x) => s + m309(x).ingresar, 0)))}>
          <h2 className="grupo-t">309 · {tr('IVA no periódico')}</h2>
          <p className="grupo-pie arriba">{tr('Como no presentas el 303, el IVA de lo que compras a proveedores de la UE, de servicios de fuera de la UE o de España con inversión del sujeto pasivo lo ingresas tú con este modelo, el trimestre en que haya alguna compra así: uno por cada tipo de operación.')}{f.iva === 'recargo' ? ` ${tr('En el recargo de equivalencia, las compras de bienes a la UE llevan además el recargo.')}` : ''} {tr('No te lo deduces: es más coste de la compra.')}</p>
          <div className="tarjetas">
            {T.flatMap((t) => { const m = m309(t); return m.declaraciones.length ? m.declaraciones.map((d) => (
              <div key={`${t}-${d.hecho}`} className="tarjeta"><h3>{tt(t)} {anio} · {HECHO[d.hecho]}</h3>
                <Casillas sinNumeros={Boolean(foralT)} filas={[
                  ...[['01', '02', '03'], ['25', '26', '27'], ['04', '05', '06'], ['07', '08', '09']].filter(([b]) => d.c[b] !== undefined).flatMap(([b, p, q]) => [[`${b} · Base al ${String(d.c[p]).replace('.', ',')} %`, d.c[b]], [`${q} · Cuota`, d.c[q]]]),
                  ...[['10', '11', '12'], ['13', '14', '15'], ['16', '17', '18'], ['19', '20', '21']].filter(([b]) => d.c[b] !== undefined).flatMap(([b, p, q]) => [[`${b} · Base del recargo del ${String(d.c[p]).replace('.', ',')} %`, d.c[b]], [`${q} · Recargo`, d.c[q]]]),
                  ['22 · Total cuota devengada', d.c['22']], ['24 · A ingresar', d.c['24'], true],
                ]} />
                {d.masTipos && <p className="nota">{tr('Hay más de cuatro tipos de IVA en este trimestre: el formulario solo tiene cuatro filas, revisa el reparto con tu gestor.')}</p>}
              </div>)) : []; })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay216 && (() => {
        const t = tPlazo(20);
        const m = t && modelo216(gastos, anio, t);
        return (
        <ModeloPlegable id="m216" num="216" nombre={tr('Retenciones de no residentes')} {...filaPlazo(t, 20, null, t && !m.rentas && 'sin pagos a no residentes')}
          dato={importeFila(t ? m.retenciones : r2(T.reduce((s, x) => s + modelo216(gastos, anio, x).retenciones, 0)))}>
          <h2 className="grupo-t">216 · {tr('Retenciones de no residentes')}</h2>
          <p className="grupo-pie arriba">{tr('Lo que retienes al pagar a quien no reside en España ni tiene aquí un establecimiento (los gastos marcados «no reside en España»: el alquiler de un local cuyo dueño vive fuera, un profesional de otro país…): el 24 %, el 19 % si reside en la UE o el EEE, o el límite del convenio con su país si te da su certificado de residencia fiscal. No va en el 111 ni en el 115: se ingresa con el 216 cada trimestre, por la fecha de pago (el del 4T, hasta el 20 de enero), y en enero el 296 lo resume por perceptor. Lo exento por la ley o por un convenio también se declara, sin retención.')}</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo216(gastos, anio, t); const c = m.c; return (
              <div key={t} className="tarjeta"><h3>{tt(t)} {anio}</h3>
                <Importe texto="A ingresar" v={c['21']} />
                {m.rentas ? <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={[
                  // Desde 2024 (Orden HAC/56/2024): dividendos aparte del resto de rentas; 05-07 y 14-16 cuentan rentas (pagos).
                  c['05'] > 0 && ['05 · Dividendos: número de rentas', String(c['05'])], c['06'] > 0 && ['06 · Resto de rentas: número', String(c['06'])], ['07 · Rentas con retención', String(c['07'])],
                  c['08'] > 0 && ['08 · Base: dividendos', c['08']], c['09'] > 0 && ['09 · Base: resto de rentas', c['09']], ['10 · Base total', c['10']],
                  c['11'] > 0 && ['11 · Retenciones: dividendos', c['11']], c['12'] > 0 && ['12 · Retenciones: resto de rentas', c['12']], ['13 · Total de retenciones', c['13']],
                  c['14'] > 0 && ['14 · Sin retención: dividendos (número)', String(c['14'])], c['15'] > 0 && ['15 · Sin retención: resto de rentas (número)', String(c['15'])], c['16'] > 0 && ['16 · Rentas sin retención', String(c['16'])],
                  c['17'] > 0 && ['17 · Base sin retención: dividendos', c['17']], c['18'] > 0 && ['18 · Base sin retención: resto de rentas', c['18']], c['16'] > 0 && ['19 · Base de las rentas sin retención', c['19']],
                  ['21 · A ingresar', c['21'], true],
                ]} /></Plegable> : <p className="nota">{tr('Sin pagos a no residentes este trimestre: no se presenta.')}</p>}
                {m.negativa && <p className="nota">{tr('Solo rentas exentas: se presenta igual, como declaración negativa.')}</p>}
                {m.rentas > 0 && <p className="nota">{tr('Hasta el {fecha}.', { fecha: tr(plazoT(t, 20)) })}</p>}
                {m.rentas > 0 && <PresentadoRet modelo="216" anio={anio} t={t} hecho={Boolean(u.pres216?.[anio]?.[t])} soloLectura={soloLectura} />}
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay369 && (() => {
        const t = T.find((x) => plazo369(anio, x) >= h);
        const m = t && modelo369(facturas, anio, t);
        // Acogida al régimen: se presenta cada trimestre, también sin ventas («Declaración sin actividad», a cero).
        const acogida = usa303(f) && Boolean(f.oss);
        const pais = (p) => tr(NOMBRES_UE[p] || p);
        const tipos = (titulo, lista) => lista.flatMap((p) => p.tipos.map((x) => [`${titulo} · ${pais(p.pais)} · ${String(x.pct).replace('.', ',')} %`, `${eur(x.base)} · ${tr('IVA {importe}', { importe: eur(x.cuota) })}`]));
        return (
        <ModeloPlegable id="m369" num="369" nombre={tr('IVA de la ventanilla única')} detalle={t ? `${tt(t)}${m.sinActividad && acogida ? ` · ${tr('sin actividad, a cero')}` : ''} · ${tr('hasta el {fecha}', { fecha: tr(`${fechaTexto(plazo369(anio, t))}${plazo369(anio, t).slice(0, 4) !== String(actual) ? ` de ${plazo369(anio, t).slice(0, 4)}` : ''}`) })}` : tr('Total del año')}
          dato={importeFila(m ? m.cuota : r2(T.reduce((s, x) => s + modelo369(facturas, anio, x).cuota, 0)))}>
          <h2 className="grupo-t">369 · {tr('Ventanilla única (OSS)')}</h2>
          <p className="grupo-pie arriba">{tr('El IVA de tus ventas a particulares de otros países de la UE, con el tipo de cada país. No va en el 303 (allí solo su base, en la casilla 123): se declara aquí cada trimestre, por país y tipo (los servicios aparte de los bienes), hasta el último día del mes siguiente (ese día, aunque caiga en fin de semana). Mientras estés en el régimen se presenta todos los trimestres, aunque no vendas nada. Las rectificativas de un trimestre anterior van como corrección de su cuota, y lo negativo de un país no compensa lo de otro: lo devuelve ese país.')}</p>
          <div className="tarjetas">
            {T.map((t) => { const m = modelo369(facturas, anio, t); return (
              <div key={t} className="tarjeta"><h3>{tt(t)} {anio}</h3>
                <Importe texto="A ingresar" v={m.cuota} />
                {!m.sinActividad ? <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={[
                  ...tipos(`3 · ${tr('Servicios')}`, m.servicios), ...tipos(`4 · ${tr('Bienes')}`, m.bienes),
                  ...m.correcciones.map((c) => [`7 · ${tr('Corrección')} · ${pais(c.pais)} · ${tt(c.t)} ${c.anio}`, c.cuota]),
                  ...m.paises.map((p) => [`8 · ${tr('Resultado')} · ${pais(p.pais)}`, p.saldo < 0 ? tr('{importe} a devolver por ese país', { importe: eur(-p.saldo) }) : p.saldo]),
                  ['Total a ingresar', m.cuota, true]]} /></Plegable>
                  : <p className="nota">{tr('Sin ventas ni correcciones')}{acogida ? `: ${tr('se presenta igualmente, marcando «Declaración sin actividad».')}` : '.'}</p>}
                {m.fuera.length > 0 && <p className="nota">{tr('Rectificativas de hace más de 3 años ({lista}): ya no van en el 369, sino ante la Hacienda de ese país.', { lista: m.fuera.map((c) => `${pais(c.pais)} ${tt(c.t)} ${c.anio}: ${eur(c.cuota)}`).join('; ') })}</p>}
                <p className="nota">{tr('Plazo: hasta el {fecha}.', { fecha: tr(`${fechaTexto(plazo369(anio, t))}${t === 4 ? ` de ${anio + 1}` : ''}`) })}</p>
                {(acogida || !m.sinActividad || u.pres369?.[anio]?.[t]) && <PresentadoRet modelo="369" anio={anio} t={t} hecho={Boolean(u.pres369?.[anio]?.[t])} soloLectura={soloLectura} />}
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {hay123 && (() => {
        const t = tPlazo(20);
        const m = t && modelo123(capital, anio, t);
        return (
        <ModeloPlegable id="m123" num="123" nombre={tr('Retenciones de dividendos e intereses')} {...filaPlazo(t, 20, null, t && !m.base && 'sin pagos')}
          dato={importeFila(t ? m.retenciones : r2(T.reduce((s, x) => s + modelo123(capital, anio, x).retenciones, 0)))}>
          <h2 className="grupo-t">123 · {tr('Dividendos e intereses')}</h2>
          <p className="grupo-pie arriba">{tr('Cuando pagas dividendos a los socios o intereses de un préstamo a una persona o a una empresa, le retienes el 19 % y lo ingresas cada trimestre con el 123 (el del 4T, hasta el 20 de enero). En enero, el 193 resume el año por perceptor.')}</p>
          <PagosCapital anio={anio} hoy={h} pagos={capitalAnio} sociedad={f.tipo === 'sociedad'} soloLectura={soloLectura} />
          <div className="tarjetas">
            {T.map((t) => { const m = modelo123(capital, anio, t); const k = casillas123(capital, anio, t); return (
              <div key={t} className="tarjeta"><h3>{tt(t)} {anio}</h3>
                <Importe texto="A ingresar" v={m.retenciones} />
                {m.base ? <Plegable><Casillas sinNumeros={Boolean(foralT)} filas={[
                  // Desde 2024 (Orden HAC/56/2024): dividendos aparte del resto de rentas (intereses y otros); 01-03 cuentan pagos, no personas.
                  k['01'] > 0 && ['01 · Dividendos: número de pagos', String(k['01'])], k['02'] > 0 && ['02 · Intereses y otras rentas: número de pagos', String(k['02'])], ['03 · Total de pagos', String(k['03'])],
                  k['04'] > 0 && ['04 · Base: dividendos', k['04']], k['05'] > 0 && ['05 · Base: intereses y otras rentas', k['05']], ['06 · Base total', k['06']],
                  k['07'] > 0 && ['07 · Retenciones: dividendos', k['07']], k['08'] > 0 && ['08 · Retenciones: intereses y otras rentas', k['08']], ['09 · Total de retenciones', k['09']],
                  ['14 · A ingresar', k['14'], true],
                ]} /></Plegable> : <p className="nota">{tr('Sin pagos en este trimestre: no se presenta.')}</p>}
                {m.base > 0 && <PresentadoRet modelo="123" anio={anio} t={t} hecho={Boolean(u.pres123?.[anio]?.[t])} soloLectura={soloLectura} />}
              </div>
            ); })}
          </div>
        </ModeloPlegable>
        );
      })()}

      {m193 && (
        <ModeloPlegable id="m193" num="193" nombre={tr('Resumen anual de dividendos e intereses')} detalle={m193.perceptores.length ? tr('Hasta el {fecha}', { fecha: tr(plazoAnual('01-31')) }) : tr('Sin pagos este año')} informativo={m193.perceptores.length > 0}>
          <h2 className="grupo-t">193 · {tr('Resumen anual')}</h2>
          {m193.perceptores.length ? <Casillas sinNumeros={Boolean(foralT)} filas={[...m193.perceptores.map((p) => [`${p.nif ? `${p.nif} · ` : ''}${p.nombre} · ${tr(TIPOS_RENDIMIENTO[p.tipo])} ${tr('(clave {clave}, naturaleza {naturaleza})', { clave: p.clave, naturaleza: p.naturaleza })}`, `${eur(p.base)} · ${tr('ret. {importe}', { importe: eur(p.retenciones) })}`]), ['Retenciones del año', m193.retenciones, true]]} /> : <p className="nota">{tr('Sin pagos de dividendos ni intereses en {anio}.', { anio })}</p>}
        </ModeloPlegable>
      )}

      {hay349 && (() => {
        const t = tPlazo(30); const m = modelo349(facturas, anio, t, gastos);
        const fila = filaPlazo(t, 30, t && (m.operadores.length || !m.rectificaciones.length ? `${m.operadores.length} ${m.operadores.length === 1 ? 'empresa' : 'empresas'}` : 'rectificaciones'), t && !m.operadores.length && !m.rectificaciones.length && 'sin operaciones: no se presenta');
        return (
        <ModeloPlegable id="m349" num="349" nombre={tr('Ventas y compras con empresas de la UE')} {...fila} informativo={m.total > 0 || m.rectificaciones.length > 0}>
          <h2 className="grupo-t">349 · {tr('Ventas y compras con empresas de la UE')}</h2>
          <p className="grupo-pie arriba">{tr('Facturas a clientes con NIF-IVA de otro país de la UE (clave S, servicios prestados) y gastos de proveedores de la UE con su NIF-IVA (clave I, servicios recibidos; si son bienes, la clave es A). Solo se presenta el trimestre en que haya alguna. No se paga: es informativo.')}</p>
          <div className="tarjetas">
            {T.flatMap((t) => periodos349(facturas, anio, t, gastos)).map((m, i) => (
              <div key={`${m.periodo}-${i}`} className="tarjeta"><h3>{/T$/.test(m.periodo) ? `${tt(Number(m.periodo[0]))} ${anio}` : `${nombreMes(`${anio}-${m.periodo}`)} ${tr('(mensual)')}`}</h3>
                {m.mensual && /T$/.test(m.periodo) === false && m.periodo === m.mensual.slice(5, 7) && <p className="nota"><strong>{tr('Desde {mes}, el 349 es mensual: hasta el 20 del mes siguiente.', { mes: nombreMes(m.mensual) })}</strong> {tr('Las entregas y servicios a empresas de la UE pasan de 50.000 € en el trimestre o en alguno de los cuatro anteriores.')}</p>}
                {m.operadores.length || m.rectificaciones.length ? <><Casillas sinNumeros={Boolean(foralT)} filas={[...m.operadores.map((c) => [`${c.nif} · ${c.nombre} (${c.clave})`, c.base]), ['Total', m.total, true],
                  // Rectificaciones de periodos ya declarados: la nueva base de ese periodo y la que se declaró.
                  ...m.rectificaciones.map((r) => [`${/T$/.test(r.periodo) ? tr('Corrige el {p} de {e}', { p: tt(Number(r.periodo[0])), e: r.ejercicio }) : tr('Corrige {mes}', { mes: nombreMes(`${r.ejercicio}-${r.periodo}`) })}: ${r.nif} · ${r.nombre} (${r.clave})`, `${eur(r.base)} (${tr('antes {importe}', { importe: eur(r.anterior) })})`])]} /><p className="nota">{tr('Hasta el {fecha}.', { fecha: tr(fechaTexto(m.plazo)) })}</p></> : <p className="nota">{tr('Sin operaciones: no se presenta.')}</p>}
                {m.negativos.length > 0 && <p className="nota">{tr('Las rectificativas de {lista} restan más de lo que hay en el trimestre: en el 349 no puede quedar nada en negativo. Si corrigen una operación de otro trimestre, van como rectificación de ese trimestre: hazlo con una factura rectificativa de la original o revísalo con tu gestor.', { lista: m.negativos.map((c) => `${c.nombre} (${eur(c.base)})`).join(', ') })}</p>}
                {(m.operadores.length > 0 || m.rectificaciones.length > 0) && !m.negativos.length && <Fichero foral={foralT} boe modelo="349" anio={anio} t={/T$/.test(m.periodo) ? Number(m.periodo[0]) : Math.ceil(Number(m.periodo) / 3)} mes={/T$/.test(m.periodo) ? null : Number(m.periodo)} nif={u.emisor?.nif} />}
              </div>
            ))}
          </div>
        </ModeloPlegable>
        );
      })()}

      {m425 && (
        <ModeloPlegable id="m425" num="425" nombre={tr('Resumen anual del IGIC')} detalle={tr('Hasta el {fecha}', { fecha: tr(`${fechaTexto(plazo420(anio, 4))} de ${anio + 1}`) })}>
          <h2 className="grupo-t">425 · {tr('Resumen anual del IGIC')}</h2>
          <div className="tarjeta"><Casillas sinNumeros={Boolean(foralT)} filas={[
            ...m425.devengadoPorTipo.flatMap((d) => [[`Base al ${d.pct} %`, d.base], [`Cuota al ${d.pct} %`, d.cuota]]),
            ['Total IGIC devengado', m425.totalDevengado, true],
            ...Object.entries(m425.deducciones).map(([k, v]) => [`${tr('IGIC deducible')} · ${tr(DEDUCCIONES425[k])}`, v, k === 'total']),
            ...m425.resultadosTrimestrales.map((v, i) => [tr('420 del {t}T', { t: i + 1 }), v]),
          ]} /><p className="nota">{tr('Resumen de las operaciones registradas. Revisa los ajustes y operaciones especiales con tu gestor antes de presentarlo.')}</p>
          <p className="descargas"><a href={SEDE_ATC} target="_blank" rel="noopener noreferrer">{tr('Abrir la Sede de la Agencia Tributaria Canaria')}</a></p></div>
        </ModeloPlegable>
      )}

      {m390 && (
        <ModeloPlegable id="m390" num="390" informativo={!dForal} nombre={dForal ? tr('Autoliquidación final del IVA') : tr('Resumen anual del IVA')} detalle={dForal ? tr('Con el 4T · hasta el {fecha}', { fecha: tr(limite(4)) }) : tr('Hasta el {fecha}', { fecha: tr(plazoAnual('01-30')) })}>
          <h2 className="grupo-t">390 · {dForal ? tr('Autoliquidación final del IVA (con el 4T)') : tr('Resumen anual del IVA')}</h2>
          {!dForal && <p className="grupo-pie arriba">{tr('No se paga: resume los cuatro 303 del año.')}{notaHastaHoy} {tr('Si cuadra con lo que presentaste, solo hay que enviarlo. Salen las casillas con importe')}{anio > 2025 ? `, ${tr('con la numeración del formulario de 2025 (el de {anio} aún no se ha publicado)', { anio })}` : ''}.</p>}
          {m390.avisos.map((a) => <p key={a} className="nota aviso">{tr(a)}</p>)}
          <div className="tarjeta">
            <Casillas sinNumeros={Boolean(foralT)} filas={[
              ...ORDEN390.filter((k) => TOTALES390.includes(k) || (m390.c[k] !== undefined && m390.c[k] !== 0)).map((k) => [`${k} · ${ETIQUETAS390[k]}`, k === '118' ? `${String(m390.c[k]).replace('.', ',')} %` : m390.c[k] ?? 0, TOTALES390.includes(k)]),
              ...m390.trimestres.map((v, i) => [`— · 303 del ${i + 1}T (casilla 46)`, v]),
            ]} />
          </div>
          {!dForal && <Fichero modelo="390" anio={anio} nif={u.emisor?.nif} aeat={AEAT.m390} />}
        </ModeloPlegable>
      )}

      <ModeloPlegable id="m347" num="347" nombre={tr('Operaciones con terceros')} informativo={m347.ventas.length + m347.compras.length > 0}
        estado={m347.sinNif.length ? 'fuera' : undefined}
        detalle={m347.sinNif.length ? tr(m347.sinNif.length === 1 ? 'Falta el NIF de {n} cliente o proveedor' : 'Falta el NIF de {n} clientes o proveedores', { n: m347.sinNif.length })
          : m347.ventas.length + m347.compras.length ? `${m347.ventas.length + m347.compras.length === 1 ? tr('1 cliente o proveedor') : tr('{n} clientes y proveedores', { n: m347.ventas.length + m347.compras.length })} · ${tr('hasta el {fecha}', { fecha: tr(plazoAnual(finFebrero)) })}` : tr('Nadie pasa de 3.005,06 €: no se presenta')}>
        <h2 className="grupo-t">347 · {tr('Operaciones de más de 3.005,06 €')}</h2>
        <p className="grupo-pie arriba">{tr('Clientes y proveedores con los que pasas de 3.005,06 € en el año, IVA incluido (y el recargo de equivalencia o la compensación agraria, si los hay). No entra lo que ya va en el 349, lo de fuera de la UE, lo que lleva retención (va en el 190 o el 180), los impuestos, sueldos y Seguridad Social ni los tickets sin proveedor. Se presenta del 1 de febrero al {fecha} y no se paga: es informativo.', { fecha: tr(plazoAnual(finFebrero)) })}{notaHastaHoy}</p>
        {m347.soloAnual && <p className="nota">{tr('Estás en el criterio de caja: tu 347 va solo con el total del año, sin trimestres.')}</p>}
        {m347.ventas.length || m347.compras.length ? (
          <div className="tarjetas">
            {[['Clientes (clave B)', m347.ventas], ['Proveedores (clave A)', m347.compras]].filter(([, l]) => l.length).map(([t, l]) => (
              <div key={t} className="tarjeta ancha"><h3>{tr(t)}</h3>
                <TablaPersonas columnas={m347.soloAnual ? ['Total'] : ['1T', '2T', '3T', '4T', 'Total']} filas={l.map((o, i) => ({
                  clave: `${i}-${o.nif}-${o.nombre}`, nombre: o.nombre,
                  // Lo que va aparte en el registro: el NIF-IVA de la UE, la inversión del sujeto pasivo, el alquiler del local, el
                  // criterio de caja y el efectivo.
                  detalle: [o.nif || (o.nifComunitario && `NIF-IVA ${o.nifComunitario}`), o.provincia === '99' && (o.pais ? tr('No residente · {pais}', { pais: nombrePais(o.pais) }) : tr('No residente: falta su país')), o.isp && tr('Inversión del sujeto pasivo'), o.arrendamiento && tr('Alquiler del local sin retención (va aparte)'), o.caja && tr(o.clave === 'B' ? 'Criterio de caja: {importe} devengado al cobrar (va aparte)' : 'Criterio de caja: {importe} devengado al pagar (va aparte)', { importe: eur(o.importeCaja) }),
                    o.metalico && `${tr('Cobrado en efectivo: {importe}', { importe: eur(o.metalico) })}${o.ejercicioMetalico !== anio ? ` ${tr('de facturas de {anio}', { anio: o.ejercicioMetalico })}` : ''}`].filter(Boolean).join(' · '),
                  cifras: m347.soloAnual ? [o.total] : [...(o.trimestres || [null, null, null, null]), o.total],
                }))} />
              </div>
            ))}
          </div>
        ) : <div className="tarjeta"><p className="nota">{tr('Nadie pasa de 3.005,06 € este año: no se presenta.')}</p></div>}
        {m347.sinNif.length > 0 && <p className="nota">{tr('Sin NIF: {lista}. Añádelo en sus facturas o gastos (si es de fuera de España, su país en la ficha del cliente): sin él no se puede declarar.', { lista: m347.sinNif.map((o) => o.nombre).join(', ') })}</p>}
        {m347.ventas.length + m347.compras.length > 0 && !m347.sinNif.length && <Fichero foral={foralT} boe modelo="347" anio={anio} nif={u.emisor?.nif} />}
      </ModeloPlegable>

      {m180 && (
        <ModeloPlegable id="m180" num="180" nombre={tr('Resumen anual del alquiler')} detalle={m180.arrendadores.length ? tr('Hasta el {fecha}', { fecha: tr(plazoAnual('01-31')) }) : tr('Sin alquileres este año')} informativo={m180.arrendadores.length > 0}>
          <h2 className="grupo-t">180 · {tr('Resumen anual del alquiler')}</h2>
          <p className="grupo-pie arriba">{tr('No se paga: resume, por arrendador y local, el alquiler y las retenciones que ya ingresaste con el 115 cada trimestre.')}{notaHastaHoy}</p>
          <div className="tarjeta">
            {m180.arrendadores.length ? <TablaPersonas columnas={['Alquiler', 'Retenido']} filas={m180.arrendadores.map((p) => ({ clave: `${p.nif}-${p.nombre}-${p.situacion || ''}-${p.refCatastral || ''}`, nombre: p.nombre, detalle: [p.nif, p.refCatastral ? tr('Ref. catastral {ref}', { ref: p.refCatastral }) : p.situacion === 4 ? tr('Local sin referencia catastral') : '', p.situacion ? '' : tr('Falta el local: indícalo en el gasto')].filter(Boolean).join(' · '), cifras: [p.base, p.retenciones] }))}
              total={m180.arrendadores.length > 1 ? [r2(m180.arrendadores.reduce((x, p) => x + p.base, 0)), m180.retenciones] : null} /> : <p className="nota">{tr('Sin alquileres este año.')}</p>}
          </div>
          {m180.arrendadores.length > 0 && <Fichero foral={foralT} boe modelo="180" anio={anio} nif={u.emisor?.nif} />}
        </ModeloPlegable>
      )}

      {m296 && (
        <ModeloPlegable id="m296" num="296" nombre={tr('Resumen anual de no residentes')} detalle={m296.perceptores.length ? tr('Hasta el {fecha}', { fecha: tr(plazoAnual('01-31')) }) : tr('Sin pagos a no residentes este año')} informativo={m296.perceptores.length > 0}>
          <h2 className="grupo-t">296 · {tr('Resumen anual de no residentes')}</h2>
          <p className="grupo-pie arriba">{tr('No se paga: resume, por perceptor, lo que pagaste a no residentes y lo que les retuviste con el 216, con su país de residencia, el tipo de renta (clave) y el porcentaje. Lo exento por la ley o por un convenio también va, al 0 %. Se presenta del 1 al 31 de enero.')}{notaHastaHoy}</p>
          <div className="tarjeta">
            {m296.perceptores.length ? <TablaPersonas columnas={['Pagado', 'Retenido']} filas={m296.perceptores.map((p) => ({ clave: `${p.nombre}-${p.nif || p.nifResidencia}-${p.clave}-${p.subclave}-${p.pct}`, nombre: p.nombre,
              detalle: [p.nif || (p.nifResidencia && tr('NIF en su país {nif}', { nif: p.nifResidencia })), `${nombrePais(p.pais)} (${p.pais})`, tr('clave {clave} ({nombre})', { clave: p.clave, nombre: tr(p.claveNombre) }), tr('subclave {clave} ({nombre})', { clave: p.subclave, nombre: tr(SUBCLAVES_296[p.subclave]) }), `${String(p.pct).replace('.', ',')} %`].filter(Boolean).join(' · '), cifras: [p.base, p.retenciones] }))}
              total={m296.perceptores.length > 1 ? [m296.base, m296.retenciones] : null} /> : <p className="nota">{tr('Sin pagos a no residentes este año.')}</p>}
          </div>
        </ModeloPlegable>
      )}

      {m190 && (
        <ModeloPlegable id="m190" num="190" nombre={tr('Resumen anual de retenciones')} detalle={m190.perceptores.length ? tr('Hasta el {fecha}', { fecha: tr(plazoAnual('01-31')) }) : tr('Sin nóminas este año')} informativo={m190.perceptores.length > 0}>
          <h2 className="grupo-t">190 · {tr('Resumen anual de retenciones')}</h2>
          <p className="grupo-pie arriba">{tr('No se paga: resume, por persona, lo que pagaste y las retenciones que ya ingresaste con el 111 cada trimestre.')}{notaHastaHoy}</p>
          <div className="tarjeta">
            {m190.perceptores.length ? (() => {
              // La Seguridad Social del trabajador (gastos deducibles) solo va en la clave A y la E.01 y E.02.
              const ss = m190.perceptores.some((p) => 'gastosDeducibles' in p);
              return <TablaPersonas columnas={['Pagado', 'Retenido', ...(ss ? ['Seg. Social'] : [])]} filas={m190.perceptores.map((p) => ({ clave: `${p.clave}${p.subclave}-${p.nif}-${p.nombre}-${p.ejercicioDevengo || ''}`, nombre: p.nombre,
                detalle: [p.nif, tr('clave {clave} ({nombre})', { clave: `${p.clave}${p.subclave ? `.${p.subclave}` : ''}`, nombre: tr(CLAVES_190[p.clave] || p.clave) }), p.ejercicioDevengo && tr('atrasos de {anio}', { anio: p.ejercicioDevengo }), ...datos190(p, tr)].filter(Boolean).join(' · '), cifras: [p.percepciones, p.retenciones, ...(ss ? [p.gastosDeducibles ?? null] : [])] }))}
                total={m190.perceptores.length > 1 ? [m190.percepciones, m190.retenciones, ...(ss ? [r2(m190.perceptores.reduce((x, p) => x + (p.gastosDeducibles || 0), 0))] : [])] : null} />;
            })() : <p className="nota">{tr('Sin nóminas este año.')}</p>}
          </div>
          {m190.perceptores.length > 0 && <Fichero foral={foralT} boe modelo="190" anio={anio} nif={u.emisor?.nif} />}
        </ModeloPlegable>
      )}

      {is && (
        <ModeloPlegable id="m200" num={dForal ? dForal.is.num : '200'} nombre={tr('Impuesto de Sociedades {anio}', { anio })} favor={is.resultado < 0}
          detalle={`${tr('Borrador')} · ${tr(is.resultado >= 0 ? 'saldría a pagar' : 'saldría a devolver')} · ${dForal ? tr('en julio de {anio}', { anio: anio + 1 }) : tr('hasta el {fecha}', { fecha: tr(plazoAnual('07-25')) })}`} dato={importeFila(Math.abs(is.resultado))} parcial={anio === actual}>
          <h2 className="grupo-t">{tr('Borrador del Impuesto sobre Sociedades {anio}', { anio })}</h2>
          <p className="grupo-pie arriba">{tr('Solo con lo que hay en Fisquo: con la amortización de tus bienes de inversión, sin los gastos que no son deducibles')}{is.foral ? '' : `, ${tr('con las pérdidas de años anteriores, la reserva de capitalización y las deducciones y bonificaciones que apuntes')}`}; {tr('sin otros ajustes: tómalo como una idea de cuánto saldrá.')} {dForal ? tr('Se presenta en julio de {anio}.', { anio: anio + 1 }) : tr('Se presenta del 1 de julio al {fecha}.', { fecha: tr(plazoAnual('07-25')) })}</p>
          <div className="tarjeta">
            <Casillas sinNumeros={Boolean(foralT)} filas={[
              ['Ingresos', is.ingresos], ['Gastos', menos(is.gastos)], is.amortizacion && ['de ellos, amortizaciones', menos(is.amortizacion)], is.ajustesContables && ['Ingresos y gastos de asientos manuales', is.ajustesContables],
              (is.ajusteNoDeducible > 0 || is.compensacion > 0 || is.reserva?.aplicada > 0) && ['Resultado contable', is.resultadoContable],
              is.ajusteNoDeducible > 0 && ['Gastos no deducibles (art. 15, ajuste positivo)', is.ajusteNoDeducible],
              (is.ajusteNoDeducible > 0 || is.compensacion > 0 || is.reserva?.aplicada > 0) && ['Base imponible previa', is.basePrevia],
              is.reserva?.aplicada > 0 && [`Reserva de capitalización (art. 25, ${is.reserva.pct} % de ${eur(is.reserva.incremento)})`, menos(is.reserva.aplicada)],
              is.compensacion > 0 && ['Pérdidas de años anteriores compensadas (art. 26)', menos(is.compensacion)],
              is.perdida > 0 && ['Resultado (pérdida)', -is.perdida], ['Base imponible (beneficio)', is.base, true],
              ...is.tramos.map((x) => [is.tramos.length > 1 ? tr('{pct} % de {importe}', { pct: x.pct, importe: eur(x.base) }) : `Cuota al ${x.pct} %`, x.cuota]),
              [conDeducciones ? 'Cuota íntegra' : 'Cuota', is.cuota, true],
              is.ddi > 0 && ['Deducciones para evitar la doble imposición (arts. 30 a 32)', menos(is.ddi)],
              is.bonificaciones > 0 && ['Bonificaciones (arts. 33 y 34)', menos(is.bonificaciones)],
              is.donativos > 0 && ['Donativos a entidades sin fines lucrativos (Ley 49/2002)', menos(is.donativos)],
              is.deduccionesCapIV > 0 && [tr('Deducciones del capítulo IV, I+D+i incluida (límite del {pct} %, art. 39.1)', { pct: is.pct39 }), menos(is.deduccionesCapIV)],
              conDeducciones && ['Cuota líquida', is.cuotaLiquida, true],
              is.retenciones && ['Retenciones soportadas', menos(is.retenciones)], [dForal ? 'Pagos fraccionados marcados' : 'Pagos del 202 marcados', menos(is.pagos)],
              [is.resultado >= 0 ? 'Saldría a pagar' : 'Saldría a devolver', Math.abs(is.resultado), true],
            ]} />
            {is.noDeducibles?.length > 0 && <p className="nota">{tr('No se restan por no ser deducibles (art. 15 de la Ley del Impuesto sobre Sociedades): {lista}. Revísalo: si alguno sí es deducible, ábrelo en Gastos y quita la marca «No es deducible en el Impuesto sobre Sociedades».', { lista: is.noDeducibles.map((x) => `${x.concepto} (${eur(x.importe)}, ${tr(x.motivo)})`).join('; ') })}</p>}
            {is.perdida > 0 && <p className="nota">{tr('Con pérdidas no hay cuota: los {importe} se compensan con los beneficios de los años siguientes (base imponible negativa), y lo pagado a cuenta en el 202 se devuelve al presentar el 200. Los pagos del 202 se siguen haciendo: salen de la cuota del año anterior.', { importe: eur(is.perdida) })}</p>}
            {!is.foral && is.basePrevia > 0 && (is.compensacion > 0 || is.binsPendientes?.length > 0) && <p className="nota">{tr('Pérdidas de años anteriores pendientes al empezar {anio}: {lista}.', { anio, lista: is.binsPendientes.map((x) => `${x.de}, ${eur(x.importe)}`).join('; ') })} {tr('Se compensan de la más antigua a la más reciente,')} {is.sinLimiteBIN ? tr('sin el límite del 70 % (de los tres primeros años con beneficio de una sociedad de nueva creación, art. 26.3)') : tr('hasta {importe} (el 70 % de la base previa o, en todo caso, 1 millón)', { importe: eur(is.limiteBIN) })}. {tr('Las de los años que llevas en Fisquo salen de lo apuntado: si alguno no está completo aquí, pon la de verdad abajo (manda sobre la calculada).')}</p>}
            {!is.foral && is.binsQuedan?.length > 0 && <p className="nota">{tr('Quedan por compensar en los años siguientes: {lista}.', { lista: is.binsQuedan.map((x) => `${x.de}, ${eur(x.importe)}`).join('; ') })}</p>}
            {is.donativos > 0 && is.donativosDetalle?.recortado && <p className="nota">{tr('De los donativos, solo deducen {base} de los {donado} donados: la base de la deducción no puede pasar del {pct} % de la base imponible del año (art. 20 de la Ley 49/2002). Lo que sobra se pierde.', { base: eur(is.donativosDetalle.limite), donado: eur(is.donativosDetalle.donado), pct: anio >= 2024 ? 15 : 10 })}</p>}
            {is.deduccionesCapIV > 0 && <p className="nota">{tr('Las deducciones del capítulo IV (I+D+i, empleo de personas con discapacidad y las demás) caben hasta {limite}: el {pct} % de la cuota tras las bonificaciones y la doble imposición (art. 39.1).', { limite: eur(is.limite39), pct: is.pct39 })} {is.pct39 === 50 ? tr('Es el 50 % porque las deducciones de I+D+i generadas este año pasan del 10 % de esa cuota.') : ''}</p>}
            {is.deduccionesQuedan?.length > 0 && <p className="nota">{tr('Quedan deducciones por aplicar en los años siguientes: {lista}.', { lista: is.deduccionesQuedan.map((x) => `${tr(TIPOS_DEDUCCION_IS[x.tipo]?.nombre || x.tipo)} de ${x.de}, ${eur(x.importe)}`).join('; ') })}</p>}
            {is.reserva?.pendiente > 0 && <p className="nota">{tr('De la reserva de capitalización quedan {importe} sin aplicar (límite del {pct} % de la base previa): se pueden aplicar en los dos años siguientes, pero Fisquo no los arrastra.', { importe: eur(is.reserva.pendiente), pct: is.reserva.limitePct ?? 20 })}</p>}
            {is.foral ? <p className="nota">{tr('Tipo de la {hacienda} según tu cifra de negocios', { hacienda: tr(foralT.hacienda) })}{is.conAnterior ? ` ${tr('de {anio}', { anio: anio - 1 })}` : ` ${tr('de este año (no hay datos del anterior)')}`} ({eur(is.incn)}): {is.tramos[0]?.pct ?? '—'} %. {tr('Fisquo no sabe tu plantilla ni tu activo, que también cuentan para ser micro o pequeña empresa: confírmalo con tu gestor. Las pérdidas de años anteriores siguen las reglas de tu Hacienda foral: no se compensan aquí.')}</p> :
            <p className="nota">{tr(is.tamano === 'micro' ? 'Tipo de microempresa (facturación de menos de 1 millón)' : is.tamano === 'reducida' ? 'Tipo de empresa de reducida dimensión (menos de 10 millones)' : 'Tipo de general')}{is.conAnterior ? ` ${tr('según lo facturado en {anio}', { anio: anio - 1 })}` : `, ${tr('con lo facturado este año (no hay datos del anterior)')}`}{is.incnAnual !== is.incn ? ` (${tr('{a} en el año de constitución, {b} elevado al año para la reducida dimensión', { a: eur(is.incn), b: eur(is.incnAnual) })})` : ''}.{' '}
              {is.nuevaCreacion?.aplica ? tr('Sociedad de nueva creación: tributa al 15 % (primer año con beneficio, {anio}, y el siguiente). No vale si la actividad ya la hacía antes otra persona o sociedad vinculada, si es del mismo grupo o si es patrimonial: confírmalo con tu gestor.', { anio: is.nuevaCreacion.primero })
                : !f.constitucion ? tr('Si la sociedad es de nueva creación, añade su fecha de constitución en Ajustes › Actividades e impuestos: el primer año con beneficio y el siguiente tributa al 15 %.')
                : is.nuevaCreacion?.falta ? tr('No hay datos de {anio} en Fisquo para saber si aún toca el 15 % de nueva creación: confírmalo con tu gestor.', { anio: is.nuevaCreacion.falta })
                : is.nuevaCreacion?.primero && is.nuevaCreacion.primero < anio - 1 ? tr('El 15 % de nueva creación ya se aplicó en {a} y {b}.', { a: is.nuevaCreacion.primero, b: is.nuevaCreacion.primero + 1 }) : ''}</p>}
          </div>
          {!is.foral && <div className="tarjetas">
            <ImporteAnio campo="fondosPropios" anio={anio} valor={u.fondosPropios?.[anio] ?? null} soloLectura={soloLectura}
              titulo={`Incremento de los fondos propios en ${anio}`}
              ayuda={`Para la reserva de capitalización (art. 25): reduce la base un 20 % de lo que crecen los fondos propios (sin el resultado del año ni las aportaciones de los socios ni la reserva legal), si se mantiene 3 años y se dota la reserva. Te lo da tu gestor; sin él, no se aplica.`} />
            <div className="tarjeta"><p><strong>{tr('Pérdidas de antes de Fisquo pendientes de compensar')}</strong></p>
              <p className="nota">{tr('Fisquo calcula las de los años que tiene (hasta cinco atrás). Las de antes, o la real de un año que no está entero aquí, apúntalas por año de origen con lo que aún quedaba por compensar (está en el cuadro de bases negativas de tu último modelo 200).')}</p></div>
            {Object.entries(u.binsPrevias || {}).sort(([a], [b]) => a - b).map(([y, v]) => (
              <ImporteAnio key={y} campo="binsPrevias" anio={Number(y)} valor={v} soloLectura={soloLectura} titulo={`Base imponible negativa de ${y}`} ayuda="Lo que quedaba por compensar. Vacío y Guardar la quita." />
            ))}
            {!soloLectura && <ImporteAnio campo="binsPrevias" anio={null} valor={null} anioEditable titulo="Añadir una base negativa de otro año" ayuda="Año de origen e importe pendiente." />}
            <DeduccionesIS anio={anio} deducciones={u.deduccionesIS || []} soloLectura={soloLectura} />
          </div>}
        </ModeloPlegable>
      )}

      {/* 232: operaciones vinculadas y con paraísos fiscales. Informativo (no se paga) y se presenta solo si se pasa de
          alguno de sus límites; la vinculación de cada cliente o proveedor se marca en su ficha. */}
      {m232 && (
        <ModeloPlegable id="m232" num="232" nombre={tr('Operaciones vinculadas y paraísos fiscales')} informativo
          estado={m232.obligado ? 'listo' : undefined}
          detalle={m232.obligado ? `${tr('Hay que presentarlo')} · ${tr('hasta el {fecha}', { fecha: tr(plazoAnual('11-30')) })}`
            : m232.vinculadas ? tr('No pasas de ningún límite: no se presenta')
            : tr('Sin partes vinculadas marcadas')}>
          <h2 className="grupo-t">{tr('Modelo 232 de {anio}', { anio })}</h2>
          <p className="grupo-pie arriba">{tr('Declaración informativa de las operaciones con personas o entidades vinculadas y de las operaciones con países o territorios calificados como paraísos fiscales (art. 13.4 del Reglamento del Impuesto sobre Sociedades y Orden HFP/816/2017).')} <strong>{tr('No se paga nada: se presenta igual, del 1 al 30 de noviembre del año siguiente.')}</strong> {tr('Fisquo suma las operaciones de los clientes y proveedores que hayas marcado como vinculados en su ficha: la vinculación la decides tú, no se deduce de los datos.')}</p>
          {m232.vinculadas === 0 && !m232.obligado ? (
            <div className="tarjeta">
              <Vacio compacto icono="hacienda" titulo={tr('No has marcado ninguna parte vinculada')}>
                {tr('Abre la ficha de tu socio, administrador, consejero, familiar o sociedad del grupo (en Clientes o en Proveedores) y marca «Parte vinculada (modelo 232)». Con eso, Fisquo suma sus operaciones del año y te dice si toca presentarlo.')}
              </Vacio>
              <p className="nota">{tr('Si no tienes operaciones con ninguno de ellos ni con un paraíso fiscal, no hay nada que presentar.')}</p>
            </div>
          ) : (
            <div className="tarjeta">
              {m232.obligado ? (
                <>
                  <p><strong>{tr('Toca presentarlo: se pasa de estos límites')}</strong></p>
                  <ul className="lista-pagos">
                    {m232.motivos.map((m, i) => (
                      <li key={`${m.regla}-${i}`}><span>{tr(m.texto, { ...(m.tercero ? { tercero: m.tercero } : {}), ...(m.tipo ? { tipo: tr(TIPOS_OPERACION_232[m.tipo]) } : {}), importe: eur(Math.abs(m.importe)), ...(m.limite ? { limite: eur(m.limite) } : {}) })}</span></li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="nota">{tr('No hay obligación de presentarlo este año: con ninguna vinculada se pasa de 250.000 €, no hay operaciones específicas por encima de 100.000 € y no hay operaciones con paraísos fiscales.')} {m232.limite50 !== null ? tr('Y ninguna clase de operación llega al 50 % de la cifra de negocios del año ({limite}).', { limite: eur(m232.limite50) }) : tr('Y este año no has facturado nada, así que el límite del 50 % de la cifra de negocios no se puede cruzar.')}</p>
              )}
              {m232.terceros.length > 0 && (
                <TablaPersonas titulo="Operaciones del año por persona o entidad vinculada" columnas={['Ingresos', 'Pagos', 'Total']} filas={m232.terceros.map((t, i) => ({
                  clave: `${i}-${t.clave}`, nombre: t.nombre,
                  detalle: [t.nif || tr('Sin NIF'), `${tr(nombreVinculo(t.vinculo) || t.vinculo)}${t.letra ? ` (${t.letra})` : ''}`,
                    t.pais && PARAISOS_FISCALES[t.pais] && tr('Paraíso fiscal: {pais}', { pais: tr(PARAISOS_FISCALES[t.pais]) }),
                    t.especifica && tr('Operaciones específicas (módulos con el 25 %)'),
                    t.supera250 && tr('Pasa de los 250.000 €')].filter(Boolean).join(' · '),
                  cifras: [t.ingresos, t.pagos, t.total],
                }))} />
              )}
              {m232.filas.length > 0 && (
                <TablaPersonas titulo="Registros del cuadro I: por tipo de operación, sin compensar ingresos con pagos" columnas={['Importe sin IVA']} filas={m232.filas.map((g, i) => ({
                  clave: `${i}-${g.nif || g.nombre}-${g.tipo}-${g.lado}`, nombre: g.nombre,
                  detalle: `${tr(TIPOS_OPERACION_232[g.tipo])} · ${tr(g.lado === 'I' ? 'Ingreso' : 'Pago')}`,
                  cifras: [g.importe],
                }))} />
              )}
              {m232.porTipo.length > 0 && <p className="nota">{tr('Por clase de operación: {lista}.', { lista: m232.porTipo.map((x) => `${tr(TIPOS_OPERACION_232[x.tipo])} ${eur(x.total)}${x.especificas ? ` (${tr('específicas {importe}', { importe: eur(x.especificas) })})` : ''}`).join('; ') })} {tr('Los límites de las operaciones específicas ({especificas}) y del {pct} % de la cifra de negocios se miran por clase de operación en el conjunto del año, no con cada vinculada; el de {limite}, con cada una.', { especificas: eur(LIMITE_232_ESPECIFICAS), pct: PCT_232_CIFRA, limite: eur(LIMITE_232) })} {m232.limite50 !== null ? tr('Tu cifra de negocios de {anio} es {incn}, así que el 50 % son {limite}.', { anio, incn: eur(m232.incn), limite: eur(m232.limite50) }) : tr('Sin facturación este año no se puede mirar el límite del 50 %.')}</p>}
              {m232.sinOperaciones.length > 0 && <p className="nota">{tr('Marcados como vinculados pero sin operaciones en {anio}: {lista}. No se declaran.', { anio, lista: m232.sinOperaciones.map((x) => x.nombre).join(', ') })}</p>}
              {m232.paraisos.length > 0 && (
                <>
                  <TablaPersonas titulo="Cuadro III: operaciones con países o territorios calificados como paraísos fiscales" columnas={['Importe sin IVA']} filas={m232.paraisos.map((x, i) => ({
                    clave: `${i}-${x.pais}-${x.nif || x.nombre}-${x.lado}`, nombre: x.nombre,
                    detalle: [tr(x.nombrePais), x.nif || tr('Sin NIF'), tr(x.lado === 'I' ? 'Ingreso' : 'Pago')].filter(Boolean).join(' · '),
                    cifras: [x.importe],
                  }))} />
                  <p className="nota">{tr('En el cuadro III van todas las operaciones con esos territorios, estén o no vinculadas y sea cual sea su importe. La lista es la de jurisdicciones no cooperativas de la Orden HFP/115/2023, con las bajas de la Orden HAC/649/2026.')}</p>
                </>
              )}
              <p className="nota">{tr('Qué no sale de aquí y tienes que repasar con tu gestoría: el método de valoración del art. 18.4 de la Ley del Impuesto sobre Sociedades (Fisquo supone uno solo por clase de operación) y la clave del tipo de operación, que se eligen en la Sede; qué operaciones son específicas, salvo las de una persona física en módulos con el 25 % que marques en su ficha (la transmisión de un negocio, de valores, de un inmueble o de un intangible no se distingue de una venta cualquiera); el cuadro II de las rentas de intangibles del art. 23, que la app no calcula; y del cuadro III, la tenencia de valores al cierre.')}</p>
              <p className="nota">{tr('Tampoco entran las nóminas ni la Seguridad Social: la retribución del administrador por el ejercicio de sus funciones no es operación vinculada (art. 18.2.b), y Fisquo no la distingue del sueldo por otro trabajo. Y si estás en un grupo de consolidación fiscal, o eres una AIE o una UTE, esas operaciones quedan fuera del modelo (art. 2.2 de la Orden): Fisquo no lo sabe.')}</p>
            </div>
          )}
        </ModeloPlegable>
      )}

      {renta && (
        <ModeloPlegable id="m100" num="100" nombre={tr('Renta {anio}', { anio })} favor={renta.resultado < 0}
          detalle={`${tr('Borrador')} · ${tr(renta.resultado >= 0 ? 'saldría a pagar' : 'saldría a devolver')} · ${tr('de abril a junio de {anio}', { anio: anio + 1 })}`} dato={importeFila(Math.abs(renta.resultado))}>
          <h2 className="grupo-t">{tr('Borrador de la renta {anio}', { anio })}</h2>
          <p className="grupo-pie arriba">{tr('Tu actividad (estimación directa simplificada)')}{f.renta ? `, ${tr('con los datos personales de Ajustes')}` : ''}. {tr('No incluye vivienda, planes de pensiones ni discapacidad, y las deducciones autonómicas solo si pones su importe en Ajustes: tómalo como una idea de cuánto te saldrá.')}{!f.renta && ` ${tr('Añade tu situación familiar en Ajustes › Actividades e impuestos para afinarlo.')}`}{!f.renta?.inicio && ` ${tr('Si empezaste la actividad hace poco, pon allí el año: los dos primeros años con beneficio se reducen un 20 %.')}`}{renta.aproximada && ` ${tr('Sin tu comunidad autónoma (Ajustes › Actividades e impuestos), la parte autonómica es aproximada: se calcula como la estatal.')}`}</p>
          <div className="tarjeta">
            <Casillas sinNumeros={Boolean(foralT)} filas={[
              ['Ingresos de la actividad', renta.ingresos], ['Gastos deducibles', menos(renta.gastos)], renta.difJust > 0 && ['5 % gastos de difícil justificación', menos(renta.difJust)],
              renta.reduccion > 0 && [renta.tipoReduccion === 'dependiente' ? 'Reducción por cliente único (art. 32.2.1.º)' : 'Reducción por rentas bajas (art. 32.2.3.º)', menos(renta.reduccion)],
              renta.reduccionInicio > 0 && ['Reducción por inicio de actividad (20 %, art. 32.3)', menos(renta.reduccionInicio)],
              ['Rendimiento neto', renta.rendimiento, true],
              renta.otrasRentas > 0 && ['Otras rentas (solo para el tipo)', renta.otrasRentas],
              [tr('Cuota estatal (mínimos de {total}{detalle})', { total: eur(renta.minimos.total), detalle: renta.minimos.total > MINIMO_PERSONAL ? `: ${tr('personal {importe}', { importe: eur(renta.minimos.personal) })}${renta.minimos.descendientes ? `, ${tr('hijos {importe}', { importe: eur(renta.minimos.descendientes) })}` : ''}${renta.minimos.ascendientes ? `, ${tr('ascendientes {importe}', { importe: eur(renta.minimos.ascendientes) })}` : ''}` : '' }), renta.cuotaEstatal],
              [renta.aproximada ? 'Cuota autonómica (aproximada, como la estatal)' : `${tr('Cuota autonómica de {ccaa}', { ccaa: renta.nombreCcaa })}${renta.minimosAutonomicos.total !== renta.minimos.total ? ` (${tr('mínimos de {importe}', { importe: eur(renta.minimosAutonomicos.total) })})` : ''}`, renta.cuotaAutonomica],
              ...renta.ganancias.map((x) => [tr('Venta de {concepto} (base del ahorro): {a} menos {b} sin amortizar', { concepto: x.concepto, a: eur(x.transmision), b: eur(x.adquisicion) }), x.ganancia]),
              renta.cuotaAhorro > 0 && ['Cuota del ahorro de esas ganancias (19 % a 30 %)', renta.cuotaAhorro],
              ['Cuota', renta.cuota, true],
              renta.deduccionCeuta > 0 && [tr('Deducción por rentas obtenidas en {ccaa} (60 %)', { ccaa: renta.nombreCcaa }), menos(renta.deduccionCeuta)],
              renta.deduccionesAutonomicas > 0 && [renta.nombreCcaa ? tr('Deducciones autonómicas de {ccaa} (las que pusiste en Ajustes)', { ccaa: renta.nombreCcaa }) : tr('Deducciones autonómicas (las que pusiste en Ajustes)'), menos(renta.deduccionesAutonomicas)],
              ['Retenciones de tus facturas', menos(renta.retenciones)], ['Pagos del 130 marcados', menos(renta.pagos130)],
              renta.maternidad.maternidad > 0 && ['Deducción por maternidad', menos(renta.maternidad.maternidad)],
              renta.maternidad.guarderia > 0 && ['Incremento por gastos de guardería', menos(renta.maternidad.guarderia)],
              [renta.resultado >= 0 ? 'Saldría a pagar' : 'Saldría a devolver', Math.abs(renta.resultado), true],
            ]} />
            <p className="nota">{tr('Tipo medio: {pct} %.', { pct: String(renta.tipoMedio).replace('.', ',') })}{anio !== renta.escalaDe && ` ${tr('Con la escala de {anio} (la última publicada por la Agencia Tributaria).', { anio: renta.escalaDe })}`}</p>
            {renta.ganancias.some((x) => x.ganancia < 0) && <p className="nota">{tr('La pérdida por la venta de un bien de la actividad no resta aquí: se compensa con otras ganancias del ahorro o en los cuatro años siguientes (art. 49 LIRPF).')}</p>}
            {renta.sinBien > 0 && <p className="nota">{renta.sinBien === 1 ? tr('Has vendido un bien de inversión sin decir cuál en la factura: su ganancia o pérdida (base del ahorro, no de la actividad) no está en este borrador.') : tr('Has vendido {n} bienes de inversión sin decir cuál en la factura: su ganancia o pérdida (base del ahorro, no de la actividad) no está en este borrador.', { n: renta.sinBien })}</p>}
            {renta.inicioActividad?.falta && <p className="nota">{tr('No hay datos de {a} para saber si aún toca la reducción del 20 % por inicio de actividad: pon el rendimiento neto de ese año en el 130 de {b} o confírmalo con tu gestor.', { a: renta.inicioActividad.falta, b: renta.inicioActividad.falta + 1 })}</p>}
            {renta.inicioActividad?.primero && <p className="nota">{tr('La reducción del 20 % por inicio de actividad ya se aplicó en {a} y {b} (los dos primeros años con beneficio).', { a: renta.inicioActividad.primero, b: renta.inicioActividad.primero + 1 })}</p>}
            {renta.maternidad.sinMes > 0 && <p className="nota">{tr('Para la deducción por maternidad del año en que nació tu hijo o en que cumple 3 años hace falta el mes: escríbelo en Ajustes con el año (por ejemplo, 05/2024).')}</p>}
            {renta.maternidad.importe > 0 && <p className="nota">{tr('La deducción por maternidad resta aunque salga a devolver. Si cobras el abono anticipado (modelo 140), lo ya cobrado se descuenta.')}</p>}
          </div>
        </ModeloPlegable>
      )}
    </main>
  );
}

export async function generateMetadata() {
  return { title: (await textos())('Impuestos') };
}

// Trimestre ya presentado en el que cuentan facturas emitidas después de que acabara (por la fecha de su operación o la de
// la factura que rectifican, lib/calculos.js emitidasDespues): si no iban al presentarlo, hay que presentar una autoliquidación
// rectificativa (desde 2025 sustituye a la complementaria en el 303).
async function EmitidasDespues({ facturas }) {
  if (!facturas.length) return null;
  const tr = await textos();
  const nums = facturas.slice(0, 5).map((f) => numeroFactura(f)).join(', ');
  return <p className="nota aviso-rect">{facturas.length === 1 ? tr('Cuenta en este trimestre una factura emitida después, por su fecha de la operación: {nums}{mas}. Si al presentarlo no la incluiste, presenta una autoliquidación rectificativa de este 303 (aquí debajo, «Preparar la rectificativa»).', { nums, mas: facturas.length > 5 ? ` ${tr('y {n} más', { n: facturas.length - 5 })}` : '' }) : tr('Cuentan en este trimestre {n} facturas emitidas después, por su fecha de la operación: {nums}{mas}. Si al presentarlo no las incluiste, presenta una autoliquidación rectificativa de este 303 (aquí debajo, «Preparar la rectificativa»).', { n: facturas.length, nums, mas: facturas.length > 5 ? ` ${tr('y {n} más', { n: facturas.length - 5 })}` : '' })}</p>;
}
