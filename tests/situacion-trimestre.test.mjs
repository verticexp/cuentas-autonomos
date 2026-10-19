import test from 'node:test';
import assert from 'node:assert/strict';
import { limiteTrimestre, proximoPlazo, situacionTrimestre } from '../lib/calculos.js';
import { textoSituacion } from '../lib/formato.js';

test('límite de cada trimestre del 303/130', () => {
  assert.equal(limiteTrimestre(1, 2026), '2026-04-20');
  assert.equal(limiteTrimestre(2, 2026), '2026-07-20');
  assert.equal(limiteTrimestre(3, 2026), '2026-10-20');
  assert.equal(limiteTrimestre(4, 2025), '2026-01-30');
});

test('si el límite cae en fin de semana, pasa al lunes siguiente', () => {
  // 30-01-2027 es sábado y 30-01-2028, domingo: el 4T acaba el lunes 1 de febrero (2027) y el 31 de enero (2028).
  assert.equal(limiteTrimestre(4, 2026), '2027-02-01');
  assert.equal(limiteTrimestre(4, 2027), '2028-01-31');
  // 20-04-2030 es sábado; 20-10-2030, domingo.
  assert.equal(limiteTrimestre(1, 2030), '2030-04-22');
  assert.equal(limiteTrimestre(3, 2030), '2030-10-21');
  // Ese lunes todavía está en plazo; el martes ya no.
  assert.deepEqual(situacionTrimestre(4, 2026, '2027-01-30'), { estado: 'listo', limite: '2027-02-01', dias: 2 });
  assert.deepEqual(situacionTrimestre(4, 2026, '2027-02-01'), { estado: 'listo', limite: '2027-02-01', dias: 0 });
  assert.equal(situacionTrimestre(4, 2026, '2027-02-02').estado, 'fuera');
  assert.equal(situacionTrimestre(4, 2027, '2028-01-30').estado, 'listo');
  assert.equal(situacionTrimestre(4, 2027, '2028-01-31').estado, 'listo');
  assert.equal(situacionTrimestre(4, 2027, '2028-02-01').estado, 'fuera');
});

test('el próximo plazo usa la misma fecha límite', () => {
  assert.deepEqual(proximoPlazo('2027-01-31'), { t: 4, anio: 2026, fecha: '2027-02-01', dias: 1 });
  assert.deepEqual(proximoPlazo('2027-02-01'), { t: 4, anio: 2026, fecha: '2027-02-01', dias: 0 });
  assert.deepEqual(proximoPlazo('2027-02-02'), { t: 1, anio: 2027, fecha: '2027-04-20', dias: 77 });
  assert.deepEqual(proximoPlazo('2028-01-30'), { t: 4, anio: 2027, fecha: '2028-01-31', dias: 1 });
});

test('en curso mientras el trimestre no ha terminado', () => {
  assert.equal(situacionTrimestre(4, 2026, '2026-10-19').estado, 'curso');
  assert.equal(situacionTrimestre(3, 2026, '2026-09-30').estado, 'curso');
  assert.equal(situacionTrimestre(1, 2027, '2026-12-31').estado, 'curso');
});

test('listo para presentar desde el día siguiente al cierre hasta el límite incluido', () => {
  assert.deepEqual(situacionTrimestre(3, 2026, '2026-10-19'), { estado: 'listo', limite: '2026-10-20', dias: 1 });
  assert.deepEqual(situacionTrimestre(3, 2026, '2026-10-20'), { estado: 'listo', limite: '2026-10-20', dias: 0 });
  assert.equal(situacionTrimestre(3, 2026, '2026-10-01').estado, 'listo');
  // El 4T se presenta en enero del año siguiente.
  assert.equal(situacionTrimestre(4, 2026, '2027-01-01').estado, 'listo');
  assert.equal(situacionTrimestre(4, 2026, '2027-01-30').estado, 'listo');
});

test('fuera de plazo cuando el límite ya pasó', () => {
  assert.equal(situacionTrimestre(3, 2026, '2026-10-21').estado, 'fuera');
  assert.equal(situacionTrimestre(2, 2026, '2026-10-19').estado, 'fuera');
  assert.equal(situacionTrimestre(4, 2025, '2026-01-31').estado, 'fuera');
  // Cualquier trimestre de un año anterior sin marcar.
  assert.equal(situacionTrimestre(1, 2025, '2026-10-19').estado, 'fuera');
  assert.ok(situacionTrimestre(1, 2025, '2026-10-19').dias < 0);
});

test('texto del estado: en curso, listo (hoy, mañana o con fecha), fuera de plazo', () => {
  assert.equal(textoSituacion({ estado: 'curso', dias: 103 }, '30 de enero de 2027'), 'En curso · se presenta hasta el 30 de enero de 2027');
  assert.equal(textoSituacion({ estado: 'listo', dias: 1 }, '20 de octubre'), 'Listo para presentar · hasta mañana, 20 de octubre');
  assert.equal(textoSituacion({ estado: 'listo', dias: 0 }, '20 de octubre'), 'Listo para presentar · hasta hoy, 20 de octubre');
  assert.equal(textoSituacion({ estado: 'listo', dias: 12 }, '20 de octubre'), 'Listo para presentar · hasta el 20 de octubre');
  assert.equal(textoSituacion({ estado: 'listo', dias: 1 }, '20 de octubre', 'se marca en el 130'), 'Listo para presentar · hasta mañana, 20 de octubre · se marca en el 130');
  assert.equal(textoSituacion({ estado: 'fuera', dias: -91 }, '20 de julio'), 'Fuera de plazo · venció el 20 de julio');
  assert.equal(textoSituacion({ estado: 'fuera', dias: -547 }, '20 de abril de 2025', 'se marca en el 130'), 'Fuera de plazo · venció el 20 de abril de 2025 · se marca en el 130');
});
