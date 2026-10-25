// IVA deducible en parte (art. 95 y 96 de la Ley del IVA): de un gasto solo se deduce el IVA de la parte afecta a la
// actividad. El caso típico es un turismo, que se presume afecto al 50 % (art. 95.Tres.2.ª); también lo usado a medias
// en casa. `deduciblePct` (0–100, sin él: 100) dice qué parte del IVA soportado va al 303.
// El IVA que no se deduce es más coste del gasto o del bien (norma 12.ª del Plan General Contable), así que cuenta como
// gasto en el IRPF y en Sociedades y, si es un bien de inversión, se amortiza con él.
// Sin dependencias (más que el redondeo), para que lo use también lib/amortizaciones.js.
import { r2 } from './redondeo.js';

// NIF-IVA de otro país de la UE (con el prefijo del país): esas facturas sin IVA van en la casilla 59 del 303 y en el 349.
const UE = /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[0-9A-Z]{2,13}$/;
export const nifUE = (nif) => { const n = String(nif || '').toUpperCase().replace(/[\s.-]/g, ''); return UE.test(n) ? n : ''; };

// Gasto de un proveedor de otro país de la UE ('ue'), de fuera ('fuera') o de España con inversión del sujeto pasivo
// ('isp': obras de construcción, chatarra, oro, móviles… del art. 84.Uno.2.º LIVA, cuya factura lo dice), sin IVA en la
// factura: el IVA lo declara quien compra (al tipo español de lo comprado) y se lo deduce a la vez. Sin marcar, un
// NIF-IVA de la UE cuenta como 'ue'; 'es' (elegido a mano) es un proveedor de España aunque su NIF lo parezca.
// El alquiler de un local en España a un casero de la UE no es un servicio intracomunitario: se localiza donde está el
// inmueble (art. 70.Uno.1.º LIVA) y, sin estar establecido el casero, lo declara quien alquila (art. 84.Uno.2.º): como
// los de fuera, en las 12-13 y 28-29 del 303 y no en el 349.
export const origenGasto = (g) => {
  if (g.impuesto === 'igic') return '';
  if (Number(g.ivaPct) || g.porTipo?.length) return '';
  const o = g.origen ? (g.origen === 'es' ? '' : g.origen) : nifUE(g.proveedorNif) ? 'ue' : '';
  return o === 'ue' && (g.alquiler || g.alquilerSinRetencion) ? 'fuera' : o;
};

// Tipo español del IVA autoliquidado: sin elegirlo, el 21 % como en los gastos de antes.
export const tipoAutoliquidado = (g) => ([4, 10, 21].includes(Number(g?.ivaAuto)) ? Number(g.ivaAuto) : 21);

// Cuota de IVA de la factura: con varios tipos (porTipo), la suma de la de cada uno, redondeada por tipo como en
// lib/calculos.js desglose (aquí sin importarlo: lib/amortizaciones.js usa este módulo y calculos usa amortizaciones).
export const cuotaFactura = (g) => (g.porTipo?.length
  ? r2(g.porTipo.reduce((s, t) => s + r2(((Number(t.base) || 0) * (Number(t.ivaPct) || 0)) / 100), 0))
  : r2((g.base * (Number(g.ivaPct) || 0)) / 100));
// Lleva IVA soportado (algún tipo mayor que 0): lo que va a las casillas de cuotas soportadas del 303.
export const conIva = (g) => Number(g.ivaPct) > 0 || Boolean(g.porTipo?.some((t) => Number(t.ivaPct) > 0));
// La base que soporta IVA: con varios tipos, sin la parte al 0 % (exenta: no va en la base de las cuotas soportadas).
export const baseConIva = (g) => (g.porTipo?.length ? r2(g.porTipo.filter((t) => Number(t.ivaPct) > 0).reduce((s, t) => s + (Number(t.base) || 0), 0)) : g.base);

// % del IVA que se deduce: un número de 0 a 100; cualquier otra cosa (o nada), 100.
export function pctDeducible(g) {
  const p = Number(g?.deduciblePct);
  return g?.deduciblePct !== undefined && g?.deduciblePct !== null && g?.deduciblePct !== '' && Number.isFinite(p) && p >= 0 && p <= 100 ? r2(p) : 100;
}

// Lo que se guarda en el gasto: el % si es menor de 100; si no, nada (se queda como todos los gastos de antes).
export function deduciblePctDe(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const p = Number(String(v).replace(',', '.').replace('%', '').trim());
  return Number.isFinite(p) && p >= 0 && p < 100 ? r2(p) : undefined;
}

// Una cuota de IVA soportado → { deducible, noDeducible } según el % del gasto. La parte deducible se redondea al céntimo
// y la no deducible es el resto, para que las dos sumen siempre la cuota.
export function partirIva(g, iva) {
  const p = pctDeducible(g);
  if (p === 100) return { deducible: iva, noDeducible: 0 };
  const deducible = r2((iva * p) / 100);
  return { deducible, noDeducible: r2(iva - deducible) };
}

// La base que acompaña a la cuota deducible en las casillas del 303 y del 390 (28, 30, 36…): la misma proporción.
export const baseDeducible = (g, base) => (pctDeducible(g) === 100 ? base : r2((base * pctDeducible(g)) / 100));

// Afectación a la actividad en el IRPF (130 y renta), aparte de la del IVA (informe de la asesoría, 20-10-2026): no
// siempre coinciden. Un turismo sin uso exclusivo deduce el 50 % del IVA (art. 95.Tres LIVA), pero en el IRPF, para la
// AEAT, nada (art. 29 LIRPF y art. 22 RIRPF); los suministros de la vivienda con despacho, el 30 % de la parte afecta
// (art. 30.2.5.ª b LIRPF). `afectoPct` (0–100; sin él, 100 como hasta ahora) dice qué parte cuenta como gasto en el IRPF.
export function pctAfecto(g) {
  const p = Number(g?.afectoPct);
  return g?.afectoPct !== undefined && g?.afectoPct !== null && g?.afectoPct !== '' && Number.isFinite(p) && p >= 0 && p <= 100 ? r2(p) : 100;
}
export const afectoPctDe = deduciblePctDe;

// Lo que cuenta como gasto en el IRPF: la parte afecta de la base más el IVA de esa parte que no se ha deducido en el
// 303. Con un 100 % afecto, la base más todo el IVA no deducible (lo de siempre). Si se deduce más IVA del que se
// afecta al IRPF (turismo: 50 % del IVA y 0 % en el IRPF), ese IVA no suma nada.
export function costeAfecto(g, { ivaCoste = false } = {}) {
  const a = pctAfecto(g);
  const deFactura = cuotaFactura(g);
  if (ivaCoste) { const iva = ivaNoDeducible(g, { ivaCoste }); return a === 100 ? r2(g.base + iva) : r2(((g.base + iva) * a) / 100); }
  if (a === 100) return r2(g.base + ivaNoDeducible(g));
  const soportado = r2(deFactura + (origenGasto(g) ? r2(g.base * (tipoAutoliquidado(g) / 100)) : 0));
  return r2((g.base * a) / 100 + (soportado * Math.max(0, a - pctDeducible(g))) / 100);
}

// IVA de un bien o gasto que no se recupera y es más coste suyo: el de su factura (o el autoliquidado, si el proveedor es
// de fuera) en la parte no deducible. Para quien no presenta el 303 (ivaCoste), todo el de la factura.
export function ivaNoDeducible(g, { ivaCoste = false } = {}) {
  const deFactura = cuotaFactura(g);
  // Quien no presenta el 303 (exento, recargo de equivalencia, agricultura) paga lo autoliquidado con el 309 y no se lo
  // deduce: también es coste.
  if (ivaCoste) return r2(deFactura + (origenGasto(g) ? r2(g.base * (tipoAutoliquidado(g) / 100)) : 0));
  return partirIva(g, r2(deFactura + (origenGasto(g) ? r2(g.base * (tipoAutoliquidado(g) / 100)) : 0))).noDeducible;
}
