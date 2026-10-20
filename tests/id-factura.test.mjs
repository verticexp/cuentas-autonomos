import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarIdFactura } from '../lib/idFactura.js';

test('quita los ceros de relleno solo del número de factura', () => {
  for (const [entrada, salida] of [['A2026-021', 'A2026-21'], ['2026-021', '2026-21'], ['R2026-00001', 'R2026-1'], ['Z2026-001', 'Z2026-1'], ['AB2026-0009', 'AB2026-9'], ['A2026-000', 'A2026-0']]) {
    assert.equal(normalizarIdFactura(entrada), salida);
    assert.equal(normalizarIdFactura(salida), salida);
  }
});

test('conserva los ids que no necesitan normalización y los formatos ajenos', () => {
  for (const id of ['A2026-21', 'A2026-100', 'A2026-0', 'A2026-0100-extra', 'A2026-', 'A2026-abc', '21-2026', '001-2026', 'cliente-001', '', null, undefined]) {
    assert.equal(normalizarIdFactura(id), id);
  }
});

test('no pierde precisión con números largos ni cambia el año', () => {
  assert.equal(normalizarIdFactura('A2026-0009007199254740993123'), 'A2026-9007199254740993123');
  assert.equal(normalizarIdFactura('A0026-021'), 'A0026-21');
});
