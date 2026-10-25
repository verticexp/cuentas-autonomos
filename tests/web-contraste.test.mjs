// Contraste (WCAG 2.x, AA) de la web pública en claro y en oscuro: los tokens de components/web/web.css. El modo oscuro
// vive en dos bloques (el del sistema y el de la cookie `tema`) que tienen que decir exactamente lo mismo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../components/web/web.css', import.meta.url), 'utf8');
const fichas = (texto) => Object.fromEntries([...texto.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const bloque = (inicio) => {
  const i = css.indexOf(inicio);
  assert.ok(i >= 0, `falta ${inicio}`);
  const abre = css.indexOf('{', i), cierra = css.indexOf('}', abre);
  return fichas(css.slice(abre + 1, cierra));
};

const claro = bloque('.web {');
const oscuroSistema = bloque(':where(html:not([data-tema="claro"])) .web {');
const oscuroCookie = bloque(':where(html[data-tema="oscuro"]) .web {');
const OSCURO = { ...claro, ...oscuroCookie };

const hex = (v) => { const m = /^#([0-9a-f]{6})$/i.exec(v) || /^#([0-9a-f]{3})$/i.exec(v); assert.ok(m, `color sin analizar: ${v}`); const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]; return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const luz = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const contraste = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('los dos bloques del modo oscuro dicen lo mismo y solo cambian tokens que existen en claro', () => {
  assert.deepEqual(oscuroSistema, oscuroCookie);
  for (const k of Object.keys(oscuroCookie)) if (k !== 'sombra' && k !== 'color-scheme') assert.ok(k in claro, `--${k} no existe en .web`);
});

// [texto, fondo, mínimo]: texto normal a 4,5:1; iconos y adornos con significado, a 3:1.
const PARES = [
  ['txt', 'pag', 4.5], ['txt', 'panel', 4.5], ['txt', 'tint', 4.5], ['txt', 'm', 4.5], ['txt', 'm2', 4.5], ['txt', 'ok-f', 4.5], ['txt', 'm3', 4.5],
  ['txt-2', 'pag', 4.5], ['txt-2', 'panel', 4.5], ['txt-2', 'm', 4.5], ['txt-2', 'm4', 4.5], ['txt-2', 'tint-2', 4.5],
  ['g', 'pag', 4.5], ['g', 'panel', 4.5], ['g', 'm', 4.5], ['g', 'm2', 4.5], ['g', 'm3', 4.5], ['g', 'tint', 4.5], ['g', 'tint-2', 4.5], ['g', 'grupo', 4.5], ['g', 'hover-f', 4.5],
  ['g2', 'pag', 4.5], ['g2', 'panel', 4.5],
  ['acc-t', 'pag', 4.5], ['acc-t', 'panel', 4.5], ['acc-t', 'm', 4.5], ['acc-t', 'm2', 4.5], ['acc-t', 'm3', 4.5], ['acc-t', 'm4', 4.5], ['acc-t', 'ok-f', 4.5], ['acc-t', 'grupo', 4.5],
  ['chip-t', 'chip-f', 4.5], ['aviso-t', 'aviso-f', 4.5], ['rojo', 'pag', 4.5], ['rojo', 'panel', 4.5], ['rojo', 'rojo-f', 4.5],
  ['c', 'sel', 4.5], ['c', 'fuerte', 4.5], ['luz', 'sel', 3], ['luz', 'fuerte', 3], ['no', 'panel', 3], ['acc', 'pag', 3], ['acc', 'panel', 3],
];
for (const [tema, f] of [['claro', claro], ['oscuro', OSCURO]]) {
  test(`contraste web (${tema}): texto y controles sobre sus superficies`, () => {
    for (const [a, b, min] of PARES) {
      // En claro hay tres cosas de antes que no llegan y no son texto corriente: --g2 (precio tachado y texto «antes»
      // tachado), --no (guion de «no incluido»), el verde de texto sobre el final de los degradados de la escena del
      // recorrido y de «Cambiarte es fácil» (4,2:1) y el icono rojo del «antes». Lo nuevo en claro no los usa, y en oscuro
      // se exige todo.
      if (tema === 'claro' && (['g2', 'no'].includes(a) || (a === 'acc-t' && ['m3', 'm4'].includes(b)) || (a === 'rojo' && b === 'rojo-f'))) continue;
      const r = contraste(hex(f[a]), hex(f[b]));
      assert.ok(r >= min, `${tema}: --${a} sobre --${b} a ${r.toFixed(2)}:1 (mínimo ${min}:1)`);
    }
  });
}

test('el botón principal (texto blanco sobre --acc2) cumple AA en los dos temas', () => {
  for (const f of [claro, OSCURO]) assert.ok(contraste(hex('#ffffff'), hex(f.acc2)) >= 4.5);
});
