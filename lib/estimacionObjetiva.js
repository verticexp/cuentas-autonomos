// Estimación objetiva del IRPF (módulos, modelo 131) y régimen simplificado del IVA. Fisquo no conoce los signos, índices
// y módulos de cada epígrafe: la persona pone, de cada actividad y año, lo que sale de la Orden de módulos (para 2026, la
// Orden HAC/1425/2025) con sus datos-base a 1 de enero, y aquí se calculan los pagos de cada trimestre.
// Sin dependencias de servidor: se prueba en tests/estimacion-objetiva.test.mjs.
import { bienInversionIva, importes, ivaGasto, leerImporte, minoracion130, origenGasto, r2, trimestre } from './calculos.js';

// Datos de una actividad en un año (u.modulos[año][actividad]):
//   tipo: 'datos' (con signos, índices y módulos), 'sinDatos' (no se pueden determinar los datos-base) o 'agricola'
//   (agrícola, ganadera o forestal). rendimiento: el rendimiento neto anual de la Orden (solo 'datos'); asalariados: el
//   personal asalariado en unidades (decide el porcentaje). iva: régimen simplificado, { cuota: la cuota devengada anual
//   por operaciones corrientes, ingreso: el porcentaje de los ingresos a cuenta, minima: el de la cuota mínima }.
const TIPOS = ['datos', 'sinDatos', 'agricola'];
const num = (v) => { const n = leerImporte(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const pctOk = (v) => { const n = num(v); return n !== null && n <= 100 ? n : null; };
export function limpiarModulos(m = {}) {
  if (!TIPOS.includes(m?.tipo)) return { error: 'Elige el tipo de actividad' };
  const out = { tipo: m.tipo };
  if (m.tipo === 'datos') {
    const rendimiento = num(m.rendimiento);
    if (rendimiento === null || rendimiento > 1e8) return { error: 'Pon el rendimiento neto anual que sale de la Orden de módulos' };
    const asalariados = num(m.asalariados ?? 0);
    if (asalariados === null || asalariados > 1000) return { error: 'El personal asalariado no es válido' };
    Object.assign(out, { rendimiento: r2(rendimiento), asalariados: Math.round(asalariados * 100) / 100 });
  }
  if (m.iva) {
    const cuota = num(m.iva.cuota), ingreso = pctOk(m.iva.ingreso), minima = pctOk(m.iva.minima ?? 0);
    if (cuota === null || ingreso === null || minima === null) return { error: 'Para el IVA simplificado pon la cuota anual devengada y los porcentajes de la Orden' };
    out.iva = { cuota: r2(cuota), ingreso, minima };
  }
  if (m.joven === true && m.tipo === 'agricola') out.joven = true; // agricultor joven (DA 6.ª del Reglamento): 25 % menos
  return out;
}

// Porcentaje del pago fraccionado (art. 110.1.b del Reglamento del IRPF): 2 % sin personal asalariado, 3 % con hasta una
// persona, 4 % con más.
export const pctModulos = (asalariados) => { const n = Number(asalariados) || 0; return n <= 0 ? 2 : n <= 1 ? 3 : 4; };

const enT = (fecha, anio, t) => fecha.startsWith(`${anio}-`) && trimestre(fecha) === t;
const LIMITE_VIVIENDA = 660.14;

// Modelo 131 de un trimestre (instrucciones de la AEAT). datos: { modulos: { [actividad]: datos } del año, facturas, anio,
// rendAnterior (minoración, como la casilla 13 del 130), vivienda: deducción por el préstamo de la vivienda habitual
// anterior a 2013 (art. 110.3.d), negativos: lo negativo de los trimestres anteriores del año aún sin restar,
// deducidoVivienda: lo ya deducido por la vivienda en el año }.
export function modelo131({ modulos = {}, facturas = [], anio, t, rendAnterior = null, vivienda = false, negativos = 0, deducidoVivienda = 0 }) {
  const acts = Object.entries(modulos);
  const de = (tipo) => new Set(acts.filter(([, m]) => m.tipo === tipo).map(([id]) => id));
  const datos = acts.filter(([, m]) => m.tipo === 'datos').map(([, m]) => m);
  // Lo ingresado, con la compensación del REAGP que se cobre (es parte de los ingresos de la actividad agraria).
  const ingresos = (ids) => r2(facturas.filter((f) => ids.has(f.actividad) && enT(f.fecha, anio, t)).reduce((s, f) => { const i = importes(f); return s + i.base + (i.compensacion || 0); }, 0));
  const c = {};
  c['01'] = r2(datos.reduce((s, m) => s + m.rendimiento, 0));
  c['02'] = r2(datos.reduce((s, m) => s + (m.rendimiento * pctModulos(m.asalariados)) / 100, 0));
  c['03'] = ingresos(de('sinDatos')); c['04'] = r2(c['03'] * 0.02);
  c['05'] = ingresos(de('agricola'));
  const jovenes = new Set(acts.filter(([, m]) => m.tipo === 'agricola' && m.joven).map(([id]) => id));
  c['06'] = r2(c['05'] * 0.02 - (jovenes.size ? ingresos(jovenes) * 0.02 * 0.25 : 0));
  c['07'] = r2(c['02'] + c['04'] + c['06']);
  // Retenciones del trimestre en las facturas de esas actividades (las de 1 % a empresas, art. 95.6 del Reglamento).
  const todas = new Set(acts.map(([id]) => id));
  c['08'] = r2(facturas.filter((f) => todas.has(f.actividad) && enT(f.fecha, anio, t)).reduce((s, f) => s + importes(f).irpf, 0));
  c['09'] = minoracion130(rendAnterior);
  c['10'] = r2(c['07'] - c['08'] - c['09']);
  c['11'] = c['10'] > 0 ? r2(Math.min(c['10'], negativos)) : 0;
  const vivir = c['01'] || c['03'] ? 0.005 * c['01'] + 0.02 * c['03'] : 0;
  c['12'] = vivienda && c['10'] > 0 ? r2(Math.max(0, Math.min(c['10'] - c['11'], vivir + 0.02 * c['05'], LIMITE_VIVIENDA - deducidoVivienda))) : 0;
  c['13'] = r2(c['10'] - c['11'] - c['12']);
  c['15'] = c['13'];
  return c;
}

// Los cuatro trimestres encadenados: un resultado negativo se resta en los siguientes del mismo año (casilla 11) y la
// deducción por vivienda no pasa de 660,14 € en el año.
export function modelos131(datos, anio) {
  let negativos = 0, vivienda = 0;
  return [1, 2, 3, 4].map((t) => {
    const c = modelo131({ ...datos, anio, t, negativos, deducidoVivienda: vivienda });
    negativos = r2(negativos - c['11'] + Math.max(0, -c['13']));
    vivienda = r2(vivienda + c['12']);
    return c;
  });
}

// Régimen simplificado del IVA (arts. 122 y 123 de la Ley del IVA y 40 del Reglamento). En los tres primeros trimestres,
// el porcentaje de la Orden sobre la cuota devengada anual por operaciones corrientes. En el 4T, la liquidación del año:
// por actividad, la cuota devengada menos el IVA soportado deducible de sus gastos corrientes y el 1 % de la cuota
// devengada (gastos de difícil justificación), nunca menos que la cuota mínima; menos lo ingresado en el año, más el IVA
// de las operaciones que van aparte (compras a la UE y de fuera, inversión del sujeto pasivo) y menos el IVA de los
// bienes de inversión, que se deduce en el 4T.
export function simplificado({ modulos = {}, gastos = [], anio, t }) {
  const acts = Object.entries(modulos).filter(([, m]) => m.iva);
  const ingresoT = r2(acts.reduce((s, [, m]) => s + (m.iva.cuota * m.iva.ingreso) / 100, 0));
  if (t < 4) return { t, ingreso: ingresoT, resultado: ingresoT, actividades: acts.map(([id, m]) => ({ id, cuota: m.iva.cuota, ingreso: r2((m.iva.cuota * m.iva.ingreso) / 100) })) };
  const delAnio = gastos.filter((g) => g.fecha.startsWith(`${anio}-`) && !g.nomina);
  const actividades = acts.map(([id, m]) => {
    const corrientes = r2(delAnio.filter((g) => g.actividad === id && !origenGasto(g) && !bienInversionIva(g)).reduce((s, g) => s + ivaGasto(g).deducible, 0));
    const dificil = r2(m.iva.cuota * 0.01);
    const minima = r2((m.iva.cuota * m.iva.minima) / 100);
    const derivada = r2(Math.max(m.iva.cuota - corrientes - dificil, minima));
    return { id, cuota: m.iva.cuota, corrientes, dificil, minima, derivada };
  });
  const derivada = r2(actividades.reduce((s, a) => s + a.derivada, 0));
  const ingresado = r2(ingresoT * 3);
  // Lo autoliquidado (proveedores de la UE y de fuera) se devenga y se deduce como siempre (lib/ivaDeducible.js).
  const auto = delAnio.filter((g) => origenGasto(g));
  const autoDevengado = r2(auto.reduce((s, g) => s + ivaGasto(g).auto, 0));
  const autoDeducible = r2(auto.reduce((s, g) => s + ivaGasto(g).deducible, 0));
  const activosFijos = r2(delAnio.filter((g) => bienInversionIva(g) && !origenGasto(g)).reduce((s, g) => s + ivaGasto(g).deducible, 0));
  const resultado = r2(derivada - ingresado + autoDevengado - autoDeducible - activosFijos);
  return { t, actividades, derivada, ingresado, autoDevengado, autoDeducible, activosFijos, resultado };
}
