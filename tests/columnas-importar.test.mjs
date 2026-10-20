// Importar con columnas elegidas a mano o sugeridas por la IA (sin llamar a la IA: solo lo que se hace con su respuesta).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapaManual, previa } from '../lib/importar.js';
import { columnasSinUsar, limpiarSugerencia, pregunta } from '../lib/columnasIA.js';

const RARO = [['Listado 2025'], ['Titular', 'Doc.', 'Mail', 'Teléfono'], ['Bodas Pérez SL', 'B12345678', 'INFO@bodas.es', '600'], ['Juan García', '12345678Z', '', '']];

test('sin título reconocible para el nombre: error con lo necesario para elegir a mano', () => {
  const p = previa('clientes', RARO);
  assert.match(p.error, /nombre/);
  assert.deepEqual(p.campos.slice(0, 2), ['nombre', 'nif']);
  assert.equal(p.fila, 1);
  assert.deepEqual(p.cabecera, ['Titular', 'Doc.', 'Mail', 'Teléfono']);
  assert.deepEqual(p.ejemplos[1], ['B12345678', '12345678Z']);
});

test('con las columnas elegidas a mano se lee todo', () => {
  const m = mapaManual('clientes', RARO, { fila: 1, mapa: { nombre: 0, nif: 1, email: 2 } });
  const p = previa('clientes', RARO, [], m);
  assert.equal(p.nuevos, 2);
  assert.equal(p.items[0].datos.email, 'info@bodas.es');
  assert.equal(p.items[1].datos.nif, '12345678Z');
  assert.equal(p.items[0].n, 3);
});

test('mapaManual descarta campos inventados, columnas fuera de rango y columnas repetidas', () => {
  const m = mapaManual('clientes', RARO, { fila: 1, mapa: { nombre: 0, nif: 0, email: 9, hackeo: 1, ciudad: '3' } });
  assert.deepEqual(m, { fila: 1, mapa: { nombre: 0, ciudad: 3 } });
  assert.equal(mapaManual('clientes', RARO, { fila: 50, mapa: {} }), null);
  assert.equal(mapaManual('clientes', RARO, null), null);
});

test('la sugerencia de la IA solo rellena huecos: no pisa lo detectado ni repite columnas', () => {
  const cab = ['Nombre', 'Doc.', 'Mail', 'Tel'];
  const mapa = { nombre: 0 };
  assert.deepEqual(columnasSinUsar(cab, mapa), [1, 2, 3]);
  const s = limpiarSugerencia('clientes', { nombre: 1, nif: 1, email: 1, ciudad: 2, inventado: 3, cp: 7 }, cab, mapa);
  assert.deepEqual(s, { nif: 1, ciudad: 2 });
  assert.deepEqual(limpiarSugerencia('clientes', 'basura', cab, mapa), {});
});

test('a la IA solo van los títulos y ejemplos de las columnas sin reconocer', () => {
  const q = pregunta('clientes', ['Nombre', 'Doc.'], [['Ana'], ['B12345678']], { nombre: 0 });
  assert.match(q, /1: «Doc\.» \(ejemplos: «B12345678»\)/);
  assert.doesNotMatch(q, /Ana/);
});
