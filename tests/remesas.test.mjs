import test from 'node:test';
import assert from 'node:assert/strict';
import { clienteId, fechaValida, prepararCuenta, prepararDomiciliacion, prepararCobros, prepararPagos } from '../lib/remesas.js';

const ES = 'ES9121000418450200051332';
const DE = 'DE89370400440532013000';
const emisor = { nombre: 'Empresa', nif: 'B12345678', iban: ES };
const cliente = { nombre: 'Ángel Pérez', nif: '12345678Z' };
const dom = { id: clienteId(cliente.nombre), nombre: cliente.nombre, iban: DE, mandato: { referencia: 'MAND-1', fecha: '2026-01-01' }, usado: false };
const factura = (id, extra = {}) => ({ id, numero: 1, anio: 2026, fecha: '2026-10-01', cliente, base: 100, ivaPct: 21, irpfPct: 15, ...extra });
const gasto = (id, extra = {}) => ({ id, proveedor: 'Diseños SL', proveedorNif: 'b87654321', concepto: 'Diseño web', base: 100, ivaPct: 21, irpfPct: 15, pendiente: true, ...extra });
const cuenta = { id: 'B87654321', nombre: 'Diseños SL', iban: DE };
const comun = { emisor, fecha: '2026-10-20', id: 'REM-123', ahora: '2026-10-13T12:00:00Z' };
const cobros = (facturas, extras = {}) => prepararCobros({ ...comun, facturas, ids: facturas.map((f) => f.id), domiciliaciones: [dom], ...extras });
const pagos = (gastos, extras = {}) => prepararPagos({ ...comun, gastos, ids: gastos.map((g) => g.id), cuentasProv: [cuenta], ...extras });

test('Cobros: primer uso FRST, importe con retención, concepto y acreedor configurado', () => {
  const f = factura('f1');
  const r = cobros([f], { emisor: { ...emisor, acreedorSepa: 'ES97001B12345678' } });
  assert.equal(r.error, undefined);
  assert.equal(r.numero, 1);
  assert.equal(r.total, 106);
  assert.deepEqual(r.documentos, [f]);
  assert.equal(r.operaciones[0].mandato.secuencia, 'FRST');
  assert.match(r.xml, /<SeqTp>FRST<\/SeqTp>/);
  assert.match(r.xml, /Factura 01-2026/);
  assert.match(r.xml, /ES97001B12345678/);
  assert.match(r.xml, /<MsgId>REM-123<\/MsgId>/);
  assert.equal(f.cobrada, undefined);
  assert.equal(dom.usado, false);
});

test('Cobros: RCUR para mandatos usados y todos los recibos de un mandato nuevo usan FRST', () => {
  const recurrente = { ...dom, id: 'OTRO CLIENTE', nombre: 'Otro Cliente', usado: true };
  const r = cobros([factura('a'), factura('b'), factura('c', { cliente: { nombre: 'Otro Cliente' } })], { domiciliaciones: [dom, recurrente] });
  assert.deepEqual(r.operaciones.map((o) => o.mandato.secuencia), ['FRST', 'FRST', 'RCUR']);
  assert.equal(r.numero, 3);
  assert.equal(r.total, 318);
});

test('Cobros: excluye ausentes, cobradas, caja, importes no positivos y clientes sin mandato', () => {
  const lista = [factura('ok'), factura('cobrada', { cobrada: true }), factura('caja', { caja: {} }), factura('cero', { base: 0 }), factura('negativa', { base: -100 }), factura('sin', { cliente: { nombre: 'Sin cuenta' } })];
  const r = cobros(lista, { ids: [...lista.map((f) => f.id), 'borrada', 'ok'] });
  assert.equal(r.numero, 1);
  assert.deepEqual(r.documentos.map((f) => f.id), ['ok']);
  assert.deepEqual(r.errores.map((e) => e.id), ['cobrada', 'caja', 'cero', 'negativa', 'sin', 'borrada']);
  assert.equal(r.total, 106);
});

test('Cobros: los rechazos del generador SEPA tampoco se marcan ni se incluyen en el historial', () => {
  const r = cobros([factura('ok'), factura('iban', { cliente: { nombre: 'Cuenta rota' } }), factura('fecha', { cliente: { nombre: 'Mandato roto' } })], {
    domiciliaciones: [dom, { ...dom, id: 'CUENTA ROTA', iban: 'ES00' }, { ...dom, id: 'MANDATO ROTO', mandato: { referencia: 'R', fecha: '2026-02-30' } }],
  });
  assert.equal(r.numero, 1);
  assert.deepEqual(r.documentos.map((d) => d.id), ['ok']);
  assert.deepEqual(r.operaciones.map((d) => d.id), ['ok']);
  assert.deepEqual(r.errores.map((d) => d.id), ['iban', 'fecha']);
  assert.doesNotMatch(r.xml, /<EndToEndId>iban/);
});

test('Cobros: devuelve el motivo cuando ningún recibo es válido y valida los datos del emisor', () => {
  assert.match(cobros([factura('f', { cobrada: true })]).error, /ya está cobrada/);
  for (const campo of ['nombre', 'iban', 'nif']) assert.equal(cobros([factura('f')], { emisor: { ...emisor, [campo]: '' } }).error, 'Rellena tus datos de facturación (IBAN y NIF) en Ajustes');
  assert.match(cobros([factura('f')], { domiciliaciones: [{ ...dom, mandato: { ...dom.mandato, fecha: '2026-10-21' } }] }).error, /posterior al cobro/);
});

test('Pagos: importe neto con IVA e IRPF, clave por NIF y por nombre normalizado', () => {
  const lista = [gasto('a'), gasto('b', { proveedor: '  José   Muñoz ', proveedorNif: '', base: 200, ivaPct: 10, irpfPct: 7 })];
  const r = pagos(lista, { cuentasProv: [cuenta, { id: 'jose munoz', nombre: 'José Muñoz', iban: ES }] });
  assert.equal(r.numero, 2);
  assert.equal(r.total, 312);
  assert.deepEqual(r.operaciones.map((p) => p.importe), [106, 206]);
  assert.match(r.xml, /pain.001.001.03/);
  assert.match(r.xml, /<InstdAmt Ccy="EUR">106.00<\/InstdAmt>/);
  assert.equal(lista[0].pendiente, true);
});

test('Pagos: solo pendientes, sin duplicados, con cuenta válida e importe positivo', () => {
  const lista = [gasto('ok'), gasto('pagado', { pendiente: undefined }), gasto('sin', { proveedorNif: 'B00000000' }), gasto('negativo', { base: -100 }), gasto('bic', { proveedorNif: 'B11111111' })];
  const r = pagos(lista, { ids: [...lista.map((g) => g.id), 'no-existe', 'ok'], cuentasProv: [cuenta, { ...cuenta, id: 'B11111111', bic: 'MAL' }] });
  assert.equal(r.numero, 1);
  assert.deepEqual(r.documentos.map((g) => g.id), ['ok']);
  assert.deepEqual(new Set(r.errores.map((e) => e.id)), new Set(['pagado', 'sin', 'negativo', 'bic', 'no-existe']));
  assert.match(pagos([gasto('x', { pendiente: false })]).error, /ya está pagado/);
});

test('Validación de selección, fecha e IBAN del emisor antes de generar', () => {
  for (const ids of [null, [], [''], [12], 'f']) assert.match(cobros([factura('f')], { ids }).error, /Selecciona/);
  for (const fecha of ['2026-02-30', '2025-12-01', 'incorrecta']) assert.match(pagos([gasto('g')], { fecha }).error, /fecha/i);
  assert.match(pagos([gasto('g')], { emisor: { ...emisor, iban: 'ES00' } }).error, /IBAN/);
  assert.match(pagos([gasto('g')], { emisor: {} }).error, /Ajustes/);
});

test('Los totales de varias líneas usan importes, incluyendo IVA mixto y retención', () => {
  const f = factura('lineas', { base: 300, lineas: [{ cantidad: 1, precio: 100, ivaPct: 21 }, { cantidad: 2, precio: 100, ivaPct: 10 }] });
  assert.equal(cobros([f]).total, 296);
  assert.equal(pagos([gasto('g', { base: f.base, lineas: f.lineas })]).total, 296);
});

test('Cuentas y domiciliaciones: normalización y referencia generada con NIF o nombre y fecha', () => {
  const datos = { cliente, iban: 'de89 3704 0044 0532 0130 00', fecha: '2026-01-01', hoy: '2026-10-13' };
  const d = prepararDomiciliacion(datos);
  assert.equal(d.id, 'ÁNGEL PÉREZ');
  assert.equal(d.iban, DE);
  assert.equal(d.mandato.referencia, '12345678Z-2026-01-01');
  assert.equal(d.usado, false);
  const largo = prepararDomiciliacion({ ...datos, cliente: { nombre: 'Á'.repeat(50) } });
  assert.equal(largo.mandato.referencia.length, 35);
  assert.ok(largo.mandato.referencia.endsWith('-2026-01-01'));
  assert.equal(prepararCuenta({ ...cuenta, bic: ' deutdeff ' }).bic, 'DEUTDEFF');
});

test('Editar un mandato usado conserva RCUR; cambiar cuenta, referencia o fecha inicia FRST', () => {
  const datos = { cliente, iban: DE, referencia: 'MAND-1', fecha: '2026-01-01', anterior: { ...dom, usado: true }, hoy: '2026-10-13' };
  assert.equal(prepararDomiciliacion(datos).usado, true);
  for (const cambio of [{ iban: ES }, { referencia: 'NUEVO' }, { fecha: '2026-02-01' }]) assert.equal(prepararDomiciliacion({ ...datos, ...cambio }).usado, false);
});

test('Rechaza fechas imposibles o futuras, referencias no SEPA, IBAN y BIC inválidos', () => {
  const datos = { cliente, iban: DE, fecha: '2026-01-01', hoy: '2026-10-13' };
  for (const fecha of ['2026-02-30', '0000-01-01', '2026-1-1', '2026-10-14', '', null]) assert.match(prepararDomiciliacion({ ...datos, fecha }).error, /fecha/i);
  assert.equal(fechaValida('2024-02-29'), true);
  assert.equal(fechaValida('2026-02-29'), false);
  for (const referencia of ['x'.repeat(36), '🙂', 'Mandáto']) assert.match(prepararDomiciliacion({ ...datos, referencia }).error, /referencia/);
  assert.match(prepararDomiciliacion({ ...datos, iban: 'ES00' }).error, /IBAN/);
  assert.match(prepararDomiciliacion({ ...datos, bic: 'MAL' }).error, /BIC/);
});
