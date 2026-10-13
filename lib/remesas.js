// Preparación sin persistencia: el historial y el marcado usan solo los documentos del XML.
import { importes, numeroFactura, r2 } from './calculos.js';
import { RET_ALQUILER } from './modelos.js';
import { claveProveedor } from './proveedores.js';
import { ibanValido, limpiarIban, referenciaMandato, remesaCobros, remesaPagos } from './sepa.js';

export const clienteId = (nombre) => String(nombre || '').trim().toUpperCase();
export const fechaValida = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)
  && f.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(f)) && new Date(f).toISOString().slice(0, 10) === f;

export function prepararCuenta({ id, nombre, iban, bic }) {
  if (!id || !String(nombre || '').trim()) return { error: 'Falta el nombre del titular' };
  if (!ibanValido(iban)) return { error: 'El IBAN no es válido' };
  const b = limpiarIban(bic);
  if (b && !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(b)) return { error: 'El BIC no es válido' };
  return { id, nombre: nombre.trim(), iban: limpiarIban(iban), ...(b ? { bic: b } : {}) };
}

export function prepararDomiciliacion({ cliente, iban, bic, referencia, fecha, anterior, hoy }) {
  const cuenta = prepararCuenta({ id: clienteId(cliente.nombre), nombre: cliente.nombre, iban, bic });
  if (cuenta.error) return cuenta;
  if (!fechaValida(fecha) || (hoy && fecha > hoy)) return { error: 'La fecha de firma del mandato no es válida o está en el futuro' };
  const ref = String(referencia || '').trim();
  if (ref && (ref.length > 35 || referenciaMandato(ref) !== ref)) return { error: 'La referencia debe tener hasta 35 caracteres SEPA (letras sin tildes, números y signos permitidos)' };
  const generada = referenciaMandato(`${referenciaMandato(cliente.nif || cliente.nombre).slice(0, 24)}-${fecha}`);
  const mandato = { referencia: ref || generada, fecha };
  if (!mandato.referencia) return { error: 'Falta la referencia del mandato' };
  const mismo = anterior?.iban === cuenta.iban && anterior?.mandato?.referencia === mandato.referencia && anterior?.mandato?.fecha === fecha;
  return { ...cuenta, mandato, usado: Boolean(mismo && anterior.usado) };
}

function seleccionar(documentos, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.some((id) => typeof id !== 'string' || !id.trim())) return { error: 'Selecciona al menos un documento válido' };
  const porId = new Map(documentos.map((d) => [d.id, d]));
  return { seleccion: [...new Set(ids)].map((id) => ({ id, doc: porId.get(id) })) };
}

function finalizar(resultado, documentos, operaciones, errores) {
  const todos = [...errores, ...(resultado.errores || [])];
  if (resultado.error) return { ...resultado, error: todos.length ? `${resultado.error}: ${todos.map((e) => `${e.id}: ${e.error}`).join('; ')}` : resultado.error, errores: todos };
  const excluidos = new Set(todos.map((e) => e.id));
  return { ...resultado, errores: todos, documentos: documentos.filter((d) => !excluidos.has(d.id)), operaciones: operaciones.filter((o) => !excluidos.has(o.id)) };
}

export function prepararCobros({ facturas = [], ids, domiciliaciones = [], emisor, fecha, id, ahora }) {
  if (!emisor?.iban || !emisor?.nif || !emisor?.nombre) return { error: 'Rellena tus datos de facturación (IBAN y NIF) en Ajustes' };
  const s = seleccionar(facturas, ids);
  if (s.error) return s;
  const cuentas = new Map(domiciliaciones.map((d) => [d.id, d]));
  const recibos = [], documentos = [], errores = [];
  for (const { id, doc: f } of s.seleccion) {
    const d = f && cuentas.get(clienteId(f.cliente?.nombre));
    const importe = f && importes(f).total;
    const fallo = !f ? 'La factura ya no existe' : f.cobrada ? 'La factura ya está cobrada' : f.caja ? 'Los cierres de caja no se domicilian'
      : !Number.isFinite(importe) || importe <= 0 ? 'El importe debe ser positivo' : !d ? 'El cliente no tiene domiciliación'
        : d.mandato?.fecha > fecha ? 'La firma del mandato es posterior al cobro' : '';
    if (fallo) { errores.push({ id, error: fallo }); continue; }
    documentos.push(f);
    recibos.push({ id, importe, concepto: `Factura ${numeroFactura(f)}`, deudor: { nombre: d.nombre, iban: d.iban, bic: d.bic },
      mandato: { ...d.mandato, secuencia: d.usado ? 'RCUR' : 'FRST' } });
  }
  const resultado = remesaCobros({ acreedor: { ...emisor, identificador: emisor.acreedorSepa }, fechaCobro: fecha, recibos, id, ahora });
  return finalizar(resultado, documentos, recibos, errores);
}

export function prepararPagos({ gastos = [], ids, cuentasProv = [], emisor, fecha, id, ahora }) {
  if (!emisor?.iban || !emisor?.nombre) return { error: 'Rellena tus datos de facturación (nombre e IBAN) en Ajustes' };
  const s = seleccionar(gastos, ids);
  if (s.error) return s;
  const cuentas = new Map(cuentasProv.map((c) => [c.id, c]));
  const pagos = [], documentos = [], errores = [];
  for (const { id, doc: g } of s.seleccion) {
    const c = g && cuentas.get(claveProveedor(g));
    const fallo = !g ? 'El gasto ya no existe' : g.pendiente !== true ? 'El gasto ya está pagado' : !g.proveedor || !c ? 'El proveedor no tiene cuenta bancaria' : '';
    if (fallo) { errores.push({ id, error: fallo }); continue; }
    documentos.push(g);
    // Lo que se le paga: con IVA y menos las retenciones (la del alquiler del local también, como en lib/asientos.js).
    const importe = r2(importes(g).total - (g.alquiler ? (g.base * RET_ALQUILER) / 100 : 0));
    pagos.push({ id, importe, concepto: g.concepto || `Gasto ${id}`, beneficiario: { nombre: c.nombre, iban: c.iban, bic: c.bic } });
  }
  return finalizar(remesaPagos({ ordenante: emisor, fechaEjecucion: fecha, pagos, id, ahora }), documentos, pagos, errores);
}
