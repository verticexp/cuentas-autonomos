// Cálculos fiscales. Sin dependencias, para poder probarlos.
import { parseImporte } from './importe.js';

export const r2 = (n) => Math.round(n * 100) / 100;
export const trimestre = (fecha) => Math.ceil(Number(fecha.slice(5, 7)) / 3);
// Series: sin letra → 07-2026 · Rectificativas 'R' → R01-2026 · cualquier otra letra (V, A…) → V2026-001
// Las importadas (Holded…) conservan su número original.
export const numeroFactura = (f) => f.importada || (f.serie && f.serie !== 'R'
  ? `${f.serie}${f.anio}-${String(f.numero).padStart(3, '0')}`
  : `${f.serie || ''}${String(f.numero).padStart(2, '0')}-${f.anio}`);
export const serieDe = (actividad) => (actividad === 'vertice' ? 'V' : '');
export const ACTIVIDADES = { dj: 'DJ', vertice: 'Vértice' };

// Como parseImporte pero respetando el signo (facturas rectificativas).
export const leerImporte = (v) => (/^\s*-/.test(String(v)) ? -1 : 1) * parseImporte(v);

// Facturas de varias líneas: cada línea con cantidad, precio, descuento (%) e IVA propio.
// Las facturas antiguas no tienen líneas: una sola base con un solo tipo de IVA.
export const baseLinea = (l) => r2((Number(l.cantidad) || 0) * (Number(l.precio) || 0) * (1 - (Number(l.dto) || 0) / 100));

// Columnas que hacen falta al imprimir una factura con líneas (las antiguas se imprimen como antes).
export const columnasLineas = (x) => ({ dto: x.lineas.some((l) => l.dto), iva: desglose(x).length > 1 });

// Base e IVA por tipo de IVA, de mayor a menor base.
export function desglose(x) {
  if (!x.lineas?.length) return [{ pct: x.ivaPct, base: x.base, iva: r2((x.base * x.ivaPct) / 100) }];
  const m = new Map();
  for (const l of x.lineas) m.set(l.ivaPct, r2((m.get(l.ivaPct) || 0) + baseLinea(l)));
  return [...m].map(([pct, base]) => ({ pct, base, iva: r2((base * pct) / 100) })).sort((a, b) => Math.abs(b.base) - Math.abs(a.base));
}

export function importes(x) {
  const iva = r2(desglose(x).reduce((s, d) => s + d.iva, 0));
  const irpf = r2((x.base * (x.irpfPct || 0)) / 100);
  return { base: x.base, iva, irpf, total: r2(x.base + iva - irpf) };
}

// Cada serie ('', 'V', 'R') tiene su numeración correlativa.
export const siguienteNumero = (facturas, anio, serie = '') =>
  Math.max(0, ...facturas.filter((f) => f.anio === anio && (f.serie || '') === serie).map((f) => f.numero)) + 1;

const masDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

export const vencimiento = (f, plazo) => masDias(f.fecha, Number(plazo) || 0);
export const vencida = (f, plazo, hoy) => !f.cobrada && importes(f).total > 0 && hoy > vencimiento(f, plazo);

// Plazos de 303 y 130: 1T→20 abr, 2T→20 jul, 3T→20 oct, 4T→30 ene del año siguiente.
export function proximoPlazo(hoy) {
  const y = Number(hoy.slice(0, 4));
  const plazos = [
    { t: 4, anio: y - 1, fecha: `${y}-01-30` },
    { t: 1, anio: y, fecha: `${y}-04-20` },
    { t: 2, anio: y, fecha: `${y}-07-20` },
    { t: 3, anio: y, fecha: `${y}-10-20` },
    { t: 4, anio: y, fecha: `${y + 1}-01-30` },
  ];
  const p = plazos.find((x) => x.fecha >= hoy);
  return { ...p, dias: diasEntre(hoy, p.fecha) };
}

// Lo que conviene apartar de una factura para Hacienda: su IVA más lo que faltará de IRPF en el 130
// (20 % del rendimiento, con el 5 % de difícil justificación, menos la retención que ya te hacen).
export function apartar(f) {
  const i = importes(f);
  const irpf = Math.max(0, r2(0.19 * f.base - i.irpf));
  return { iva: i.iva, irpf, total: r2(i.iva + irpf) };
}

// NIF-IVA de otro país de la UE (con el prefijo del país): esas facturas sin IVA van en la casilla 59 del 303 y en el 349.
const UE = /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[0-9A-Z]{2,13}$/;
export const nifUE = (nif) => { const n = String(nif || '').toUpperCase().replace(/[\s.-]/g, ''); return UE.test(n) ? n : ''; };

// Gasto de un proveedor de otro país de la UE ('ue') o de fuera ('fuera'), sin IVA en la factura: el IVA lo declara
// quien compra (inversión del sujeto pasivo, al 21 %) y se lo deduce a la vez. Sin marcar, un NIF-IVA de la UE cuenta como
// 'ue'; 'es' (elegido a mano) es un proveedor de España aunque su NIF lo parezca.
export const origenGasto = (g) => {
  if (Number(g.ivaPct)) return '';
  if (g.origen) return g.origen === 'es' ? '' : g.origen;
  return nifUE(g.proveedorNif) ? 'ue' : '';
};
const autoliquidado = (l) => l.map((g) => ({ base: g.base, iva: r2(g.base * 0.21) }));

// Casillas del modelo 303 (régimen general) de un trimestre.
export function casillas303(facturas, gastos, anio, t) {
  const delT = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && trimestre(x.fecha) === t);
  const F = delT(facturas).flatMap(desglose);
  const UEg = autoliquidado(delT(gastos).filter((g) => origenGasto(g) === 'ue'));
  const FUERA = autoliquidado(delT(gastos).filter((g) => origenGasto(g) === 'fuera'));
  // Lo de fuera de la UE se deduce con el resto del IVA soportado (28 y 29); lo de la UE, en las 36 y 37.
  const G = [...delT(gastos).filter((g) => g.ivaPct > 0).map(importes), ...FUERA];
  const tipo = (p) => F.filter((x) => x.pct === p);
  const sum = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));
  const c = {
    '01': sum(tipo(4), 'base'), '03': sum(tipo(4), 'iva'),
    '04': sum(tipo(10), 'base'), '06': sum(tipo(10), 'iva'),
    '07': sum(tipo(21), 'base'), '09': sum(tipo(21), 'iva'),
    '10': sum(UEg, 'base'), '11': sum(UEg, 'iva'), '12': sum(FUERA, 'base'), '13': sum(FUERA, 'iva'),
    '28': sum(G, 'base'), '29': sum(G, 'iva'), '36': sum(UEg, 'base'), '37': sum(UEg, 'iva'),
    sinIva: sum(tipo(0), 'base'),
    // 59: entregas y servicios a empresas de otros países de la UE (parte de lo facturado sin IVA).
    '59': sum(delT(facturas).filter((f) => nifUE(f.cliente?.nif)).flatMap(desglose).filter((x) => x.pct === 0), 'base'),
  };
  c['27'] = r2(c['03'] + c['06'] + c['09'] + c['11'] + c['13']);
  c['45'] = r2(c['29'] + c['37']);
  c['46'] = r2(c['27'] - c['45']);
  return c;
}

const suma = (lista, k) => r2(lista.reduce((s, x) => s + x[k], 0));

// 303: IVA repercutido − IVA soportado del trimestre.
// 130: 20 % del rendimiento acumulado del año − retenciones acumuladas − pagos 130 realmente hechos antes.
// Si un trimestre no se presentó, no resta nada y lo pendiente se arrastra al siguiente que se presente.
// actividades: ids de las actividades de la empresa (en su orden). Si hay facturas o gastos de una que ya no está,
// se cuentan igual (como una actividad más): ningún euro se queda fuera.
// ivaCoste: quien no presenta el 303 (actividad exenta o recargo de equivalencia) no recupera el IVA, así que para el
// IRPF el de sus gastos es gasto y, en recargo de equivalencia, el que cobra es ingreso.
export function resumenAnual(facturas, gastos, anio, pagos = {}, actividades = Object.keys(ACTIVIDADES), { ivaCoste = false } = {}) {
  const delAnio = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`));
  const irpf = (x) => (ivaCoste ? { ...x, base: r2(x.base + x.iva) } : x);
  const F = delAnio(facturas);
  const G = delAnio(gastos);
  let acIng = 0, acGas = 0, acRet = 0, pagados = 0;

  const trimestres = [1, 2, 3, 4].map((t) => {
    const f = F.filter((x) => trimestre(x.fecha) === t).map(importes).map(irpf);
    const g = G.filter((x) => trimestre(x.fecha) === t).map(importes).map(irpf);
    const q = { t, ingresos: suma(f, 'base'), ivaRep: suma(f, 'iva'), retenciones: suma(f, 'irpf'), gastos: suma(g, 'base'), ivaDed: suma(g, 'iva') };
    acIng += q.ingresos; acGas += q.gastos; acRet += q.retenciones;
    q.m303 = r2(q.ivaRep - q.ivaDed);
    // Estimación directa simplificada: 5 % de gastos de difícil justificación (máx. 2.000 €/año).
    const previo = acIng - acGas;
    q.difJust = r2(Math.min(0.05 * Math.max(0, previo), 2000));
    q.rendAcum = r2(previo - q.difJust);
    q.ingAcum = r2(acIng);
    q.gasAcum = r2(acGas + q.difJust);
    q.retAcum = r2(acRet);
    q.pagosPrev = r2(pagados);
    q.m130 = Math.max(0, r2(0.2 * q.rendAcum - q.retAcum - q.pagosPrev));
    q.presentado = pagos[t] !== undefined && pagos[t] !== null;
    pagados += Number(pagos[t]) || 0;
    return q;
  });

  const ids = [...new Set([...actividades, ...F.map((x) => x.actividad), ...G.map((x) => x.actividad)])];
  const porActividad = ids.map((a) => {
    const ingresos = suma(F.filter((x) => x.actividad === a).map((x) => irpf(importes(x))), 'base');
    const gastosA = suma(G.filter((x) => x.actividad === a).map((x) => irpf(importes(x))), 'base');
    return { actividad: a, ingresos, gastos: gastosA, rendimiento: r2(ingresos - gastosA) };
  });

  const pendiente = r2(F.filter((f) => !f.cobrada).reduce((s, f) => s + importes(f).total, 0));
  return { trimestres, porActividad, pendiente };
}
