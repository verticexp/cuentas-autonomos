import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionGastos } from '../lib/revisionGastos.js';

const gasto = (extra = {}) => ({ id: 'g', numero: 'P2026-01', fecha: '2026-06-15',
  proveedor: 'Hotel Mirador', concepto: 'Material', base: 100, ivaPct: 0, pendiente: true, ...extra });
const cargo = (extra = {}) => ({ id: 'm', fecha: '2026-06-17', importe: -100,
  concepto: 'COMPRA HOTEL MIRADOR P2026-01', contraparte: 'Hotel Mirador', estado: 'pendiente', ...extra });

test('un cargo con su gasto sugerido sale con el gasto para emparejarlo o borrarlo, también si la sugerencia es segura', () => {
  const r = revisionGastos([cargo()], [gasto()]);
  assert.equal(r.total, 1);
  const [x] = r.items;
  assert.equal(x.m.id, 'm');
  assert.equal(x.sugerencia.id, 'g');
  assert.equal(x.sugerencia.importe, 100);
  assert.equal(x.sugerencia.segura, true);
  assert.equal(x.sugerencia.pendiente, true);
  assert.deepEqual(x.otras, []);
});

test('los demás gastos cercanos se ofrecen para elegir, sin repetir el sugerido, y marcan si cuadran', () => {
  const r = revisionGastos([cargo()], [gasto(), gasto({ id: 'g2', numero: undefined, proveedor: 'Otro', base: 100, pendiente: false }), gasto({ id: 'g3', numero: undefined, proveedor: 'Lejos', base: 40 })]);
  const { otras } = r.items[0];
  assert.deepEqual(otras.map((o) => o.id), ['g2', 'g3']);
  assert.equal(otras[0].cuadra, true);
  assert.equal(otras[1].cuadra, false);
});

test('fuera: ingresos, emparejados, ignorados y lo que no es un gasto (Hacienda, nóminas…); los gastos ya enlazados no se ofrecen', () => {
  const movs = [cargo(), cargo({ id: 'i', importe: 50 }), cargo({ id: 'e', estado: 'emparejado', enlace: { tipo: 'gasto', id: 'g2' } }),
    cargo({ id: 'x', estado: 'ignorado' }), cargo({ id: 'h', concepto: 'AEAT MODELO 303', contraparte: 'AGENCIA TRIBUTARIA' })];
  const r = revisionGastos(movs, [gasto(), gasto({ id: 'g2', numero: undefined }), gasto({ id: 'g4', numero: undefined, banco: 'otro' })]);
  assert.deepEqual(r.items.map((x) => x.m.id), ['m']);
  assert.ok(!r.items[0].otras.some((o) => ['g2', 'g4'].includes(o.id)));
});

test('sin gasto que encaje sale para añadirlo; más recientes primero y con límite', () => {
  const movs = Array.from({ length: 5 }, (_, i) => cargo({ id: `m${i}`, fecha: `2026-06-0${i + 1}`, concepto: 'TARJETA', contraparte: undefined, importe: -7 }));
  const r = revisionGastos(movs, [], { limite: 3 });
  assert.equal(r.total, 5);
  assert.deepEqual(r.items.map((x) => x.m.id), ['m4', 'm3', 'm2']);
  assert.equal(r.items[0].sugerencia, null);
});
