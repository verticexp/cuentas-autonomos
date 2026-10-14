// Cartera de efectos a cobrar: selección, vencimientos y exportación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { carteraCobros, carteraXlsx, TRAMOS } from '../lib/cartera.js';

const factura = (id, vence, extra = {}) => ({ id, anio: 2026, numero: Number(id.replace(/\D/g, '')) || 1, serie: '', fecha: '2026-10-01', base: 100, ivaPct: 21, irpfPct: 0,
  cliente: { nombre: 'Cliente', nif: 'A1' }, vence, ...extra });
const hoy = '2026-10-14';

test('ordena por vencimiento, emisión y número, excluye cobradas y conserva el saldo parcial', () => {
  const fs = [factura('f3', '2026-10-20', { fecha: '2026-10-03' }), factura('f2', '2026-10-20', { fecha: '2026-10-02' }),
    factura('f1', '2026-10-20', { fecha: '2026-10-02', numero: 2 }), factura('f4', '2026-10-10', { cobrada: true }),
    factura('f5', '2026-10-22', { pagos: [{ fecha: '2026-10-05', importe: 50 }] })];
  const d = carteraCobros(fs, { hoy });
  assert.deepEqual(d.efectos.map((e) => e.id), ['f2', 'f1', 'f3', 'f5']);
  assert.equal(d.efectos[3].pendiente, 71);
  assert.equal(d.efectos[3].cobrado, 50);
});

test('clasifica vencidos, hoy y límites de los tramos', () => {
  const ds = [-1, 0, 30, 31, 60, 61, 90, 91];
  const fs = ds.map((n, i) => factura(`x${i}`, new Date(Date.UTC(2026, 9, 14 + n)).toISOString().slice(0, 10)));
  const d = carteraCobros(fs, { hoy });
  assert.deepEqual(d.efectos.map((e) => [e.dias, e.tramo]), [[-1, 'vencido'], [0, '0-30'], [30, '0-30'], [31, '31-60'], [60, '31-60'], [61, '61-90'], [90, '61-90'], [91, '+90']]);
  assert.equal(d.vencido, 121);
  assert.equal(d.aVencer, d.total - d.vencido);
  assert.deepEqual(d.porTramo.map((x) => x.n), [1, 2, 2, 2, 1]);
});

test('abonos pendientes quedan fuera de la cartera y de su total', () => {
  const d = carteraCobros([factura('a1', '2026-10-20', { serie: 'R', base: -100 }), factura('f1', '2026-10-20')], { hoy });
  assert.equal(d.efectos.length, 1);
  assert.equal(d.total, 121);
  assert.deepEqual(d.abonos, { n: 1, importe: -121 });
});

test('agrupa cliente por NIF y calcula concentración; agrupa vencidos por mes', () => {
  const fs = [factura('f1', '2026-09-30', { cliente: { nombre: 'Nombre Uno', nif: 'NIF' } }),
    factura('f2', '2026-10-20', { cliente: { nombre: 'Nombre Dos', nif: 'NIF' } }),
    factura('f3', '2026-11-02', { cliente: { nombre: 'Otro', nif: 'OTRO' } })];
  const d = carteraCobros(fs, { hoy });
  assert.equal(d.porCliente.length, 2);
  assert.equal(d.porCliente[0].n, 2);
  assert.equal(d.porCliente[0].vencido, 121);
  assert.equal(d.concentracion, 66.67);
  assert.deepEqual(d.porMes.map((m) => m.mes), ['vencido', '2026-10', '2026-11']);
});

test('sin facturas devuelve totales vacíos y siempre cinco tramos; exporta un XLSX', () => {
  const d = carteraCobros([], { hoy });
  assert.equal(d.total, 0);
  assert.equal(d.pmv, null);
  assert.equal(d.concentracion, 0);
  assert.equal(d.porTramo.length, 5);
  assert.deepEqual(d.porTramo.map((x) => x.id), TRAMOS.map((x) => x.id));
  const buffer = carteraXlsx({ empresa: {}, d });
  assert.ok(Buffer.isBuffer(buffer));
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
});

import { cambiarEfecto, formaDe, requiereRecepcion } from '../lib/cartera.js';

test('forma de cobro: la de la factura o, si no, la de la ficha; solo cheque, confirming y pagaré piden recepción', () => {
  const fichas = [{ id: 'CLIENTE', nombre: 'Cliente', formaCobro: 'transferencia' }];
  const fs = [factura('a1', '2026-10-20'), factura('a2', '2026-10-21', { formaCobro: 'cheque' }), factura('a3', '2026-10-22', { formaCobro: 'recibo' }),
    factura('a4', '2026-10-23', { formaCobro: 'confirming', efecto: { recibido: true, fecha: '2026-10-10' } }), factura('a5', '2026-10-24', { formaCobro: 'pagare' })];
  const d = carteraCobros(fs, { hoy, clientes: fichas });
  const e = (id) => d.efectos.find((x) => x.id === id);
  assert.deepEqual([e('a1').forma, e('a1').formaDeFicha, e('a1').requiereRecepcion, e('a1').recibido], ['transferencia', true, false, true]);
  assert.deepEqual([e('a2').forma, e('a2').requiereRecepcion, e('a2').recibido], ['cheque', true, false]);
  assert.deepEqual([e('a3').requiereRecepcion, e('a3').recibido], [false, true]); // el recibo no hay que recibirlo
  assert.deepEqual([e('a4').recibido, e('a4').fechaRecepcion], [true, '2026-10-10']);
  assert.equal(e('a5').recibido, false);
  assert.deepEqual(d.porRecibir, { n: 2, importe: 242 }); // el cheque y el pagaré
  assert.equal(d.porForma.reduce((s, x) => s + x.n, 0), 5);
  assert.deepEqual(['cheque', 'confirming', 'pagare'].map(requiereRecepcion), [true, true, true]);
  assert.deepEqual(['transferencia', 'recibo', 'domiciliacion', 'efectivo', ''].map(requiereRecepcion), [false, false, false, false, false]);
  // Sin ficha ni forma: «Sin indicar» y nada que recibir
  const sin = carteraCobros([factura('z', '2026-10-20')], { hoy });
  assert.deepEqual([sin.efectos[0].forma, sin.efectos[0].formaNombre, sin.efectos[0].recibido], ['', 'Sin indicar', true]);
  assert.equal(formaDe(factura('z', '2026-10-20')), '');
});

test('cambiarEfecto: marca recibido solo si la forma lo pide y la recepción se pierde al cambiar de forma', () => {
  const f = factura('c1', '2026-10-20');
  assert.match(cambiarEfecto(f, { recibido: true }, { hoy }).error, /forma de cobro/); // sin forma
  assert.match(cambiarEfecto(f, { forma: 'tarjeta', recibido: true }, { hoy }).error, /no necesita/);
  assert.match(cambiarEfecto(f, { forma: 'inventada' }, { hoy }).error, /no es válida/);
  assert.match(cambiarEfecto({ ...f, cobrada: true }, { forma: 'cheque' }, { hoy }).error, /cobrada/);
  const cheque = cambiarEfecto(f, { forma: 'cheque' }, { hoy }).nueva;
  assert.equal(cheque.formaCobro, 'cheque');
  const recibido = cambiarEfecto(cheque, { recibido: true }, { hoy }).nueva;
  assert.deepEqual(recibido.efecto, { recibido: true, fecha: hoy, forma: 'cheque' });
  assert.equal(cambiarEfecto(recibido, { recibido: false }, { hoy }).nueva.efecto, undefined);
  // Otro tipo de papel: hay que volver a recibirlo
  assert.equal(cambiarEfecto(recibido, { forma: 'confirming' }, { hoy }).nueva.efecto, undefined);
  // A una forma que no pide recepción: se borra el efecto
  const recibo = cambiarEfecto(recibido, { forma: 'recibo' }, { hoy }).nueva;
  assert.deepEqual([recibo.formaCobro, recibo.efecto], ['recibo', undefined]);
  // Quitar la forma vuelve a la de la ficha; con ficha de cheque se puede marcar recibido sin forma propia
  assert.equal(cambiarEfecto(cheque, { forma: '' }, { hoy }).nueva.formaCobro, undefined);
  assert.equal(cambiarEfecto(f, { recibido: true }, { hoy, formaFicha: 'cheque' }).nueva.efecto.recibido, true);
  // La factura original no se toca
  assert.equal(f.formaCobro, undefined);
});

test('el Excel lleva la forma de cobro y la recepción', () => {
  const d = carteraCobros([factura('x1', '2026-10-20', { formaCobro: 'cheque' }), factura('x2', '2026-10-21', { formaCobro: 'recibo' })], { hoy });
  const buf = carteraXlsx({ empresa: 'X', d });
  assert.equal(buf.subarray(0, 2).toString(), 'PK');
  assert.ok(buf.length > 500);
});
