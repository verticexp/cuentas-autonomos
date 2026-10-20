import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { GLOSARIO } from '../lib/glosario.js';

async function archivos(directorio) {
  const entradas = await readdir(directorio, { withFileTypes: true });
  return (await Promise.all(entradas.filter((e) => e.name !== '(web)' && e.name !== 'web').map((e) => {
    const ruta = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, directorio);
    return e.isDirectory() ? archivos(ruta) : /\.[jt]sx?$/.test(e.name) ? [ruta] : [];
  }))).flat();
}

test('todos los términos usados en la app existen en GLOSARIO', async () => {
  const fuentes = (await Promise.all(['app/', 'components/'].map((d) => archivos(new URL(`../${d}`, import.meta.url))))).flat();
  let usos = 0;
  for (const ruta of fuentes) {
    const codigo = await readFile(ruta, 'utf8');
    for (const [, id] of codigo.matchAll(/<Termino\s+id=["']([^"']+)["']/g)) {
      usos++;
      assert.ok(Object.hasOwn(GLOSARIO, id), `${ruta.pathname}: falta el término ${id}`);
    }
  }
  assert.ok(usos > 0, 'la comprobación debe encontrar términos en las pantallas');
});
