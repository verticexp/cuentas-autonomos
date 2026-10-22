// Dónde presenta sus impuestos la empresa (fiscal.territorio en lib/empresa.js). En territorio común, todo va a la
// Agencia Tributaria. En Canarias, el IGIC va a la Agencia Tributaria Canaria (lib/igic.js) y el IRPF y Sociedades a la
// AEAT. Navarra, Álava, Bizkaia y Gipuzkoa tienen Hacienda propia (Convenio y Concierto Económico): el IVA, el IRPF, las
// retenciones y Sociedades se presentan allí, con sus modelos, sus casillas y sus plazos. El IVA se calcula igual (mismos
// tipos y reglas); lo que cambia es dónde, con qué modelo y hasta cuándo. Para el servidor y el navegador.
import { habil, r2, resumenAnual } from './calculos.js';

export const TERRITORIOS = {
  comun: { nombre: 'Territorio común', hacienda: 'Agencia Tributaria', sede: 'https://sede.agenciatributaria.gob.es' },
  canarias: { nombre: 'Canarias', hacienda: 'Agencia Tributaria Canaria', sede: 'https://sede.gobiernodecanarias.org/tributos/' },
  navarra: { nombre: 'Navarra', hacienda: 'Hacienda Foral de Navarra', sede: 'https://www.navarra.es/es/hacienda', foral: true },
  alava: { nombre: 'Álava', hacienda: 'Hacienda Foral de Álava', sede: 'https://web.araba.eus/es/hacienda', foral: true, ticketbai: true },
  bizkaia: { nombre: 'Bizkaia', hacienda: 'Hacienda Foral de Bizkaia', sede: 'https://www.bizkaia.eus/es/hacienda', foral: true, ticketbai: true },
  gipuzkoa: { nombre: 'Gipuzkoa', hacienda: 'Hacienda Foral de Gipuzkoa', sede: 'https://www.gipuzkoa.eus/es/web/ogasuna', foral: true, ticketbai: true },
};
// Para el cuestionario, en este orden.
export const OPCIONES_TERRITORIO = [
  ['comun', 'Agencia Tributaria (resto de España)'],
  ['canarias', 'Canarias (IGIC)'],
  ['navarra', 'Navarra (Hacienda Foral)'],
  ['alava', 'Álava (Hacienda Foral)'],
  ['bizkaia', 'Bizkaia (Hacienda Foral)'],
  ['gipuzkoa', 'Gipuzkoa (Hacienda Foral)'],
];

export const territorioDe = (fiscal) => (TERRITORIOS[fiscal?.territorio] ? fiscal.territorio : 'comun');
export const datosTerritorio = (fiscal) => TERRITORIOS[territorioDe(fiscal)];
// Navarra y el País Vasco: su Hacienda cobra el IVA, el IRPF y Sociedades.
export const esForal = (fiscal) => Boolean(datosTerritorio(fiscal).foral);
// País Vasco: las facturas se emiten con un programa TicketBAI dado de alta en su Hacienda (Batuz en Bizkaia).
export const conTicketBai = (fiscal) => Boolean(datosTerritorio(fiscal).ticketbai);

// ---- Modelos y plazos de cada Hacienda foral (2026). Fuentes oficiales consultadas el 22-10-2026: instrucciones de los
// modelos, reglamentos del IRPF e IVA, normas forales del Impuesto sobre Sociedades y calendarios fiscales de cada
// territorio (detalle en docs/territorios-forales.md). Revisar cada año.
// plazos: { trimestre: [mes, día] } del final del plazo (el del 4T, en enero o febrero del año siguiente); si cae en
// sábado, domingo o festivo, el siguiente día hábil. Cuando las fuentes oficiales no coinciden, el plazo más corto.
const MES_25 = { 1: [4, 25], 2: [7, 25], 3: [10, 25] };
const DIA_10 = { 1: [5, 10], 2: [8, 10], 3: [11, 10], 4: [2, 10] };
const VASCO = (iva, { irpf, ret, enero = 31 }) => ({
  // El 4T del IVA no se presenta: su resultado va en el 390, la autoliquidación final del año.
  iva: { num: iva, plazos: MES_25, cuarto: '390' },
  ivaAnual: { num: '390', plazo: [1, 31], final: true },
  irpf,
  ret: { num: '110', alquiler: ret, plazos: { ...MES_25, 4: [1, enero] } },
  // Sociedades: el pago fraccionado (203) es el 5 % de la base imponible del último periodo y no lo pagan las micro y
  // pequeñas empresas (hasta 10 M€ de cifra de negocios).
  // micro y pequena: hasta cuánto factura cada una (la norma pide además plantilla y activo, que Fisquo no conoce).
  is: { num: '200', pago: { num: '203', plazo: [10, 25], pct: 5, sobre: 'base', exentaPyme: true }, tipos: { micro: 20, pequena: 20, general: 24 }, pequena: 10e6, micro: 2e6 },
  renta: '109',
});
export const FORALES = {
  navarra: {
    // F-69 con su propio 4T; la declaración-resumen anual va como anexo de la última del año (no hay 390).
    iva: { num: 'F-69', plazos: { 1: [4, 20], 2: [8, 5], 3: [10, 20], 4: [1, 31] } },
    ivaAnual: null,
    irpf: { num: '130', metodo: 'navarra', plazos: { 1: [4, 20], 2: [8, 5], 3: [10, 20], 4: [1, 31] } },
    ret: { num: '715', alquiler: '759', plazos: { 1: [4, 20], 2: [7, 20], 3: [10, 20], 4: [1, 20] } },
    // Sociedades (Ley Foral 26/2016, art. 12 y 51): 28 % general (25 % con requisitos de empleo), 23 % la pequeña
    // empresa (menos de 20 M€) y 19 % la microempresa (hasta 1 M€). Pago fraccionado S-91 en octubre.
    is: { num: 'S-90', pago: { num: 'S-91', plazo: [10, 20], pct: 30, sobre: 'cuota' }, tipos: { micro: 19, pequena: 23, general: 28 }, pequena: 20e6 - 0.01, micro: 1e6 },
    renta: 'F-90',
  },
  // Bizkaia: el pago fraccionado del IRPF es del 1 al 25 (art. 111 del Reglamento) y las retenciones del 4T, hasta el 25 de enero.
  bizkaia: VASCO('303', { irpf: { num: '130', metodo: 'bizkaia', plazos: { ...MES_25, 4: [1, 25] }, exonerados: { 2026: [1] } }, ret: '115', enero: 25 }),
  // Gipuzkoa: el IVA trimestral es el 300 y el pago fraccionado se presenta hasta el día 10 del mes siguiente.
  gipuzkoa: VASCO('300', { irpf: { num: '130', metodo: 'gipuzkoa', plazos: DIA_10, exonerados: { 2026: [1] } }, ret: '115' }),
  // Álava: el pago fraccionado lo calcula y lo cobra la Diputación (de oficio); el 130 solo al empezar la actividad.
// exonerados: trimestres sin pago fraccionado por norma de urgencia (1T de 2026: Decreto Foral Normativo 1/2026 de Bizkaia,
// Decreto Foral-Norma 2/2026 de Gipuzkoa y Decreto Normativo de Urgencia Fiscal 2/2026 de Álava, de abril de 2026).
  alava: VASCO('303', { irpf: { num: '130', metodo: 'alava', plazos: DIA_10, deOficio: true, exonerados: { 2026: [1] } }, ret: '115-A' }),
};
export const foralDe = (fiscal) => FORALES[fiscal?.territorio] || null;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const lista = (l) => (l.length > 1 ? `${l.slice(0, -1).join(', ')} y ${l.at(-1)}` : l[0]);
// Los plazos de un modelo en palabras: { 1: [4, 25], 2: [7, 25], 3: [10, 25], 4: [1, 31] } → «hasta el 25 de abril, julio
// y octubre, y el 31 de enero». Sin hábiles: es el plazo de la norma.
export function textoPlazos(plazos) {
  const tramos = [];
  for (const t of [1, 2, 3, 4].filter((q) => plazos[q])) {
    const [mes, dia] = plazos[t];
    if (tramos.at(-1)?.dia === dia) tramos.at(-1).meses.push(MESES[mes - 1]);
    else tramos.push({ dia, meses: [MESES[mes - 1]] });
  }
  const partes = tramos.map((x) => `el ${x.dia} de ${lista(x.meses)}`);
  // «, y» solo cuando el tramo anterior ya lleva su «y» (abril, julio y octubre, y el 31 de enero).
  const y = partes.length > 1 && partes.at(-2).includes(' y ') ? ', y ' : ' y ';
  return `hasta ${partes.length > 1 ? `${partes.slice(0, -1).join(', ')}${y}${partes.at(-1)}` : partes[0]}`;
}

// Último día del plazo de un modelo trimestral en un territorio foral. clave: 'iva' | 'irpf' | 'ret'. En el País Vasco,
// el «plazo» del IVA del 4T es el del 390. null fuera de los territorios forales.
export function plazoForal(territorio, clave, t, anio) {
  const d = FORALES[territorio];
  if (!d) return null;
  const [mes, dia] = clave === 'iva' && t === 4 && d.iva.cuarto ? d.ivaAnual.plazo : d[clave].plazos[t];
  const y = t === 4 ? anio + 1 : anio;
  return habil(`${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
}

// Como situacionTrimestre (lib/calculos.js), con el plazo foral de cada modelo: «curso» mientras dura el trimestre, «listo»
// hasta el último día del plazo y «fuera» después.
const FIN_TRIMESTRE = ['03-31', '06-30', '09-30', '12-31'];
const diasHasta = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export function situacionForal(territorio, clave, t, anio, hoy) {
  const limite = plazoForal(territorio, clave, t, anio);
  const estado = hoy <= `${anio}-${FIN_TRIMESTRE[t - 1]}` ? 'curso' : hoy <= limite ? 'listo' : 'fuera';
  return { estado, limite, dias: diasHasta(hoy, limite) };
}

// ---- Pago fraccionado del IRPF de los autónomos en estimación directa, según el territorio. Trimestral, sin acumular:
// cada trimestre paga lo mismo (salvo en los casos con datos del propio trimestre).
// Navarra (Reglamento del IRPF, art. 92, modalidad 1): sobre todo el rendimiento neto del penúltimo año, el 6 % (de 6.500
// a 12.000 €), el 12 % (hasta 24.000), el 18 % (hasta 36.000) o el 24 % (más), menos sus retenciones; por cuartas partes.
export function pctNavarra(rendimiento) {
  const r = Number(rendimiento) || 0;
  if (r < 6500) return 0;
  if (r <= 12000) return 6;
  if (r <= 24000) return 12;
  if (r <= 36000) return 18;
  return 24;
}
// Modalidad 2 de Navarra (la de los primeros años, sin rendimiento del penúltimo): el porcentaje que toca al rendimiento
// del año elevado al año, sobre lo acumulado hasta el trimestre, menos sus retenciones y lo ya pagado.
function modalidad2(T) {
  let rend = 0, ret = 0, pagado = 0;
  return T.map((q, i) => {
    rend += (q.ingresos || 0) - (q.gastos || 0); ret += q.retenciones || 0;
    const pago = r2(Math.max(0, pctNavarra(rend * 4 / (i + 1)) / 100 * rend - ret - pagado));
    pagado += pago;
    return pago;
  });
}
// p: { rendPenultimo, retPenultimo, ingresosPenultimo (del penúltimo año), anio, anioInicio (primer año de la actividad, si
// se sabe), trimestres: [{ ingresos, gastos, retenciones }] del año en curso }. Devuelve { metodo, pagos: [importe de cada
// trimestre] o null, texto, deOficio? } o null fuera de los territorios forales.
export function pagoFraccionadoForal(territorio, p = {}) {
  const d = FORALES[territorio];
  if (!d) return null;
  const rend = p.rendPenultimo === null || p.rendPenultimo === undefined ? null : Number(p.rendPenultimo);
  const ret = Number(p.retPenultimo) || 0;
  const T = p.trimestres || [];
  const desde = p.anioInicio !== undefined && p.anioInicio !== null ? p.anio - p.anioInicio : null; // 0: año de inicio
  const cuatro = (v) => [1, 2, 3, 4].map(() => r2(Math.max(0, v)));
  const delTrimestre = (pct) => T.map((q) => r2(Math.max(0, pct / 100 * ((q.ingresos || 0) - (q.gastos || 0)) - (q.retenciones || 0))));
  const metodo = d.irpf.metodo;
  if (rend === null && desde !== null && desde <= 1) {
    if (metodo === 'bizkaia') return { metodo: 'trimestre', pagos: delTrimestre(20), texto: 'Año de inicio o el siguiente: 20 % de los ingresos menos los gastos de cada trimestre, menos sus retenciones' };
    if (metodo === 'navarra') return { metodo: 'modalidad2', pagos: modalidad2(T), texto: 'Primeros años (modalidad 2): el porcentaje que toca al rendimiento del año, sobre lo acumulado, menos retenciones y lo ya pagado' };
    if (metodo === 'alava' && desde === 0) return { metodo: 'trimestre', pagos: delTrimestre(5), texto: 'Año de inicio: 5 % del rendimiento neto de cada trimestre, menos sus retenciones (lo presentas tú con el 130)' };
    if (metodo === 'alava') return { metodo: 'de-oficio', pagos: null, deOficio: true, texto: 'El año siguiente al de inicio, la Diputación te liquida los pagos a partir de lo que pagaste el primer año' };
    if (metodo === 'gipuzkoa') return { metodo: 'penultimo', pct: 5, pagos: cuatro(0), texto: 'Sin rendimiento del penúltimo año no hay pago (puedes ingresar el 1 % de lo facturado en el trimestre, menos sus retenciones)' };
  }
  if (metodo === 'navarra') {
    if (rend === null) return { metodo: 'sin-datos', pagos: null, texto: 'Hace falta el rendimiento neto del penúltimo año' };
    const pct = pctNavarra(rend);
    return { metodo: 'penultimo', pct, pagos: cuatro((rend * pct / 100 - ret) / 4), texto: `${pct} % del rendimiento neto del penúltimo año, menos sus retenciones, en cuatro partes` };
  }
  if (rend === null) return { metodo: 'sin-datos', pagos: null, texto: 'Hace falta el rendimiento neto del penúltimo año' };
  // 5 % del rendimiento neto del penúltimo año menos una cuarta parte de sus retenciones. Bizkaia: sin rendimiento
  // positivo, el 0,5 % de las ventas o ingresos de ese año. Álava: lo calcula y lo cobra la Diputación.
  const deOficio = Boolean(d.irpf.deOficio);
  if (metodo === 'bizkaia' && rend <= 0) return { metodo: 'ventas', pagos: cuatro(0.005 * (Number(p.ingresosPenultimo) || 0) - ret / 4), texto: '0,5 % de las ventas del penúltimo año (sin rendimiento positivo), menos una cuarta parte de sus retenciones' };
  return { metodo: 'penultimo', pct: 5, pagos: cuatro(0.05 * rend - ret / 4), deOficio, texto: `5 % del rendimiento neto del penúltimo año, menos una cuarta parte de sus retenciones${deOficio ? ': lo calcula y te lo cobra la Diputación' : ''}` };
}

// Tipo del Impuesto sobre Sociedades foral según la cifra de negocios del año anterior (sin los requisitos de plantilla o
// de activo, que Fisquo no conoce: el resultado es una estimación). null fuera de los territorios forales.
export function tipoISForal(territorio, cifraNegocios) {
  const is = FORALES[territorio]?.is;
  if (!is) return null;
  const c = Number(cifraNegocios) || 0;
  return c <= is.micro ? is.tipos.micro : c <= is.pequena ? is.tipos.pequena : is.tipos.general;
}

// El pago fraccionado foral de un año con lo que hay en Fisquo: el rendimiento neto, las retenciones y los ingresos del
// penúltimo año salen de sus facturas y gastos si los hay; si no, el rendimiento escrito en Impuestos (rend130[año]).
// inicio: la actividad empezó este año o el anterior (no hay nada en Fisquo antes). Devuelve lo de pagoFraccionadoForal
// con origen ('fisquo', 'escrito' o null) y el año que se usa, o null fuera de los territorios forales.
export function pagosIrpfForal(fiscal, { facturas = [], gastos = [], anio, rend130 = {}, actividades, ivaCoste = false, iva = {} } = {}) {
  const t = territorioDe(fiscal);
  if (!FORALES[t]) return null;
  const penultimo = anio - 2;
  const conDatos = (y) => [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`));
  const op = { ivaCoste, iva };
  const res = (y) => resumenAnual(facturas, gastos, y, {}, actividades, op);
  const primero = Math.min(...[...facturas, ...gastos].map((x) => Number(x.fecha?.slice(0, 4)) || anio), anio);
  let datos = {}, origen = null;
  if (conDatos(penultimo)) {
    const q4 = res(penultimo).trimestres[3];
    datos = { rendPenultimo: q4.rendAcum, retPenultimo: q4.retAcum, ingresosPenultimo: q4.ingAcum };
    origen = 'fisquo';
  } else if (rend130[penultimo] !== undefined && rend130[penultimo] !== null && rend130[penultimo] !== '') {
    datos = { rendPenultimo: Number(rend130[penultimo]) };
    origen = 'escrito';
  }
  const actual = res(anio).trimestres.map((q) => ({ ingresos: q.ingresos, gastos: q.gastos, retenciones: q.retenciones }));
  const r = pagoFraccionadoForal(t, { ...datos, anio, anioInicio: origen ? null : primero, trimestres: actual });
  const exonerados = FORALES[t].irpf.exonerados?.[anio] || [];
  if (r?.pagos && exonerados.length) r.pagos = r.pagos.map((v, i) => (exonerados.includes(i + 1) ? 0 : v));
  return r && { ...r, origen, penultimo, exonerados };
}
