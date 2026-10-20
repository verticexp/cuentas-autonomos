// «Tus modelos» del resumen: el próximo día de presentación de cada modelo (lib/avisos.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { proximoPlazoDe } from '../lib/avisos.js';

const autonomo = { tipo: 'autonomo', iva: 'general' };
const sociedad = { tipo: 'sociedad', iva: 'general', trabajadores: true };

test('trimestrales: el de este trimestre hasta su último día, luego el siguiente', () => {
  assert.equal(proximoPlazoDe(autonomo, '303', '2026-10-20'), '2026-10-20');
  assert.equal(proximoPlazoDe(autonomo, '130', '2026-10-21'), '2027-02-01'); // 30 de enero de 2027 es sábado: pasa al lunes
  assert.equal(proximoPlazoDe(sociedad, '111', '2026-10-21'), '2027-01-20');
});

test('anuales y del Registro Mercantil', () => {
  assert.equal(proximoPlazoDe(autonomo, '390', '2026-10-20'), '2027-02-01');
  assert.equal(proximoPlazoDe(autonomo, '100', '2026-03-01'), '2026-06-30');
  assert.equal(proximoPlazoDe(sociedad, '200', '2026-10-20'), '2027-07-26'); // 25 de julio de 2027 es domingo
  assert.equal(proximoPlazoDe(sociedad, 'rm-cuentas', '2026-10-20'), '2027-07-30');
  assert.equal(proximoPlazoDe(sociedad, 'rm-libros', '2026-01-10'), '2026-04-30');
});

test('un modelo que no toca no tiene plazo', () => {
  assert.equal(proximoPlazoDe(autonomo, '111', '2026-10-20'), null);
  assert.equal(proximoPlazoDe(autonomo, '200', '2026-10-20'), null);
  assert.equal(proximoPlazoDe({}, '303', '2026-10-20'), null);
});
