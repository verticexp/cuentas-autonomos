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

// Casillas del modelo 303 (régimen general) de un trimestre.
export function casillas303(facturas, gastos, anio, t) {
  const delT = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`) && trimestre(x.fecha) === t);
  const F = delT(facturas).flatMap(desglose);
  const G = delT(gastos).filter((g) => g.ivaPct > 0).map(importes);
  const tipo = (p) => F.filter((x) => x.pct === p);
  const sum = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));
  const c = {
    '01': sum(tipo(4), 'base'), '03': sum(tipo(4), 'iva'),
    '04': sum(tipo(10), 'base'), '06': sum(tipo(10), 'iva'),
    '07': sum(tipo(21), 'base'), '09': sum(tipo(21), 'iva'),
    '28': sum(G, 'base'), '29': sum(G, 'iva'),
    sinIva: sum(tipo(0), 'base'),
  };
  c['27'] = r2(c['03'] + c['06'] + c['09']);
  c['45'] = c['29'];
  c['46'] = r2(c['27'] - c['45']);
  return c;
}

const suma = (lista, k) => r2(lista.reduce((s, x) => s + x[k], 0));

// 303: IVA repercutido − IVA soportado del trimestre.
// 130: 20 % del rendimiento acumulado del año − retenciones acumuladas − pagos 130 realmente hechos antes.
// Si un trimestre no se presentó, no resta nada y lo pendiente se arrastra al siguiente que se presente.
// actividades: ids de las actividades de la empresa (en su orden). Si hay facturas o gastos de una que ya no está,
// se cuentan igual (como una actividad más): ningún euro se queda fuera.
export function resumenAnual(facturas, gastos, anio, pagos = {}, actividades = Object.keys(ACTIVIDADES)) {
  const delAnio = (l) => l.filter((x) => x.fecha.startsWith(`${anio}-`));
  const F = delAnio(facturas);
  const G = delAnio(gastos);
  let acIng = 0, acGas = 0, acRet = 0, pagados = 0;

  const trimestres = [1, 2, 3, 4].map((t) => {
    const f = F.filter((x) => trimestre(x.fecha) === t).map(importes);
    const g = G.filter((x) => trimestre(x.fecha) === t).map(importes);
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
    const ingresos = suma(F.filter((x) => x.actividad === a), 'base');
    const gastosA = suma(G.filter((x) => x.actividad === a), 'base');
    return { actividad: a, ingresos, gastos: gastosA, rendimiento: r2(ingresos - gastosA) };
  });

  const pendiente = r2(F.filter((f) => !f.cobrada).reduce((s, f) => s + importes(f).total, 0));
  return { trimestres, porActividad, pendiente };
}
