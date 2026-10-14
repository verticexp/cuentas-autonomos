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
