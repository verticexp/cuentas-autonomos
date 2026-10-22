// Cálculos del IGIC para los modelos 420 y 425. Tipos 2026: revisar con la Ley de Presupuestos cada año (1 % nuevo en 2026).
import { bienInversionIva, desglose, habil, importes, r2, trimestre } from './calculos.js';
import { pctDeducible } from './ivaDeducible.js';
import { operacionDe } from './operaciones.js';

export const TIPOS_IGIC = Object.freeze([0, 1, 3, 5, 7, 9.5, 15, 20]);
export const tipoIgicValido = (pct) => TIPOS_IGIC.includes(Number(pct));
const suma = (xs, fn) => r2(xs.reduce((s, x) => s + fn(x), 0));
const enTrimestre = (x, anio, t) => x.fecha?.startsWith(`${anio}-`) && trimestre(x.fecha) === t;
const redondea = (x) => r2(Number(x) || 0);

// Casillas trimestrales 420. Las operaciones no soportadas por los datos disponibles quedan a cero.
export function casillas420(facturas = [], gastos = [], anio, t) {
  const F = facturas.filter((f) => enTrimestre(f, anio, t));
  const G = gastos.filter((g) => enTrimestre(g, anio, t));
  const mods = (f) => Boolean(f.rectifica) || Number(importes(f).base) < 0;
  // La operación describe solo las líneas al 0 %; las gravadas conservan su tipo.
  const adicionales = F.filter((f) => !mods(f) && f.operacion);
  const normales = F.filter((f) => !mods(f)).flatMap((f) => desglose(f).filter((d) => !f.operacion || Number(d.pct) !== 0));
  const tipos = [...new Set(normales.filter((d) => Number(d.pct) >= 0).map((d) => Number(d.pct)))].sort((a, b) => b - a);
  const usados = tipos.slice(0, 6);
  const c = {};
  for (let i = 0; i < 6; i++) {
    const n = String(i * 3 + 1).padStart(2, '0');
    const xs = normales.filter((d) => d.pct === usados[i]);
    c[n] = suma(xs, (x) => x.base);
    c[String(Number(n) + 1).padStart(2, '0')] = usados[i] ?? 0;
    c[String(Number(n) + 2).padStart(2, '0')] = suma(xs, (x) => x.iva);
  }
  const modsF = F.filter(mods).flatMap((f) => desglose(f));
  c['19'] = suma(G.filter((g) => g.isp), (g) => g.base);
  c['20'] = suma(G.filter((g) => g.isp), (g) => r2(Number(g.base) * Number(g.ivaPct) / 100));
  c['21'] = suma(modsF, (x) => x.base);
  c['22'] = suma(modsF, (x) => x.iva);
  c['23'] = 0; c['24'] = 0;
  const cuotasDevengadas = suma(usados.flatMap((p) => normales.filter((d) => d.pct === p)), (x) => x.iva);
  c['25'] = r2(cuotasDevengadas + c['20'] + c['22'] + suma(tipos.slice(6).flatMap((p) => normales.filter((d) => d.pct === p)), (x) => x.iva));

  const gastosPos = G.filter((g) => Number(g.base) >= 0);
  const gastosRect = G.filter((g) => Number(g.base) < 0);
  const deducible = (g) => {
    const cuota = g.isp ? r2(Number(g.base) * Number(g.ivaPct) / 100) : importes(g).iva;
    return { base: redondea(g.base), cuota: r2(cuota * pctDeducible(g) / 100) };
  };
  const grupos = [
    gastosPos.filter((g) => !g.compensacion && !g.importacion && !bienInversionIva(g)),
    gastosPos.filter((g) => !g.compensacion && !g.importacion && bienInversionIva(g)),
    gastosPos.filter((g) => !g.compensacion && g.importacion && !bienInversionIva(g)),
    gastosPos.filter((g) => !g.compensacion && g.importacion && bienInversionIva(g)),
  ];
  for (let i = 0; i < 4; i++) {
    const baseCas = String(26 + i * 2), cuotaCas = String(27 + i * 2);
    c[baseCas] = suma(grupos[i], (g) => deducible(g).base);
    c[cuotaCas] = suma(grupos[i], (g) => deducible(g).cuota);
  }
  c['34'] = suma(gastosRect, (g) => deducible(g).base);
  c['35'] = suma(gastosRect, (g) => deducible(g).cuota);
  c['36'] = suma(G.filter((g) => [12, 10.5].includes(Number(g.compensacion))), (g) => r2(Number(g.base) * Number(g.compensacion) / 100 * pctDeducible(g) / 100));
  for (const k of ['37', '38', '39', '42', '44']) c[k] = 0;
  c['40'] = suma(['27', '29', '31', '33', '35', '36'], (k) => c[k]);
  c['41'] = r2(c['25'] - c['40']); c['43'] = 0; c['45'] = c['41'];
  // 46: exportaciones (exentas con derecho a deducción); las exentas sin derecho a deducción no van en el 420.
  c['46'] = suma(adicionales.filter((f) => operacionDe(f) === 'exportacion'), (f) => suma(desglose(f).filter((d) => Number(d.pct) === 0), (d) => d.base));
  c['47'] = suma(adicionales.filter((f) => ['servicios-fuera', 'isp'].includes(operacionDe(f))), (f) => suma(desglose(f).filter((d) => Number(d.pct) === 0), (d) => d.base));
  c.otros = tipos.slice(6).map((pct) => ({ pct, base: suma(normales.filter((d) => d.pct === pct), (d) => d.base), cuota: suma(normales.filter((d) => d.pct === pct), (d) => d.iva) }));
  c.demasiadosTipos = tipos.length > 6;
  return c;
}

// Compensa primero el saldo antiguo; el remanente a favor se arrastra y puede devolverse en el 4T.
export function liquidaciones420(facturas = [], gastos = [], anio, { devolucion4T = false, pres303 = {} } = {}) {
  const primero = [...facturas, ...gastos].reduce((min, x) => Math.min(min, Number(x.fecha?.slice(0, 4)) || anio), anio);
  let pendiente = 0;
  const out = [];
  for (let y = primero; y <= anio; y++) for (const t of [1, 2, 3, 4]) {
    const c = casillas420(facturas, gastos, y, t);
    const bruto = c['41'], anterior = pendiente;
    const compensado = bruto > 0 ? Math.min(bruto, pendiente) : 0;
    const ingresar = Math.max(0, r2(bruto - compensado));
    pendiente = r2(pendiente - compensado + Math.max(0, -bruto));
    const pideDevolucion = pres303?.[y]?.[4] === 'devolucion' || (y === anio && devolucion4T);
    const devolucion = t === 4 && pideDevolucion ? pendiente : 0;
    if (devolucion) pendiente = 0;
    if (y === anio) out.push({ ...c, t, bruto, anterior, compensado, ingresar, pendiente, devolucion, '43': anterior, '45': r2(bruto - anterior) });
  }
  return out;
}

// El 4T vence el último día de enero; los otros, el día 20 del mes siguiente.
export function plazo420(anio, t) {
  return habil(t === 4 ? `${anio + 1}-01-31` : `${anio}-${['04', '07', '10'][t - 1]}-20`);
}

// Resumen anual 425 de las operaciones registradas y resultados líquidos de cada trimestre.
export function modelo425(facturas, gastos, anio, iva = {}) {
  const q = [1, 2, 3, 4].map((t) => casillas420(facturas, gastos, anio, t));
  const porTipo = new Map();
  for (const f of facturas.filter((x) => x.fecha?.startsWith(`${anio}-`))) for (const d of desglose(f)) {
    const p = porTipo.get(Number(d.pct)) || { pct: Number(d.pct), base: 0, cuota: 0 };
    p.base = r2(p.base + d.base); p.cuota = r2(p.cuota + d.iva); porTipo.set(p.pct, p);
  }
  const total = (k) => suma(q, (x) => x[k]);
  return {
    devengadoPorTipo: [...porTipo.values()].sort((a, b) => b.pct - a.pct),
    totalDevengado: total('25'),
    deducciones: { corrientes: total('27'), bienesInversion: total('29'), importacionesCorrientes: total('31'), importacionesInversion: total('33'), rectificaciones: total('35'), compensaciones: total('36'), total: total('40') },
    resultadosTrimestrales: liquidaciones420(facturas, gastos, anio, iva).map((x) => x['45']),
  };
}
