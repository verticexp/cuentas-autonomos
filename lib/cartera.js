// Cartera de efectos pendientes de cobro, agrupada por vencimiento y cliente.
import { importes, numeroFactura, pagadoDe, pendienteDe, r2, vencimiento } from './calculos.js';
import { fechaCorta } from './formato.js';
import { nombreMesT } from './tesoreria.js';
import { FORMAS, idCliente, nombreForma } from './terceros.js';
import { xlsx } from './xlsx.js';

export const TRAMOS = [
  { id: 'vencido', nombre: 'Vencidos' },
  { id: '0-30', nombre: 'Vencen en 0-30 días' },
  { id: '31-60', nombre: 'Vencen en 31-60 días' },
  { id: '61-90', nombre: 'Vencen en 61-90 días' },
  { id: '+90', nombre: 'Vencen en más de 90 días' },
];

// Formas de cobro que son un papel que hay que tener en la mano: se marca cuándo se recibe. El resto (recibo bancario,
// transferencia, domiciliación, tarjeta, efectivo, Bizum) no lo necesita: cuentan como recibidas.
export const REQUIEREN_RECEPCION = ['cheque', 'confirming', 'pagare'];
export const requiereRecepcion = (forma) => REQUIEREN_RECEPCION.includes(forma);

const diasEntre = (a, b) => (Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)))
  - Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))) / 864e5;
const claveNombre = (s) => String(s).trim().toLocaleLowerCase('es');
const tramoDe = (dias) => dias < 0 ? 'vencido' : dias <= 30 ? '0-30' : dias <= 60 ? '31-60' : dias <= 90 ? '61-90' : '+90';

// La forma de cobro de una factura: la suya o, si no la tiene, la de la ficha del cliente.
export const formaDe = (f, fichas = new Map()) => f.formaCobro || fichas.get(idCliente(f.cliente?.nombre))?.formaCobro || '';

// clientes: las fichas (hash «clientes»), para la forma de cobro por defecto.
export function carteraCobros(facturas, { hoy, plazo = 0, clientes: listaClientes = [] }) {
  const fichas = new Map(listaClientes.map((c) => [idCliente(c.nombre || c.id), c]));
  const abonoLista = facturas.filter((f) => !f.borrada && !f.cobrada && pendienteDe(f) < 0);
  const abonos = { n: abonoLista.length, importe: r2(abonoLista.reduce((s, f) => s + pendienteDe(f), 0)) };
  const efectos = facturas.filter((f) => !f.borrada && !f.cobrada && pendienteDe(f) > 0).map((f) => {
    const vence = vencimiento(f, plazo);
    const dias = diasEntre(hoy, vence);
    const forma = formaDe(f, fichas);
    const requiere = requiereRecepcion(forma);
    return { id: f.id, numero: numeroFactura(f), fecha: f.fecha, vence, cliente: f.cliente?.nombre || 'Sin cliente', nif: f.cliente?.nif || '', concepto: f.concepto || '',
      total: importes(f).total, cobrado: pagadoDe(f), pendiente: pendienteDe(f), dias, vencido: vence < hoy, tramo: tramoDe(dias),
      forma, formaNombre: nombreForma(forma) || 'Sin indicar', formaDeFicha: !f.formaCobro && Boolean(forma), requiereRecepcion: requiere,
      recibido: requiere ? Boolean(f.efecto?.recibido) : true, fechaRecepcion: requiere && f.efecto?.recibido ? f.efecto.fecha || '' : '', url: `/facturas/${encodeURIComponent(f.id)}` };
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
  const sinRecibir = efectos.filter((e) => e.requiereRecepcion && !e.recibido);
  const porRecibir = { n: sinRecibir.length, importe: suma(sinRecibir) };
  const formas = new Map();
  for (const e of efectos) {
    if (!formas.has(e.forma)) formas.set(e.forma, { id: e.forma, nombre: e.formaNombre, n: 0, importe: 0 });
    const x = formas.get(e.forma); x.n++; x.importe += e.pendiente;
  }
  const porForma = [...formas.values()].map((x) => ({ ...x, importe: r2(x.importe) })).sort((a, b) => b.importe - a.importe || a.nombre.localeCompare(b.nombre, 'es'));
  const pmv = efectos.length ? r2(efectos.reduce((s, e) => s + e.dias * e.pendiente, 0) / total) : null;
  return { hoy, efectos, total, vencido, aVencer: r2(total - vencido), porTramo, porMes, porCliente,
    concentracion: total ? r2(porCliente[0].importe / total * 100) : 0, pmv, abonos, porRecibir, porForma };
}

// Cambia la forma de cobro y/o marca el efecto como recibido. cambio: { forma?, recibido? }; formaFicha: la del cliente.
// Devuelve { nueva } o { error }. Solo el cheque, el confirming y el pagaré se marcan como recibidos; al cambiar de
// forma, la recepción anterior deja de valer.
export function cambiarEfecto(f, { forma, recibido } = {}, { hoy, formaFicha = '' } = {}) {
  if (f.cobrada) return { error: 'La factura ya está cobrada' };
  const nueva = { ...f };
  if (forma !== undefined) {
    if (forma !== '' && !FORMAS.some((x) => x.id === forma)) return { error: 'La forma de cobro no es válida' };
    if (forma) nueva.formaCobro = forma; else delete nueva.formaCobro;
    if ((f.formaCobro || '') !== forma) delete nueva.efecto;
  }
  if (recibido !== undefined) {
    const efectiva = nueva.formaCobro || formaFicha;
    if (!requiereRecepcion(efectiva)) return { error: efectiva ? `${nombreForma(efectiva)} no necesita marcarse como recibido` : 'Indica antes la forma de cobro' };
    if (recibido) nueva.efecto = { recibido: true, fecha: hoy, forma: efectiva }; else delete nueva.efecto;
  } else if (!requiereRecepcion(nueva.formaCobro || formaFicha)) delete nueva.efecto;
  return { nueva };
}

export function carteraXlsx({ empresa, d }) {
  const recepcion = (e) => (!e.requiereRecepcion ? 'No necesaria' : e.recibido ? `Recibido${e.fechaRecepcion ? ` el ${fechaCorta(e.fechaRecepcion)}` : ''}` : 'Pendiente de recibir');
  const filas = [['Vence', 'Días', 'Factura', 'Cliente', 'NIF', 'Concepto', 'Forma de cobro', 'Recepción', 'Emitida', 'Total', 'Cobrado', 'Pendiente'],
    ...d.efectos.map((e) => [fechaCorta(e.vence), { n: e.dias }, e.numero, e.cliente, e.nif, e.concepto, e.formaNombre, recepcion(e), fechaCorta(e.fecha), e.total, e.cobrado, e.pendiente]),
    [{ b: 'Total' }, '', '', '', '', '', '', '', '', '', '', { b: d.total }]];
  return xlsx([
    { nombre: 'Cartera', filas, anchos: [13, 9, 15, 28, 16, 34, 20, 22, 13, 14, 14, 14] },
    { nombre: 'Por forma de cobro', filas: [['Forma de cobro', 'Efectos', 'Importe'], ...d.porForma.map((x) => [x.nombre, { n: x.n }, x.importe])], anchos: [26, 12, 16] },
    { nombre: 'Por tramos', filas: [['Tramo', 'Efectos', 'Importe'], ...d.porTramo.map((x) => [x.nombre, { n: x.n }, x.importe])], anchos: [30, 12, 16] },
    { nombre: 'Por cliente', filas: [['Cliente', 'NIF', 'Efectos', 'Importe', 'Vencido'], ...d.porCliente.map((x) => [x.cliente, x.nif, { n: x.n }, x.importe, x.vencido])], anchos: [30, 16, 12, 16, 16] },
  ]);
}
