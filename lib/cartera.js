// Cartera de efectos pendientes de cobro, agrupada por vencimiento y cliente.
import { importes, numeroFactura, pagadoDe, pendienteDe, r2, vencimiento } from './calculos.js';
import { fechaCorta } from './formato.js';
import { nombreMesT } from './tesoreria.js';
import { xlsx } from './xlsx.js';

export const TRAMOS = [
  { id: 'vencido', nombre: 'Vencidos' },
  { id: '0-30', nombre: 'Vencen en 0-30 días' },
  { id: '31-60', nombre: 'Vencen en 31-60 días' },
  { id: '61-90', nombre: 'Vencen en 61-90 días' },
  { id: '+90', nombre: 'Vencen en más de 90 días' },
];

const diasEntre = (a, b) => (Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)))
  - Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))) / 864e5;
const claveNombre = (s) => String(s).trim().toLocaleLowerCase('es');
const tramoDe = (dias) => dias < 0 ? 'vencido' : dias <= 30 ? '0-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '+90';

export function carteraCobros(facturas, { hoy, plazo = 0 }) {
  const abonoLista = facturas.filter((f) => !f.borrada && !f.cobrada && pendienteDe(f) < 0);
  const abonos = { n: abonoLista.length, importe: r2(abonoLista.reduce((s, f) => s + pendienteDe(f), 0)) };
  const efectos = facturas.filter((f) => !f.borrada && !f.cobrada && pendienteDe(f) > 0).map((f) => {
    const vence = vencimiento(f, plazo);
    const dias = diasEntre(hoy, vence);
    return { id: f.id, numero: numeroFactura(f), fecha: f.fecha, vence, cliente: f.cliente?.nombre || 'Sin cliente', nif: f.cliente?.nif || '', concepto: f.concepto || '',
      total: importes(f).total, cobrado: pagadoDe(f), pendiente: pendienteDe(f), dias, vencido: vence < hoy, tramo: tramoDe(dias), url: `/facturas/${encodeURIComponent(f.id)}` };
  }).sort((a, b) => a.vence.localeCompare(b.vence) || a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero, undefined, { numeric: true }));
  const suma = (xs) => r2(xs.reduce((s, x) => s + x.pendiente, 0));
  const total = suma(efectos);
  const vencido = suma(efectos.filter((e) => e.vencido));
  const porTramo = TRAMOS.map((t) => { const xs = efectos.filter((e) => e.tramo === t.id); return { id: t.id, nombre: t.nombre, n: xs.length, importe: suma(xs) }; });
  const meses = new Map();
  for (const e of efectos) {
    const mes = e.vence.slice(0, 7);
    const key = e.vencido ? 'vencido' : mes;
    if (!meses.has(key)) meses.set(key, { mes: key, nombre: key === 'vencido' ? 'Ya vencidos' : nombreMesT(key), n: 0, importe: 0 });
    const fila = meses.get(key); fila.n++; fila.importe += e.pendiente;
  }
  const porMes = [...meses.values()].map((m) => ({ ...m, importe: r2(m.importe) })).sort((a, b) => a.mes === 'vencido' ? -1 : b.mes === 'vencido' ? 1 : a.mes.localeCompare(b.mes));
  const clientes = new Map();
  for (const e of efectos) {
    const k = e.nif ? `nif:${e.nif}` : `nombre:${claveNombre(e.cliente)}`;
    if (!clientes.has(k)) clientes.set(k, { cliente: e.cliente, nif: e.nif, n: 0, importe: 0, vencido: 0 });
    const c = clientes.get(k); c.n++; c.importe += e.pendiente; if (e.vencido) c.vencido += e.pendiente;
  }
  const porCliente = [...clientes.values()].map((c) => ({ ...c, importe: r2(c.importe), vencido: r2(c.vencido) })).sort((a, b) => b.importe - a.importe || a.cliente.localeCompare(b.cliente, 'es'));
  const pmv = efectos.length ? r2(efectos.reduce((s, e) => s + e.dias * e.pendiente, 0) / total) : null;
  return { hoy, efectos, total, vencido, aVencer: r2(total - vencido), porTramo, porMes, porCliente,
    concentracion: total ? r2(porCliente[0].importe / total * 100) : 0, pmv, abonos };
}

export function carteraXlsx({ empresa, d }) {
  const filas = [['Vence', 'Días', 'Factura', 'Cliente', 'NIF', 'Concepto', 'Emitida', 'Total', 'Cobrado', 'Pendiente'],
    ...d.efectos.map((e) => [fechaCorta(e.vence), { n: e.dias }, e.numero, e.cliente, e.nif, e.concepto, fechaCorta(e.fecha), e.total, e.cobrado, e.pendiente]),
    [{ b: 'Total' }, '', '', '', '', '', '', '', '', { b: d.total }]];
  return xlsx([
    { nombre: 'Cartera', filas, anchos: [13, 9, 15, 28, 16, 34, 13, 14, 14, 14] },
    { nombre: 'Por tramos', filas: [['Tramo', 'Efectos', 'Importe'], ...d.porTramo.map((x) => [x.nombre, { n: x.n }, x.importe])], anchos: [30, 12, 16] },
    { nombre: 'Por cliente', filas: [['Cliente', 'NIF', 'Efectos', 'Importe', 'Vencido'], ...d.porCliente.map((x) => [x.cliente, x.nif, { n: x.n }, x.importe, x.vencido])], anchos: [30, 16, 12, 16, 16] },
  ]);
}
