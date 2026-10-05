import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosDelDia } from '../lib/avisos.js';

const fiscal = { tipo: 'autonomo', iva: 'general' };
const fac = (id, fecha, extra = {}) => ({ id, numero: Number(id), anio: 2026, fecha, base: 100, ivaPct: 21, irpfPct: 0, cliente: { nombre: `C${id}` }, ...extra });

test('plazos de Hacienda: 7 días antes, el día antes y el último día', () => {
  assert.deepEqual(avisosDelDia({ fiscal }, '2026-10-13').map((a) => a.titulo), ['Queda una semana: 303 y 130 del 3T']);
  assert.deepEqual(avisosDelDia({ fiscal }, '2026-10-19').map((a) => a.titulo), ['Mañana acaba el plazo: 303 y 130 del 3T']);
  assert.deepEqual(avisosDelDia({ fiscal }, '2027-01-30').map((a) => a.titulo), ['Hoy es el último día: 303 y 130 del 4T']);
  assert.equal(avisosDelDia({ fiscal }, '2026-10-14').length, 0);
  assert.deepEqual(avisosDelDia({ fiscal: { tipo: 'sociedad', iva: 'general' } }, '2026-10-19').map((a) => a.titulo), ['Mañana acaba el plazo: 303 del 3T']);
  assert.equal(avisosDelDia({ fiscal: { tipo: 'sociedad', iva: 'exento' } }, '2026-10-19').length, 0);
});

test('facturas: solo el día siguiente a vencer, sin cobrar', () => {
  const F = [fac('1', '2026-09-01'), fac('2', '2026-09-01', { cobrada: true }), fac('3', '2026-08-31')];
  const a = avisosDelDia({ facturas: F, plazo: 30 }, '2026-10-02');
  assert.deepEqual(a.map((x) => [x.titulo, x.url]), [['Factura vencida: C1', '/facturas/1']]);
  const dos = avisosDelDia({ facturas: [fac('1', '2026-09-01'), fac('4', '2026-09-01')], plazo: 30 }, '2026-10-02');
  assert.equal(dos[0].titulo, '2 facturas vencidas');
  assert.equal(avisosDelDia({ facturas: F, plazo: 30 }, '2026-10-03').length, 0);
});
