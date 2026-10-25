// Modelos 115, 180, 349, 390, 190 y borrador de la renta (100). Orientativos: los confirma la gestoría.
import { tipoISForal } from './territorios.js';
import { categoriaDe } from './categorias.js';
import { MARGEN, casillas303, costeGasto, desglose, fechaDevengo, fechaIva, habil, importes, liquidaciones303, nifUE, operacionesCaja, operacionesProrrata, origenGasto, prorrataAnio, r2, resumenAnual, trimestre } from './calculos.js';
import { TIPOS_OPERACION, operacionDe } from './operaciones.js';
import { calculoNomina, nominasPagadasEn } from './nominas.js';
import { amortizacionesAnio } from './amortizaciones.js';
import { claveProveedor } from './proveedores.js';
import { valorInventario } from './inventario.js';

const suma = (l, f) => r2(l.reduce((s, x) => s + f(x), 0));
const delT = (l, anio, t) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && (!t || trimestre(x.fecha) === t));
export const RET_ALQUILER = 19;
// Sin fecha de pago explícita, los gastos históricos se consideran pagados al emitirlos.
const pagadosEn = (gastos, anio, t) => delT(gastos.filter((g) => !g.pendiente).map((g) => ({ ...g, fecha: g.pagado || g.fecha })), anio, t);

// 115 (trimestral) y 180 (anual): retenciones del alquiler del local. Los gastos marcados «alquiler».
export function modelo115(gastos, anio, t) {
  const A = pagadosEn(gastos.filter((g) => g.alquiler), anio, t);
  const base = suma(A, (g) => g.base);
  return { perceptores: new Set(A.map((g) => claveProveedor(g) || 'sin nombre')).size, base, retenciones: suma(A, (g) => r2((g.base * RET_ALQUILER) / 100)) };
}
export function modelo180(gastos, anio) {
  const m = new Map();
  for (const g of pagadosEn(gastos.filter((x) => x.alquiler), anio)) {
    const k = claveProveedor(g) || 'sin nombre';
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', base: 0, retenciones: 0 };
    p.base = r2(p.base + g.base);
    p.retenciones = r2(p.retenciones + r2((g.base * RET_ALQUILER) / 100));
    m.set(k, p);
  }
  const arrendadores = [...m.values()];
  return { arrendadores, base: suma(arrendadores, (p) => p.base), retenciones: suma(arrendadores, (p) => p.retenciones) };
}

// 349: clientes de otros países de la UE (NIF-IVA con prefijo del país), clave S (servicios prestados), y proveedores
// de la UE con su NIF-IVA, clave I (servicios recibidos).
export { nifUE };
export function modelo349(facturas, anio, t, gastos = []) {
  const m = new Map();
  const sumar = (nif, nombre, clave, base) => {
    const c = m.get(nif + clave) || { nif, nombre, clave, base: 0 };
    c.base = r2(c.base + base);
    m.set(nif + clave, c);
  };
  // Solo la parte sin IVA de las operaciones intracomunitarias (lib/operaciones.js): con IVA español no es intracomunitaria.
  // Por la fecha de devengo, como la casilla 59 del 303 (fechaIva de lib/calculos.js), para que los dos cuadren.
  for (const f of delT(facturas.map((x) => (fechaIva(x) === x.fecha ? x : { ...x, fecha: fechaIva(x) })), anio, t)) {
    const op = TIPOS_OPERACION[operacionDe(f)];
    const nif = nifUE(f.cliente?.nif);
    // Irlanda del Norte (XI) solo cuenta como UE para bienes: sus servicios no van al 349.
    if (op?.clave349 && nif && !(nif.startsWith('XI') && op.clave349 === 'S')) sumar(nif, f.cliente.nombre, op.clave349, desglose(f).filter((x) => x.pct === 0).reduce((s, x) => s + x.base, 0));
  }
  // Compras a la UE: A las de bienes (un bien de inversión, mercaderías o con stock) e I las de servicios.
  for (const g of delT(gastos, anio, t)) {
    const nif = nifUE(g.proveedorNif);
    const bienes = Boolean(g.inversion || g.stock?.length) || ['600', '601', '602'].includes(categoriaDe(g));
    if (nif && origenGasto(g) === 'ue' && (bienes || !nif.startsWith('XI'))) sumar(nif, g.proveedor || 'Sin nombre', bienes ? 'A' : 'I', g.base);
  }
  const operadores = [...m.values()].sort((a, b) => b.base - a.base);
  return { operadores, total: suma(operadores, (c) => c.base) };
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
  c['106'] = 0; c['107'] = 0;
  c['108'] = r2(['99', '653', '103', '104', '105', '110', '125', '126', '127', '227', '228'].reduce((t, k) => t + (c[k] || 0), 0) - c['106'] - c['107']);
  // Operaciones específicas y prorrata.
  c['232'] = suma(q, (x) => x.detalle.noDeducible);
  sumar('654', s('62')); sumar('655', s('63')); sumar('656', s('74')); sumar('657', s('75'));
  const definitiva = prorrataAnio(facturas, anio);
  if (definitiva !== null || q[3].prorrata) {
    const o = operacionesProrrata(facturas, anio);
    c['115'] = o.total; c['116'] = r2(o.total - o.exentas); c['117'] = q[3].prorrata?.especial ? 'E' : 'G'; c['118'] = definitiva ?? 100;
  }
  return { c, avisos: [...avisos], trimestres: q.map((x) => x['46']), resultado: r2(c['47'] - c['64']), deducible: s('45'), devengado: s('27') };
}

// Retenciones a profesionales (gastos con irpfPct, por ejemplo la gestoría): casillas 07 a 09 del 111 y clave G del 190.
export function retencionesProfesionales(gastos, anio, t) {
  const R = pagadosEn(gastos.filter((g) => !g.alquiler && Number(g.irpfPct) > 0), anio, t);
  return { perceptores: new Set(R.map((g) => claveProveedor(g) || 'sin nombre')).size, base: suma(R, (g) => g.base), retenciones: suma(R, (g) => importes(g).irpf) };
}

// 190: resumen anual de retenciones de los trabajadores (clave A), de los profesionales (clave G) y de los empresarios en
// módulos y agricultores con el 1 o el 2 % (clave H), por perceptor.
export function modelo190(nominas, empleados, anio, gastos = []) {
  const m = new Map();
  for (const n of nominasPagadasEn(nominas, anio)) {
    const e = empleados.find((x) => x.id === n.empleado) || {};
    const c = calculoNomina(n);
    const p = m.get(n.empleado) || { nombre: e.nombre || n.empleadoNombre, nif: e.nif || '', clave: 'A', percepciones: 0, retenciones: 0 };
    p.percepciones = r2(p.percepciones + c.bruto); p.retenciones = r2(p.retenciones + c.irpf);
    m.set(n.empleado, p);
  }
  for (const g of pagadosEn(gastos.filter((x) => !x.alquiler && Number(x.irpfPct) > 0), anio)) {
    const clave = Number(g.irpfPct) <= 2 ? 'H' : 'G';
    const k = `prof:${clave}:${claveProveedor(g) || 'sin nombre'}`;
    const p = m.get(k) || { nombre: g.proveedor || 'Sin nombre', nif: g.proveedorNif || '', clave, percepciones: 0, retenciones: 0 };
    p.percepciones = r2(p.percepciones + g.base); p.retenciones = r2(p.retenciones + importes(g).irpf);
    m.set(k, p);
  }
  const perceptores = [...m.values()];
  return { perceptores, percepciones: suma(perceptores, (p) => p.percepciones), retenciones: suma(perceptores, (p) => p.retenciones) };
}

// 347: clientes (clave B) y proveedores (clave A) con los que se pasa de 3.005,06 € en el año, IVA incluido, con lo de
// cada trimestre. Fuera: lo que ya va en el 349 (empresas de la UE), lo de fuera de la UE (ventas sin IVA a un NIF que
// no es español y compras de fuera), lo que lleva retención (va en el 190 o el 180: facturas con retención, alquiler del
// local y profesionales) y los tickets sin proveedor.
export const LIMITE_347 = 3005.06;
const NIF_ES = /^(ES)?([0-9]{8}[A-Z]|[XYZKLM][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;
export function modelo347(facturas, gastos, anio) {
  const m = new Map();
  const sumar = (clave, nif, nombre, fecha, total) => {
    const k = `${clave}:${nif || String(nombre || '').trim().toUpperCase()}`;
    const o = m.get(k) || { clave, nif: nif || '', nombre: nombre || 'Sin nombre', total: 0, trimestres: [0, 0, 0, 0] };
    o.total = r2(o.total + total);
    o.trimestres[trimestre(fecha) - 1] = r2(o.trimestres[trimestre(fecha) - 1] + total);
    m.set(k, o);
  };
  const nifDe = (n) => String(n || '').toUpperCase().replace(/[\s.-]/g, '');
  for (const f of delT(facturas, anio)) {
    const i = importes(f);
    const nif = nifDe(f.cliente?.nif);
    // Las ventas a consumidores finales (cierres de caja, tiques) no se declaran.
    if (f.simplificada || Number(f.irpfPct) > 0 || (nifUE(nif) && !i.iva) || (!i.iva && nif && !NIF_ES.test(nif))) continue;
    sumar('B', nif.replace(/^ES/, ''), f.cliente?.nombre, f.fecha, r2(i.base + i.iva + (i.recargo || 0)));
  }
  for (const g of delT(gastos, anio)) {
    // Las importaciones tampoco (art. 33.2 RGAT: van en el DUA).
    if (g.alquiler || g.importacion || Number(g.irpfPct) > 0 || origenGasto(g) || !String(g.proveedor || '').trim()) continue;
    const i = importes(g);
    sumar('A', nifDe(g.proveedorNif).replace(/^ES/, ''), g.proveedor, g.fecha, r2(i.base + i.iva));
  }
  const declarados = [...m.values()].filter((o) => Math.abs(o.total) > LIMITE_347).sort((a, b) => b.total - a.total);
  return { ventas: declarados.filter((o) => o.clave === 'B'), compras: declarados.filter((o) => o.clave === 'A'), sinNif: declarados.filter((o) => !o.nif) };
}

// 202 (sociedades, art. 40.2 de la Ley del Impuesto sobre Sociedades): el 18 % de la cuota del último Impuesto sobre
// Sociedades ya presentado (menos deducciones, bonificaciones y retenciones). En abril, el de hace dos años (el del
// año pasado aún no se ha presentado); en octubre y diciembre, el del año pasado. Sin cuota (o a cero), no se presenta.
export function modelo202(cuotaIS = {}, anio) {
  return [[1, 'abril', anio - 2], [2, 'octubre', anio - 1], [3, 'diciembre', anio - 1]].map(([p, mes, de]) => {
    const cuota = cuotaIS[de] ?? null;
    return { p, mes, de, cuota, pago: cuota > 0 ? r2(cuota * 0.18) : 0, fecha: habil(`${anio}-${{ abril: '04', octubre: '10', diciembre: '12' }[mes]}-20`) };
  });
}

// Borrador del Impuesto sobre Sociedades (modelo 200), solo con lo que hay en la app: base = ingresos − gastos, sin
// ajustes. El tipo depende de la facturación del año anterior (Ley 27/2014, art. 29, con la Ley 7/2024): menos de 1 M
// (microempresa, dos tramos: los primeros 50.000 € y el resto), menos de 10 M (reducida dimensión) o general (25 %).
const TIPO_MICRO = { 2025: [21, 22], 2026: [19, 21] }; // antes de 2025, 23 %; desde 2027, 17 % y 20 %
const TIPO_REDUCIDA = { 2025: 24, 2026: 23, 2027: 22, 2028: 21 }; // antes de 2025, 25 %; desde 2029, 20 %
export function tiposIS(anio, tamano) {
  if (tamano === 'micro') return anio < 2025 ? [23, 23] : TIPO_MICRO[anio] || [17, 20];
  if (tamano === 'reducida') { const t = anio < 2025 ? 25 : TIPO_REDUCIDA[anio] || 20; return [t, t]; }
  return [25, 25];
}
// Base imponible de un año (ingresos − gastos, con amortizaciones, existencias y asientos manuales), sin ajustes.
function baseSociedades(facturas, gastos, anio, { ivaCoste = false, productos = [], ajustes = [], albaranes = [], manuales = [], hasta = `${anio}-12-31` } = {}) {
  const neto = (x) => { const i = importes(x); return ivaCoste ? r2(i.base + i.iva) : i.base; };
  const F = delT(facturas, anio).filter((f) => f.fecha <= hasta);
  const ingresos = suma(F, neto);
  // Los bienes de inversión no cuentan enteros: solo su amortización del año.
  const amortizacion = suma(amortizacionesAnio(gastos, anio, { regimen: 'sociedad', ivaCoste, hasta }), (x) => x.cuota);
  const datosStock = { productos, facturas, gastos, ajustes, albaranes };
  const variacionExistencias = productos.length ? r2(valorInventario(datosStock, hasta) - valorInventario(datosStock, `${anio - 1}-12-31`)) : 0;
  const gastosAnio = r2(suma(delT(gastos, anio).filter((g) => g.fecha <= hasta && !(g.inversion && g.base > 0)), (g) => costeGasto(g, { ivaCoste })) + amortizacion - variacionExistencias);
  const ajustesContables = r2(manuales.filter((a) => !a.apertura && a.fecha.startsWith(`${anio}-`) && a.fecha <= hasta).reduce((s, a) => s + a.lineas.filter((l) => /^[67]/.test(l.cuenta) && !/^(630|633|638)/.test(l.cuenta)).reduce((v, l) => v + Number(l.haber || 0) - Number(l.debe || 0), 0), 0));
  // perdida: lo que la base imponible negativa deja para compensar en los años siguientes (art. 26 LIS).
  const resultado = r2(ingresos - gastosAnio + ajustesContables);
  return { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base: Math.max(0, resultado), perdida: Math.max(0, -resultado) };
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
// 15 % de las entidades de nueva creación (que es de la ley estatal).
export function borradorSociedades(facturas, gastos, anio, { pagos202 = {}, ivaCoste = false, productos = [], ajustes = [], albaranes = [], manuales = [], hasta = `${anio}-12-31`, constitucion = '', cuotaIS = {}, territorio } = {}) {
  const op = { ivaCoste, productos, ajustes, albaranes, manuales };
  const { F, ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base, perdida } = baseSociedades(facturas, gastos, anio, { ...op, hasta });
  const previo = suma(delT(facturas, anio - 1), (f) => f.base);
  // Sin datos del año anterior en la app, el de este; con datos, el del año anterior aunque fuera cero (art. 29 LIS).
  const conAnterior = [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${anio - 1}-`));
  const incn = conAnterior ? previo : suma(delT(facturas, anio), (f) => f.base);
  const tamano = incn < 1e6 ? 'micro' : incn < 1e7 ? 'reducida' : 'general';
  const foral = tipoISForal(territorio, incn);
  const nueva = foral !== null ? null : nuevaCreacion(anio, {
    constitucion, cuotaIS, base,
    hayDatos: (y) => [...facturas, ...gastos].some((x) => x.fecha?.startsWith(`${y}-`)),
    baseDe: (y) => baseSociedades(facturas, gastos, y, op).base,
  });
  // El 15 % sustituye al tipo del tramo solo donde es menor.
  const [t1, t2] = foral !== null ? [foral, foral] : tiposIS(anio, tamano).map((t) => (nueva?.aplica ? Math.min(t, TIPO_NUEVA_CREACION) : t));
  const tramos = t1 === t2 ? [{ base, pct: t1 }] : [{ base: Math.min(base, 50000), pct: t1 }, { base: r2(Math.max(0, base - 50000)), pct: t2 }];
  for (const x of tramos) x.cuota = r2((x.base * x.pct) / 100);
  const cuota = suma(tramos, (x) => x.cuota);
  const pagos = r2(Object.values(pagos202[anio] || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  const retenciones = suma(F, (f) => importes(f).irpf);
  return { ingresos, gastos: gastosAnio, amortizacion, variacionExistencias, ajustesContables, base, perdida, incn, conAnterior, tamano, nuevaCreacion: nueva, ...(foral !== null ? { foral: territorio } : {}), tramos: tramos.filter((x) => x.base > 0), cuota, pagos, retenciones, resultado: r2(cuota - pagos - retenciones), tipoMedio: base ? r2((cuota / base) * 100) : 0 };
}

// Borrador de la renta de un autónomo (estimación directa simplificada), solo con lo que hay en la app.
// Escala general orientativa (estatal + autonómica media) y mínimo personal de 5.550 €.
const ESCALA = [[12450, 19], [20200, 24], [35200, 30], [60000, 37], [300000, 45], [Infinity, 47]];
export function cuotaEscala(base) {
  let cuota = 0, desde = 0;
  for (const [hasta, pct] of ESCALA) {
    if (base <= desde) break;
    cuota += ((Math.min(base, hasta) - desde) * pct) / 100;
    desde = hasta;
  }
  return r2(cuota);
}
export const MINIMO_PERSONAL = 5550;
// Mínimos personales y familiares (arts. 57-59 LIRPF), por edad a 31 de diciembre del año.
const MINIMO_DESCENDIENTE = [2400, 2700, 4000, 4500]; // 1.º, 2.º, 3.º y 4.º y siguientes (menores de 25 que conviven)
export function minimosRenta(anio, { nacimiento, hijos = [], compartidos = true, ascendientes = [] } = {}) {
  const edad = (y) => anio - Number(y);
  // Edad cumplida a 31 de diciembre: el incremento es para quien tiene 65 (o 75) años o más, como en Renta WEB y en el
  // algoritmo de retenciones (lib/retencionIrpf.js).
  const personal = MINIMO_PERSONAL + (nacimiento && edad(nacimiento) >= 65 ? 1150 : 0) + (nacimiento && edad(nacimiento) >= 75 ? 1400 : 0);
  const H = hijos.map(Number).filter((y) => y && edad(y) >= 0 && edad(y) < 25).sort((a, b) => a - b);
  // Con los dos progenitores declarando por separado, cada uno aplica la mitad.
  const parte = compartidos ? 0.5 : 1;
  const descendientes = r2(H.reduce((s, y, i) => s + (MINIMO_DESCENDIENTE[Math.min(i, 3)] + (edad(y) < 3 ? 2800 : 0)) * parte, 0));
  const A = ascendientes.map(Number).filter((y) => y && edad(y) >= 65);
  const ascend = A.reduce((s, y) => s + 1150 + (edad(y) >= 75 ? 1400 : 0), 0);
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

// personal: { nacimiento, hijos: [año de nacimiento…], compartidos, ascendientes: [año…], dependiente, otrasRentas, inicio,
// exEmpleador } (fiscal.renta).
export function borradorRenta(facturas, gastos, anio, pagos = {}, { ivaCoste = false, personal = {}, iva = {} } = {}) {
  const q4 = resumenAnual(facturas, gastos, anio, pagos, undefined, { ivaCoste, iva }).trimestres[3];
  const ingresos = q4.ingAcum;
  const gastosAnio = r2(q4.gasAcum - q4.difJust);
  const previo = r2(ingresos - gastosAnio); // antes de la difícil justificación
  const otrasRentas = Math.max(0, Number(personal.otrasRentas) || 0);
  // La difícil justificación y la reducción general, o la de dependiente sin difícil justificación: lo que deje menos.
  const general = (() => { const rn = r2(Math.max(0, previo - q4.difJust)); return { difJust: q4.difJust, reduccion: reduccionActividad(rn, { otrasRentas }), rn }; })();
  const dep = personal.dependiente ? (() => { const rn = r2(Math.max(0, previo)); return { difJust: 0, reduccion: reduccionActividad(rn, { dependiente: true, otrasRentas }), rn }; })() : null;
  const elegida = dep && dep.rn - dep.reduccion < general.rn - general.reduccion ? { ...dep, tipo: 'dependiente' } : { ...general, tipo: general.reduccion ? 'general' : null };
  const reducido = r2(Math.max(0, elegida.rn - elegida.reduccion));
  // Inicio de actividad (art. 32.3 LIRPF): un 20 % del rendimiento neto positivo, ya reducido por el 32.2, hasta 100.000 €,
  // el primer año con rendimiento positivo y el siguiente. El año de alta y el siguiente siempre son uno de esos dos (si el
  // de alta no tuvo beneficio, el siguiente es el primero); más tarde depende de años que Fisquo no conoce. No se aplica si
  // más de la mitad de los ingresos vienen de quien le pagó una nómina el año anterior.
  const inicio = Number(personal.inicio) || 0;
  const reduccionInicio = inicio && (anio === inicio || anio === inicio + 1) && !personal.exEmpleador ? r2(0.2 * Math.min(reducido, 100000)) : 0;
  const rendimiento = r2(reducido - reduccionInicio);
  const minimos = minimosRenta(anio, personal);
  const base = r2(rendimiento + otrasRentas);
  const cuotaTotal = r2(Math.max(0, cuotaEscala(base) - cuotaEscala(Math.min(base, minimos.total))));
  // Solo la parte de la cuota que corresponde a la actividad (las otras rentas tienen sus propias retenciones, fuera de Fisquo).
  const cuota = base ? r2((cuotaTotal * rendimiento) / base) : 0;
  const retenciones = q4.retAcum;
  const pagos130 = r2(Object.values(pagos || {}).reduce((s, v) => s + (Number(v) || 0), 0));
  return { ingresos, gastos: gastosAnio, difJust: elegida.difJust, reduccion: elegida.reduccion, tipoReduccion: elegida.tipo, reduccionInicio, rendimiento, minimos, otrasRentas, cuota, retenciones, pagos130, resultado: r2(cuota - retenciones - pagos130), tipoMedio: rendimiento ? r2((cuota / rendimiento) * 100) : 0 };
}

export { importes };
