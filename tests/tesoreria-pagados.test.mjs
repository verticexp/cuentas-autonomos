import test from 'node:test';
import assert from 'node:assert/strict';
import { pagadosSinExtracto } from '../lib/tesoreria.js';

const base = { pagos130: { 2026: { 3: 250 } }, fiscal: {} };

test('el 130 pagado después del saldo se resta; con extracto posterior, no', () => {
  const pagadosHacienda = { '2026-3-130': { fecha: '2026-10-19', en: '2026-10-19T10:00:00Z' } };
  assert.deepEqual(pagadosSinExtracto({ ...base, pagadosHacienda, saldo: { importe: 1000, fecha: '2026-10-15' } }).map((d) => d.importe), [250]);
  assert.equal(pagadosSinExtracto({ ...base, pagadosHacienda, saldo: { importe: 1000, fecha: '2026-10-20' } }).length, 0);
  assert.equal(pagadosSinExtracto({ ...base, pagadosHacienda, saldo: { importe: 1000, fecha: '2026-10-19', en: '2026-10-19T12:00:00Z' } }).length, 0);
  assert.equal(pagadosSinExtracto({ ...base, pagadosHacienda, saldo: { importe: 1000, fecha: '2026-10-19', en: '2026-10-19T09:00:00Z' } }).length, 1);
});
