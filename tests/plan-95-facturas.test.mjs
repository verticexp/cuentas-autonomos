// Plan para llegar a 9,5 (26-10-2026): idioma y moneda por cliente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { limpiarFicha } from '../lib/terceros.js';

test('la ficha del cliente guarda su idioma y su moneda (español y euros, sin guardar)', () => {
  const v = limpiarFicha({ nombre: 'Kunde GmbH', nif: 'DE123456789', pais: 'DE', idioma: 'en', moneda: 'USD' }, 'cliente');
  assert.equal(v.ok, true);
  assert.equal(v.datos.idioma, 'en');
  assert.equal(v.datos.moneda, 'USD');
  const es = limpiarFicha({ nombre: 'Taller SL', idioma: 'es', moneda: 'EUR' }, 'cliente');
  assert.equal(es.datos.idioma, undefined);
  assert.equal(es.datos.moneda, undefined);
  assert.equal(limpiarFicha({ nombre: 'X', idioma: 'klingon', moneda: 'XXX' }, 'cliente').datos.idioma, undefined);
  // A un proveedor no se le guarda.
  assert.equal(limpiarFicha({ nombre: 'Proveedor', idioma: 'en' }, 'proveedor').datos.idioma, undefined);
});
