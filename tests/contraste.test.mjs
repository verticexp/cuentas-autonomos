// Contraste de las fichas de color de app/globals.css en los dos temas (WCAG 2.x): el texto a ≥ 4,5:1 sobre las superficies
// en las que se pinta, los gráficos a ≥ 3:1 y el texto secundario lo bastante cerca de 5:1 para distinguirse del principal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (archivo) => readFileSync(new URL(`../app/${archivo}.css`, import.meta.url), 'utf8');
const globals = leer('globals'), diseno = leer('diseno');

const fichasDe = (bloque) => Object.fromEntries([...bloque.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, k, v]) => [k, v.trim()]));
const bloque = (css, selector) => {
  const m = css.match(new RegExp(`^${selector.replace(/[[\]()".*+?^$|\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm'));
  assert.ok(m, `falta ${selector}`);
  return fichasDe(m[1]);
};
const claro = bloque(globals, ':root');
const TEMAS = {
  claro: { ...claro, marca: '#0F1F1B', sobre: '#fff', cabecera: claro.verde }, // lib/marca.js COLOR_BASE; .inicio usa --verde
  oscuro: {
    ...claro, ...bloque(globals, ':root[data-tema="oscuro"]'),
    ...bloque(diseno, ':root[data-tema="oscuro"] body[data-marca="base"]'),
    cabecera: bloque(diseno, ':root[data-tema="oscuro"] .inicio')['fondo-logo'],
  },
};

// Color en [r, g, b] de 0 a 255; lo que tiene transparencia se compone sobre `fondo`.
function rgb(valor, fondo) {
  const v = valor.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  assert.ok(m, `color sin analizar: ${v}`);
  const a = m[4] === undefined ? 1 : Number(m[4]);
  const base = a < 1 ? rgb(fondo) : [0, 0, 0];
  return [1, 2, 3].map((i, j) => Number(m[i]) * a + base[j] * (1 - a));
}
// color-mix(in srgb, a p, b)
const mezcla = (a, b, p) => a.map((x, i) => x * p + b[i] * (1 - p));
const luz = ([r, g, b]) => {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contraste = (a, b) => { const [x, y] = [luz(a), luz(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const [tema, f] of Object.entries(TEMAS)) {
  const c = (nombre, fondo = f.surface) => rgb(f[nombre] ?? nombre, fondo);
  const fondos = ['surface', 'paper', 'surface-2'];
  const exige = (texto, fondo, minimo, que) => {
    const r = contraste(texto, fondo);
    assert.ok(r >= minimo, `${tema}: ${que} a ${r.toFixed(2)}:1 (mínimo ${minimo}:1)`);
  };

  test(`contraste (${tema}): texto principal, secundario y de color sobre las superficies`, () => {
    for (const fondo of fondos) {
      for (const texto of ['ink', 'muted', 'in', 'out', 'hacienda', 'aviso', 'info', 'marca']) {
        exige(c(texto, f[fondo]), c(fondo), 4.5, `--${texto} sobre --${fondo}`);
      }
    }
  });

  test(`contraste (${tema}): el texto secundario se distingue del principal`, () => {
    const muted = contraste(c('muted'), c('surface'));
    assert.ok(muted >= 4.5 && muted <= 6, `${tema}: --muted sobre --surface a ${muted.toFixed(2)}:1 (entre 4,5 y 6)`);
    assert.ok(contraste(c('ink'), c('surface')) / muted >= 2.5, `${tema}: --ink y --muted demasiado parecidos`);
  });

  // Los chips, los filtros y las etiquetas de los campos de factura pintan texto sobre --relleno (translúcido): sobre --paper sale
  // más oscuro que --surface, y ahí --muted se quedaba en 4,4:1 (lo midió axe en el navegador, 26-10-2026).
  test(`contraste (${tema}): texto principal y secundario sobre --relleno`, () => {
    for (const fondo of ['surface', 'paper']) {
      const relleno = c('relleno', f[fondo]);
      for (const texto of ['ink', 'muted']) exige(c(texto), relleno, 4.5, `--${texto} sobre --relleno sobre --${fondo}`);
    }
  });

  // Las filas de las hojas (+ «Crear», filtros) llevan --relleno encima de --surface-2: ahí --muted solo llegaba a 3,9:1 en oscuro.
  test(`contraste (${tema}): letra pequeña de las filas de las hojas (app/hoja.css)`, () => {
    const relleno = c('relleno', f['surface-2']);
    exige(mezcla(c('muted'), c('ink'), 0.7), relleno, 4.5, '.hoja-fila small sobre --relleno sobre --surface-2');
  });

  test(`contraste (${tema}): estado «Fuera de plazo» (--out con un 15 % de --ink sobre su tinte al 10 %)`, () => {
    for (const fondo of ['surface', 'paper']) {
      const base = c(fondo), tinta = c('out', base);
      exige(mezcla(tinta, c('ink'), 0.85), mezcla(tinta, base, 0.1), 4.5, `.pres-fuera sobre --${fondo}`);
    }
  });

  test(`contraste (${tema}): avisos en rojo sobre su tinte (--out al 12 %, texto con un 15 % de --ink)`, () => {
    for (const fondo of ['surface', 'paper']) {
      const base = c(fondo), tinta = c('out', base);
      exige(mezcla(tinta, c('ink'), 0.85), mezcla(tinta, base, 0.12), 4.5, `.teso-alerta sobre --${fondo}`);
    }
  });

  test(`contraste (${tema}): etiquetas de estado (texto con un 15 % de --ink sobre su fondo al 13 %)`, () => {
    for (const color of ['in', 'hacienda', 'out']) {
      for (const fondo of ['surface', 'paper']) {
        const base = c(fondo), tinta = c(color, f[fondo]);
        exige(mezcla(tinta, c('ink'), 0.85), mezcla(tinta, base, 0.13), 4.5, `etiqueta --${color} sobre --${fondo}`);
      }
    }
  });

  test(`contraste (${tema}): rellenos con texto encima`, () => {
    exige([255, 255, 255], c('in-boton'), 4.5, 'blanco sobre --in-boton');
    exige([255, 255, 255], c('out-boton'), 4.5, 'blanco sobre --out-boton');
    exige(c('sobre'), c('marca'), 4.5, '--sobre sobre --marca');
    exige(c('ico', f.menta), c('menta'), 4.5, '--ico sobre --menta');
    exige(c('crema'), c('cabecera'), 4.5, 'crema sobre la cabecera del resumen');
    exige(rgb('rgba(250, 250, 248, 0.68)', f.cabecera), c('cabecera'), 4.5, 'subtítulo de la cabecera del resumen');
  });

  test(`contraste (${tema}): gráficos y barras a ≥ 3:1`, () => {
    for (const color of ['in', 'out', 'hacienda', 'irpf', 'aviso', 'info']) exige(c(color), c('surface'), 3, `--${color} como gráfico`);
  });

  test(`contraste (${tema}): lo que flota encima no es más oscuro que lo de debajo`, () => {
    assert.ok(luz(c('surface-2')) >= luz(c('surface')), `${tema}: --surface-2 más oscura que --surface`);
    if (tema === 'oscuro') {
      assert.ok(luz(c('surface')) > luz(c('paper')), 'oscuro: --surface debe ser más clara que --paper');
      assert.ok(luz(c('surface-2')) > luz(c('cabecera')), 'oscuro: el beneficio debe ser más claro que la cabecera sobre la que flota');
    }
  });
}

test('contraste: el bloque oscuro automático y el forzado tienen las mismas fichas', () => {
  const m = globals.match(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-tema="claro"\]\)\s*\{([^}]*)\}/);
  assert.ok(m);
  assert.deepEqual(fichasDe(m[1]), bloque(globals, ':root[data-tema="oscuro"]'));
});

// Auditoría 23-10-2026: los campos se veían sin borde (1,1:1); --borde-campo da ≥ 3:1 frente a lo que lo rodea (WCAG 1.4.11).
for (const [tema, f] of Object.entries(TEMAS)) {
  test(`contraste (${tema}): el borde de los campos se distingue del fondo y del propio campo`, () => {
    for (const fondo of ['surface', 'paper']) {
      const borde = rgb(f['borde-campo'], f[fondo]);
      const r = contraste(borde, rgb(f[fondo]));
      assert.ok(r >= 3, `${tema}: --borde-campo sobre --${fondo} a ${r.toFixed(2)}:1`);
    }
  });
}
