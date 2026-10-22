// Pagos a proveedores: cuándo vence cada gasto sin pagar y cómo va lo que hay que pagar, igual que el vencimiento de las
// facturas emitidas. Un gasto pendiente guarda su vencimiento (`vence`): el de su factura, o el plazo de la ficha del
// proveedor, o PLAZO_PAGO días (Ley 3/2004 de morosidad, art. 4: sin pacto, 30 días desde que se recibe la factura). Los
// gastos de antes, sin `vence`, se toman con ese mismo plazo desde su fecha. Sin dependencias de servidor.
import { importes, r2 } from './calculos.js';

export const PLAZO_PAGO = 30;
// «Vence pronto»: en la semana que viene.
export const DIAS_PRONTO = 7;

const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f || '')) && !Number.isNaN(Date.parse(`${f}T12:00:00Z`));
export const masDias = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 864e5).toISOString().slice(0, 10);
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

// Vencimiento de un gasto: el guardado o, en los de antes, su fecha más el plazo legal.
export const venceGasto = (g, plazo = PLAZO_PAGO) => (fechaValida(g?.vence) ? g.vence : masDias(g.fecha, Number.isInteger(plazo) && plazo >= 0 ? plazo : PLAZO_PAGO));

// Lo que se le paga al proveedor: el total de la factura menos la retención (que se ingresa a Hacienda).
export const aPagar = (g) => importes(g).total;

// 'pagado' | 'vencido' | 'pronto' (vence en los próximos DIAS_PRONTO días, hoy incluido) | 'pendiente'.
export function estadoPago(g, hoy) {
  if (!g.pendiente) return 'pagado';
  const v = venceGasto(g);
  if (hoy > v) return 'vencido';
  return diasEntre(hoy, v) <= DIAS_PRONTO ? 'pronto' : 'pendiente';
}

// Texto corto para la lista: «Vencido hace 5 días», «Vence hoy», «Vence mañana», «Vence el 15/11/2026».
export function textoVence(g, hoy, fechaCorta) {
  const v = venceGasto(g), d = diasEntre(hoy, v);
  if (d < 0) return d === -1 ? 'Venció ayer' : `Vencido hace ${-d} días`;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  return `Vence el ${fechaCorta(v)}`;
}

// Agenda de lo que hay que pagar: los gastos sin pagar por urgencia, cada grupo con su total y ordenado por vencimiento.
export const GRUPOS_PAGO = [
  { id: 'vencido', titulo: 'Vencidos' },
  { id: 'semana', titulo: 'Esta semana' },
  { id: 'mes', titulo: 'En los próximos 30 días' },
  { id: 'despues', titulo: 'Más adelante' },
];
export function agendaPagos(gastos, hoy) {
  const pendientes = (gastos || []).filter((g) => g.pendiente && !g.nomina)
    .map((g) => ({ g, vence: venceGasto(g) })).sort((a, b) => a.vence.localeCompare(b.vence) || String(a.g.proveedor || a.g.concepto).localeCompare(String(b.g.proveedor || b.g.concepto)));
  const grupo = (v) => { const d = diasEntre(hoy, v); return d < 0 ? 'vencido' : d <= DIAS_PRONTO ? 'semana' : d <= 30 ? 'mes' : 'despues'; };
  const grupos = GRUPOS_PAGO.map((x) => ({ ...x, gastos: [], total: 0 }));
  for (const p of pendientes) {
    const gr = grupos.find((x) => x.id === grupo(p.vence));
    gr.gastos.push(p.g);
    gr.total = r2(gr.total + aPagar(p.g));
  }
  const total = r2(grupos.reduce((s, x) => s + x.total, 0));
  return { total, n: pendientes.length, vencidos: grupos[0].gastos.length, totalVencido: grupos[0].total, grupos: grupos.filter((x) => x.gastos.length) };
}

// Vencimiento que llega del formulario o de la factura: una fecha real, no anterior a la de la factura ni a más de dos
// años de ella. Otra cosa (o nada) → undefined.
export function venceValido(v, fecha) {
  if (!fechaValida(v) || !fechaValida(fecha)) return undefined;
  return v >= fecha && diasEntre(fecha, v) <= 730 ? v : undefined;
}
