import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// La confirmación «hecho» (components/Hecho.js) cubre la pantalla con position: fixed. «hecho» a secas ya es la clase de los
// pasos completados (components/ProgresoAlta.js), de los movimientos conciliados (components/Banco.js) y de los pasos del
// despacho: con un `.hecho` global, todos salían pegados arriba a lo ancho (la franja oscura de la bienvenida).
test('app/hecho.css solo usa clases hecho-…', () => {
  const css = readFileSync(new URL('../app/hecho.css', import.meta.url), 'utf8');
  const sueltas = [...css.matchAll(/\.hecho(?![\w-])/g)];
  assert.equal(sueltas.length, 0, 'un selector .hecho global choca con otras pantallas');
  assert.match(readFileSync(new URL('../components/Hecho.js', import.meta.url), 'utf8'), /className="hecho-capa"/);
});
