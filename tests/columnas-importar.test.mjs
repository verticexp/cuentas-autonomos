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

test('clientes que ya existen: solo se rellenan los datos vacíos, emparejando por NIF o por nombre', () => {
  const ya = [
    { id: 'BODAS PÉREZ SL', nombre: 'Bodas Pérez SL', nif: 'B12345678', direccion: '', ciudad: '' },
    { id: 'JUAN GARCÍA', nombre: 'Juan García', nif: '', email: 'viejo@juan.es', direccion: '', ciudad: '' },
    { id: 'COMPLETO', nombre: 'Completo', nif: 'X1', email: 'a@b.es', direccion: 'C/ 1', ciudad: 'Vic' },
  ];
  const filas = [['Nombre', 'NIF', 'Email', 'Dirección', 'Población'],
    ['BODAS PEREZ', 'B-12345678', 'info@bodas.es', 'C/ Mayor 3', 'Barcelona'],
    ['juan garcía', '12345678Z', 'nuevo@juan.es', '', ''],
    ['Completo', 'X1', 'otro@b.es', 'C/ 2', 'Reus'],
    ['Nueva SL', 'B87654321', '', '', '']];
  const p = previa('clientes', filas, ya);
  assert.deepEqual(p.items.map((x) => x.estado), ['completar', 'completar', 'duplicado', 'nuevo']);
  assert.deepEqual(p.items[0].completa, { email: 'info@bodas.es', direccion: 'C/ Mayor 3', ciudad: 'Barcelona' });
  assert.equal(p.items[0].id, 'BODAS PÉREZ SL');
  assert.deepEqual(p.items[1].completa, { nif: '12345678Z' });
  assert.equal(p.completar, 2);
});
