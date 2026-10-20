// El alta rellena la provincia con el código postal (lib/prueba.js provinciaDeCp).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROVINCIAS, provinciaDeCp } from '../lib/prueba.js';

test('los dos primeros dígitos dan la provincia', () => {
  assert.equal(provinciaDeCp('46001'), 'Valencia');
  assert.equal(provinciaDeCp('08001'), 'Barcelona');
  assert.equal(provinciaDeCp('01001'), 'Álava');
  assert.equal(provinciaDeCp('15001'), 'La Coruña');
  assert.equal(provinciaDeCp('38001'), 'Santa Cruz de Tenerife');
  assert.equal(provinciaDeCp('52001'), 'Melilla');
});

test('un código incompleto o que no existe no da provincia', () => {
  for (const cp of ['', '4600', '460011', '00001', '53001', '99999', 'abcde']) assert.equal(provinciaDeCp(cp), '', cp);
});

test('todas las provincias que devuelve están en la lista del alta', () => {
  for (let i = 1; i <= 52; i++) assert.ok(PROVINCIAS.includes(provinciaDeCp(`${String(i).padStart(2, '0')}001`)), String(i));
});
