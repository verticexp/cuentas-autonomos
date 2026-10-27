// Cuentas anuales de una sociedad para depositar en el Registro Mercantil, con los epígrafes oficiales del plan general
// contable de pymes (RD 1515/2007): balance, cuenta de pérdidas y ganancias, estado de cambios en el patrimonio neto y
// memoria. Todo sale de los asientos (lib/asientos.js); la memoria se rellena con las cifras y se puede retocar.
import { r2 } from './calculos.js';
import { libroBienes } from './amortizaciones.js';
import { CUENTAS } from './asientos.js';

// ---------- Balance (modelo de pymes) ----------
// Casillas del modelo «PYMES Castellano Editable 2022» del Ministerio de Justicia.
const h = (id, codigo, t, hijos) => ({ id, codigo, t, ...(hijos ? { hijos } : {}) });
export const ESTRUCTURA_BALANCE = {
  activo: [
    h('A', '11000', 'A) ACTIVO NO CORRIENTE', [
      h('A.I', '11100', 'I. Inmovilizado intangible'), h('A.II', '11200', 'II. Inmovilizado material'),
      h('A.III', '11300', 'III. Inversiones inmobiliarias'),
      h('A.IV', '11400', 'IV. Inversiones en empresas del grupo y asociadas a largo plazo'),
      h('A.V', '11500', 'V. Inversiones financieras a largo plazo'), h('A.VI', '11600', 'VI. Activos por impuesto diferido'),
      h('A.VII', '11700', 'VII. Deudores comerciales no corrientes'),
    ]),
    h('B', '12000', 'B) ACTIVO CORRIENTE', [
      h('B.I', '12200', 'I. Existencias'),
      h('B.II', '12300', 'II. Deudores comerciales y otras cuentas a cobrar', [
        h('B.II.1', '12380', '1. Clientes por ventas y prestaciones de servicios', [
          h('B.II.1.a', '12381', 'a) a largo plazo'), h('B.II.1.b', '12382', 'b) a corto plazo'),
        ]),
        h('B.II.2', '12370', '2. Accionistas (socios) por desembolsos exigidos'), h('B.II.3', '12390', '3. Otros deudores'),
      ]),
      h('B.III', '12400', 'III. Inversiones en empresas del grupo y asociadas a corto plazo'),
      h('B.IV', '12500', 'IV. Inversiones financieras a corto plazo'), h('B.V', '12600', 'V. Periodificaciones a corto plazo'),
      h('B.VI', '12700', 'VI. Efectivo y otros activos líquidos equivalentes'),
    ]),
  ],
  pasivo: [
    h('PA', '20000', 'A) PATRIMONIO NETO', [
      h('PA1', '21000', 'A-1) Fondos propios', [
        h('PA1.I', '21100', 'I. Capital', [h('PA1.I.1', '21110', '1. Capital escriturado'), h('PA1.I.2', '21120', '2. (Capital no exigido)')]),
        h('PA1.II', '21200', 'II. Prima de emisión'),
        h('PA1.III', '21300', 'III. Reservas', [h('PA1.III.1', '21350', '1. Reserva de capitalización'), h('PA1.III.2', '21360', '2. Otras reservas')]),
        h('PA1.IV', '21400', 'IV. (Acciones y participaciones en patrimonio propias)'),
        h('PA1.V', '21500', 'V. Resultados de ejercicios anteriores'), h('PA1.VI', '21600', 'VI. Otras aportaciones de socios'),
        h('PA1.VII', '21700', 'VII. Resultado del ejercicio'), h('PA1.VIII', '21800', 'VIII. (Dividendo a cuenta)'),
      ]),
      h('PA2', '22000', 'A-2) Ajustes en patrimonio neto'), h('PA3', '23000', 'A-3) Subvenciones, donaciones y legados recibidos'),
    ]),
    h('PB', '31000', 'B) PASIVO NO CORRIENTE', [
      h('PB.I', '31100', 'I. Provisiones a largo plazo'),
      h('PB.II', '31200', 'II. Deudas a largo plazo', [h('PB.II.1', '31220', '1. Deudas con entidades de crédito'), h('PB.II.2', '31230', '2. Acreedores por arrendamiento financiero'), h('PB.II.3', '31290', '3. Otras deudas a largo plazo')]),
      h('PB.III', '31300', 'III. Deudas con empresas del grupo y asociadas a largo plazo'), h('PB.IV', '31400', 'IV. Pasivos por impuesto diferido'),
      h('PB.V', '31500', 'V. Periodificaciones a largo plazo'), h('PB.VI', '31600', 'VI. Acreedores comerciales no corrientes'),
      h('PB.VII', '31700', 'VII. Deuda con características especiales a largo plazo'),
    ]),
    h('PC', '32000', 'C) PASIVO CORRIENTE', [
      h('PC.I', '32200', 'I. Provisiones a corto plazo'),
      h('PC.II', '32300', 'II. Deudas a corto plazo', [h('PC.II.1', '32320', '1. Deudas con entidades de crédito'), h('PC.II.2', '32330', '2. Acreedores por arrendamiento financiero'), h('PC.II.3', '32390', '3. Otras deudas a corto plazo')]),
      h('PC.III', '32400', 'III. Deudas con empresas del grupo y asociadas a corto plazo'),
      h('PC.IV', '32500', 'IV. Acreedores comerciales y otras cuentas a pagar', [
        h('PC.IV.1', '32580', '1. Proveedores', [h('PC.IV.1.a', '32581', 'a) a largo plazo'), h('PC.IV.1.b', '32582', 'b) a corto plazo')]),
        h('PC.IV.2', '32590', '2. Otros acreedores'),
      ]),
      h('PC.V', '32600', 'V. Periodificaciones a corto plazo'), h('PC.VI', '32700', 'VI. Deuda con características especiales a corto plazo'),
    ]),
  ],
};
export const TOTALES_BALANCE = [
  h('activo', '10000', 'TOTAL ACTIVO (A + B)'), h('pasivo', '30000', 'TOTAL PATRIMONIO NETO Y PASIVO (A + B + C)'),
];

// Epígrafe de cada cuenta (la regla más larga que encaje). Las de los grupos 4 y 5 cambian de lado según su saldo.
const REGLAS = [
  ['A.I', ['20', '280', '290']], ['A.II', ['21', '23', '281', '291']], ['A.III', ['22', '282', '292']],
  ['A.IV', ['2403', '2404', '2413', '2414', '2423', '2424', '2933', '2934', '2943', '2944', '2953', '2954']], ['A.V', ['24', '25', '26', '293', '294', '295', '296', '297', '298']], ['A.VI', ['474']],
  ['B.I', ['3', '407']], ['B.II.1', ['430', '431', '432', '433', '434', '435', '436', '490', '493']], ['B.II.2', ['5580']],
  ['B.II.3', ['44', '460', '470', '471', '472', '473', '544']], ['B.III', ['53', '5933', '5934', '5943', '5944', '5953', '5954']], ['B.IV', ['54', '565', '566', '59']], ['B.V', ['480', '567']], ['B.VI', ['57']],
  ['PA1.I.1', ['100', '101', '102']], ['PA1.I.2', ['1030', '1040']], ['PA1.II', ['110']], ['PA1.III', ['112', '113', '114', '115', '119']], ['PA1.IV', ['108', '109']],
  ['PA1.V', ['120', '121']], ['PA1.VI', ['118', '550']], ['PA1.VII', ['129', '6', '7']], ['PA1.VIII', ['557']], ['PA2', ['133', '134', '135', '136', '137']], ['PA3', ['13']],
  ['PB.I', ['14']], ['PB.II.1', ['170', '1605']], ['PB.II.2', ['174', '1625']], ['PB.II.3', ['17', '18', '1615', '1635']],
  ['PB.III', ['1603', '1604', '1613', '1614', '1623', '1624', '1633', '1634']], ['PB.IV', ['479']], ['PB.V', ['181']], ['PB.VII', ['15', '189', '199']],
  ['PC.I', ['499', '529']], ['PC.II.1', ['520', '527', '5105']], ['PC.II.2', ['524', '5125']], ['PC.II.3', ['52', '551', '552', '553', '555', '56', '5115', '5135', '5145']],
  ['PC.III', ['510', '511', '512', '513', '514']],
  ['PC.IV.1', ['400', '401', '402', '403', '404', '405', '406']], ['PC.IV.2', ['41', '438', '465', '466', '475', '476', '477']], ['PC.V', ['485', '568']], ['PC.VI', ['195', '197', '502', '503', '504', '507']],
];
// Si el saldo va al revés de lo normal, el otro lado del balance.
const AL_REVES = { 'B.II.1': 'PC.IV.2', 'B.II.3': 'PC.IV.2', 'B.VI': 'PC.II.1', 'PC.IV.1': 'B.II.3', 'PC.IV.2': 'B.II.3', 'PC.II.3': 'B.II.3' };
export function epigrafe(c, saldo) {
  let mejor = null, largo = 0;
  for (const [id, prefs] of REGLAS) for (const p of prefs) if (c.startsWith(p) && p.length > largo) { mejor = id; largo = p.length; }
  if (!mejor) mejor = /^[45]/.test(c) ? (saldo >= 0 ? 'B.II.3' : 'PC.IV.2') : /^1/.test(c) ? 'PB.II.3' : 'A.II';
  const activo = /^[AB]/.test(mejor);
  // Las amortizaciones y deterioros minoran su activo; la 499 es una provisión de pasivo.
  const correctora = /^(28|29|39|490|493|59)/.test(c);
  if (!correctora && AL_REVES[mejor] && (activo ? saldo < 0 : saldo > 0)) mejor = AL_REVES[mejor];
  return mejor;
}

function saldosHasta(asientos, fecha) {
  const m = {};
  for (const a of asientos) if (a.fecha <= fecha) for (const l of a.lineas) m[l.cuenta] = r2((m[l.cuenta] || 0) + l.debe - l.haber);
  return m;
}

// Importe de cada epígrafe (hojas y totales) a una fecha.
export function balanceOficial(asientos, fecha, { cuentas = CUENTAS, vencimientos = {} } = {}) {
  const v = {};
  for (const [c, s] of Object.entries(saldosHasta(asientos, fecha))) {
    if (!s) continue;
    let id = epigrafe(c, s);
    // Sin vencimiento conocido, clientes y proveedores se presentan a corto plazo.
    const dato = vencimientos[c];
    const limite = `${Number(fecha.slice(0, 4)) + 1}${fecha.slice(4)}`;
    const largo = dato?.fecha > limite;
    if (id === 'B.II.1') id = largo ? (dato.cicloExplotacion ? 'B.II.1.a' : 'A.VII') : 'B.II.1.b';
    if (id === 'PC.IV.1') id = largo ? (dato.cicloExplotacion ? 'PC.IV.1.a' : 'PB.VI') : 'PC.IV.1.b';
    if (id === 'B.II.3' && largo) id = 'A.VII';
    if (id === 'PC.IV.2' && largo) id = 'PB.VI';
    if (id === 'PA1.III') id = /^1140/.test(c) && /reserva de capitalización/i.test(cuentas['1140'] || '') ? 'PA1.III.1' : 'PA1.III.2';
    v[id] = r2((v[id] || 0) + (/^[AB]/.test(id) ? s : -s));
  }
  const sumar = (n) => (n.hijos ? (v[n.id] = r2(n.hijos.reduce((s, x) => s + sumar(x), 0))) : (v[n.id] = v[n.id] || 0));
  const activo = r2(ESTRUCTURA_BALANCE.activo.reduce((s, n) => s + sumar(n), 0));
  const pasivo = r2(ESTRUCTURA_BALANCE.pasivo.reduce((s, n) => s + sumar(n), 0));
  return { fecha, v, activo, pasivo };
}

// ---------- Cuenta de pérdidas y ganancias (modelo de pymes) ----------
export const LINEAS_PYG = [
  { id: 1, t: '1. Importe neto de la cifra de negocios', p: ['700', '701', '702', '703', '704', '705', '706', '708', '709'] },
  { id: 2, t: '2. Variación de existencias de productos terminados y en curso de fabricación', p: ['6930', '71', '7930'] },
  { id: 3, t: '3. Trabajos realizados por la empresa para su activo', p: ['73'] },
  { id: 4, t: '4. Aprovisionamientos', p: ['600', '601', '602', '606', '607', '608', '609', '61', '6931', '6932', '6933', '7931', '7932', '7933'] },
  { id: 5, t: '5. Otros ingresos de explotación', p: ['740', '747', '75', '7'] },
  { id: 6, t: '6. Gastos de personal', p: ['64'] },
  { id: 7, t: '7. Otros gastos de explotación', p: ['62', '631', '634', '636', '639', '65', '694', '695', '794', '7954', '6'] },
  { id: 8, t: '8. Amortización del inmovilizado', p: ['68'] },
  { id: 9, t: '9. Imputación de subvenciones de inmovilizado no financiero y otras', p: ['746'] },
  { id: 10, t: '10. Excesos de provisiones', p: ['7951', '7952', '7955', '7956'] },
  { id: 11, t: '11. Deterioro y resultado por enajenaciones del inmovilizado', p: ['670', '671', '672', '690', '691', '692', '770', '771', '772', '790', '791', '792'] },
  { id: 12, t: '12. Otros resultados', p: ['678', '778'] },
  { id: 13, t: '13. Ingresos financieros', p: [], hijos: ['13.a', '13.b'] },
  { id: '13.a', t: 'a) Imputación de subvenciones, donaciones y legados de carácter financiero', p: [] },
  { id: '13.b', t: 'b) Otros ingresos financieros', p: ['76'] },
  { id: 14, t: '14. Gastos financieros', p: ['66'] },
  { id: 15, t: '15. Variación de valor razonable en instrumentos financieros', p: ['663', '763'] },
  { id: 16, t: '16. Diferencias de cambio', p: ['668', '768'] },
  { id: 17, t: '17. Deterioro y resultado por enajenaciones de instrumentos financieros', p: ['666', '667', '673', '675', '696', '697', '698', '699', '766', '773', '775', '796', '797', '798', '799'] },
  { id: 18, t: '18. Otros ingresos y gastos de carácter financiero', p: [], hijos: ['18.a', '18.b', '18.c'] },
  { id: '18.a', t: 'a) Incorporación al activo de gastos financieros', p: [] },
  { id: '18.b', t: 'b) Ingresos financieros derivados de convenios de acreedores', p: [] },
  // La 669 (otros gastos financieros) va a la 14 y la 769 (otros ingresos financieros) a la 13.b, como en el modelo.
  { id: '18.c', t: 'c) Resto de ingresos y gastos', p: [] },
  { id: 19, t: '19. Impuestos sobre beneficios', p: ['630', '633', '638'] },
].map((l) => ({ ...l, codigo: ({ 1: '40100', 2: '40200', 3: '40300', 4: '40400', 5: '40500', 6: '40600', 7: '40700', 8: '40800', 9: '40900', 10: '41000', 11: '41100', 12: '41300', 13: '41400', '13.a': '41430', '13.b': '41490', 14: '41500', 15: '41600', 16: '41700', 17: '41800', 18: '42100', '18.a': '42110', '18.b': '42120', '18.c': '42130', 19: '41900' })[l.id] }));
export const TOTALES_PYG = [
  h('A', '49100', 'A) RESULTADO DE EXPLOTACIÓN (1 a 12)'), h('B', '49200', 'B) RESULTADO FINANCIERO (13 a 18)'),
  h('C', '49300', 'C) RESULTADO ANTES DE IMPUESTOS (A + B)'), h('D', '49500', 'D) RESULTADO DEL EJERCICIO (C + 19)'),
];
const lineaPyg = (c) => {
  let mejor = null, largo = 0;
  for (const l of LINEAS_PYG) for (const p of l.p) if (c.startsWith(p) && p.length > largo) { mejor = l.id; largo = p.length; }
  return mejor;
};
export function pygOficial(asientos, desde, hasta, { clasificacion = {} } = {}) {
  const v = Object.fromEntries(LINEAS_PYG.map((l) => [l.id, 0]));
  for (const a of asientos) if (a.fecha >= desde && a.fecha <= hasta && a.origen?.tipo !== 'regularizacion') {
    for (const l of a.lineas) if (/^[67]/.test(l.cuenta)) {
      // Las partidas sin cuenta específica del PGC necesitan una clasificación expresa.
      const propuesta = clasificacion[l.cuenta];
      const id = LINEAS_PYG.some((x) => x.id === propuesta && !x.hijos) ? propuesta : lineaPyg(l.cuenta);
      v[id] = r2(v[id] + l.haber - l.debe);
    }
  }
  for (const l of LINEAS_PYG) if (l.hijos) v[l.id] = r2(l.hijos.reduce((s, id) => s + v[id], 0));
  const s = (ids) => r2(ids.reduce((x, id) => x + v[id], 0));
  const A = s([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const B = s([13, 14, 15, 16, 17, 18]);
  return { v, A, B, C: r2(A + B), D: r2(A + B + v[19]) };
}

// Misma relación de casillas en pantalla y CSV, incluidas las que valen cero.
export function filasPygOficial() {
  return LINEAS_PYG.flatMap((l) => [
    ...(l.id === 13 ? [TOTALES_PYG[0]] : []),
    ...(l.id === 19 ? TOTALES_PYG.slice(1, 3) : []), l,
  ]).concat(TOTALES_PYG[3]);
}
export function csvPymes({ anio, bal, pyg }) {
  const campo = (v) => /[;"\r\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v);
  const numero = (v) => r2(v || 0).toFixed(2).replace('.', ',');
  const filas = [['código', 'concepto', `ejercicio ${anio}`, `ejercicio ${anio - 1}`]];
  const fila = (n, valores) => filas.push([n.codigo, n.t, ...valores.map(numero)]);
  const lado = (nodos) => { for (const n of nodos) { fila(n, bal.map((b) => b.v[n.id])); if (n.hijos) lado(n.hijos); } };
  lado(ESTRUCTURA_BALANCE.activo); fila(TOTALES_BALANCE[0], bal.map((b) => b.activo));
  lado(ESTRUCTURA_BALANCE.pasivo); fila(TOTALES_BALANCE[1], bal.map((b) => b.pasivo));
  for (const n of filasPygOficial()) fila(n, pyg.map((p) => n.p ? p.v[n.id] : p[n.id]));
  return '\uFEFF' + filas.map((f) => f.map(campo).join(';')).join('\r\n') + '\r\n';
}

// ---------- Estado de cambios en el patrimonio neto (total, simplificado a un año) ----------
// PGC pymes: se separan los ajustes en patrimonio de las subvenciones.
export function cambiosPatrimonio(asientos, anio) {
  const fin = (y) => balanceOficial(asientos, `${y}-12-31`).v;
  const ini = fin(anio - 1), f = fin(anio);
  const col = (v) => ({ capital: r2((v['PA1.I'] || 0) + (v['PA1.IV'] || 0)), reservas: r2((v['PA1.II'] || 0) + (v['PA1.III'] || 0)), anteriores: v['PA1.V'] || 0, aportaciones: r2((v['PA1.VI'] || 0) + (v['PA1.VIII'] || 0)), resultado: v['PA1.VII'] || 0, ajustes: v.PA2 || 0, subvenciones: v.PA3 || 0 });
  const a = col(ini), b = col(f);
  const resultado = pygOficial(asientos, `${anio}-01-01`, `${anio}-12-31`).D;
  // Operaciones con socios: lo que cambia en capital y aportaciones por asientos que no son el cierre.
  const socios = { capital: 0, aportaciones: 0 };
  for (const x of asientos) if (x.fecha.startsWith(`${anio}-`) && !['cierre', 'regularizacion'].includes(x.origen?.tipo)) {
    for (const l of x.lineas) {
      if (/^10[0-4]/.test(l.cuenta) || /^10[89]/.test(l.cuenta)) socios.capital = r2(socios.capital + l.haber - l.debe);
      if (/^(118|557)/.test(l.cuenta)) socios.aportaciones = r2(socios.aportaciones + l.haber - l.debe);
    }
  }
  const claves = Object.keys(a);
  const fila = (o) => ({ ...o, total: r2(claves.reduce((s, k) => s + (o[k] || 0), 0)) });
  const reconocidos = fila({ resultado });
  const conSocios = fila(socios);
  const otras = fila(Object.fromEntries(claves.map((k) => [k, r2(b[k] - a[k] - (reconocidos[k] || 0) - (conSocios[k] || 0))])));
  return { inicial: fila(a), reconocidos, socios: conSocios, otras, final: fila(b) };
}

// ---------- Tamaño: qué modelo toca ----------
// Pymes (art. 2 del RD 1515/2007): dos de tres durante dos años seguidos: activo ≤ 4 M, cifra de negocios ≤ 8 M y plantilla
// media ≤ 50. Microempresa (criterios simplificados): activo ≤ 1 M, cifra ≤ 2 M y plantilla ≤ 10.
export function plantillaMedia(nominas, anio) {
  const meses = {};
  for (const n of nominas) if (n.mes?.startsWith(`${anio}-`)) for (const e of n.empleados || [n.empleado || n.empleadoNombre]) (meses[n.mes] ||= new Set()).add(e);
  return r2(Object.values(meses).reduce((s, x) => s + x.size, 0) / 12);
}
export function modeloCuentas(años) {
  const cumple = (x, [act, cifra, plant]) => [x.activo <= act, x.cifra <= cifra, x.plantilla <= plant].filter(Boolean).length >= 2;
  const dos = (lim) => años.every((x) => cumple(x, lim));
  if (dos([1e6, 2e6, 10])) return { id: 'micro', nombre: 'Pymes (microempresa)', detalle: 'Modelo de pymes; además puedes usar los criterios simplificados de las microempresas.' };
  if (dos([4e6, 8e6, 50])) return { id: 'pymes', nombre: 'Pymes', detalle: 'Modelo del plan general contable de pymes: balance, pérdidas y ganancias, cambios en el patrimonio neto y memoria.' };
  return { id: 'abreviado', nombre: 'Abreviado o normal', detalle: 'Por tamaño ya no te toca el modelo de pymes: revisa con tu gestor si es el abreviado o el normal.' };
}

// Periodo medio de pago a proveedores (Ley 15/2010): días entre la factura y el pago, ponderados por importe. Solo los
// gastos con fecha de pago real (emparejados con el banco).
export function periodoMedioPago(gastos, anio) {
  const P = gastos.filter((g) => g.pagado && g.pagado.startsWith(`${anio}-`) && !g.nomina && g.base > 0);
  if (!P.length) return null;
  const dias = (g) => Math.max(0, Math.round((Date.parse(g.pagado) - Date.parse(g.fecha)) / 864e5));
  const total = P.reduce((s, g) => s + g.base, 0);
  return { dias: r2(P.reduce((s, g) => s + dias(g) * g.base, 0) / total), pagos: P.length };
}

// Memoria abreviada/pymes: art. 5.5 de la Resolución ICAC de 29-1-2016.
// Saldo medio de apertura y cierre de proveedores y acreedores por servicios (sin anticipos,
// inmovilizado, nóminas ni impuestos), dividido entre compras netas (60) y servicios exteriores (62).
export function periodoMedioPagoPymes(asientos, anio) {
  const inicio = `${anio}-01-01`, fin = `${anio}-12-31`;
  const acreedores = (saldos) => r2(Object.entries(saldos).reduce((s, [c, v]) => /^(40[0-6]|410|411)/.test(c) ? s + Math.max(0, -v) : s, 0));
  // Si se migró el 1 de enero, los saldos iniciales están en la apertura de ese día.
  const apertura = asientos.filter((a) => a.fecha < inicio || (a.fecha === inicio && a.origen?.tipo === 'apertura'));
  const saldoMedio = r2((acreedores(saldosHasta(apertura, inicio)) + acreedores(saldosHasta(asientos, fin))) / 2);
  let comprasServicios = 0;
  for (const a of asientos) if (a.fecha >= inicio && a.fecha <= fin && !['apertura', 'regularizacion'].includes(a.origen?.tipo)) {
    for (const l of a.lineas) if (/^(60|62)/.test(l.cuenta)) comprasServicios = r2(comprasServicios + l.debe - l.haber);
  }
  if (comprasServicios <= 0) return null;
  return { dias: r2(saldoMedio / comprasServicios * 365), saldoMedio, comprasServicios };
}

// ---------- Memoria (borrador con las cifras) ----------
const e = (n) => `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} €`;
export const SECCIONES = [
  [1, 'Actividad de la empresa'], [2, 'Bases de presentación de las cuentas anuales'], [3, 'Aplicación de resultados'], [4, 'Normas de registro y valoración'],
  [5, 'Inmovilizado material, intangible e inversiones inmobiliarias'], [6, 'Activos financieros'], [7, 'Pasivos financieros'], [8, 'Fondos propios'],
  [9, 'Situación fiscal'], [10, 'Ingresos y gastos'], [11, 'Subvenciones, donaciones y legados'], [12, 'Operaciones con partes vinculadas'], [13, 'Otra información'],
  [14, 'Información sobre el periodo medio de pago a proveedores'],
];

export function memoriaBorrador({ asientos, gastos, nominas = [], empresa, anio }) {
  const bal = balanceOficial(asientos, `${anio}-12-31`).v;
  const pyg = pygOficial(asientos, `${anio}-01-01`, `${anio}-12-31`);
  const libro = libroBienes(gastos, anio, { regimen: 'sociedad' });
  const altas = libro.filter((b) => b.fecha.startsWith(`${anio}-`));
  const brutoIni = r2(libro.filter((b) => b.fecha < `${anio}-01-01`).reduce((s, b) => s + b.valor, 0));
  const brutoAlta = r2(altas.reduce((s, b) => s + b.valor, 0));
  const amortAnio = r2(libro.reduce((s, b) => s + b.anio, 0));
  const amortFin = r2(libro.reduce((s, b) => s + b.acumulada, 0));
  const res = pyg.D;
  // La misma aplicación que hace el asiento de cierre (lib/asientos.js): reserva legal, compensar pérdidas y remanente.
  const saldo = (pref) => r2(asientos.filter((a) => a.fecha <= `${anio}-12-31`).reduce((s, a) => s + a.lineas.filter((l) => l.cuenta.startsWith(pref)).reduce((x, l) => x + l.haber - l.debe, 0), 0));
  const capital = bal['PA1.I.1'] || 0;
  const aLegal = res > 0 ? r2(Math.min(res * 0.1, Math.max(0, saldo('10') * 0.2 - saldo('112')))) : 0;
  const aCompensar = res > 0 ? r2(Math.min(res - aLegal, Math.max(0, -saldo('121')))) : 0;
  const plantilla = plantillaMedia(nominas, anio);
  const pmp = periodoMedioPagoPymes(asientos, anio);
  const personal = Math.abs(pyg.v[6]);
  const actividades = (empresa.actividades || []).map((a) => a.nombre).join(', ') || 'la indicada en sus estatutos';
  const emisor = empresa.emisor || {};

  return {
    1: `${emisor.nombre || empresa.nombre || 'La sociedad'}, con NIF ${emisor.nif || '—'} y domicilio social en ${[emisor.direccion, emisor.ciudad].filter(Boolean).join(', ') || '—'}, tiene como actividad principal: ${actividades}. La moneda funcional es el euro.`,
    2: `Las cuentas anuales del ejercicio ${anio} se han preparado a partir de los registros contables de la sociedad, de acuerdo con el Código de Comercio, la Ley de Sociedades de Capital y el Plan General de Contabilidad de Pequeñas y Medianas Empresas (Real Decreto 1515/2007), y muestran la imagen fiel del patrimonio, de la situación financiera y de los resultados. No hay razones excepcionales que obliguen a no aplicar disposiciones legales en materia contable. Se presentan, a efectos comparativos, las cifras del ejercicio ${anio - 1}. No hay cambios de criterios contables ni corrección de errores. La empresa sigue en funcionamiento sin incertidumbres significativas.`,
    3: res >= 0
      ? `Propuesta de aplicación del resultado. Base de reparto: pérdidas y ganancias, ${e(res)}. Aplicación: ${aLegal ? `a reserva legal, ${e(aLegal)}; ` : ''}${aCompensar ? `a compensar resultados negativos de ejercicios anteriores, ${e(aCompensar)}; ` : ''}a remanente, ${e(r2(res - aLegal - aCompensar))}.`
      : `Propuesta de aplicación del resultado. Base de reparto: pérdidas y ganancias, ${e(res)}. Aplicación: a resultados negativos de ejercicios anteriores, ${e(res)}.`,
    4: 'Inmovilizado: se valora por su precio de adquisición y se amortiza de forma lineal según su vida útil, con los coeficientes de la tabla del artículo 12 de la Ley del Impuesto sobre Sociedades; los bienes de hasta 300 € se amortizan íntegramente en el ejercicio de compra. Instrumentos financieros: los créditos y débitos comerciales se valoran por su valor nominal, al vencer a menos de un año. Impuesto sobre beneficios: gasto calculado sobre el resultado del ejercicio. Ingresos y gastos: se registran según el principio de devengo; los ingresos, por el importe de la contraprestación sin IVA.',
    5: `Inmovilizado material e intangible. Coste a 1 de enero: ${e(brutoIni)}. Altas del ejercicio: ${e(brutoAlta)}${altas.length ? ` (${altas.map((b) => b.concepto).join('; ')})` : ''}. Coste a 31 de diciembre: ${e(r2(brutoIni + brutoAlta))}. Amortización del ejercicio: ${e(amortAnio)}. Amortización acumulada a 31 de diciembre: ${e(amortFin)}. Valor neto contable: ${e(r2(brutoIni + brutoAlta - amortFin))}. No hay inversiones inmobiliarias ni correcciones por deterioro.`,
    6: `Créditos por operaciones comerciales (clientes): ${e(bal['B.II.1'] || 0)}. Otros deudores (incluidas Administraciones Públicas): ${e(bal['B.II.3'] || 0)}. Efectivo y otros activos líquidos: ${e(bal['B.VI'] || 0)}. No hay inversiones financieras.`,
    7: `Deudas con entidades de crédito: a largo plazo, ${e(bal['PB.II.1'] || 0)}; a corto plazo, ${e(bal['PC.II.1'] || 0)}. Proveedores: ${e(bal['PC.IV.1'] || 0)}. Otros acreedores (incluidas Administraciones Públicas y Seguridad Social): ${e(bal['PC.IV.2'] || 0)}. Otras deudas a corto plazo: ${e(bal['PC.II.3'] || 0)}. No hay deudas con garantía real ni impagos en el ejercicio.`,
    8: `El capital social es de ${e(capital)}, totalmente suscrito y desembolsado. Reservas: ${e(bal['PA1.III'] || 0)}. Resultados de ejercicios anteriores: ${e(bal['PA1.V'] || 0)}. Patrimonio neto total: ${e(bal.PA || 0)}.`,
    9: `Resultado contable antes de impuestos: ${e(pyg.C)}. No hay diferencias permanentes ni temporarias significativas, por lo que la base imponible coincide con el resultado contable. Gasto por Impuesto sobre Sociedades: ${e(Math.abs(pyg.v[19]))}. Saldos con las Administraciones Públicas al cierre: deudores, ${e(bal['B.II.3'] || 0)} (incluidos en otros deudores); acreedores, incluidos en otros acreedores. La sociedad tiene abiertos a inspección los ejercicios no prescritos.`,
    10: `Aprovisionamientos: ${e(Math.abs(pyg.v[4]))}. Gastos de personal: ${e(personal)}${personal ? ', de los que las cargas sociales se detallan en el libro diario (cuenta 642)' : ''}. Otros gastos de explotación: ${e(Math.abs(pyg.v[7]))}. Importe neto de la cifra de negocios: ${e(pyg.v[1])}, procedente de la actividad ordinaria en España.`,
    11: 'La sociedad no ha recibido subvenciones, donaciones ni legados en el ejercicio.',
    12: 'Durante el ejercicio no ha habido operaciones con partes vinculadas distintas de las propias del órgano de administración. Los administradores no han percibido remuneraciones por su cargo [revisar]. No hay anticipos ni créditos concedidos a los administradores.',
    13: `Número medio de personas empleadas en el ejercicio: ${plantilla || (personal ? '[indicar]' : '0')}. No existen acuerdos fuera de balance ni hechos posteriores al cierre que afecten a las cuentas anuales.`,
    14: pmp
      ? `El periodo medio de pago a proveedores del ejercicio ha sido de ${String(pmp.dias).replace('.', ',')} días (saldo medio de acreedores comerciales / compras netas y servicios exteriores × 365, según la Resolución ICAC de 29-1-2016).`
      : 'El periodo medio de pago a proveedores del ejercicio no se puede calcular al no haber compras netas y servicios exteriores positivos.',
  };
}

// Plazos: formular en tres meses desde el cierre, aprobar en junta en seis y depositar en el mes siguiente a la aprobación.
export const plazosCuentas = (anio) => ({ formular: `${anio + 1}-03-31`, aprobar: `${anio + 1}-06-30`, depositar: `${anio + 1}-07-30` });


// Todo lo de las cuentas anuales de un año: cifras de ese año y del anterior, modelo, memoria (la guardada o el borrador)
// y los datos que pone la empresa (administradores, registro, fechas). guardado: { administradores, registro, formulacion, junta, memoria }
export function cuentasAnuales({ asientos, gastos, nominas = [], empresa, anio, guardado = {} }) {
  const bal = [balanceOficial(asientos, `${anio}-12-31`), balanceOficial(asientos, `${anio - 1}-12-31`)];
  const pyg = [pygOficial(asientos, `${anio}-01-01`, `${anio}-12-31`), pygOficial(asientos, `${anio - 1}-01-01`, `${anio - 1}-12-31`)];
  const tamano = (i) => ({ activo: bal[i].activo, cifra: pyg[i].v[1], plantilla: plantillaMedia(nominas, anio - i) });
  const borrador = memoriaBorrador({ asientos, gastos, nominas, empresa, anio });
  const memoria = Object.fromEntries(SECCIONES.map(([n]) => [n, String(guardado.memoria?.[n] ?? '').trim() || borrador[n]]));
  const emisor = empresa.emisor || {};
  return {
    anio, bal, pyg, borrador, memoria,
    tamano: tamano(0), modelo: modeloCuentas([tamano(0), tamano(1)]),
    ecpn: cambiosPatrimonio(asientos, anio),
    plazos: plazosCuentas(anio),
    empresa: { nombre: emisor.nombre || empresa.nombre || '', nif: emisor.nif || '', domicilio: [emisor.direccion, emisor.ciudad].filter(Boolean).join(', '), ciudad: String(emisor.ciudad || '').replace(/^\d{5}\s*/, '') },
    datos: { administradores: guardado.administradores || '', registro: guardado.registro || '', formulacion: guardado.formulacion || '', junta: guardado.junta || '' },
    cuadra: bal[0].activo === bal[0].pasivo,
  };
}
