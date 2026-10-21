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

test('lista de clientes con un resumen de facturación debajo: ni los títulos ni el total ni la otra tabla son clientes', () => {
  const filas = [['Nombre', 'NIF', 'Email'], ['Alfa SL', 'B11111111', 'a@alfa.es'], ['Beta SL', 'B22222222', ''], [],
    ['Resumen de facturación 2025'], ['Razón social', 'Facturado'], ['Alfa SL', 1000], ['Gamma SL', 500], ['Total', 1500]];
  const p = previa('clientes', filas, []);
  assert.deepEqual(p.items.filter((x) => x.estado === 'nuevo').map((x) => x.datos.nombre), ['Alfa SL', 'Beta SL']);
  assert.equal(p.items.filter((x) => x.estado === 'omitida').length, 5);
  assert.equal(p.items.find((x) => x.datos?.nombre === 'Alfa SL').n, 2);
});

test('sin fila vacía entre medias, la otra tabla empieza en sus títulos; los totales sueltos y los títulos repetidos se saltan', () => {
  const p = previa('clientes', [['Cliente', 'CIF'], ['Alfa SL', 'B1'], ['Cliente', 'CIF'], ['Total Energies SL', 'A2'], ['TOTAL:', ''], ['Razón social', 'Ventas'], ['Gamma SL', '300']], []);
  assert.deepEqual(p.items.map((x) => x.estado), ['nuevo', 'omitida', 'nuevo', 'omitida', 'omitida', 'omitida']);
  assert.equal(p.items[2].datos.nombre, 'Total Energies SL');
});

test('facturas y gastos: un concepto que coincide con un título no corta la tabla (lleva importes)', () => {
  const p = previa('gastos', [['Fecha', 'Concepto', 'Base', '% IVA'], ['01/02/2026', 'Concepto', 100, 21], ['02/02/2026', 'Luz', 50, 21], ['', 'Total', 150, '']], []);
  assert.deepEqual(p.items.map((x) => x.estado), ['nuevo', 'nuevo', 'omitida']);
});

test('revisión a mano: quitar filas, recuperar una saltada y los repetidos se recalculan', () => {
  const filas = [['Nombre', 'NIF'], ['Alfa SL', 'B1'], ['Alfa SL', 'B1'], ['Beta SL', 'B2'], ['Total', '']];
  const p = previa('clientes', filas, []);
  assert.deepEqual(p.items.map((x) => x.estado), ['nuevo', 'duplicado', 'nuevo', 'omitida']);
  assert.deepEqual(p.items[0].original, ['Alfa SL', 'B1']);
  // Quitar la primera Alfa: la segunda pasa a ser la nueva. Recuperar «Total» (si de verdad fuera un cliente).
  const r = previa('clientes', filas, [], null, { quitar: [2], incluir: [5] });
  assert.deepEqual(r.items.map((x) => x.estado), ['quitada', 'nuevo', 'nuevo', 'nuevo']);
  assert.equal(r.items[3].datos.nombre, 'Total');
  assert.equal(r.items[3].incluida, true);
  assert.equal(r.quitadas, 1);
  assert.equal(r.nuevos, 3);
});
