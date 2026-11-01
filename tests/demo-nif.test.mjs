import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { nifEspanolValido } from '../lib/validacion.js';

// Los NIF de la demo llevaban el número de orden en el sitio del carácter de control («B00000003»), así que la ficha
// de cualquier cliente de ejemplo se guardaba mal: el producto rechazaba el NIF, con razón. Con el control bien
// calculado la demo se puede editar entera. Esto vigila que no vuelva a colarse uno inventado.
const SOLO_NIF_ES = /^[0-9A-Z]{9}$/;

const literales = () => {
  const dir = new URL('../scripts/', import.meta.url);
  const encontrados = [];
  for (const archivo of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
    const texto = readFileSync(new URL(archivo, dir), 'utf8');
    texto.split('\n').forEach((linea, i) => {
      for (const [, valor] of linea.matchAll(/\b(?:nif|proveedorNif|nifProveedor)\s*:\s*'([^']*)'/g)) {
        // Los identificadores de fuera (DE…, FR…) no se juzgan con el control español.
        if (SOLO_NIF_ES.test(valor)) encontrados.push({ valor, donde: `scripts/${archivo}:${i + 1}` });
      }
    });
  }
  return encontrados;
};

test('los NIF españoles de la demo son válidos', () => {
  const todos = literales();
  assert.ok(todos.length > 20, 'El escáner tiene que seguir encontrando los NIF de la demo');
  const malos = todos.filter(({ valor }) => !nifEspanolValido(valor));
  assert.deepEqual(malos, [], `NIF con el carácter de control mal: ${malos.map((m) => `${m.valor} (${m.donde})`).join(', ')}`);
});
