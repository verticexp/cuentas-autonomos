// Escala de letra de la app (comentario de :root en app/globals.css): ningún tamaño suelto como 14,7 px o 0,85 rem.
// Fuera de la escala solo las hojas que imitan el papel (factura.css y la factura A4 de cuentas.css, en pt) y la
// maqueta decorativa del panel del alta (registro-marca.css, 10 px).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const ESCALA = new Set([11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34, 40]);
const LIBRES = { 'factura.css': () => true, 'cuentas.css': (v) => /pt$/.test(v), 'registro-marca.css': (v) => v === '10px' };
const dir = new URL('../app/', import.meta.url);
const hojas = [...readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]),
  ...readdirSync(new URL('../components/', import.meta.url)).filter((f) => f.endsWith('.module.css')).map((f) => [f, readFileSync(new URL(`../components/${f}`, import.meta.url), 'utf8')])];

test('los tamaños de letra de la app están en la escala', () => {
  const fuera = [];
  for (const [archivo, css] of hojas) {
    for (const [, valor] of css.matchAll(/font-size:\s*([^;}!]+?)\s*(?:!important)?\s*[;}]/g)) {
      if (/^(clamp|var|calc|min|max)\(|em$|%$|^inherit$|^smaller$|^larger$/.test(valor)) continue;
      if (LIBRES[archivo]?.(valor)) continue;
      const px = /^(\d+(?:\.\d+)?)px$/.exec(valor);
      if (!px || !ESCALA.has(Number(px[1]))) fuera.push(`${archivo}: ${valor}`);
    }
  }
  assert.deepEqual(fuera, []);
});
