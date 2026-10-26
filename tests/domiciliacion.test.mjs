// Plazo de domiciliación (lib/domiciliacion.js) contra el calendario del contribuyente 2026 de la AEAT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { conPagoDomiciliable, finDomiciliacion } from '../lib/domiciliacion.js';
import { habil, limiteTrimestre } from '../lib/calculos.js';

test('las fechas de domiciliación de 2026 son las que publica la AEAT', () => {
  // [fin de presentación, fin de domiciliación] de la tabla oficial (111 mensual y trimestral, 130, 303 mensual, 200 y renta).
  const tabla = [
    ['2026-01-20', '2026-01-15'], ['2026-02-20', '2026-02-17'], ['2026-03-20', '2026-03-16'], ['2026-04-20', '2026-04-15'],
    ['2026-05-20', '2026-05-15'], ['2026-06-22', '2026-06-17'], ['2026-07-20', '2026-07-15'], ['2026-08-20', '2026-08-17'],
    ['2026-09-21', '2026-09-16'], ['2026-10-20', '2026-10-15'], ['2026-11-20', '2026-11-17'], ['2026-12-21', '2026-12-16'],
    ['2026-01-30', '2026-01-27'], ['2026-03-02', '2026-02-25'], ['2026-03-30', '2026-03-25'], ['2026-04-30', '2026-04-27'],
    ['2026-06-01', '2026-05-27'], ['2026-06-30', '2026-06-25'], ['2026-07-30', '2026-07-27'], ['2026-08-31', '2026-08-26'],
    ['2026-09-30', '2026-09-25'], ['2026-10-30', '2026-10-27'], ['2026-11-30', '2026-11-25'], ['2026-12-30', '2026-12-24'],
    ['2026-07-27', '2026-07-22'],
  ];
  for (const [limite, domiciliacion] of tabla) assert.equal(finDomiciliacion(limite), domiciliacion, limite);
});

test('2027: el 4T de 2026 acaba el 1 de febrero y la domiciliación, el 27 de enero; San José es inhábil en Madrid', () => {
  assert.equal(limiteTrimestre(4, 2026), '2027-02-01');
  assert.equal(finDomiciliacion(limiteTrimestre(4, 2026)), '2027-01-27');
  // 1T de 2027: 20 de abril (martes) → 15 de abril.
  assert.equal(finDomiciliacion(habil('2027-04-20')), '2027-04-15');
  // 111 mensual de febrero de 2027: 22 de marzo (lunes; el 20 es sábado); el 19 de marzo es fiesta en Madrid: 18, 17 y 16.
  assert.equal(finDomiciliacion(habil('2027-03-20')), '2027-03-16');
  assert.equal(finDomiciliacion(''), null);
});

test('qué plazos llevan un pago que se puede domiciliar', () => {
  assert.equal(conPagoDomiciliable('303 y 130 del 3T'), true);
  assert.equal(conPagoDomiciliable('la renta'), true);
  assert.equal(conPagoDomiciliable('347 (si pasas de 3.005,06 € con alguien)'), false);
  assert.equal(conPagoDomiciliable('190, 180 y 193'), false);
  assert.equal(conPagoDomiciliable('369 del 1T'), false);
});
