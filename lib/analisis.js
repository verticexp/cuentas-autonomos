// Análisis financiero de la pantalla Análisis: margen bruto, EBITDA, punto de equilibrio y ratios básicos.
// Todo sale de la cuenta de pérdidas y ganancias y del balance de la contabilidad (lib/asientos.js), así que cuadra con ellos.
// Sin dependencias de servidor, para poder probarlo.
import { importes, r2 } from './calculos.js';

const pc = (a, b) => (b ? r2((a / b) * 100) : null);
const dias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5) + 1;

// Las cifras de una cuenta de pérdidas y ganancias (pygContable): los costes, en positivo.
export function cifras(pyg) {
  const v = (id) => pyg.partidas.find((p) => p.id === id)?.importe ?? 0;
  const ventas = v('cifra');
  const aprovisionamientos = r2(-v('aprovisionamientos'));
  const margenBruto = r2(ventas - aprovisionamientos);
  const amortizacion = r2(-v('amortizacion'));
  const ebitda = r2(pyg.explotacion + amortizacion);
  // Lo que no depende de las ventas: personal, otros gastos, amortización, financieros… (menos los otros ingresos).
  // Con él: resultado antes de impuestos = margen bruto − costes fijos.
  const costesFijos = r2(margenBruto - pyg.antes);
  return {
    ventas, otrosIngresos: v('otrosIngresos'), aprovisionamientos, margenBruto, margenBrutoPct: pc(margenBruto, ventas),
    personal: r2(-v('personal')), gastosExplotacion: r2(-v('explotacion')), excepcionales: v('excepcionales'),
    ebitda, ebitdaPct: pc(ebitda, ventas), amortizacion, ebit: pyg.explotacion, ebitPct: pc(pyg.explotacion, ventas),
    financiero: pyg.financiero, antes: pyg.antes, impuesto: pyg.impuesto, resultado: pyg.resultado, netoPct: pc(pyg.resultado, ventas),
    costesFijos,
  };
}

// Punto de equilibrio: las ventas con las que el resultado antes de impuestos es 0.
// Costes variables = aprovisionamientos (compras, subcontratas); fijos = todo lo demás.
export function equilibrio(c, meses) {
  const mc = c.ventas > 0 ? c.margenBruto / c.ventas : 0;
  const base = { ventas: c.ventas, costesFijos: c.costesFijos, margenContribucionPct: c.ventas > 0 ? r2(mc * 100) : null, meses: r2(meses) };
  if (c.costesFijos <= 0) return { ...base, estado: 'sin-fijos', ventasEquilibrio: 0, mensual: 0, margenSeguridad: c.ventas, margenSeguridadPct: c.ventas > 0 ? 100 : null, faltan: 0 };
  if (!(mc > 0)) return { ...base, estado: 'imposible', ventasEquilibrio: null, mensual: null, margenSeguridad: null, margenSeguridadPct: null, faltan: null };
  const pe = r2(c.costesFijos / mc);
  const seguridad = r2(c.ventas - pe);
  return {
    ...base, estado: c.ventas >= pe ? 'superado' : 'por-debajo', ventasEquilibrio: pe, mensual: meses > 0 ? r2(pe / meses) : null,
    ventasMensuales: meses > 0 ? r2(c.ventas / meses) : null, margenSeguridad: seguridad, margenSeguridadPct: c.ventas > 0 ? pc(seguridad, c.ventas) : null, faltan: Math.max(0, r2(pe - c.ventas)),
  };
}

// Suma de las cuentas (por prefijo) de las masas del balance indicadas.
const saldoCuentas = (masas, ids, prefijos) => r2(masas.filter((m) => ids.includes(m.id)).flatMap((m) => m.detalle)
  .filter((d) => prefijos.some((p) => String(d.id).startsWith(p))).reduce((s, d) => s + d.importe, 0));

// Un ratio con su valoración: bien / ojo / mal (null si no se puede valorar). `mejor` dice cómo se lee: 'alto', 'bajo' o 'rango'.
const ratio = (id, nombre, valor, unidad, ayuda, referencia, estado) => ({ id, nombre, valor: valor === null ? null : r2(valor), unidad, ayuda, referencia, estado: valor === null ? null : estado(valor) });
const tramos = (bien, ojo, alto = true) => (v) => (alto ? (v >= bien ? 'bien' : v >= ojo ? 'ojo' : 'mal') : (v <= bien ? 'bien' : v <= ojo ? 'ojo' : 'mal'));

// Ratios básicos de liquidez, solvencia, rentabilidad y plazos. `facturado` y `comprado` (con IVA, del periodo) son para los plazos de cobro y pago.
export function ratios(c, bal, { dias: n = 365, facturado = 0, comprado = 0 } = {}) {
  const masas = [...bal.activo, ...bal.pasivo];
  const masa = (id) => masas.find((m) => m.id === id)?.importe ?? 0;
  const ac = masa('ac'), anc = masa('anc'), pn = masa('pn'), pnc = masa('pnc'), pcorto = masa('pc');
  const activo = r2(ac + anc), exigible = r2(pnc + pcorto);
  const existencias = saldoCuentas(masas, ['ac'], ['3']);
  const disponible = saldoCuentas(masas, ['ac'], ['57']);
  const clientes = saldoCuentas(masas, ['ac'], ['43']);
  const proveedores = saldoCuentas(masas, ['pc'], ['40', '41']);
  const div = (a, b) => (b > 0 ? a / b : null);
  const lista = [
    ratio('liquidez', 'Liquidez general', div(ac, pcorto), 'x', 'Lo que tienes en el corto plazo (banco, clientes, existencias) entre lo que debes en el corto plazo.', 'Entre 1,5 y 2,5', (v) => (v < 1 ? 'mal' : v < 1.5 || v > 3 ? 'ojo' : 'bien')),
    ratio('acida', 'Prueba ácida', div(ac - existencias, pcorto), 'x', 'Como la liquidez, pero sin contar las existencias: lo que cobrarías y tendrías sin vender nada más.', 'Cerca de 1 o más', tramos(1, 0.7)),
    ratio('tesoreria', 'Tesorería', div(disponible, pcorto), 'x', 'Solo el dinero en banco y caja entre las deudas a corto plazo.', 'Desde 0,2', tramos(0.2, 0.1)),
    ratio('solvencia', 'Solvencia', div(activo, exigible), 'x', 'Todo lo que tienes entre todo lo que debes. Por debajo de 1 deberías más de lo que tienes.', 'Más de 1,5', tramos(1.5, 1)),
    ratio('endeudamiento', 'Endeudamiento', pn > 0 ? exigible / pn : (exigible > 0 ? null : 0), 'x', 'Lo que debes por cada euro propio. Más bajo es más tranquilo.', 'Hasta 1', tramos(1, 2, false)),
    ratio('autonomia', 'Autonomía financiera', activo > 0 ? (pn / activo) * 100 : null, '%', 'Qué parte de lo que tienes es tuyo y no se debe a nadie.', 'Más del 40 %', tramos(40, 25)),
    ratio('margenNeto', 'Margen neto', c.netoPct, '%', 'De cada 100 € que vendes, cuántos quedan de resultado.', 'Positivo', (v) => (v > 0 ? 'bien' : 'mal')),
    ratio('roa', 'Rentabilidad del activo (ROA)', activo > 0 ? (c.ebit / activo) * 100 : null, '%', 'Lo que rinde la actividad (resultado de explotación) sobre todo lo que tienes puesto en ella. Del periodo, no anualizado.', 'Positivo', (v) => (v > 0 ? 'bien' : 'mal')),
    ratio('roe', 'Rentabilidad financiera (ROE)', pn > 0 ? (c.resultado / pn) * 100 : null, '%', 'El resultado sobre tu patrimonio neto. Del periodo, no anualizado.', 'Positivo', (v) => (v > 0 ? 'bien' : 'mal')),
    ratio('cobro', 'Periodo medio de cobro', facturado > 0 ? (clientes / facturado) * n : null, 'días', 'Días que tardan en pagarte, de media: lo que te deben los clientes frente a lo facturado (con IVA).', 'Hasta 30 días', tramos(30, 60, false)),
    ratio('pago', 'Periodo medio de pago', comprado > 0 ? (proveedores / comprado) * n : null, 'días', 'Días que tardas en pagar, de media: lo que debes a proveedores frente a lo comprado (con IVA). La ley fija un máximo de 60.', 'Hasta 60 días', tramos(60, 90, false)),
  ];
  return { ratios: lista, fondoManiobra: r2(ac - pcorto), activo, exigible, patrimonioNeto: pn, existencias, disponible, clientes, proveedores };
}

// Todo el análisis de un periodo. pyg/anterior: pygContable; bal: balanceContable a la fecha de cierre del periodo;
// per: { desde, hasta }; facturas y gastos, para los plazos de cobro y de pago.
export function analisis({ pyg, anterior = null, bal, per, hoy, facturas = [], gastos = [] }) {
  const c = cifras(pyg);
  const fin = per.hasta > hoy ? hoy : per.hasta;
  const n = Math.max(1, dias(per.desde, fin));
  const delPeriodo = (x) => x.fecha >= per.desde && x.fecha <= fin;
  const facturado = r2(facturas.filter((f) => delPeriodo(f) && !f.borrada).reduce((s, f) => s + Math.max(0, importes(f).total), 0));
  const comprado = r2(gastos.filter((g) => delPeriodo(g) && !g.nomina).reduce((s, g) => s + Math.max(0, importes(g).total), 0));
  const r = ratios(c, bal, { dias: n, facturado, comprado });
  return { ...c, anterior: anterior ? cifras(anterior) : null, parcial: per.hasta > hoy, dias: n, equilibrio: equilibrio(c, per.hasta <= hoy ? Math.round(n / 30.4375) : n / 30.4375), ...r };
}
