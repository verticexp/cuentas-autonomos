// Conceptos del banco en tipo frase (lib/textoBanco.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fraseBanco } from '../lib/textoBanco.js';

test('lo que llega todo en mayúsculas pasa a tipo frase', () => {
  assert.equal(fraseBanco('RECIBO COMBUSTIBLE FURGONETA'), 'Recibo combustible furgoneta');
  assert.equal(fraseBanco('RECIBO SEGURO DE RESPONSABILIDAD CIVIL'), 'Recibo seguro de responsabilidad civil');
  assert.equal(fraseBanco('TRANSF. SEPA DE GRÁFICAS ÁLVAREZ SL'), 'Transf. SEPA de gráficas álvarez SL');
});

test('los nombres de la otra parte, con cada palabra en mayúscula', () => {
  assert.equal(fraseBanco('GRÁFICAS ÁLVAREZ SL', { nombre: true }), 'Gráficas Álvarez SL');
  assert.equal(fraseBanco('AYUNTAMIENTO DE VILAMAR', { nombre: true }), 'Ayuntamiento de Vilamar');
});

test('siglas y referencias con cifras se quedan como vienen', () => {
  assert.equal(fraseBanco('PAGO TPV REF 00012345 IVA'), 'Pago TPV ref 00012345 IVA');
  assert.equal(fraseBanco('CUOTA TGSS 202610'), 'Cuota TGSS 202610');
});

test('lo que ya trae minúsculas no se toca', () => {
  for (const s of ['Transportes Ràpid S.L.', 'Amazon EU', 'pago con tarjeta', '', null, undefined, '1234']) assert.equal(fraseBanco(s), String(s ?? ''));
});
