import test from 'node:test';
import assert from 'node:assert/strict';
import { pascua, festivoNacional } from '../lib/festivos.js';
import { habil } from '../lib/calculos.js';

test('Pascua gregoriana en distintos años', () => {
  for (const [anio, fecha] of [[2024, '2024-03-31'], [2025, '2025-04-20'], [2026, '2026-04-05'], [2027, '2027-03-28'], [2030, '2030-04-21']]) {
    assert.equal(pascua(anio), fecha);
  }
});

test('festivos nacionales comunes a toda España', () => {
  for (const dia of ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25']) {
    assert.equal(festivoNacional(`2026-${dia}`), true);
  }
  assert.equal(festivoNacional('2025-04-18'), true);
  assert.equal(festivoNacional('2025-04-17'), false);
  assert.equal(festivoNacional('2025-04-21'), false);
  assert.equal(festivoNacional('2026-10-20'), false);
});

test('día hábil tras fines de semana y festivos nacionales', () => {
  for (const [fecha, resultado] of [
    ['2027-01-30', '2027-02-01'],
    ['2026-12-25', '2026-12-28'],
    ['2027-01-01', '2027-01-04'],
    ['2025-04-18', '2025-04-21'],
    ['2026-10-20', '2026-10-20'],
  ]) assert.equal(habil(fecha), resultado);
});
