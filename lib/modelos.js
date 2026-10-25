// Modelos 115, 180, 349, 390, 190, 202, borrador del Impuesto sobre Sociedades (200) y de la renta (100). Orientativos: los confirma la gestoría.
import { tipoISForal } from './territorios.js';
import { pctAfecto, tipoAutoliquidado } from './ivaDeducible.js';
import { categoriaDe, noDeducibleIS } from './categorias.js';
import { MARGEN, RECARGO, casillas303, compraDeBienes, costeGasto, desglose, devengadoCaja, fechaDeduccion, fechaDevengo, fechaIva, gastoEnCaja, habil, importes, limiteTrimestre, liquidaciones303, nifUE, operacionesCaja, operacionesProrrata, origenGasto, pagosDe, prorrataAnio, prorrataBienes, r2, resumenAnual, trimestre } from './calculos.js';
import { TIPOS_OPERACION, operacionDe } from './operaciones.js';
import { calculoNomina, nominasPagadasEn } from './nominas.js';
import { amortizacionesAnio, bajasBienes, valorNeto } from './amortizaciones.js';
import { claveProveedor } from './proveedores.js';
import { valorInventario } from './inventario.js';
import { CLAVES_296, claveNoResidente, pctNoResidente, nifEspanol, subclave296 } from './noResidentes.js';

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));
const delT = (l, anio, t) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && (!t || trimestre(x.fecha) === t));
export const RET_ALQUILER = 19;
// Sin fecha de pago explícita, los gastos históricos se consideran pagados al emitirlos.
const pagadosEn = (gastos, anio, t) => delT(gastos.filter((g) => !g.pendiente).map((g) => ({ ...g, fecha: g.pagado || g.fecha })), anio, t);

// 115 (trimestral) y 180 (anual): retenciones del alquiler del local. Los gastos marcados «alquiler» (con la retención
// del 19 %, art. 100 RIRPF; el de un arrendador no residente va al 216 y al 296). El alquiler del local sin retención (g.alquilerSinRetencion, sin «alquiler»: importes() no le
// retiene) no va en ninguno de los dos: va en el 347 (modelo347).
// Causas por las que el alquiler del local no lleva retención (art. 75.3.h RIRPF y, el arrendador no residente sin
// establecimiento, art. 74 RIRPF: se le retiene por el IRNR con el 216, que Fisquo no hace).
export const CAUSAS_SIN_RETENCION = {
  menos900: 'Lo que pagas en el año a ese arrendador no pasa de 900 € (art. 75.3.h.2.º RIRPF)',
  epigrafe861: 'El arrendador está en el epígrafe 861 del IAE y su cuota no sale cero: te da el certificado (art. 75.3.h.3.º RIRPF)',
  vivienda: 'Es una vivienda que la empresa alquila para un empleado (art. 75.3.h.1.º RIRPF)',
  leasing: 'Es un arrendamiento financiero (leasing) del inmueble (art. 75.3.h.4.º RIRPF)',
  otra: 'Otra causa que te ha confirmado la gestoría (arrendador exento, no residente, local rústico…)',
};
// Situación del inmueble (diseño de registro del 180, posición 114): 1, con referencia catastral en España salvo el País
// Vasco y Navarra; 2, en el País Vasco; 3, en Navarra; 4, sin referencia catastral. La referencia (posiciones 115-134):
// 20 caracteres (14 de la parcela, 4 del inmueble y 2 de control).
export const SITUACIONES_INMUEBLE = {
  1: 'En España, fuera del País Vasco y Navarra, con referencia catastral',
  2: 'En el País Vasco, con referencia catastral',
  3: 'En Navarra, con referencia catastral',
  4: 'Sin referencia catastral',
};
export const REF_CATASTRAL = /^[0-9A-Z]{20}$/;
export function modelo115(gastos, anio, t) {
  const A = pagadosEn(gastos.filter((g) => g.alquiler && !g.noResidente), anio, t);
  const base = suma(A, (g) => g.base);
  return { perceptores: new Set(A.map((g) => claveProveedor(g) || 'sin nombre')).size, base, retenciones: suma(A, (g) => r2((g.base * RET_ALQUILER) / 100)) };
}
// 180: un registro por arrendador e inmueble (diseño, posiciones 114-134: situación y referencia catastral del inmueble
// de cada registro). Los gastos sin inmueble (los de antes) van juntos, en el del arrendador sin inmueble.
export function modelo180(gastos, anio) {
  const m = new Map();
  for (const g of pagadosEn(gastos.filter((x) => x.alquiler && !x.noResidente), anio)) {
    const inm = g.inmueble?.situacion ? g.inmueble : null;
    const k = `${claveProveedor(g) || 'sin nombre'}|${inm ? `${inm.situacion}:${inm.refCatastral || ''}` : ''}`;
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', ...(inm ? { situacion: inm.situacion, ...(inm.refCatastral ? { refCatastral: inm.refCatastral } : {}) } : {}), base: 0, retenciones: 0 };
    p.base = r2(p.base + g.base);
    p.retenciones = r2(p.retenciones + r2((g.base * RET_ALQUILER) / 100));
    m.set(k, p);
  }
  const arrendadores = [...m.values()];
  return { arrendadores, base: suma(arrendadores, (p) => p.base), retenciones: suma(arrendadores, (p) => p.retenciones) };
}

// 309 (IVA, declaración-liquidación no periódica; diseño de registro DR309 v1.4 de la AEAT): quien no presenta el 303
// (actividad exenta, recargo de equivalencia o régimen de la agricultura) y compra a la UE o con inversión del sujeto
// pasivo ingresa así el IVA de esas compras (art. 71.1 RIVA y Orden HAC/3625/2003), cada trimestre en que las haya.
// Una declaración por hecho imponible: 1 adquisición intracomunitaria de bienes (y con ella, en el recargo de
// equivalencia, el recargo de cada tipo, art. 156 LIVA) y 3 inversión del sujeto pasivo (servicios de la UE y de fuera,
// y compras de España del art. 84.Uno.2.º). Liquidación: régimen general en las filas 01-03, 25-27, 04-06 y 07-09 (base,
// tipo y cuota, una por tipo), recargo en las 10-12, 13-15, 16-18 y 19-21, total 22, a deducir 23 (nada: no hay derecho
// a deducir) y resultado 24. Situación tributaria: 1 agricultura, 2 recargo de equivalencia, 3 sin derecho a deducción.
const FILAS309 = [['01', '02', '03'], ['25', '26', '27'], ['04', '05', '06'], ['07', '08', '09']];
const FILAS309_RE = [['10', '11', '12'], ['13', '14', '15'], ['16', '17', '18'], ['19', '20', '21']];
export function modelo309(gastos, anio, t, { regimen } = {}) {
  const situacion = { reagp: 1, recargo: 2 }[regimen] || 3;
  const hechos = new Map();
  for (const g of delT(gastos, anio, t)) {
    const origen = origenGasto(g);
    if (!origen) continue;
    const hecho = origen === 'ue' && compraDeBienes(g) ? 1 : 3;
    const pct = tipoAutoliquidado(g);
    const h = hechos.get(hecho) || new Map();
    const x = h.get(pct) || { pct, base: 0 };
    x.base = r2(x.base + g.base);
    h.set(pct, x);
    hechos.set(hecho, h);
  }
  const declaraciones = [...hechos].sort(([a], [b]) => a - b).map(([hecho, tipos]) => {
    const c = {};
    const lista = [...tipos.values()].sort((a, b) => b.pct - a.pct);
    lista.slice(0, 4).forEach((x, i) => { const [b, p, q] = FILAS309[i]; c[b] = x.base; c[p] = x.pct; c[q] = r2((x.base * x.pct) / 100); });
    if (hecho === 1 && regimen === 'recargo') lista.slice(0, 4).forEach((x, i) => { if (!RECARGO[x.pct]) return; const [b, p, q] = FILAS309_RE[i]; c[b] = x.base; c[p] = RECARGO[x.pct]; c[q] = r2((x.base * RECARGO[x.pct]) / 100); });
    c['22'] = r2(['03', '27', '06', '09', '12', '15', '18', '21'].reduce((s, k) => s + (c[k] || 0), 0));
    c['23'] = 0;
    c['24'] = r2(c['22'] - c['23']);
    return { hecho, situacion, c, ...(lista.length > 4 ? { masTipos: true } : {}) };
  });
  return { declaraciones, ingresar: suma(declaraciones, (d) => d.c['24']) };
}

// 349: clientes de otros países de la UE (NIF-IVA con prefijo del país), clave S (servicios prestados), y proveedores
// de la UE con su NIF-IVA, clave I (servicios recibidos).
export { nifUE };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const dos = (n) => String(n).padStart(2, '0');
const finDeMes = (anio, mes) => `${anio}-${dos(mes)}-${dos(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`;
// Primer y último día de un trimestre (o del año, sin trimestre).
const rangoT = (anio, t) => (t ? [`${anio}-${dos(3 * t - 2)}-01`, finDeMes(anio, 3 * t)] : [`${anio}-01-01`, `${anio}-12-31`]);

// Operaciones del 349, una por factura o gasto: { nif, nombre, clave, base, fecha, original? }. Solo la parte sin IVA de
// las operaciones intracomunitarias (lib/operaciones.js): con IVA español no es intracomunitaria; y sin lo que en el REBU y
// el REAV queda fuera de la base (fueraBase), que tampoco va en la casilla 59 del 303. fecha: la de devengo, como en la 59
// (fechaDevengo de lib/calculos.js). original: en una rectificativa, la fecha de la operación que corrige (la de su factura
// original o, sin ella a mano, rectifica.fecha). Los abonos de proveedores no dicen qué gasto corrigen: no la llevan.
function operaciones349(facturas, gastos) {
  const out = [];
  for (const f of facturas) {
    const op = TIPOS_OPERACION[operacionDe(f)];
    const nif = nifUE(f.cliente?.nif);
    // Irlanda del Norte (XI) solo cuenta como UE para bienes: sus servicios no van al 349.
    if (!op?.clave349 || !nif || (nif.startsWith('XI') && op.clave349 === 'S')) continue;
    const orig = f.rectifica?.id && facturas.find((x) => x.id === f.rectifica.id);
    const original = orig ? fechaDevengo(orig) : FECHA.test(f.rectifica?.fecha || '') ? f.rectifica.fecha : '';
    const base = r2(desglose(f).filter((x) => x.pct === 0 && !x.fueraBase).reduce((s, x) => s + x.base, 0));
    out.push({ nif, nombre: f.cliente.nombre, clave: op.clave349, base, fecha: fechaDevengo(f), ...(original ? { original } : {}) });
  }
  // Compras a la UE: A las de bienes (un bien de inversión, mercaderías o con stock) e I las de servicios.
  for (const g of gastos) {
    const nif = nifUE(g.proveedorNif);
    const bienes = Boolean(g.inversion || g.stock?.length) || ['600', '601', '602'].includes(categoriaDe(g));
    if (nif && origenGasto(g) === 'ue' && (bienes || !nif.startsWith('XI'))) out.push({ nif, nombre: g.proveedor || 'Sin nombre', clave: bienes ? 'A' : 'I', base: g.base, fecha: g.fecha });
  }
  return out;
}

// Entregas de bienes y servicios prestados (claves E y S; no las compras A e I) de un periodo, sin IVA y sin las
// rectificaciones de operaciones de antes del periodo (van aparte).
const entregas349 = (ops, desde, hasta) => r2(ops.filter((o) => ['E', 'S'].includes(o.clave) && o.fecha >= desde && o.fecha <= hasta && !(o.original && o.original < desde)).reduce((s, o) => s + o.base, 0));
// Periodicidad (art. 81 RIVA; instrucciones del 349): mensual si las entregas y servicios pasan de 50.000 € en el trimestre
// o en cualquiera de los cuatro anteriores. Devuelve el mes (AAAA-MM) desde el que es mensual (el primero del trimestre si
// fue en uno anterior, o el mes en cuyo final se pasa) o null si es trimestral. Superado a final de un mes, se presenta
// en los 20 días siguientes por los meses que van de trimestre (diseño de registro del 349, posición 186).
export const LIMITE_349_MENSUAL = 50000;
function mensual349(ops, anio, t) {
  for (let i = 1; i <= 4; i++) {
    const q = (anio * 4 + t - 1) - i;
    if (entregas349(ops, ...rangoT(Math.floor(q / 4), (q % 4) + 1)) > LIMITE_349_MENSUAL) return `${anio}-${dos(3 * t - 2)}`;
  }
  const [desde] = rangoT(anio, t);
  for (let mes = 3 * t - 2; mes <= 3 * t; mes++) if (entregas349(ops, desde, finDeMes(anio, mes)) > LIMITE_349_MENSUAL) return `${anio}-${dos(mes)}`;
  return null;
}
// Declaración en la que fue una operación: { ejercicio, periodo ('1T'…'4T' o el mes '01'…'12'), desde, hasta }. En un
// trimestre que pasó a mensual, la primera declaración mensual recoge los meses del trimestre hasta el que lo supera.
function periodo349(ops, fecha) {
  const anio = Number(fecha.slice(0, 4)), t = trimestre(fecha), mes = Number(fecha.slice(5, 7));
  const desdeMes = mensual349(ops, anio, t);
  if (!desdeMes) { const [desde, hasta] = rangoT(anio, t); return { ejercicio: anio, periodo: `${t}T`, desde, hasta }; }
  const corte = Number(desdeMes.slice(5, 7));
  return mes <= corte
    ? { ejercicio: anio, periodo: dos(corte), desde: rangoT(anio, t)[0], hasta: finDeMes(anio, corte) }
    : { ejercicio: anio, periodo: dos(mes), desde: `${anio}-${dos(mes)}-01`, hasta: finDeMes(anio, mes) };
}

// operadores: un registro por operador y clave, con las operaciones del periodo (las rectificativas del mismo periodo
// restan). Una rectificativa de una operación de un periodo anterior (ya declarado) no resta aquí: va en rectificaciones
// (diseño de registro del 349, posiciones 147-178) con la clave, el ejercicio y el periodo que corrige, la nueva base de
// ese periodo (base) y la que se declaró entonces (anterior). Ninguna base puede ser negativa: lo que un abono sin su
// operación resta de más queda en negativos, para revisarlo. mensual: el mes desde el que el 349 es mensual, o null.
// rango: [desde, hasta] de una declaración mensual (periodos349), en vez del trimestre.
export function modelo349(facturas, anio, t, gastos = [], { rango } = {}) {
  const ops = operaciones349(facturas, gastos);
  const [desde, hasta] = rango || rangoT(anio, t);
  const en = (o, d, h) => o.fecha >= d && o.fecha <= h;
  const previa = (o, d) => Boolean(o.original) && o.original < d;
  const m = new Map();
  for (const o of ops) {
    if (!en(o, desde, hasta) || previa(o, desde)) continue;
    const c = m.get(o.nif + o.clave) || { nif: o.nif, nombre: o.nombre, clave: o.clave, base: 0 };
    c.base = r2(c.base + o.base);
    m.set(o.nif + o.clave, c);
  }
  const R = new Map();
  for (const o of ops) {
    if (!en(o, desde, hasta) || !previa(o, desde)) continue;
    const p = periodo349(ops, o.original);
    const k = [o.nif, o.clave, p.ejercicio, p.periodo].join('|');
    const r = R.get(k) || { nif: o.nif, nombre: o.nombre, clave: o.clave, ejercicio: p.ejercicio, periodo: p.periodo, p, ahora: 0 };
    r.ahora = r2(r.ahora + o.base);
    R.set(k, r);
  }
  const rectificaciones = [...R.values()].map(({ p, ahora, ...r }) => {
    const mismo = (o) => o.nif === r.nif && o.clave === r.clave;
    // Lo declarado en ese periodo y lo que ya lo corrigieron las declaraciones posteriores, anteriores a esta.
    const declarado = Math.max(0, r2(ops.filter((o) => mismo(o) && en(o, p.desde, p.hasta) && !previa(o, p.desde)).reduce((s, o) => s + o.base, 0)));
    const corregido = r2(ops.filter((o) => mismo(o) && o.original >= p.desde && o.original <= p.hasta && o.fecha > p.hasta && o.fecha < desde).reduce((s, o) => s + o.base, 0));
    const anterior = Math.max(0, r2(declarado + corregido));
    return { ...r, base: Math.max(0, r2(anterior + ahora)), anterior };
  });
  const operadores = [...m.values()].filter((c) => c.base > 0).sort((a, b) => b.base - a.base);
  return {
    operadores, total: suma(operadores, (c) => c.base),
    rectificaciones, totalRectificaciones: suma(rectificaciones, (r) => r.base),
    negativos: [...m.values()].filter((c) => c.base < 0),
    mensual: t && !rango ? mensual349(ops, anio, t) : null,
  };
}
// Declaraciones de un trimestre: una trimestral o, si pasa a mensual (más de 50.000 € de entregas y servicios), la del
// periodo del trimestre hasta el mes en que se supera y después una por mes (art. 81 RIVA; instrucciones del 349).
// Cada una con su periodo ('1T'…'4T' o el mes '01'…'12') y su plazo (el 20 del mes siguiente; el último del año, el 30 de
// enero; el de julio, hasta el 20 de septiembre).
export function periodos349(facturas, anio, t, gastos = []) {
  const m = modelo349(facturas, anio, t, gastos);
  const plazo = (mes) => habil(mes === 12 ? `${anio + 1}-01-30` : mes === 7 ? `${anio}-09-20` : `${anio}-${dos(mes + 1)}-20`);
  if (!m.mensual) return [{ periodo: `${t}T`, plazo: limiteTrimestre(t, anio), ...m }];
  const corte = Number(m.mensual.slice(5, 7));
  const meses = [[rangoT(anio, t)[0], corte], ...Array.from({ length: 3 * t - corte }, (_, i) => [`${anio}-${dos(corte + 1 + i)}-01`, corte + 1 + i])];
  return meses.map(([desde, mes]) => ({ ...modelo349(facturas, anio, t, gastos, { rango: [desde, finDeMes(anio, mes)] }), periodo: dos(mes), plazo: plazo(mes), mensual: m.mensual }));
}

// 390: resumen anual del IVA, con las casillas del diseño de registro de 2025 (DR390e2025 v1.02 y sus instrucciones; el
// de 2026 aún no está publicado). Sale de los cuatro 303 del año (lib/calculos.js casillas303), que ya llevan la prorrata,
// y de su detalle: el 390 separa por tipos y por régimen lo que el 303 junta.
// Devengado por tipo (0 %, 4 %, 10 %, 21 %; los de 2 %, 5 % y 7,5 % tienen casilla pero en 2025 solo admiten cero).
const T390 = {
  ordinario: { 0: ['700', '701'], 4: ['01', '02'], 10: ['03', '04'], 21: ['05', '06'], 2: ['667', '668'], 5: ['702', '703'], 7.5: ['669', '670'] },
  caja: { 0: ['708', '709'], 4: ['643', '644'], 10: ['645', '646'], 21: ['647', '648'] },
  rebu: { 0: ['712', '713'], 4: ['07', '08'], 10: ['09', '10'], 21: ['11', '12'] },
  reav: { 21: ['13', '14'] },
  aib: { 0: ['716', '717'], 4: ['21', '22'], 10: ['23', '24'], 21: ['25', '26'] },
  ais: { 0: ['720', '721'], 4: ['545', '546'], 10: ['547', '548'], 21: ['551', '552'] },
};
// Deducciones por bloque y tipo, y la casilla del total del bloque; base del 303 de cada bloque.
const D390 = {
  int: { 4: ['190', '191'], 10: ['603', '604'], 21: ['605', '606'], total: ['48', '49'], b303: ['28', '29'] },
  intInv: { 4: ['196', '197'], 10: ['611', '612'], 21: ['613', '614'], total: ['50', '51'], b303: ['30', '31'] },
  imp: { 4: ['202', '203'], 10: ['619', '620'], 21: ['621', '622'], total: ['52', '53'], b303: ['32', '33'] },
  impInv: { 4: ['208', '209'], 10: ['623', '624'], 21: ['625', '626'], total: ['54', '55'], b303: ['34', '35'] },
  aib: { 4: ['214', '215'], 10: ['627', '628'], 21: ['629', '630'], total: ['56', '57'], b303: ['36', '37'] },
  aibInv: { 4: ['220', '221'], 10: ['631', '632'], 21: ['633', '634'], total: ['58', '59'], b303: ['38', '39'] },
  ais: { 4: ['587', '588'], 10: ['635', '636'], 21: ['637', '638'], total: ['597', '598'], b303: ['36', '37'] },
};
export const ETIQUETAS390 = {
  '01': 'Régimen ordinario 4 %: base', '02': 'Régimen ordinario 4 %: cuota', '03': 'Régimen ordinario 10 %: base', '04': 'Régimen ordinario 10 %: cuota', '05': 'Régimen ordinario 21 %: base', '06': 'Régimen ordinario 21 %: cuota',
  700: 'Régimen ordinario 0 %: base', 667: 'Régimen ordinario 2 %: base', 668: 'Régimen ordinario 2 %: cuota', 702: 'Régimen ordinario 5 %: base', 703: 'Régimen ordinario 5 %: cuota', 669: 'Régimen ordinario 7,5 %: base', 670: 'Régimen ordinario 7,5 %: cuota',
  708: 'Criterio de caja 0 %: base', 643: 'Criterio de caja 4 %: base', 644: 'Criterio de caja 4 %: cuota', 645: 'Criterio de caja 10 %: base', 646: 'Criterio de caja 10 %: cuota', 647: 'Criterio de caja 21 %: base', 648: 'Criterio de caja 21 %: cuota',
  712: 'Bienes usados (REBU) 0 %: base', '07': 'Bienes usados (REBU) 4 %: base', '08': 'Bienes usados (REBU) 4 %: cuota', '09': 'Bienes usados (REBU) 10 %: base', 10: 'Bienes usados (REBU) 10 %: cuota', 11: 'Bienes usados (REBU) 21 %: base', 12: 'Bienes usados (REBU) 21 %: cuota',
  13: 'Agencias de viajes (REAV): base', 14: 'Agencias de viajes (REAV): cuota',
  716: 'Compras de bienes a la UE 0 %: base', 21: 'Compras de bienes a la UE 4 %: base', 22: 'Compras de bienes a la UE 4 %: cuota', 23: 'Compras de bienes a la UE 10 %: base', 24: 'Compras de bienes a la UE 10 %: cuota', 25: 'Compras de bienes a la UE 21 %: base', 26: 'Compras de bienes a la UE 21 %: cuota',
  720: 'Servicios de la UE 0 %: base', 545: 'Servicios de la UE 4 %: base', 546: 'Servicios de la UE 4 %: cuota', 547: 'Servicios de la UE 10 %: base', 548: 'Servicios de la UE 10 %: cuota', 551: 'Servicios de la UE 21 %: base', 552: 'Servicios de la UE 21 %: cuota',
  27: 'Otras inversiones del sujeto pasivo: base', 28: 'Otras inversiones del sujeto pasivo: cuota',
  29: 'Modificación de bases y cuotas: base', 30: 'Modificación de bases y cuotas: cuota', 31: 'Modificaciones por concurso o créditos incobrables: base', 32: 'Modificaciones por concurso o créditos incobrables: cuota',
  33: 'Total bases imponibles', 34: 'Total cuotas devengadas',
  35: 'Recargo de equivalencia 0,5 %: base', 36: 'Recargo de equivalencia 0,5 %: cuota', 599: 'Recargo de equivalencia 1,4 %: base', 600: 'Recargo de equivalencia 1,4 %: cuota', 601: 'Recargo de equivalencia 5,2 %: base', 602: 'Recargo de equivalencia 5,2 %: cuota',
  665: 'Recargo de equivalencia 0,62 %: base', 666: 'Recargo de equivalencia 0,62 %: cuota', 691: 'Recargo de equivalencia 0,26 %: base', 692: 'Recargo de equivalencia 0,26 %: cuota',
  43: 'Modificación del recargo: base', 44: 'Modificación del recargo: cuota', 45: 'Modificación del recargo por concurso o incobrables: base', 46: 'Modificación del recargo por concurso o incobrables: cuota',
  47: 'Total cuotas de IVA y recargo de equivalencia',
  190: 'Interiores corrientes 4 %: base', 191: 'Interiores corrientes 4 %: cuota', 603: 'Interiores corrientes 10 %: base', 604: 'Interiores corrientes 10 %: cuota', 605: 'Interiores corrientes 21 %: base', 606: 'Interiores corrientes 21 %: cuota', 48: 'Interiores corrientes: base', 49: 'Interiores corrientes: cuota deducible',
  196: 'Interiores, bienes de inversión 4 %: base', 197: 'Interiores, bienes de inversión 4 %: cuota', 611: 'Interiores, bienes de inversión 10 %: base', 612: 'Interiores, bienes de inversión 10 %: cuota', 613: 'Interiores, bienes de inversión 21 %: base', 614: 'Interiores, bienes de inversión 21 %: cuota', 50: 'Interiores, bienes de inversión: base', 51: 'Interiores, bienes de inversión: cuota deducible',
  202: 'Importaciones corrientes 4 %: base', 203: 'Importaciones corrientes 4 %: cuota', 619: 'Importaciones corrientes 10 %: base', 620: 'Importaciones corrientes 10 %: cuota', 621: 'Importaciones corrientes 21 %: base', 622: 'Importaciones corrientes 21 %: cuota', 52: 'Importaciones corrientes: base', 53: 'Importaciones corrientes: cuota deducible',
  208: 'Importaciones de bienes de inversión 4 %: base', 209: 'Importaciones de bienes de inversión 4 %: cuota', 623: 'Importaciones de bienes de inversión 10 %: base', 624: 'Importaciones de bienes de inversión 10 %: cuota', 625: 'Importaciones de bienes de inversión 21 %: base', 626: 'Importaciones de bienes de inversión 21 %: cuota', 54: 'Importaciones de bienes de inversión: base', 55: 'Importaciones de bienes de inversión: cuota deducible',
  214: 'Compras de bienes a la UE 4 %: base', 215: 'Compras de bienes a la UE 4 %: cuota', 627: 'Compras de bienes a la UE 10 %: base', 628: 'Compras de bienes a la UE 10 %: cuota', 629: 'Compras de bienes a la UE 21 %: base', 630: 'Compras de bienes a la UE 21 %: cuota', 56: 'Compras de bienes corrientes a la UE: base', 57: 'Compras de bienes corrientes a la UE: cuota deducible',
  220: 'Bienes de inversión de la UE 4 %: base', 221: 'Bienes de inversión de la UE 4 %: cuota', 631: 'Bienes de inversión de la UE 10 %: base', 632: 'Bienes de inversión de la UE 10 %: cuota', 633: 'Bienes de inversión de la UE 21 %: base', 634: 'Bienes de inversión de la UE 21 %: cuota', 58: 'Bienes de inversión de la UE: base', 59: 'Bienes de inversión de la UE: cuota deducible',
  587: 'Servicios de la UE 4 %: base', 588: 'Servicios de la UE 4 %: cuota', 635: 'Servicios de la UE 10 %: base', 636: 'Servicios de la UE 10 %: cuota', 637: 'Servicios de la UE 21 %: base', 638: 'Servicios de la UE 21 %: cuota', 597: 'Servicios de la UE: base', 598: 'Servicios de la UE: cuota deducible',
  60: 'Compensaciones del régimen agrario: base', 61: 'Compensaciones del régimen agrario: cuota', 639: 'Rectificación de deducciones: base', 62: 'Rectificación de deducciones: cuota',
  63: 'Regularización de bienes de inversión', 522: 'Regularización por la prorrata definitiva', 64: 'Suma de deducciones', 65: 'Resultado del régimen general',
  84: 'Suma de resultados', 85: 'Compensación de cuotas del ejercicio anterior', 86: 'Resultado de la liquidación',
  95: 'Total a ingresar en los 303 del año', 97: 'Último periodo: a compensar', 98: 'Último periodo: a devolver', 662: 'Cuotas pendientes de compensar generadas en el año (no incluidas en la 97)',
  99: 'Operaciones en régimen general', 653: 'Operaciones del criterio de caja', 103: 'Entregas y servicios intracomunitarios exentos', 104: 'Exportaciones y otras exentas con derecho a deducir',
  105: 'Exentas sin derecho a deducir', 110: 'No sujetas por reglas de localización', 125: 'Con inversión del sujeto pasivo', 126: 'Ventanilla única (OSS), no sujetas en España', 127: 'Ventanilla única (OSS), sujetas',
  227: 'Régimen de bienes usados (REBU)', 228: 'Régimen de agencias de viajes (REAV)', 106: 'Inmuebles y operaciones financieras no habituales', 107: 'Entregas de bienes de inversión', 108: 'Total volumen de operaciones',
  232: 'Bases del IVA soportado no deducible', 654: 'Entregas del criterio de caja (regla general): base', 655: 'Entregas del criterio de caja (regla general): cuota', 656: 'Adquisiciones del criterio de caja (regla general): base', 657: 'Adquisiciones del criterio de caja (regla general): cuota',
  115: 'Prorrata: importe total de las operaciones', 116: 'Prorrata: operaciones con derecho a deducir', 117: 'Prorrata: tipo (G general, E especial)', 118: 'Prorrata: porcentaje definitivo',
};
// Orden del formulario; en negrita los totales, que se enseñan siempre.
export const ORDEN390 = ['700', '01', '02', '667', '668', '702', '703', '669', '670', '03', '04', '05', '06', '708', '643', '644', '645', '646', '647', '648',
  '712', '07', '08', '09', '10', '11', '12', '13', '14', '716', '21', '22', '23', '24', '25', '26', '720', '545', '546', '547', '548', '551', '552',
  '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '599', '600', '601', '602', '665', '666', '691', '692', '43', '44', '45', '46', '47',
  '190', '191', '603', '604', '605', '606', '48', '49', '196', '197', '611', '612', '613', '614', '50', '51', '202', '203', '619', '620', '621', '622', '52', '53',
  '208', '209', '623', '624', '625', '626', '54', '55', '214', '215', '627', '628', '629', '630', '56', '57', '220', '221', '631', '632', '633', '634', '58', '59',
  '587', '588', '635', '636', '637', '638', '597', '598', '60', '61', '639', '62', '63', '522', '64', '65', '84', '85', '86', '95', '97', '98', '662',
  '99', '653', '103', '104', '105', '110', '125', '126', '127', '227', '228', '106', '107', '108', '232', '654', '655', '656', '657', '115', '116', '117', '118'];
export const TOTALES390 = ['33', '34', '47', '64', '65', '84', '86', '95', '108'];
export function modelo390(facturas, gastos, anio, iva = {}) {
  const q = [1, 2, 3, 4].map((t) => casillas303(facturas, gastos, anio, t, iva));
  const s = (k) => suma(q, (c) => c[k] || 0);
  const c = {};
  const sumar = (k, v) => { if (k) c[k] = r2((c[k] || 0) + v); };
  const avisos = new Set();
  // Devengado. El 303 junta en las 01-09 el régimen ordinario, lo devengado por los cobros del criterio de caja y el margen
  // de los regímenes de bienes usados y agencias de viajes: aquí cada uno a lo suyo.
  const porTipo = (lista) => { const m = new Map(); for (const x of lista) { const y = m.get(x.pct) || { base: 0, iva: 0 }; y.base += x.base; y.iva += x.iva; m.set(x.pct, y); } return m; };
  const devengado = new Map([[4, { base: s('01'), iva: s('03') }], [10, { base: s('04'), iva: s('06') }], [21, { base: s('07'), iva: s('09') }], ...q.flatMap((x) => x.otros).reduce((m, o) => m.set(o.pct, { base: (m.get(o.pct)?.base || 0) + o.base, iva: (m.get(o.pct)?.iva || 0) + o.iva }), new Map())]);
  const especiales = { caja: porTipo(q.flatMap((x) => x.detalle.caja)), rebu: porTipo(q.flatMap((x) => x.detalle.margen.filter((m) => m.r === 'rebu'))), reav: porTipo(q.flatMap((x) => x.detalle.margen.filter((m) => m.r === 'reav'))) };
  for (const [r, m] of Object.entries(especiales)) for (const [pct, v] of m) {
    const d = devengado.get(pct);
    if (d) { d.base -= v.base; d.iva -= v.iva; }
    const k = T390[r][pct];
    if (!k) avisos.add(`Hay operaciones de ${r === 'caja' ? 'criterio de caja' : r.toUpperCase()} al ${pct} %, que el 390 no recoge en ese régimen: revísalas con tu gestor.`);
    sumar(k?.[0], v.base); sumar(k?.[1], v.iva);
  }
  for (const [pct, v] of devengado) {
    const k = T390.ordinario[pct];
    sumar(k?.[0], v.base); sumar(k?.[1], v.iva);
    if ([2, 5, 7.5].includes(pct) && (v.base || v.iva) && anio >= 2025) avisos.add(`Hay ventas al ${String(pct).replace('.', ',')} %: en el 390 de ${anio} esas casillas solo admiten cero. Revisa esas facturas con tu gestor.`);
  }
  for (const a of q.flatMap((x) => x.detalle.adq)) { const k = T390[a.r][a.pct]; sumar(k?.[0], a.base); sumar(k?.[1], a.iva); }
  sumar('27', s('12')); sumar('28', s('13'));
  const mod80 = q.flatMap((x) => x.detalle.mod80);
  const b80 = suma(mod80, (x) => x.base), q80 = suma(mod80, (x) => x.iva), re80 = suma(mod80.filter((x) => x.recargo), (x) => x.recargo), reb80 = suma(mod80.filter((x) => x.recargo), (x) => x.base);
  sumar('29', r2(s('14') - b80)); sumar('30', r2(s('15') - q80)); sumar('31', b80); sumar('32', q80);
  // Totales del devengado (33 y 34): cada par base-cuota de arriba.
  const pares = [...Object.values(T390).flatMap((m) => Object.values(m)), ['27', '28'], ['29', '30'], ['31', '32']];
  c['33'] = r2(pares.reduce((t, [b]) => t + (c[b] || 0), 0));
  c['34'] = r2(pares.reduce((t, [, k]) => t + (c[k] || 0), 0));
  // Recargo de equivalencia y sus modificaciones (las de concurso o incobrables, aparte).
  sumar('35', s('168')); sumar('36', s('170')); sumar('599', s('19')); sumar('600', s('21')); sumar('601', s('22')); sumar('602', s('24'));
  for (const o of q.flatMap((x) => x.reOtros || [])) { const [b, k] = o.re === 0.62 ? ['665', '666'] : ['691', '692']; sumar(b, o.base); sumar(k, o.recargo); }
  sumar('43', r2(s('25') - reb80)); sumar('44', r2(s('26') - re80)); sumar('45', reb80); sumar('46', re80);
  c['47'] = r2((c['34'] || 0) + ['36', '600', '602', '666', '692', '44', '46'].reduce((t, k) => t + (c[k] || 0), 0));
  // Deducciones: lo deducido en cada 303 (ya con la prorrata) repartido por tipos en proporción a la cuota de cada gasto.
  const ded = {};
  for (const x of q) {
    const especial = Boolean(x.prorrata?.especial);
    for (const [b303, q303] of [...new Set(Object.values(D390).map((d) => d.b303.join()))].map((k) => k.split(','))) {
      const filas = x.detalle.ded.filter((f) => D390[f.b].b303[0] === b303 && !(especial && f.uso === 'exentas'));
      const antes = filas.reduce((t, f) => t + f.iva, 0);
      let resto = x[q303] || 0;
      filas.forEach((f, i) => {
        const iva = i === filas.length - 1 ? r2(resto) : r2(antes ? (f.iva * (x[q303] || 0)) / antes : 0);
        resto = r2(resto - iva);
        const k = `${f.b}|${f.pct}`;
        ded[k] = { base: r2((ded[k]?.base || 0) + f.base), iva: r2((ded[k]?.iva || 0) + iva) };
      });
    }
  }
  for (const [k, v] of Object.entries(ded)) {
    const [b, pct] = k.split('|');
    const cas = D390[b][pct];
    if (!cas && (v.base || v.iva)) avisos.add(`Hay gastos al ${String(pct).replace('.', ',')} % en ${ETIQUETAS390[D390[b].total[0]].replace(': base', '').toLowerCase()}: van en el total del bloque; su casilla por tipo la pone tu gestor.`);
    sumar(cas?.[0], v.base); sumar(cas?.[1], v.iva);
    sumar(D390[b].total[0], v.base); sumar(D390[b].total[1], v.iva);
  }
  sumar('60', s('base42')); sumar('61', s('42')); sumar('639', s('40')); sumar('62', s('41')); c['63'] = 0; sumar('522', s('44'));
  c['64'] = r2(['49', '51', '53', '55', '57', '59', '598', '61', '62', '63', '522'].reduce((t, k) => t + (c[k] || 0), 0));
  c['65'] = r2(c['47'] - c['64']);
  // Resultado de la liquidación anual y de los 303 (liquidaciones303: compensación, devolución y caducidad).
  const L = liquidaciones303(facturas, gastos, anio, undefined, iva);
  let previo = L[0].anterior, c85 = 0;
  L.forEach((l, i) => { if (i) previo = Math.max(0, r2(previo - l.caducado)); const usar = Math.min(previo, l.compensado); c85 = r2(c85 + usar); previo = r2(previo - usar); });
  c['84'] = c['65']; c['85'] = c85; c['86'] = r2(c['84'] - c['85']);
  c['95'] = suma(L, (l) => l.ingresar);
  const l4 = L[3];
  c['97'] = !l4.devolucion && l4.bruto < 0 ? r2(-l4.bruto) : 0;
  c['98'] = l4.devolucion || 0;
  c['662'] = l4.devolucion ? 0 : Math.max(0, r2(l4.pendiente - c['97'] - previo));
  // Volumen de operaciones (art. 121 LIVA): por la fecha de devengo y sin el IVA. Cada factura según su régimen y, la parte
  // sin IVA, según su operación (lib/operaciones.js), como en el 303.
  const deCaja = new Set(operacionesCaja(facturas, iva.recc).flat().map((f) => f.id));
  for (const f of facturas.filter((x) => fechaDevengo(x).startsWith(`${anio}-`))) {
    if (f.oss?.pais) { sumar('126', importes(f).base); continue; }
    const op = TIPOS_OPERACION[operacionDe(f)];
    const exenta = op?.ue && !nifUE(f.cliente?.nif) ? null : op?.clave349 === 'S' && nifUE(f.cliente?.nif).startsWith('XI') ? '110' : { 59: '103', 60: '104', 120: '110', 122: '125' }[op?.casilla303] || (f.operacion === 'exenta' && operacionDe(f) === 'exenta' ? '105' : null);
    for (const x of desglose(f)) {
      if (MARGEN[f.margen] && (x.margen || x.fueraBase)) sumar(f.margen === 'rebu' ? '227' : '228', x.base);
      else if (x.pct) sumar(deCaja.has(f.id) ? '653' : '99', x.base);
      else sumar(exenta || '99', x.base);
    }
  }
  // Lo que no es de la actividad habitual (factura con accesoria) va en su casilla y se resta del total (art. 121.Tres).
  const accesorias = (k) => r2(facturas.filter((f) => f.accesoria === k && fechaDevengo(f).startsWith(`${anio}-`) && !f.oss?.pais).reduce((s, f) => s + desglose(f).reduce((x, d) => x + d.base, 0), 0));
  c['106'] = accesorias('inmueble'); c['107'] = accesorias('inversion');
  c['108'] = r2(['99', '653', '103', '104', '105', '110', '125', '126', '127', '227', '228'].reduce((t, k) => t + (c[k] || 0), 0) - c['106'] - c['107']);
  // Operaciones específicas y prorrata.
  c['232'] = suma(q, (x) => x.detalle.noDeducible);
  sumar('654', s('62')); sumar('655', s('63')); sumar('656', s('74')); sumar('657', s('75'));
  const definitiva = prorrataAnio(facturas, anio);
  if (definitiva !== null || q[3].prorrata) {
    const o = operacionesProrrata(facturas, anio);
    c['115'] = o.total; c['116'] = r2(o.total - o.exentas); c['117'] = q[3].prorrata?.especial ? 'E' : 'G'; c['118'] = definitiva ?? 100;
  }
  // baseDed: la base de todo el IVA soportado deducible (los bloques de la 48 a la 597).
  const baseDed = r2(['48', '50', '52', '54', '56', '58', '597'].reduce((t, k) => t + (c[k] || 0), 0));
  return { c, avisos: [...avisos], trimestres: q.map((x) => x['46']), resultado: r2(c['47'] - c['64']), deducible: s('45'), devengado: s('27'), baseDed };
}

// Retenciones a profesionales (gastos con irpfPct, por ejemplo la gestoría): casillas 07 a 09 del 111 y clave G del 190.
// También las del art. 75.2.b RIRPF (19 %, alquiler de una máquina o de un negocio, propiedad intelectual…; clave I del
// 190): el 111 las recoge «cuando deriven de una actividad económica desarrollada por su perceptor», y entonces son
// rendimientos de actividades económicas, casillas 07 a 09 (instrucciones del 111 en la Sede: «Obligados a presentar» y
// «Casillas 07, 08 y 09»). Si no lo son (rendimientos del capital mobiliario), van al 123 y al 193, no aquí.
export function retencionesProfesionales(gastos, anio, t) {
  const R = pagadosEn(gastos.filter((g) => !g.alquiler && !g.noResidente && Number(g.irpfPct) > 0), anio, t);
  return { perceptores: new Set(R.map((g) => claveProveedor(g) || 'sin nombre')).size, base: suma(R, (g) => g.base), retenciones: suma(R, (g) => importes(g).irpf) };
}

// 190: resumen anual de retenciones de los trabajadores (clave A), los consejeros y administradores (clave E), los
// profesionales (clave G), los empresarios en módulos y agricultores con el 1 o el 2 % (clave H) y otras rentas (I), por
// perceptor, clave y subclave (diseño de registro del 190, posiciones 78-80).
// Subclaves de los gastos con retención (clave190 del gasto; sin ella, la que toca a su %): pct es la retención que les
// corresponde (art. 95 y 101 RIRPF).
export const SUBCLAVES_190 = {
  G01: { pct: 15, nombre: 'Profesional (retención general del 15 %)' },
  G02: { pct: 7, nombre: 'Recaudador municipal, mediador de seguros o delegado de Loterías (7 %)' },
  G03: { pct: 7, nombre: 'Profesional en sus tres primeros años (7 %)' },
  H01: { pct: 2, nombre: 'Agricultura o ganadería (2 %)' },
  H02: { pct: 1, nombre: 'Engorde de porcino o avicultura (1 %)' },
  H03: { pct: 2, nombre: 'Actividad forestal (2 %)' },
  H04: { pct: 1, nombre: 'Empresario en módulos (1 %)' },
  // Clave I (diseño del 190): rentas del art. 75.2.b RIRPF que para quien las cobra son de su actividad económica (no
  // profesional). I01, derechos de imagen (24 %, art. 101.2 RIRPF); I02, propiedad intelectual (15 %, el tipo general del
  // art. 101.9 LIRPF); I03, el resto: arrendamiento de bienes muebles, negocios o minas, propiedad industrial, asistencia
  // técnica (19 %, art. 101.2 RIRPF). Si no son de una actividad de quien cobra, son capital mobiliario: 123 y 193.
  I01: { pct: 24, nombre: 'Cesión de derechos de imagen, dentro de su actividad (24 %)' },
  I02: { pct: 15, nombre: 'Propiedad intelectual, dentro de su actividad (15 %)' },
  I03: { pct: 19, nombre: 'Arrendamiento de negocios o bienes muebles y otras del art. 75.2.b RIRPF (19 %)' },
};
const SUBCLAVE_DEFECTO = { 15: 'G01', 7: 'G03', 2: 'H01', 1: 'H04', 19: 'I03', 24: 'I01' };
export const clave190De = (g) => (SUBCLAVES_190[g.clave190]?.pct === Number(g.irpfPct) ? g.clave190 : SUBCLAVE_DEFECTO[Number(g.irpfPct)] || (Number(g.irpfPct) <= 2 ? 'H01' : 'G01'));
// Clave E (consejeros y administradores, lib/nominas.js cotizacion.administrador): 01 asimilado, 02 asimilado de una
// sociedad que facturó menos de 100.000 € (pequena), 03 autónomo de una pequeña y 04 el resto.
const subclaveE = (adm, pequena) => (adm === 'asimilado' ? (pequena ? '02' : '01') : pequena ? '03' : '04');
// Datos adicionales de la clave A (posiciones 153-254), de lo que el trabajador comunicó en el 145 (empleado.datos145):
// año de nacimiento, situación familiar (con el NIF del cónyuge en la 2), discapacidad (0, 1 del 33 al 65 %, 2 con
// movilidad reducida, 3 del 65 % o más), contrato (1 general, 2 de menos de un año, 3 relación laboral especial, 4
// peonadas), movilidad geográfica e hijos con derecho al mínimo (menores de 25 a 31 de diciembre o con discapacidad): los
// menores de 3 años (o adoptados en el año o los dos anteriores) y el resto, con cuántos se computan por entero.
const CONTRATO_190 = { general: 1, inferiorAnio: 2, especial: 3, manuales: 4 };
function datos190(d, anio) {
  if (!d) return { contrato: 1 };
  const hijos = (d.descendientes || []).filter((h) => h.nacimiento <= anio && (anio - h.nacimiento < 25 || (h.discapacidad && h.discapacidad !== 'no')));
  const menor3 = (h) => anio - h.nacimiento < 3 || (h.adopcion !== undefined && anio - h.adopcion < 3);
  const cuenta = (l) => ({ total: l.length, porEntero: l.filter((h) => h.porEntero).length });
  return {
    nacimiento: d.nacimiento, situacionFamiliar: d.situacionFamiliar, ...(d.situacionFamiliar === 2 && d.nifConyuge ? { nifConyuge: d.nifConyuge } : {}),
    discapacidad: d.discapacidad === '65' ? 3 : d.discapacidad === '33a65' ? (d.movilidadReducida ? 2 : 1) : 0,
    contrato: CONTRATO_190[d.contrato] || 1, movilidad: d.movilidadGeografica ? 1 : 0,
    hijos: { menores3: cuenta(hijos.filter(menor3)), resto: cuenta(hijos.filter((h) => !menor3(h))) },
  };
}
// gastosDeducibles (posiciones 184-196): en la clave A y la E.01 y E.02, la Seguridad Social del trabajador de sus nóminas.
export function modelo190(nominas, empleados, anio, gastos = []) {
  const m = new Map();
  for (const n of nominasPagadasEn(nominas, anio)) {
    const e = empleados.find((x) => x.id === n.empleado) || {};
    const c = calculoNomina(n);
    const adm = n.detalle?.administrador || e.cotizacion?.administrador;
    const clave = adm ? 'E' : 'A', subclave = adm ? subclaveE(adm, e.cotizacion?.pequena) : '';
    const k = `${n.empleado}:${clave}${subclave}`;
    const conGastos = clave === 'A' || ['01', '02'].includes(subclave);
    const p = m.get(k) || { nombre: e.nombre || n.empleadoNombre, nif: e.nif || '', clave, subclave, percepciones: 0, retenciones: 0, ...(conGastos ? { gastosDeducibles: 0 } : {}), ...(clave === 'A' ? datos190(e.datos145, anio) : {}) };
    p.percepciones = r2(p.percepciones + c.bruto); p.retenciones = r2(p.retenciones + c.irpf);
    if (conGastos) p.gastosDeducibles = r2(p.gastosDeducibles + c.ssTrabajador);
    m.set(k, p);
  }
  for (const g of pagadosEn(gastos.filter((x) => !x.alquiler && !x.noResidente && Number(x.irpfPct) > 0), anio)) {
    const sc = clave190De(g);
    const k = `prof:${sc}:${claveProveedor(g) || 'sin nombre'}`;
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', clave: sc[0], subclave: sc.slice(1), percepciones: 0, retenciones: 0 };
    p.percepciones = r2(p.percepciones + g.base); p.retenciones = r2(p.retenciones + importes(g).irpf);
    m.set(k, p);
  }
  const perceptores = [...m.values()];
  return { perceptores, percepciones: suma(perceptores, (p) => p.percepciones), retenciones: suma(perceptores, (p) => p.retenciones) };
}

// 347: clientes (clave B) y proveedores (clave A) con los que se pasa de 3.005,06 € en el año, con lo de cada trimestre.
// Fuera: lo que ya va en el 349 (empresas de la UE), lo de fuera de la UE (ventas sin IVA a un NIF que no es español y
// compras de fuera), lo que lleva retención (va en el 190 o el 180: facturas con retención, alquiler del local y
// profesionales; art. 33.2 RGAT, operaciones ya incluidas en otra declaración informativa) y los tickets sin proveedor.
// El alquiler del local sin retención (g.alquilerSinRetencion) no va en el 180: sí aquí, en un registro aparte con la
// marca de arrendamiento de local de negocio (arrendamiento, posición 100 del diseño: «debiendo consignarlas separadamente
// del resto»). El registro de inmueble (tipo 2) es solo del arrendador.
// Importe (instrucciones del 347, «Importe de las operaciones»): la base más el IVA, el recargo de equivalencia y la
// compensación del régimen de la agricultura (REAGP). Ventas por la fecha con la que cuentan en el 303 (fechaIva).
// Registros aparte (diseño de registro del 347, tipo 2 de declarado), con la misma clave:
//  · isp: compras con inversión del sujeto pasivo (posición 282). Solo las marcadas (g.isp, de momento solo en IGIC): la
//    app no recoge la inversión del sujeto pasivo en los gastos de proveedores españoles con IVA.
//  · caja: operaciones del criterio de caja (posiciones 281 y 284-299): las facturas de la empresa en el régimen
//    (iva.recc, lib/calculos.js operacionesCaja) y los gastos que esperan al pago para deducirse (gastoEnCaja), con solo
//    importes anuales: total, lo devengado por la regla general (la factura), e importeCaja, lo devengado al cobrar o pagar
//    (o el 31 de diciembre del año siguiente). Con la empresa en el régimen durante el año, toda su declaración es anual
//    (soloAnual): ningún registro lleva trimestres.
//  · metalico: cobros en efectivo de más de 6.000 € de un cliente (posiciones 101-115), con el ejercicio de las operaciones
//    (132-135); los de facturas de años anteriores, en un registro con total 0. Cuenta como efectivo el cobro apuntado así
//    (metodo 'efectivo' o 'metalico', como el cobro a mano con la forma «Efectivo», lib/cobroManual.js) o el cobro a mano
//    de una factura con la forma de cobro «Efectivo» (formaCobro).
// nifComunitario: el NIF-IVA de un cliente de otro país de la UE (posiciones 264-280), en lugar del NIF español.
// Se declara a quien pasa de 3.005,06 € sumando todos sus registros (o con más de eso devengado por caja o con cobros en
// metálico de más de 6.000 €), con todos sus registros.
export const LIMITE_347 = 3005.06;
export const LIMITE_METALICO = 6000;
const NIF_ES = /^(ES)?([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;
// Gastos que no son entregas de bienes ni servicios con factura (art. 33.2.a RGAT): tributos (631), sueldos (640) y
// Seguridad Social o cuota de autónomos (642). Y las nóminas.
const SIN_FACTURA_347 = ['631', '640', '642'];
const EFECTIVO = ['efectivo', 'metalico'];
const enEfectivo = (f, p) => EFECTIVO.includes(p.metodo) || (p.metodo === 'manual' && f.formaCobro === 'efectivo');
export function modelo347(facturas, gastos, anio, { recc } = {}) {
  const m = new Map();
  const registro = (k, datos) => {
    if (!m.has(k)) m.set(k, { ...datos, total: 0, trimestres: [0, 0, 0, 0] });
    return m.get(k);
  };
  const sumar = (o, fecha, total) => {
    o.total = r2(o.total + total);
    if (fecha) o.trimestres[trimestre(fecha) - 1] = r2(o.trimestres[trimestre(fecha) - 1] + total);
  };
  const nifDe = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '');
  // Quién: su NIF español, su NIF-IVA de otro país de la UE o, sin ninguno, su nombre (id: con lo que se agrupa).
  const quien = (n, nombre) => {
    const nif = nifDe(n), ue = nifUE(nif), es = ue ? '' : nif.replace(/^ES/, '');
    return { nif: es, ...(ue ? { nifComunitario: ue } : {}), nombre: nombre || 'Sin nombre', id: ue || es || String(nombre || '').trim().toUpperCase() };
  };
  const importe = (x) => { const i = importes(x); return r2(i.base + i.iva + (i.recargo || 0) + (i.compensacion || 0)); };
  const delAnio = (fecha) => fecha.startsWith(`${anio}-`);
  // Las ventas a consumidores finales (cierres de caja, tiques sin NIF del cliente) no se declaran; una simplificada con el
  // NIF del cliente, sí (art. 7.2 del Reglamento de facturación). Una factura de España sin el NIF del cliente es
  // simplificada aunque no venga de un cierre de caja (la serie FS, lib/validacion.js sinNifEspana): sin los datos del
  // destinatario no va al 347 (art. 33.2.a del Reglamento de gestión e inspección, RD 1065/2007).
  const sinNifEspana = (f) => !f.oss?.pais && (!String(f.cliente?.pais || '').trim() || String(f.cliente.pais).trim().toUpperCase() === 'ES');
  const fuera = (f) => {
    const i = importes(f), nif = nifDe(f.cliente?.nif);
    return ((f.simplificada || sinNifEspana(f)) && !nif) || Number(f.irpfPct) > 0 || (nifUE(nif) && !i.iva) || (!i.iva && nif && !NIF_ES.test(nif));
  };
  // Lo que de una factura con IVA a un cliente de la UE va en el 349 (sus líneas sin IVA intracomunitarias).
  const parte349 = (f) => {
    const nif = nifUE(f.cliente?.nif), op = TIPOS_OPERACION[operacionDe(f)];
    return nif && op?.clave349 && !(nif.startsWith('XI') && op.clave349 === 'S') ? r2(desglose(f).filter((x) => x.pct === 0 && !x.fueraBase).reduce((s, x) => s + x.base, 0)) : 0;
  };
  const grupos = operacionesCaja(facturas, recc);
  const enCaja = new Set(grupos.flat());
  for (const f of facturas) {
    if (enCaja.has(f) || !delAnio(fechaIva(f)) || fuera(f)) continue;
    const q = quien(f.cliente?.nif, f.cliente?.nombre);
    sumar(registro(`B:${q.id}`, { clave: 'B', ...q }), fechaIva(f), r2(importe(f) - parte349(f)));
  }
  // Lo cobrado o pagado este año de operaciones de caja de otro año se declara si con esa persona se pasó del límite en
  // el año de la factura (instrucciones del 347, ejemplo de una factura de 4.000 € cobrada en dos años): origen, por año.
  const origen = new Map();
  const deOrigen = (o, fecha, total) => {
    const k = `${o.clave}${o.id}|${fecha.slice(0, 4)}`;
    origen.set(k, r2((origen.get(k) || 0) + total));
  };
  const devengado = (g, fecha) => r2(devengadoCaja(g, fecha).reduce((s, d) => s + d.base + d.iva + (d.recargo || 0), 0));
  for (const g of grupos) {
    if (fuera(g[0])) continue;
    const general = r2(g.filter((f) => delAnio(fechaIva(f))).reduce((s, f) => s + importe(f), 0));
    const caja = r2(devengado(g, `${anio}-12-31`) - devengado(g, `${anio - 1}-12-31`));
    if (!general && !caja) continue;
    const q = quien(g[0].cliente?.nif, g[0].cliente?.nombre);
    const o = registro(`Bcaja:${q.id}`, { clave: 'B', ...q, caja: true, importeCaja: 0 });
    sumar(o, null, general);
    o.importeCaja = r2(o.importeCaja + caja);
    if (caja) deOrigen(o, fechaIva(g[0]), g.reduce((s, f) => s + importe(f), 0));
  }
  // Cobros en metálico del año, por cliente, registro y ejercicio de la factura. Los cierres de caja no: son ventas a
  // consumidores finales sin NIF (art. 7.2 del Reglamento de facturación), aunque se cobren en efectivo.
  const efectivo = new Map();
  for (const f of facturas) {
    if (fuera(f) || f.caja) continue;
    const cobrado = r2(pagosDe(f).filter((p) => enEfectivo(f, p) && delAnio(String(p.fecha || f.fecha))).reduce((s, p) => s + p.importe, 0));
    if (!cobrado) continue;
    const q = quien(f.cliente?.nif, f.cliente?.nombre), ejercicio = Number(fechaIva(f).slice(0, 4));
    const k = `${enCaja.has(f) ? 'Bcaja' : 'B'}:${q.id}${ejercicio === anio ? '' : `:${ejercicio}`}`;
    const e = efectivo.get(k) || { q, caja: enCaja.has(f), ejercicio, importe: 0 };
    e.importe = r2(e.importe + cobrado);
    efectivo.set(k, e);
  }
  for (const [k, e] of efectivo) {
    if (e.importe <= LIMITE_METALICO) continue;
    const o = registro(k, { clave: 'B', ...e.q, ...(e.caja ? { caja: true, importeCaja: 0 } : {}) });
    Object.assign(o, { metalico: e.importe, ejercicioMetalico: e.ejercicio });
  }
  for (const g of gastos) {
    // Las importaciones tampoco (art. 33.2 RGAT: van en el DUA).
    if (g.alquiler || g.noResidente || g.importacion || Number(g.irpfPct) > 0 || ['ue', 'fuera'].includes(origenGasto(g)) || g.nomina || SIN_FACTURA_347.includes(categoriaDe(g)) || !String(g.proveedor || '').trim()) continue;
    const q = quien(g.proveedorNif, g.proveedor);
    // El alquiler del local sin retención, en su registro aparte (compatible con el criterio de caja: diseño, posición 281).
    const arr = g.alquilerSinRetencion ? 'arr' : '';
    if (gastoEnCaja(g, recc)) {
      const general = delAnio(g.fecha) ? importe(g) : 0, caja = delAnio(fechaDeduccion(g)) ? importe(g) : 0;
      if (!general && !caja) continue;
      const o = registro(`Acaja${arr}:${q.id}`, { clave: 'A', ...q, caja: true, importeCaja: 0, ...(arr ? { arrendamiento: true } : {}) });
      sumar(o, null, general);
      o.importeCaja = r2(o.importeCaja + caja);
      if (caja) deOrigen(o, g.fecha, importe(g));
    // Compra de España con inversión del sujeto pasivo (art. 84.Uno.2.º LIVA): aparte, con la «X» de la posición 282 del
    // diseño; el importe es la contraprestación (la factura no lleva IVA).
    } else if (delAnio(g.fecha)) { const isp = g.isp || origenGasto(g) === 'isp'; sumar(registro(`A${isp ? 'isp' : ''}${arr}:${q.id}`, { clave: 'A', ...q, ...(isp ? { isp: true } : {}), ...(arr ? { arrendamiento: true } : {}) }), g.fecha, importe(g)); }
  }
  const persona = new Map();
  for (const [k, total] of origen) if (Math.abs(total) > LIMITE_347) persona.set(k.split('|')[0], { total: 0, otro: true });
  for (const o of m.values()) {
    const p = persona.get(o.clave + o.id) || { total: 0, otro: false };
    p.total = r2(p.total + o.total);
    if (Math.abs(o.importeCaja || 0) > LIMITE_347 || o.metalico) p.otro = true;
    persona.set(o.clave + o.id, p);
  }
  const soloAnual = Boolean(recc?.desde) && recc.desde <= `${anio}-12-31` && (!recc.hasta || recc.hasta >= `${anio}-01-01`);
  const declarados = [...m.values()]
    .filter((o) => { const p = persona.get(o.clave + o.id); return Math.abs(p.total) > LIMITE_347 || p.otro; })
    .map(({ id, trimestres, ...o }) => (o.caja || soloAnual ? o : { ...o, trimestres }))
    .sort((a, b) => b.total - a.total);
  return { ventas: declarados.filter((o) => o.clave === 'B'), compras: declarados.filter((o) => o.clave === 'A'), sinNif: declarados.filter((o, i, l) => !o.nif && !o.nifComunitario && l.findIndex((x) => x.clave === o.clave && x.nombre === o.nombre) === i), soloAnual };
}

// 202 (sociedades), modalidad del art. 40.2 de la Ley del Impuesto sobre Sociedades: el 18 % de la «cuota del ejercicio a
// ingresar o devolver» del último Impuesto sobre Sociedades cuyo plazo ya venció, es decir, la cuota íntegra menos
// deducciones, bonificaciones y retenciones e ingresos a cuenta, sin restar los pagos fraccionados (casilla «Resultado» del
// 200; Manual de Sociedades 2025, págs. 821 y 827-829). En abril, el de hace dos años (el del año pasado aún no se ha
// presentado); en octubre y diciembre, el del año pasado. Sin cuota (o a cero), no se presenta.
export function modelo202(cuotaIS = {}, anio) {
  return [[1, 'abril', anio - 2], [2, 'octubre', anio - 1], [3, 'diciembre', anio - 1]].map(([p, mes, de]) => {
    const cuota = cuotaIS[de] ?? null;
    return { p, mes, de, cuota, pago: cuota > 0 ? r2(cuota * 0.18) : 0, fecha: habil(`${anio}-${{ abril: '04', octubre: '10', diciembre: '12' }[mes]}-20`) };
  });
}

// Borrador del Impuesto sobre Sociedades (modelo 200), solo con lo que hay en la app: resultado (ingresos − gastos), más
// los gastos no deducibles (art. 15 LIS), menos la reserva de capitalización (art. 25) y las bases negativas de años
// anteriores (art. 26). El tipo depende de la facturación del año anterior (Ley 27/2014, art. 29, con la Ley 7/2024):
// menos de 1 M (microempresa, dos tramos: los primeros 50.000 € y el resto), menos de 10 M (reducida dimensión) o general.
// Manual de Sociedades 2025, págs. 10-12: micro 21/22 % en 2025, 19/21 % en 2026 y 17/20 % desde 2027; reducida dimensión
// 24 % en 2025, 23 % en 2026, 22 % en 2027, 21 % en 2028 y 20 % desde 2029. Antes de 2025: micro 23 % en 2023 y 2024 (Ley
// 38/2022) y 25 % antes (no había tipo de micro); reducida dimensión, 25 %.
const TIPO_MICRO = { 2025: [21, 22], 2026: [19, 21] };
const TIPO_REDUCIDA = { 2025: 24, 2026: 23, 2027: 22, 2028: 21 };
export function tiposIS(anio, tamano) {
  if (tamano === 'micro') return anio < 2023 ? [25, 25] : anio < 2025 ? [23, 23] : TIPO_MICRO[anio] || [17, 20];
  if (tamano === 'reducida') { const t = anio < 2025 ? 25 : TIPO_REDUCIDA[anio] || 20; return [t, t]; }
  return [25, 25];
}
// Resultado de un año (ingresos − gastos, con amortizaciones, existencias y asientos manuales) y los gastos no deducibles
// (art. 15 LIS, lib/categorias.js noDeducibleIS): se suman al resultado como ajuste positivo.
// capital: los dividendos e intereses pagados (lib/capitalMobiliario.js). Los intereses y otros rendimientos son gasto
// financiero (cuentas 662 y 669, como en lib/asientos.js) y restan del resultado; los dividendos no (salen del remanente).
// iva: ajustes del IVA (lib/empresa.js ajustesIva): con prorrata, el IVA que no se deduce es gasto (norma de registro y
// valoración 12.ª del PGC, art. 10.3 LIS) y el de los bienes de inversión, más valor suyo (lib/calculos.js prorrataBienes).
function baseSociedades(facturas, gastos, anio, { ivaCoste = false, iva = {}, productos = [], ajustes = [], albaranes = [], manuales = [], capital = [], hasta = `${anio}-12-31` } = {}) {
  const neto = (x) => { const i = importes(x); return ivaCoste ? r2(i.base + i.iva) : i.base; };
  const F = delT(facturas, anio).filter((f) => f.fecha <= hasta);
  const ingresos = suma(F, neto);
  // Los bienes de inversión no cuentan enteros: solo su amortización del año.
  const enBienes = ivaCoste ? new Map() : prorrataBienes(facturas, gastos, iva);
  const bajas = bajasBienes(facturas);
  const opBien = { regimen: 'sociedad', ivaCoste, hasta, prorrata: enBienes, bajas };
  const amortizacion = suma(amortizacionesAnio(gastos, anio, opBien), (x) => x.cuota);
  // Bienes vendidos en el año: su factura es ingreso y lo que quedaba por amortizar, gasto (la diferencia es el beneficio
  // o la pérdida del inmovilizado, cuentas 771 y 671).
  const vendidos = suma(gastos.filter((g) => g.inversion && g.base > 0 && bajas.get(g.id)?.fecha.startsWith(`${anio}-`) && bajas.get(g.id).fecha <= hasta), (g) => valorNeto(g, bajas.get(g.id).fecha, opBien));
  const prorrata = ivaCoste ? 0 : r2(liquidaciones303(facturas, gastos, anio, hasta, iva).reduce((s, l) => s + l.perdidoProrrata, 0)
    - suma(gastos.filter((g) => enBienes.has(g.id) && g.fecha.startsWith(`${anio}-`) && g.fecha <= hasta), (g) => enBienes.get(g.id)));
  const datosStock = { productos, facturas, gastos, ajustes, albaranes };
  const variacionExistencias = productos.length ? r2(valorInventario(datosStock, hasta) - valorInventario(datosStock, `${anio - 1}-12-31`)) : 0;
  const delAnio = delT(gastos, anio).filter((g) => g.fecha <= hasta && !(g.inversion && g.base > 0));
  const financieros = suma(capital.filter((p) => p.tipo !== 'dividendos' && String(p.fecha || '').startsWith(`${anio}-`) && p.fecha <= hasta), (p) => Number(p.bruto) || 0);
  const gastosAnio = r2(suma(delAnio, (g) => costeGasto(g, { ivaCoste })) + amortizacion - variacionExistencias + financieros + prorrata + vendidos);
  const ajustesContables = r2(manuales.filter((a) => !a.apertura && a.fecha.startsWith(`${anio}-`) && a.fecha <= hasta).reduce((s, a) => s + a.lineas.filter((l) => /^[67]/.test(l.cuenta) && !/^(630|633|638)/.test(l.cuenta)).reduce((v, l) => v + Number(l.haber || 0) - Number(l.debe || 0), 0), 0));
  const noDeducibles = delAnio.map((g) => ({ g, nd: noDeducibleIS(g) })).filter((x) => x.nd).map(({ g, nd }) => ({ id: g.id, fecha: g.fecha, concepto: g.concepto || g.proveedor || 'Sin concepto', importe: costeGasto(g, { ivaCoste }), ...nd }));
  const resultado = r2(ingresos - gastosAnio + ajustesContables);
  const ajusteNoDeducible = suma(noDeducibles, (x) => x.importe);
  return { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, financieros, prorrata, vendidos, ajustesContables, resultado, noDeducibles, ajusteNoDeducible, basePrevia: r2(resultado + ajusteNoDeducible) };
}

// Cifra de negocios (INCN) del año anterior, que decide el tipo y los límites. Sin datos del año anterior en la app, la de
// este; con datos, la del año anterior aunque fuera cero (art. 29 LIS). Para la reducida dimensión, si el año anterior fue
// el de la constitución y duró menos de un año, se eleva al año: INCN / días × 365 (art. 101.1 LIS; Manual de Sociedades
// 2025, pág. 621). Para la microempresa (art. 29.1: «del período impositivo inmediato anterior») el manual no prevé
// elevarla (págs. 10-11 y 85): no se eleva. Los 6 M del 202 y los 20/60 M de las bases negativas tampoco («los 12 meses
// anteriores»).
// Sin las ventas de bienes de inversión ni las operaciones inmobiliarias o financieras que no son la actividad habitual
// (factura con accesoria): la cifra de negocios son los ingresos de la actividad ordinaria (art. 35.2 del Código de Comercio,
// al que remite el art. 101.1 LIS); esas ventas son resultados del inmovilizado (cuentas 771 y 671), no ventas.
function cifraNegocios(facturas, gastos, anio, constitucion = '') {
  const conAnterior = [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${anio - 1}-`));
  const incn = suma(delT(facturas, conAnterior ? anio - 1 : anio).filter((f) => !f.accesoria), (f) => f.base);
  let incnAnual = incn;
  if (conAnterior && /^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') && Number(constitucion.slice(0, 4)) === anio - 1) {
    const dias = Math.round((Date.parse(`${anio - 1}-12-31T12:00:00Z`) - Date.parse(`${constitucion}T12:00:00Z`)) / 864e5) + 1;
    if (dias > 0 && dias < 365) incnAnual = r2((incn / dias) * 365);
  }
  return { incn, incnAnual, conAnterior };
}

// Reserva de capitalización (art. 25 LIS; Manual de Sociedades 2025, págs. 351-356): desde 2025, el 20 % del incremento de
// los fondos propios del año, sin pasar del 20 % de la base previa (el 25 % con una cifra de negocios de menos de 1 M en los
// 12 meses anteriores); en 2024, 15 % con el límite del 10 %; antes, 10 % y 10 %. El incremento lo apunta la empresa
// (fondosPropios[año]): sale de los fondos propios al cierre sin el resultado del año menos los del inicio sin el del
// anterior, y sin las aportaciones de los socios ni las reservas legales o estatutarias, algo que los asientos de Fisquo
// no distinguen. No mira el porcentaje mayor por aumentar la plantilla (23/26,5/30 %) ni aplica lo pendiente de años
// anteriores (se puede aplicar en los 2 años siguientes): devuelve lo que queda sin aplicar.
function reservaCapitalizacion(anio, basePrevia, incremento, incn) {
  const inc = Math.max(0, Number(incremento) || 0);
  if (!inc || basePrevia <= 0) return { incremento: inc, aplicada: 0, pendiente: inc ? r2((inc * (anio >= 2025 ? 20 : anio === 2024 ? 15 : 10)) / 100) : 0 };
  const [pct, lim] = anio >= 2025 ? [20, incn < 1e6 ? 25 : 20] : anio === 2024 ? [15, 10] : [10, 10];
  const derecho = r2((inc * pct) / 100);
  const aplicada = Math.min(derecho, r2((basePrevia * lim) / 100));
  return { incremento: inc, pct, limitePct: lim, derecho, aplicada, pendiente: r2(derecho - aplicada) };
}

// Las liquidaciones de los años de la app hasta `anio`, en orden, para arrastrar las bases imponibles negativas (art. 26
// LIS; Manual de Sociedades 2025, págs. 363-369): cada año con base previa positiva compensa las pendientes, de la más
// antigua a la más reciente, hasta el 70 % de la base previa a la reserva de capitalización y a la compensación (el 50 % con
// 20 M o más de cifra de negocios y el 25 % con 60 M o más) y, en todo caso, hasta 1 M; sin límite del 70 % en los 3
// primeros años con base previa positiva de una entidad de nueva creación (art. 26.3). Nunca deja la base en negativo.
// Las pendientes: las pérdidas de los años con datos en la app y las que apunta la empresa en binsPrevias ({ año: lo que
// quedaba por compensar de ese año }), que mandan sobre lo que sale de la app. Nada de antes del año de constitución.
// comun: false en Navarra y el País Vasco (sus normas forales tienen otros límites): sin reserva ni compensación.
// Solo se calculan los años con datos de los cinco últimos (las facturas que carga Impuestos, lib/datosImpuestos.js): los
// de antes, con solo los gastos, saldrían en pérdidas; sus bases pendientes las apunta la empresa.
const ANIOS_DATOS = 5;
function liquidacionesIS(facturas, gastos, anio, { op = {}, hasta = `${anio}-12-31`, binsPrevias = {}, fondosPropios = {}, constitucion = '', cuotaIS = {}, comun = true } = {}) {
  const hay = (y) => y > anio - ANIOS_DATOS && [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`));
  // Una constitución posterior al año no cuenta.
  const c = (Number(/^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') ? constitucion.slice(0, 4) : 0)) || 0;
  const c0 = c && c <= anio ? c : 0;
  const tecleadas = new Map(Object.entries(binsPrevias || {}).map(([y, v]) => [Number(y), Number(v)]).filter(([y, v]) => Number.isInteger(y) && y < anio && (!c0 || y >= c0) && Number.isFinite(v) && v >= 0));
  const anios = [...facturas, ...gastos].map((x) => Number(String(x.fecha || '').slice(0, 4))).filter((y) => y > anio - ANIOS_DATOS && y < anio);
  const desde = c0 || Math.min(anio, ...anios, ...tecleadas.keys());
  const pendientes = new Map(); // año de origen → lo que queda por compensar
  const res = {};
  // Art. 26.3: años con base previa positiva desde la constitución; sin datos ni cuota apuntada no se sabe (se aplica el 70 %).
  let positivas = 0, seSabe = Boolean(c0);
  for (let y = desde; y <= anio; y++) {
    if (y !== anio && !hay(y)) {
      if (tecleadas.has(y)) pendientes.set(y, tecleadas.get(y));
      if (Number(cuotaIS?.[y]) > 0) positivas++; else if (y !== c0) seSabe = false;
      continue;
    }
    const b = baseSociedades(facturas, gastos, y, { ...op, hasta: y === anio ? hasta : `${y}-12-31` });
    const { incn } = cifraNegocios(facturas, gastos, y, constitucion);
    const pendientesInicio = [...pendientes].filter(([, v]) => v > 0).map(([de, importe]) => ({ de, importe }));
    const reserva = comun ? reservaCapitalizacion(y, b.basePrevia, fondosPropios?.[y], incn) : { incremento: 0, aplicada: 0, pendiente: 0 };
    let compensacion = 0, limiteBIN = 0;
    const sinLimiteBIN = comun && seSabe && positivas < 3;
    if (comun && b.basePrevia > 0) {
      limiteBIN = sinLimiteBIN ? Infinity : Math.max(1e6, r2((b.basePrevia * (incn >= 6e7 ? 25 : incn >= 2e7 ? 50 : 70)) / 100));
      let queda = Math.min(limiteBIN, r2(b.basePrevia - reserva.aplicada));
      for (const [de, v] of pendientes) {
        const usa = r2(Math.min(v, queda));
        if (usa <= 0) continue;
        pendientes.set(de, r2(v - usa));
        compensacion = r2(compensacion + usa);
        queda = r2(queda - usa);
      }
    }
    if (b.basePrevia > 0) positivas++;
    const perdida = Math.max(0, -b.basePrevia);
    if (y !== anio && tecleadas.has(y)) pendientes.set(y, tecleadas.get(y));
    else if (perdida > 0 && comun) pendientes.set(y, perdida);
    res[y] = { ...b, incn, reserva, compensacion, limiteBIN, sinLimiteBIN, pendientesInicio, base: Math.max(0, r2(b.basePrevia - reserva.aplicada - compensacion)), perdida };
  }
  res[anio].pendientesFin = [...pendientes].filter(([, v]) => v > 0).map(([de, importe]) => ({ de, importe }));
  return res;
}

// Entidades de nueva creación (art. 29.1 LIS): 15 % en el primer periodo impositivo con base positiva y en el siguiente,
// salvo que le toque un tipo menor. Cada año desde la constitución cuenta como «con beneficio» si la cuota del IS
// apuntada en Impuestos (cuotaIS) es positiva o, con datos en Fisquo, si su base sale positiva. El año de constitución
// sin datos cuenta como sin beneficio; otro año sin datos ni cuota apuntada no se sabe y se queda en el tipo normal.
// Devuelve { aplica, primero } (primero: el primer año con beneficio) o { aplica: false, falta } (el año que no se sabe).
// No mira las excepciones (grupo de sociedades, actividad que ya ejercía otra persona vinculada, sociedad patrimonial).
export const TIPO_NUEVA_CREACION = 15;
export function nuevaCreacion(anio, { constitucion, cuotaIS = {}, base = 0, baseDe = () => 0, hayDatos = () => false } = {}) {
  const c = Number(/^\d{4}-\d{2}-\d{2}$/.test(constitucion || '') ? constitucion.slice(0, 4) : 0);
  if (!c || anio < c) return null;
  for (let y = c; y < anio; y++) {
    const cuota = cuotaIS?.[y];
    const conCuota = cuota !== undefined && cuota !== null;
    let positiva;
    if (hayDatos(y)) positiva = Number(cuota) > 0 || baseDe(y) > 0;
    else if (conCuota) positiva = Number(cuota) > 0;
    else if (y === c) positiva = false;
    else return { aplica: false, falta: y };
    if (positiva) return { aplica: y === anio - 1, primero: y };
  }
  return { aplica: base > 0, primero: base > 0 ? anio : null };
}

// territorio: en Navarra y el País Vasco (lib/territorios.js), el tipo foral según la cifra de negocios, sin tramos ni el
// 15 % de las entidades de nueva creación (que es de la ley estatal), y sin la reserva de capitalización ni la compensación
// de bases negativas de la ley estatal (cada norma foral tiene las suyas).
// binsPrevias: { año: base negativa pendiente } de antes de Fisquo (o la real de un año que no está entero en Fisquo);
// fondosPropios: { año: incremento de los fondos propios } para la reserva de capitalización.
export function borradorSociedades(facturas, gastos, anio, { pagos202 = {}, ivaCoste = false, iva = {}, productos = [], ajustes = [], albaranes = [], manuales = [], capital = [], hasta = `${anio}-12-31`, constitucion = '', cuotaIS = {}, territorio, binsPrevias = {}, fondosPropios = {} } = {}) {
  const op = { ivaCoste, iva, productos, ajustes, albaranes, manuales, capital };
  const { incn, incnAnual, conAnterior } = cifraNegocios(facturas, gastos, anio, constitucion);
  const tamano = incn < 1e6 ? 'micro' : incnAnual < 1e7 ? 'reducida' : 'general';
  const foral = tipoISForal(territorio, incn);
  const L = liquidacionesIS(facturas, gastos, anio, { op, hasta, binsPrevias, fondosPropios, constitucion, cuotaIS, comun: foral === null });
  const { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, financieros, prorrata, vendidos, ajustesContables, resultado, noDeducibles, ajusteNoDeducible, basePrevia, reserva, compensacion, limiteBIN, sinLimiteBIN, pendientesInicio, pendientesFin, base, perdida } = L[anio];
  const nueva = foral !== null ? null : nuevaCreacion(anio, {
    constitucion, cuotaIS, base,
    hayDatos: (y) => [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`)),
    baseDe: (y) => L[y]?.base ?? 0,
  });
  // El 15 % sustituye al tipo del tramo solo donde es menor.
  const [t1, t2] = foral !== null ? [foral, foral] : tiposIS(anio, tamano).map((t) => (nueva?.aplica ? Math.min(t, TIPO_NUEVA_CREACION) : t));
  const tramos = t1 === t2 ? [{ base, pct: t1 }] : [{ base: Math.min(base, 50000), pct: t1 }, { base: r2(Math.max(0, base - 50000)), pct: t2 }];
  for (const x of tramos) x.cuota = r2((x.base * x.pct) / 100);
  const cuota = suma(tramos, (x) => x.cuota);
  const pagos = r2(Object.values(pagos202[anio] || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  const retenciones = suma(F, (f) => importes(f).irpf);
  return {
    ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, financieros, prorrata, vendidos, ajustesContables, resultadoContable: resultado, noDeducibles, ajusteNoDeducible, basePrevia,
    reserva, compensacion, limiteBIN, sinLimiteBIN, binsPendientes: pendientesInicio, binsQuedan: pendientesFin,
    base, perdida, incn, incnAnual, conAnterior, tamano, tipos: [t1, t2], nuevaCreacion: nueva, ...(foral !== null ? { foral: territorio } : {}),
    // Con más de 6 M de cifra de negocios, el 202 es obligatoriamente el del art. 40.3 (modelo202Art403).
    obligado403: foral === null && incn > 6e6,
    tramos: tramos.filter((x) => x.base > 0), cuota, pagos, retenciones,
    // «Cuota del ejercicio a ingresar o devolver» (sin los pagos del 202): la base del 202 del año siguiente (art. 40.2).
    cuotaEjercicio: r2(cuota - retenciones),
    resultado: r2(cuota - pagos - retenciones), tipoMedio: base ? r2((cuota / base) * 100) : 0,
  };
}

// 202, modalidad del art. 40.3 LIS (obligatoria con más de 6 M de cifra de negocios en los 12 meses anteriores; Manual de
// Sociedades 2025, págs. 821-824 y 830-843): sobre la base imponible de los 3, 9 y 11 primeros meses del año (casilla 16:
// base previa menos las bases negativas compensadas, sin la reserva de capitalización del año), los 5/7 del tipo del año
// redondeados por defecto (con 10 M o más, los 19/20 redondeados por exceso), menos las retenciones del periodo (casilla
// 28) y los pagos fraccionados anteriores del año (casilla 30). Con 10 M o más, nunca menos del 23 % del resultado
// contable del periodo menos esos pagos (casilla 33, DA 14.ª LIS). La microempresa (dos tipos) parte la base en los
// primeros 50.000 € y el resto, como en el 200. opciones: las de borradorSociedades.
export function modelo202Art403(facturas, gastos, anio, opciones = {}) {
  const is = borradorSociedades(facturas, gastos, anio, opciones);
  const grande = is.incn >= 1e7;
  const pctPago = (t) => (grande ? Math.ceil((19 * t) / 20) : Math.floor((5 * t) / 7));
  const op = { ivaCoste: opciones.ivaCoste, iva: opciones.iva || {}, productos: opciones.productos || [], ajustes: opciones.ajustes || [], albaranes: opciones.albaranes || [], manuales: opciones.manuales || [], capital: opciones.capital || [] };
  const hechos = [];
  for (const [p, mes, fin] of [[1, 'abril', '03-31'], [2, 'octubre', '09-30'], [3, 'diciembre', '11-30']]) {
    const hasta = `${anio}-${fin}`;
    const L = liquidacionesIS(facturas, gastos, anio, { op, hasta, binsPrevias: opciones.binsPrevias, fondosPropios: { ...(opciones.fondosPropios || {}), [anio]: 0 }, constitucion: opciones.constitucion, cuotaIS: opciones.cuotaIS, comun: !is.foral })[anio];
    const [t1, t2] = is.tipos;
    const tramos = (t1 === t2 ? [{ base: L.base, pct: pctPago(t1) }] : [{ base: Math.min(L.base, 50000), pct: pctPago(t1) }, { base: r2(Math.max(0, L.base - 50000)), pct: pctPago(t2) }]).map((x) => ({ ...x, cuota: r2((x.base * x.pct) / 100) }));
    const previo = suma(tramos, (x) => x.cuota);
    const retenciones = suma(L.F, (f) => importes(f).irpf);
    const anteriores = suma(hechos, (x) => Number(opciones.pagos202?.[anio]?.[x.p] ?? x.pago) || 0);
    const resultado = r2(Math.max(0, previo - retenciones) - anteriores);
    const minimo = grande ? Math.max(0, r2(Math.max(0, L.resultado) * 0.23 - anteriores)) : 0;
    // de y cuota, como en modelo202 (lib/presentar.js): el año a cuenta del que se paga y lo que sale antes de restar.
    hechos.push({ p, mes, de: anio, cuota: previo, modalidad: '40.3', basePrevia: L.basePrevia, compensacion: L.compensacion, base: L.base, tramos: tramos.filter((x) => x.base > 0), previo, retenciones, anteriores, resultado, minimo, resultadoContable: L.resultado, pago: Math.max(0, resultado, minimo), fecha: habil(`${anio}-${{ abril: '04', octubre: '10', diciembre: '12' }[mes]}-20`) });
  }
  return hechos;
}

// Borrador de la renta de un autónomo (estimación directa simplificada), solo con lo que hay en la app.
// Escalas del IRPF de 2025 (Manual práctico de Renta 2025, parte 1, cap. 15, págs. 1120-1131). Para 2026 se usan las de
// 2025 (aún no hay manual de 2026): la tarjeta lo dice («escala de 2025»). Cada tramo: [hasta, % del tramo].
// Escala general estatal (art. 63.1 LIRPF), pág. 1120.
const ESCALA_ESTATAL = [[12450, 9.5], [20200, 12], [35200, 15], [60000, 18.5], [300000, 22.5], [Infinity, 24.5]];
// Escala del ahorro (arts. 66.1.2.º y 76.2 LIRPF, desde 2025): la mitad estatal y la otra mitad autonómica, la misma en
// todas las comunidades: 19 % hasta 6.000 €, 21 % hasta 50.000, 23 % hasta 200.000, 27 % hasta 300.000 y 30 % el resto.
const ESCALA_AHORRO = [[6000, 9.5], [50000, 10.5], [200000, 11.5], [300000, 13.5], [Infinity, 15]];
// Escala del art. 65 LIRPF: la autonómica de Ceuta y Melilla (DA 32.ª LIRPF), págs. 1130-1131.
const ESCALA_ART65 = [[12450, 9.5], [20200, 12], [35200, 15], [60000, 18.5], [Infinity, 22.5]];
// Orientativa, sin comunidad elegida: la estatal más la del art. 65 (19/24/30/37/45/47 %).
const ESCALA = [[12450, 19], [20200, 24], [35200, 30], [60000, 37], [300000, 45], [Infinity, 47]];
export function cuotaEscala(base, escala = ESCALA) {
  let cuota = 0, desde = 0;
  for (const [hasta, pct] of escala) {
    if (base <= desde) break;
    cuota += ((Math.min(base, hasta) - desde) * pct) / 100;
    desde = hasta;
  }
  return r2(cuota);
}
export const MINIMO_PERSONAL = 5550;
// Mínimos personales y familiares estatales (arts. 57-59 LIRPF; Manual de Renta 2025, parte 1, págs. 1068-1083): del
// contribuyente (y más de 65 y de 75 años), por descendientes (1.º, 2.º, 3.º y 4.º y siguientes, menores de 25 que conviven,
// y más por los menores de 3) y por ascendientes mayores de 65 (y de 75) que conviven.
const MINIMOS_ESTATALES = { personal: MINIMO_PERSONAL, mas65: 1150, mas75: 1400, descendientes: [2400, 2700, 4000, 4500], menor3: 2800, ascendiente: 1150, ascendiente75: 1400 };
// Las 15 comunidades de régimen común, Ceuta y Melilla: su escala autonómica de 2025 (cap. 15, págs. 1121-1131) y, si la
// tienen, sus mínimos para el gravamen autonómico (cap. 14, págs. 1084-1093; las demás usan los estatales). Navarra y el
// País Vasco tienen su propio impuesto: no están (en territorio foral, la renta no se calcula aquí).
// Illes Balears solo cambia el del contribuyente y los del 2.º y siguientes descendientes y ascendientes (pág. 1086-1087).
export const CCAA = {
  andalucia: { nombre: 'Andalucía', escala: [[13000, 9.5], [21100, 12], [35200, 15], [60000, 18.5], [Infinity, 22.5]], // pág. 1121
    minimos: { personal: 5790, mas65: 1200, mas75: 1460, descendientes: [2510, 2820, 4170, 4700], menor3: 2920, ascendiente: 1200, ascendiente75: 1460 } }, // págs. 1084-1085
  aragon: { nombre: 'Aragón', escala: [[13072.5, 9.5], [21210, 12], [36960, 15], [52500, 18.5], [60000, 20.5], [80000, 23], [90000, 24], [130000, 25], [Infinity, 25.5]] }, // pág. 1122
  asturias: { nombre: 'Principado de Asturias', escala: [[12450, 9], [17707.2, 12], [33007.2, 14], [53407.2, 19.2], [70000, 21.5], [90000, 22.5], [175000, 25], [Infinity, 26]], // págs. 1122-1123
    minimos: { personal: 6105, mas65: 1265, mas75: 1540, descendientes: [2640, 2970, 4400, 4950], menor3: 3080, ascendiente: 1265, ascendiente75: 1540 } }, // págs. 1085-1086
  baleares: { nombre: 'Illes Balears', escala: [[10000, 9], [18000, 11.25], [30000, 14.25], [48000, 17.5], [70000, 19], [90000, 21.75], [120000, 22.75], [175000, 23.75], [Infinity, 24.75]], // pág. 1123
    minimos: { personal: 6105, mas65: 1265, mas75: 1540, descendientes: [2400, 2970, 4400, 4950], menor3: 2800, ascendiente: 1265, ascendiente75: 1540 } }, // págs. 1086-1087
  canarias: { nombre: 'Canarias', escala: [[13748, 9], [19422, 11.5], [35924, 14], [57566, 18.5], [93268, 23.5], [123745, 25], [Infinity, 26]], // pág. 1124
    minimos: { personal: 5606, mas65: 1162, mas75: 1414, descendientes: [2424, 2727, 4040, 4545], menor3: 2828, ascendiente: 1162, ascendiente75: 1414 } }, // págs. 1087-1088
  cantabria: { nombre: 'Cantabria', escala: [[13000, 8.5], [21000, 11], [35200, 14.5], [60000, 18], [90000, 22.5], [Infinity, 24.5]] }, // págs. 1124-1125
  'castilla-la-mancha': { nombre: 'Castilla-La Mancha', escala: [[12450, 9.5], [20200, 12], [35200, 15], [60000, 18.5], [Infinity, 22.5]] }, // pág. 1125
  'castilla-y-leon': { nombre: 'Castilla y León', escala: [[12450, 9], [20200, 12], [35200, 14], [53407.2, 18.5], [Infinity, 21.5]] }, // págs. 1125-1126 (mínimos estatales, pág. 1089)
  cataluna: { nombre: 'Cataluña', escala: [[12500, 9.5], [22000, 12.5], [33000, 16], [53000, 19], [90000, 21.5], [120000, 23.5], [175000, 24.5], [Infinity, 25.5]] }, // pág. 1126 (mínimos estatales, pág. 1089)
  extremadura: { nombre: 'Extremadura', escala: [[12450, 8], [20200, 10], [24200, 16], [35200, 17.5], [60000, 21], [80200, 23.5], [99200, 24], [120200, 24.5], [Infinity, 25]] }, // pág. 1127
  galicia: { nombre: 'Galicia', escala: [[12985.35, 9], [21068.6, 11.65], [35200, 14.9], [60000, 18.4], [Infinity, 22.5]], // pág. 1127
    minimos: { personal: 5789, mas65: 1199, mas75: 1460, descendientes: [2503, 2816, 4172, 4694], menor3: 2920, ascendiente: 1199, ascendiente75: 1460 } }, // págs. 1089-1090
  madrid: { nombre: 'Comunidad de Madrid', escala: [[13362.22, 8.5], [19004.63, 10.7], [35425.68, 12.8], [57320.4, 17.4], [Infinity, 20.5]], // pág. 1128
    minimos: { personal: 5956.65, mas65: 1234.26, mas75: 1502.58, descendientes: [2575.85, 2897.83, 4400, 4950], menor3: 3005.16, ascendiente: 1234.26, ascendiente75: 1502.58 } }, // págs. 1090-1091
  murcia: { nombre: 'Región de Murcia', escala: [[12450, 9.5], [20200, 11.2], [34000, 13.3], [60000, 17.9], [Infinity, 22.5]] }, // pág. 1128
  'la-rioja': { nombre: 'La Rioja', escala: [[12450, 8], [20200, 10.6], [35200, 13.6], [40000, 17.8], [50000, 18.3], [60000, 19], [120000, 24.5], [Infinity, 27]] }, // pág. 1129 (solo cambia el mínimo por discapacidad, pág. 1091)
  valencia: { nombre: 'Comunitat Valenciana', escala: [[12000, 9], [22000, 12], [32000, 15], [42000, 17.5], [52000, 20], [62000, 22.5], [72000, 25], [100000, 26.5], [150000, 27.5], [200000, 28.5], [Infinity, 29.5]], // págs. 1129-1130
    minimos: { personal: 6105, mas65: 1265, mas75: 1540, descendientes: [2640, 2970, 4400, 4950], menor3: 3080, ascendiente: 1265, ascendiente75: 1540 } }, // págs. 1092-1093
  ceuta: { nombre: 'Ceuta', escala: ESCALA_ART65, ceutaMelilla: true },
  melilla: { nombre: 'Melilla', escala: ESCALA_ART65, ceutaMelilla: true },
};
// Por edad a 31 de diciembre del año. tabla: la estatal o la de la comunidad (CCAA[…].minimos).
export function minimosRenta(anio, { nacimiento, hijos = [], compartidos = true, ascendientes = [] } = {}, tabla = MINIMOS_ESTATALES) {
  const edad = (y) => anio - Number(y);
  // Edad cumplida a 31 de diciembre: el incremento es para quien tiene 65 (o 75) años o más, como en Renta WEB y en el
  // algoritmo de retenciones (lib/retencionIrpf.js).
  const personal = r2(tabla.personal + (nacimiento && edad(nacimiento) >= 65 ? tabla.mas65 : 0) + (nacimiento && edad(nacimiento) >= 75 ? tabla.mas75 : 0));
  const H = hijos.map(Number).filter((y) => y && edad(y) >= 0 && edad(y) < 25).sort((a, b) => a - b);
  // Con los dos progenitores declarando por separado, cada uno aplica la mitad.
  const parte = compartidos ? 0.5 : 1;
  const descendientes = r2(H.reduce((s, y, i) => s + (tabla.descendientes[Math.min(i, 3)] + (edad(y) < 3 ? tabla.menor3 : 0)) * parte, 0));
  const A = ascendientes.map(Number).filter((y) => y && edad(y) >= 65);
  const ascend = r2(A.reduce((s, y) => s + tabla.ascendiente + (edad(y) >= 75 ? tabla.ascendiente75 : 0), 0));
  return { personal, descendientes, ascendientes: ascend, total: r2(personal + descendientes + ascend) };
}

// Reducciones del rendimiento neto de la actividad (art. 32.2 LIRPF, manual de Renta 2025 de la AEAT):
//  · Autónomo económicamente dependiente o con un único cliente no vinculado (32.2.1.º, y requisitos del art. 26 RIRPF):
//    2.000 € y, con rendimientos de menos de 19.747,50 € y no más de 6.500 € de otras rentas, 6.498 € (hasta 14.047,50 €)
//    o 6.498 − 1,14 × (RN − 14.047,50). En estimación directa simplificada no es compatible con el 5 % de difícil
//    justificación: se aplica lo que más reduce.
//  · Si no: con rentas (incluida la actividad) de menos de 12.000 €, 1.620 € hasta 8.000 € y 1.620 − 0,405 × (rentas − 8.000)
//    hasta 12.000 € (32.2.3.º), compatible con la difícil justificación.
// Nunca deja el rendimiento en negativo.
export function reduccionActividad(rn, { dependiente = false, otrasRentas = 0 } = {}) {
  if (rn <= 0) return 0;
  if (dependiente) {
    const adicional = rn < 19747.5 && otrasRentas <= 6500 ? (rn <= 14047.5 ? 6498 : 6498 - 1.14 * (rn - 14047.5)) : 0;
    return r2(Math.min(rn, 2000 + Math.max(0, adicional)));
  }
  const rentas = rn + otrasRentas;
  if (rentas >= 12000) return 0;
  return r2(Math.min(rn, rentas <= 8000 ? 1620 : 1620 - 0.405 * (rentas - 8000)));
}

// Deducción por maternidad (art. 81 LIRPF; Manual de Renta 2025, parte 1, págs. 1381-1389): para la madre (dada de alta en
// la Seguridad Social: una autónoma lo está), 100 € por cada mes del año en que el hijo tiene menos de 3 años, desde el mes
// de nacimiento hasta el anterior al que los cumple, hasta 1.200 € por hijo. Más el gasto de guardería o centro de
// educación infantil autorizado, hasta 1.000 € por hijo (1.000/12 por mes con derecho, 83,33 €) y sin pasar de lo pagado.
// Resta del resultado aunque salga a devolver. Sin el mes de nacimiento, el año en que nace y el que cumple 3 no se cuentan
// (sinMes); no mira el abono anticipado (modelo 140) ni los meses de guardería tras cumplir los 3.
export function deduccionMaternidad(anio, { madre = false, hijos = [], hijosMes = [], guarderia = 0 } = {}) {
  if (!madre) return { importe: 0, maternidad: 0, guarderia: 0, sinMes: 0 };
  let maternidad = 0, topeGuarderia = 0, sinMes = 0;
  hijos.forEach((y, i) => {
    const edad = anio - Number(y), m = Number(hijosMes[i]) || 0;
    let meses = 0;
    if (edad === 1 || edad === 2) meses = 12;
    else if (edad === 0 || edad === 3) {
      if (m >= 1 && m <= 12) for (let mes = 1; mes <= 12; mes++) { const k = edad * 12 + mes - m; if (k >= 0 && k <= 35) meses++; }
      else sinMes++;
    }
    maternidad += Math.min(1200, 100 * meses);
    topeGuarderia += Math.min(1000, r2((1000 * meses) / 12));
  });
  const g = r2(Math.min(Math.max(0, Number(guarderia) || 0), topeGuarderia));
  return { importe: r2(maternidad + g), maternidad: r2(maternidad), guarderia: g, sinMes };
}

// Rendimiento de la actividad de un año, con la difícil justificación y las reducciones del art. 32.2 (lo que deje menos).
// normal: estimación directa normal (sin difícil justificación).
function rendimientoActividad(facturas, gastos, anio, pagos, { ivaCoste, iva, personal, normal = false }) {
  const q4 = resumenAnual(facturas, gastos, anio, pagos, undefined, { ivaCoste, iva, normal }).trimestres[3];
  const ingresos = q4.ingAcum;
  const gastosAnio = r2(q4.gasAcum - q4.difJust);
  const previo = r2(ingresos - gastosAnio); // antes de la difícil justificación
  const otrasRentas = Math.max(0, Number(personal.otrasRentas) || 0);
  // La difícil justificación y la reducción general, o la de dependiente sin difícil justificación: lo que deje menos.
  const general = (() => { const rn = r2(Math.max(0, previo - q4.difJust)); return { difJust: q4.difJust, reduccion: reduccionActividad(rn, { otrasRentas }), rn }; })();
  const dep = personal.dependiente ? (() => { const rn = r2(Math.max(0, previo)); return { difJust: 0, reduccion: reduccionActividad(rn, { dependiente: true, otrasRentas }), rn }; })() : null;
  const elegida = dep && dep.rn - dep.reduccion < general.rn - general.reduccion ? { ...dep, tipo: 'dependiente' } : { ...general, tipo: general.reduccion ? 'general' : null };
  return { q4, ingresos, gastosAnio, otrasRentas, elegida, neto: r2(previo - q4.difJust), reducido: r2(Math.max(0, elegida.rn - elegida.reduccion)) };
}

// personal: { nacimiento, hijos: [año de nacimiento…], hijosMes: [mes de nacimiento o 0…], compartidos, ascendientes: [año…],
// dependiente, otrasRentas, inicio, exEmpleador, ccaa, madre, guarderia } (fiscal.renta).
// rendimientos: { año: rendimiento neto de la actividad } apuntado para el 130 (u.rend130), para los años sin datos.
export function borradorRenta(facturas, gastos, anio, pagos = {}, { ivaCoste = false, personal = {}, iva = {}, rendimientos = {}, normal = false } = {}) {
  const act = rendimientoActividad(facturas, gastos, anio, pagos, { ivaCoste, iva, personal, normal });
  const { q4, ingresos, gastosAnio, otrasRentas, elegida, reducido } = act;
  // Inicio de actividad (art. 32.3 LIRPF; Manual de Renta 2025, parte 1, págs. 482-483): un 20 % del rendimiento neto
  // positivo, ya reducido por el 32.2, hasta 100.000 €, el primer año con rendimiento positivo desde el inicio y el
  // siguiente. Toca este año si es positivo y ninguno de los años desde el inicio hasta el antepasado lo fue (este año o
  // el anterior es entonces el primero). Cada año se mira con lo que hay en Fisquo o, sin datos, con el rendimiento
  // apuntado para el 130; si alguno no se sabe, no se aplica (falta). No se aplica si más de la mitad de los ingresos vienen
  // de quien le pagó una nómina el año anterior.
  const inicio = Number(personal.inicio) || 0;
  const hay = (y) => y > anio - ANIOS_DATOS && [...facturas, ...gastos].some((x) => String(x.fecha || '').startsWith(`${y}-`));
  let falta = null, yaPositivo = null;
  if (inicio && anio >= inicio) {
    for (let y = inicio; y <= anio - 2 && !falta && !yaPositivo; y++) {
      const rn = hay(y) ? rendimientoActividad(facturas, gastos, y, {}, { ivaCoste, iva, personal, normal }).neto : rendimientos?.[y] !== undefined && rendimientos?.[y] !== null && Number.isFinite(Number(rendimientos[y])) ? Number(rendimientos[y]) : null;
      if (rn === null) falta = y; else if (rn > 0) yaPositivo = y;
    }
  }
  const aplicaInicio = Boolean(inicio) && anio >= inicio && !falta && !yaPositivo && !personal.exEmpleador;
  const reduccionInicio = aplicaInicio ? r2(0.2 * Math.min(reducido, 100000)) : 0;
  const rendimiento = r2(reducido - reduccionInicio);
  const base = r2(rendimiento + otrasRentas);
  // Cuota íntegra (Manual de Renta 2025, parte 1, págs. 1118-1121): la escala estatal sobre la base menos la misma escala
  // sobre el mínimo personal y familiar estatal, más la escala de la comunidad sobre la base menos esa escala sobre el
  // mínimo autonómico. Sin comunidad elegida, la estatal y la del art. 65 con los mínimos estatales (aproximada).
  const ccaa = CCAA[personal.ccaa] || null;
  const minimos = minimosRenta(anio, personal);
  const minimosAut = ccaa?.minimos ? minimosRenta(anio, personal, ccaa.minimos) : minimos;
  const parcial = (escala, minimo) => r2(Math.max(0, cuotaEscala(base, escala) - cuotaEscala(Math.min(base, minimo), escala)));
  const estatalTotal = parcial(ESCALA_ESTATAL, minimos.total);
  const autonomicaTotal = parcial(ccaa ? ccaa.escala : ESCALA_ART65, minimosAut.total);
  // Solo la parte de la cuota que corresponde a la actividad (las otras rentas tienen sus propias retenciones, fuera de Fisquo).
  const parte = (c) => (base ? r2((c * rendimiento) / base) : 0);
  const cuotaEstatal = parte(estatalTotal), cuotaAutonomica = parte(autonomicaTotal);
  // Venta de bienes de inversión afectos (art. 28.2 LIRPF): no es rendimiento de la actividad, sino ganancia o pérdida
  // patrimonial (art. 33), en la base del ahorro (art. 46.b): el precio de la parte afecta menos el valor de adquisición
  // que queda tras las amortizaciones (art. 37.1.n y 40 LIRPF). Se grava con la escala del ahorro (arts. 66 y 76), con el
  // mínimo que no haya cabido en la base general (arts. 56.2 y 63.2). Una pérdida no resta aquí (se compensa con otras
  // ganancias o en los cuatro años siguientes, art. 49). Las ventas sin el bien elegido no se pueden calcular (sinBien).
  const bajas = bajasBienes(facturas);
  const opBien = { regimen: 'autonomo', ivaCoste, irpf: true, prorrata: ivaCoste ? undefined : prorrataBienes(facturas, gastos, iva), bajas };
  const ganancias = gastos.filter((g) => g.inversion && g.base > 0 && bajas.get(g.id)?.fecha.startsWith(`${anio}-`)).map((g) => {
    const { fecha, precio } = bajas.get(g.id);
    const transmision = r2((precio * pctAfecto(g)) / 100), adquisicion = valorNeto(g, fecha, opBien);
    return { id: g.id, concepto: g.concepto, fecha, transmision, adquisicion, ganancia: r2(transmision - adquisicion) };
  });
  const sinBien = facturas.filter((f) => f.accesoria && !f.rectifica && !(f.bien && gastos.some((g) => g.id === f.bien)) && f.fecha.startsWith(`${anio}-`)).length;
  const baseAhorro = Math.max(0, r2(ganancias.reduce((s, x) => s + x.ganancia, 0)));
  const ahorro = (minimo) => r2(cuotaEscala(baseAhorro, ESCALA_AHORRO) - cuotaEscala(Math.min(baseAhorro, Math.max(0, minimo - Math.max(0, base))), ESCALA_AHORRO));
  const cuotaAhorro = baseAhorro ? r2(ahorro(minimos.total) + ahorro(minimosAut.total)) : 0;
  const cuota = r2(cuotaEstatal + cuotaAutonomica + cuotaAhorro);
  // Ceuta y Melilla (art. 68.4 LIRPF; Manual de Renta 2025, parte 1, págs. 1290-1293): el 60 % de la parte de las cuotas
  // íntegras estatal y autonómica de las rentas obtenidas allí. Se da por hecho que la actividad se ejerce allí.
  const deduccionCeuta = ccaa?.ceutaMelilla ? r2(cuota * 0.6) : 0;
  const maternidad = deduccionMaternidad(anio, personal);
  const retenciones = q4.retAcum;
  const pagos130 = r2(Object.values(pagos || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  return {
    ingresos, gastos: gastosAnio, difJust: elegida.difJust, reduccion: elegida.reduccion, tipoReduccion: elegida.tipo, reduccionInicio,
    inicioActividad: inicio ? { aplica: aplicaInicio, ...(falta ? { falta } : {}), ...(yaPositivo ? { primero: yaPositivo } : {}) } : null,
    rendimiento, minimos, minimosAutonomicos: minimosAut, otrasRentas,
    ccaa: ccaa ? personal.ccaa : null, nombreCcaa: ccaa?.nombre || null, aproximada: !ccaa, escalaDe: 2025,
    cuotaEstatal, cuotaAutonomica, ganancias, sinBien, baseAhorro, cuotaAhorro, cuota, deduccionCeuta, maternidad, retenciones, pagos130,
    resultado: r2(cuota - deduccionCeuta - retenciones - pagos130 - maternidad.importe), tipoMedio: rendimiento ? r2(((cuota - cuotaAhorro) / rendimiento) * 100) : 0,
  };
}

// 216 (trimestral; mensual en las grandes empresas, que la app no distingue): retenciones e ingresos a cuenta del IRNR de
// lo pagado a no residentes sin establecimiento permanente (gastos con noResidente, lib/noResidentes.js), por la fecha de
// pago como el 111. Casillas del diseño de registro (ejercicio 2024 y siguientes) y de sus instrucciones en la Sede:
//  I. Rentas sometidas a retención: 05/08/11 dividendos (número de rentas, base y retenciones), 06/09/12 el resto y
//     07/10/13 los totales.
//  II. Rentas no sometidas (exentas por la ley o por un convenio, art. 31.4 TRLIRNR): 14/17 dividendos, 15/18 el resto y
//     16/19 los totales. Si solo hay estas, la declaración es negativa (casilla 13 a cero), pero se presenta.
//  20: lo ingresado en una declaración anterior del periodo (solo en la complementaria: aquí, 0); 21: a ingresar, 13 - 20.
// Cada gasto cuenta como una renta.
export function modelo216(gastos, anio, t) {
  const R = pagadosEn(gastos.filter((g) => g.noResidente), anio, t);
  const c = Object.fromEntries(['05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21'].map((k) => [k, 0]));
  for (const g of R) {
    const div = claveNoResidente(g) === 1;
    if (pctNoResidente(g) > 0) {
      const [n, b, r] = div ? ['05', '08', '11'] : ['06', '09', '12'];
      c[n] += 1; c[b] = r2(c[b] + g.base); c[r] = r2(c[r] + importes(g).irpf);
    } else {
      const [n, b] = div ? ['14', '17'] : ['15', '18'];
      c[n] += 1; c[b] = r2(c[b] + g.base);
    }
  }
  c['07'] = c['05'] + c['06']; c['10'] = r2(c['08'] + c['09']); c['13'] = r2(c['11'] + c['12']);
  c['16'] = c['14'] + c['15']; c['19'] = r2(c['17'] + c['18']); c['21'] = r2(c['13'] - c['20']);
  return { c, rentas: R.length, perceptores: new Set(R.map((g) => claveProveedor(g) || 'sin nombre')).size, base: r2(c['10'] + c['19']), retenciones: c['13'], negativa: R.length > 0 && c['13'] === 0 };
}

// 296 (resumen anual, del 1 al 31 de enero): un registro por perceptor, clave, subclave y porcentaje (diseño de registro
// del 296: NIF en España, si lo tiene, o el de su país de residencia, posiciones 433-452; país de residencia, 498-499;
// naturaleza D, dineraria; clave de la renta, 100-101; subclave, 102-103: 01 tipo general, 02 límite de convenio, 03
// exención interna, 04 exención por convenio; base, porcentaje y retenciones). Las rentas exentas también van, al 0 %.
// devengo: la fecha del último gasto del registro (cada renta lleva la suya si se declaran por separado).
export function modelo296(gastos, anio) {
  const m = new Map();
  for (const g of pagadosEn(gastos.filter((x) => x.noResidente).map((x) => ({ ...x, devengo: x.fecha })), anio)) {
    const clave = claveNoResidente(g), subclave = subclave296(g), pct = pctNoResidente(g);
    const k = `${claveProveedor(g) || 'sin nombre'}:${clave}:${subclave}:${pct}`;
    const nif = String(g.proveedorNif || '').toUpperCase();
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: nifEspanol(nif) ? nif : '', nifResidencia: nifEspanol(nif) ? '' : nif, pais: g.noResidente.pais, naturaleza: 'D', clave, claveNombre: CLAVES_296[clave], subclave, pct, rentas: 0, base: 0, retenciones: 0, devengo: '' };
    p.rentas += 1; p.base = r2(p.base + g.base); p.retenciones = r2(p.retenciones + importes(g).irpf);
    if (g.devengo > p.devengo) p.devengo = g.devengo;
    m.set(k, p);
  }
  const perceptores = [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.clave - b.clave);
  return { perceptores, base: suma(perceptores, (p) => p.base), retenciones: suma(perceptores, (p) => p.retenciones) };
}

export { importes };
