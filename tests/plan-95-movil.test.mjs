// Plan para llegar a 9,5 (26-10-2026): sin conexión.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLICO } from '../lib/rutasPublicas.js';

test('sin red, el service worker enseña la página guardada «Sin conexión» y nunca guarda pantallas con datos', () => {
  const sw = readFileSync(new URL('../app/sw/route.js', import.meta.url), 'utf8');
  assert.match(sw, /caches\.open\(OFFLINE\)\.then\(\(c\) => c\.add\(new Request\('\/sin-conexion'/);
  assert.match(sw, /e\.request\.mode !== 'navigate'/);
  assert.match(sw, /fetch\(e\.request\)\.catch\(/);
  // Solo se guarda la página de sin conexión (y los archivos compartidos, aparte).
  assert.doesNotMatch(sw, /cache\.put\(e\.request/);
  assert.equal(PUBLICO.test('/sin-conexion'), true);
  assert.equal(PUBLICO.test('/sin-conexionx'), false);
});
