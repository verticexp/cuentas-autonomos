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

// Gasto de un proveedor de otro país de la UE ('ue') o de fuera ('fuera'), sin IVA en la factura: el IVA lo declara
// quien compra (inversión del sujeto pasivo, al 21 %) y se lo deduce a la vez. Sin marcar, un NIF-IVA de la UE cuenta como
// 'ue'; 'es' (elegido a mano) es un proveedor de España aunque su NIF lo parezca.
export const origenGasto = (g) => {
  if (Number(g.ivaPct)) return '';
  if (g.origen) return g.origen === 'es' ? '' : g.origen;
  return nifUE(g.proveedorNif) ? 'ue' : '';
};

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

// IVA de un bien o gasto que no se recupera y es más coste suyo: el de su factura (o el autoliquidado, si el proveedor es
// de fuera) en la parte no deducible. Para quien no presenta el 303 (ivaCoste), todo el de la factura.
export function ivaNoDeducible(g, { ivaCoste = false } = {}) {
  const deFactura = r2((g.base * (Number(g.ivaPct) || 0)) / 100);
  if (ivaCoste) return deFactura;
  return partirIva(g, r2(deFactura + (origenGasto(g) ? r2(g.base * 0.21) : 0))).noDeducible;
}
