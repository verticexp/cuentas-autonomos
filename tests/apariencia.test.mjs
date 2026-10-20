import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const automatico = ':root:not([data-tema="claro"])';
const oscuro = ':root[data-tema="oscuro"]';
const archivos = ['globals', 'diseno', 'mk', 'remesas', 'v2'];

// Estos bloques solo contienen reglas planas; se rechaza cualquier contenido sin analizar.
function reglas(texto) {
  const resultado = [];
  const resto = texto.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectores, declaraciones) => {
    for (const selector of selectores.split(',')) {
      resultado.push([selector.trim(), declaraciones.trim().replace(/\s+/g, ' ')]);
    }
    return '';
  });
  assert.equal(resto.trim(), '', 'todas las reglas deben quedar analizadas');
  return resultado;
}

for (const archivo of archivos) {
  test(`apariencia: ${archivo}.css limita el automático y duplica cada regla en oscuro`, () => {
    const css = readFileSync(new URL(`../app/${archivo}.css`, import.meta.url), 'utf8');
    const bloques = [...css.matchAll(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)];
    assert.ok(bloques.length > 0, 'debe comprobar al menos un bloque oscuro');
    assert.equal(bloques.length, (css.match(/prefers-color-scheme:\s*dark/g) || []).length);
    const fuera = css.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, '');
    const forzadas = reglas([...fuera.matchAll(/(:root\[data-tema="oscuro"\][^{}]*)\{([^{}]*)\}/g)]
      .map(m => `${m[1]}{${m[2]}}`).join('\n'));
    const esperadas = [];
    for (const bloque of bloques) {
      for (const [selector, declaraciones] of reglas(bloque[1])) {
        assert.ok(selector === automatico || selector.startsWith(`${automatico} `), selector);
        esperadas.push([selector.replace(automatico, oscuro), declaraciones]);
      }
    }
    assert.deepEqual(forzadas, esperadas, 'mismos selectores, declaraciones y orden fuera del media');
  });
}

test('apariencia: el esquema por defecto sigue siendo claro', () => {
  const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /^:root\s*\{[^}]*color-scheme:\s*light\s*;/);
});
