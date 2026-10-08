import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosDelDia, plazosFiscales } from '../lib/avisos.js';

const fiscal = { tipo: 'autonomo', iva: 'general' };
const fac = (id, fecha, extra = {}) => ({ id, numero: Number(id), anio: 2026, fecha, base: 100, ivaPct: 21, irpfPct: 0, cliente: { nombre: `C${id}` }, ...extra });

test('plazos de Hacienda: 7 días antes, el día antes y el último día', () => {
  assert.deepEqual(avisosDelDia({ fiscal }, '2026-10-13').map((a) => a.titulo), ['Queda una semana: 303 y 130 del 3T']);
  assert.deepEqual(avisosDelDia({ fiscal }, '2026-10-19').map((a) => a.titulo), ['Mañana acaba el plazo: 303 y 130 del 3T']);
  assert.deepEqual(avisosDelDia({ fiscal }, '2027-01-30').map((a) => a.titulo), ['Hoy es el último día: 303 y 130 del 4T y 390']);
  assert.equal(avisosDelDia({ fiscal }, '2026-10-14').length, 0);
  assert.deepEqual(avisosDelDia({ fiscal: { tipo: 'sociedad', iva: 'general' } }, '2026-10-19').map((a) => a.titulo), ['Mañana acaba el plazo: 303 del 3T y 202']);
  assert.deepEqual(avisosDelDia({ fiscal: { tipo: 'sociedad', iva: 'exento' }, cuotaIS: { 2025: 0 } }, '2026-10-19').length, 0);
  assert.equal(avisosDelDia({ fiscal: {} }, '2026-10-19').length, 0);
});

test('facturas: solo el día siguiente a vencer, sin cobrar', () => {
  const F = [fac('1', '2026-09-01'), fac('2', '2026-09-01', { cobrada: true }), fac('3', '2026-08-31')];
  const a = avisosDelDia({ facturas: F, plazo: 30 }, '2026-10-02');
  assert.deepEqual(a.map((x) => [x.titulo, x.url]), [['Factura vencida: C1', '/facturas/1']]);
  const dos = avisosDelDia({ facturas: [fac('1', '2026-09-01'), fac('4', '2026-09-01')], plazo: 30 }, '2026-10-02');
  assert.equal(dos[0].titulo, '2 facturas vencidas');
  assert.equal(avisosDelDia({ facturas: F, plazo: 30 }, '2026-10-03').length, 0);
});

test('calendario: todos los plazos del año según cómo trabaja', () => {
  const aut = plazosFiscales({ tipo: 'autonomo', iva: 'general', trabajadores: true, alquiler: true, intracom: true }, 2027);
  assert.deepEqual(aut.map((p) => [p.fecha, p.texto]), [
    ['2027-01-20', '111 y 115 del 4T'], ['2027-01-30', '303, 130 y 349 del 4T y 390'], ['2027-01-31', '190 y 180'],
    ['2027-02-28', '347 (si pasas de 3.005,06 € con alguien)'],
    ['2027-04-20', '303, 130, 349, 111 y 115 del 1T'], ['2027-07-20', '303, 130, 349, 111 y 115 del 2T'], ['2027-10-20', '303, 130, 349, 111 y 115 del 3T'],
    ['2027-06-30', 'la renta'],
  ].sort((a, b) => aut.findIndex((p) => p.fecha === a[0]) - aut.findIndex((p) => p.fecha === b[0])));
  const soc = plazosFiscales({ tipo: 'sociedad', iva: 'general' }, 2028, { cuotaIS: { 2026: 0, 2027: 500 } });
  assert.deepEqual(soc.map((p) => [p.fecha, p.texto]).filter(([f]) => ['2028-04-20', '2028-04-30', '2028-07-25', '2028-07-30', '2028-10-20', '2028-12-20', '2028-02-29'].includes(f)), [
    ['2028-02-29', '347 (si pasas de 3.005,06 € con alguien)'], ['2028-04-20', '303 del 1T'], ['2028-10-20', '303 del 3T y 202'],
    ['2028-04-30', 'legalizar los libros en el Registro Mercantil'], ['2028-07-25', '200 (Impuesto sobre Sociedades)'], ['2028-07-30', 'depositar las cuentas anuales'], ['2028-12-20', '202'],
  ]);
});
