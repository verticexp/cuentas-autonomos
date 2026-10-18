import test from 'node:test';
import assert from 'node:assert/strict';
import { vistaImportacion, FILAS_POR_PAGINA } from '../lib/vistaImportacion.js';
import { previa } from '../lib/importar.js';

test('la vista real incluye un error posterior a la fila 100 y permite encontrarlo', () => {
  const filas = [['Nombre', 'NIF'], ...Array.from({ length: 120 }, (_, i) => [`Cliente ${i}`, '']), ['', '']];
  // Una fila con NIF pero sin nombre no es un cliente válido.
  filas[121] = ['', '12345678Z'];
  const resultado = previa('clientes', filas, []);
  assert.ok(!resultado.error, resultado.error);
  const error = resultado.items.find((x) => x.estado === 'error' && x.n > 100);
  assert.ok(error);
  const errores = vistaImportacion(resultado.items, 'error');
  assert.ok(errores.items.some((x) => x.n === error.n));
  const todas = [];
  for (let pagina = 1; pagina <= vistaImportacion(resultado.items).paginas; pagina++) {
    const vista = vistaImportacion(resultado.items, 'todos', pagina);
    assert.ok(vista.items.length <= FILAS_POR_PAGINA);
    todas.push(...vista.items);
  }
  assert.deepEqual(todas, resultado.items);
});

test('filtra todos los estados antes de paginar y cuenta el total filtrado', () => {
  const estados = ['nuevo', 'duplicado', 'error', 'omitida', 'agrupada'];
  const items = Array.from({ length: 551 }, (_, i) => ({ n: i + 2, estado: estados[i % estados.length] }));
  const copia = structuredClone(items);
  for (const estado of estados) {
    const esperados = items.filter((x) => x.estado === estado);
    const vista = vistaImportacion(items, estado, 2);
    assert.equal(vista.total, esperados.length);
    assert.equal(vista.desde, 51);
    assert.equal(vista.hasta, 100);
    assert.deepEqual(vista.items, esperados.slice(50, 100));
  }
  assert.deepEqual(items, copia);
});

test('límites, última página y filtro vacío', () => {
  const items = Array.from({ length: 101 }, (_, n) => ({ n, estado: 'nuevo' }));
  const ultima = vistaImportacion(items, 'todos', 999);
  assert.equal(ultima.pagina, 3);
  assert.equal(ultima.desde, 101);
  assert.equal(ultima.hasta, 101);
  assert.equal(ultima.items.length, 1);
  for (const pagina of [0, -1, NaN, 1.5]) assert.equal(vistaImportacion(items, 'todos', pagina).pagina, 1);
  const vacia = vistaImportacion(items, 'error', 3);
  assert.deepEqual([vacia.total, vacia.desde, vacia.hasta, vacia.pagina, vacia.paginas], [0, 0, 0, 1, 1]);
  assert.deepEqual(vacia.items, []);
});
