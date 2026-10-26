// Coherencia de estilos: modo oscuro (colores) y movimiento reducido. Un color fijo nuevo en los CSS de la app o una animación
// que ignore «reducir movimiento» rompen esta prueba; si es a propósito, se añade a las excepciones de abajo con su motivo.
// La web pública (app/(web), components/web) tiene su propia prueba (tests/aurora-web.test.mjs) y aquí no entra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivosCss, declaraciones, leerCss } from './apoyo/estilos.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CSS = archivosCss(RAIZ).map((ruta) => ({ ruta, decl: declaraciones(leerCss(RAIZ, ruta)) }));

// ---------------------------------------------------------------------------------------------------------------------
// 1. Colores fijos
// ---------------------------------------------------------------------------------------------------------------------
// Los colores de la app salen de las variables de app/globals.css (--ink, --muted, --line, --surface, --in, --out, --aviso,
// --info, --marca…), que cambian solas en el modo oscuro. Un color literal (#hex, rgb(), hsl(), white, black) solo vale:
//   · al definir una variable (`--x: #…`), que es de donde sale el color;
//   · en las reglas del tema oscuro (selector `[data-tema="oscuro"]` o `@media (prefers-color-scheme: dark)`);
//   · en sombras (`box-shadow`, `text-shadow`, `filter`), que son negras con transparencia en los dos temas;
//   · como color de texto blanco o negro puro sobre un relleno de color (`color: #fff`);
//   · en una de estas excepciones, con su motivo.
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|(?<![-\w])(?:white|black)(?![-\w])/g;
const TEXTO_PURO = /^(?:#fff|#ffffff|#000|#000000|white|black)(?:\s*!important)?$/i;
const PAPEL = 'Hoja que imita el papel: lleva los colores del tema claro en los dos temas, como la factura impresa';
const EXCEPCIONES = [
  { archivo: 'app/rafaga.css', motivo: 'La cámara de la ráfaga va siempre en negro, como la de iOS' },
  { archivo: 'app/registro-marca.css', motivo: 'Panel de marca del registro: paleta propia, igual en claro y oscuro' },
  { archivo: 'app/cuentas.css', selector: /factura-a4|\.f-|pdf-/, motivo: PAPEL },
  { archivo: 'app/cuentas.css', selector: /^html, body$/, motivo: 'Al imprimir la factura, el fondo es blanco (@media print)' },
  { archivo: 'app/factura.css', selector: /^\.fa\b/, motivo: PAPEL },
  { archivo: 'app/diseno.css', selector: /muestra-factura/, motivo: PAPEL },
  { archivo: 'app/v2.css', selector: /\.ff-/, motivo: PAPEL },
  { archivo: 'app/documento-vista.css', selector: /doc-archivo/, motivo: 'El documento subido (imagen o PDF) se ve sobre blanco, como en el papel' },
  { archivo: 'app/diseno.css', selector: /qr-dos-pasos/, motivo: 'Un QR necesita fondo blanco para leerse' },
  { archivo: 'app/diseno.css', selector: /color-libre/, motivo: 'Rueda de color para elegir la marca' },
  { archivo: 'app/diseno.css', selector: /sino input\[type="checkbox"\]::after/, motivo: 'La bola del interruptor es blanca en los dos temas, como la de iOS' },
  { archivo: 'app/diseno.css', selector: /\.arr-barra|\.logo-marca|\.inicio/, motivo: 'Cabecera y arranque en verde oscuro fijo: el texto crema no cambia con el tema' },
  { archivo: 'app/entrar.css', selector: /login-lema/, motivo: 'Texto sobre el panel verde oscuro fijo de entrar' },
  { archivo: 'app/empresas.css', selector: /emp-chip/, motivo: 'Chip translúcido sobre la cabecera verde oscura fija' },
  { archivo: 'app/hoja.css', selector: /hoja-fondo/, motivo: 'Velo oscuro detrás de las hojas: oscurece en los dos temas' },
  { archivo: 'app/deslizar.css', selector: /desliz-boton\.azul/, motivo: 'Botón azul de deslizar, con texto blanco en los dos temas' },
  { archivo: 'app/deslizar.css', selector: /desliz-boton:focus-visible/, motivo: 'Anillo de foco blanco sobre los botones de color de deslizar' },
  { archivo: 'app/mk.css', selector: /graf-b\.in/, motivo: 'Barra del gráfico: se aclara hacia el blanco desde --in' },
];
const DECL_COLOR = [];
for (const { ruta, decl } of CSS) {
  for (const d of decl) {
    const m = d.valor.match(COLOR);
    if (m) DECL_COLOR.push({ ruta, ...d });
  }
}
const esOscuro = (d) => /data-tema="oscuro"/.test(d.selector) || d.ats.some((a) => /prefers-color-scheme:\s*dark/.test(a));
const permitida = (d) => d.prop.startsWith('--') || esOscuro(d) || /shadow|^filter$|^-webkit-filter$/.test(d.prop) || (d.prop === 'color' && TEXTO_PURO.test(d.valor));

test('los CSS de la app no llevan colores fijos fuera de las variables y de la lista de excepciones', () => {
  const usadas = new Set();
  const sueltos = [];
  for (const d of DECL_COLOR) {
    if (permitida(d)) continue;
    const i = EXCEPCIONES.findIndex((e) => e.archivo === d.ruta && (!e.selector || e.selector.test(d.selector)));
    if (i >= 0) usadas.add(i);
    else sueltos.push(`${d.ruta}:${d.linea}  ${d.selector.slice(0, 70)} { ${d.prop}: ${d.valor.slice(0, 80)} }`);
  }
  assert.deepEqual(sueltos, [], `Color fijo que no cambia en el modo oscuro: usa una variable de app/globals.css (--ink, --muted, --line, --surface, --in, --out, --aviso, --info, --ambar…) o, si es a propósito, añádelo a EXCEPCIONES con su motivo:\n  ${sueltos.join('\n  ')}`);
  const sinUso = EXCEPCIONES.map((e, i) => (usadas.has(i) ? null : `${e.archivo} ${e.selector || ''}`)).filter(Boolean);
  assert.deepEqual(sinUso, [], `Excepciones que ya no se usan (bórralas de EXCEPCIONES):\n  ${sinUso.join('\n  ')}`);
});

test('las variables de color del tema claro tienen su valor en el tema oscuro (o no cambian a propósito)', () => {
  const globals = CSS.find((c) => c.ruta === 'app/globals.css').decl;
  const defs = (pred) => new Set(globals.filter((d) => d.prop.startsWith('--') && pred(d)).map((d) => d.prop));
  const claro = defs((d) => d.selector === ':root' && !d.ats.length);
  const oscuro = defs((d) => esOscuro(d));
  // Estos son iguales en los dos temas: marca fija, medidas y fuentes.
  const IGUALES = new Set(['--font', '--verde', '--crema', '--gris', '--r-s', '--r-m', '--r-l', '--r-pastilla', '--ambar']);
  const sinOscuro = [...claro].filter((v) => !oscuro.has(v) && !IGUALES.has(v));
  assert.deepEqual(sinOscuro, [], `Variables de globals.css sin valor para el modo oscuro: ${sinOscuro.join(', ')}. Defínelas en los dos bloques oscuros o añádelas a IGUALES si no cambian.`);
});

// Los estilos en línea y los colores en el código: solo en estos archivos, que los necesitan fijos (tonos de avatar, barra de
// estado del móvil, iconos de marcas ajenas, imágenes que genera Next, la factura impresa).
const JS_CON_COLORES = new Set([
  'components/Avatar.js', // tonos propios de cada persona
  'components/BarraEstado.js', // color de la barra del sistema (meta theme-color): no admite variables CSS
  'components/BotonesSociales.js', // logotipos de Google y Apple
  'components/GestoAtras.js', // sombra de la página que se desliza
  'components/FacturaA4.js', 'components/AlbaranA4.js', // el papel
  'app/layout.js', 'app/manifest.js', 'app/apple-icon.js', 'app/opengraph-image.js', // metadatos e imágenes de la marca
]);
const COLOR_JS = /['"`]#[0-9a-fA-F]{3,8}['"`;)]|\brgba?\(|\bhsla?\(|[:=] ?['"](?:white|black)['"]/;
function js(dir, salida = []) {
  for (const f of readdirSync(join(RAIZ, dir))) {
    const ruta = join(dir, f);
    if (/^app\/(\(web\)|api)$|^components\/web$|node_modules/.test(ruta)) continue;
    if (statSync(join(RAIZ, ruta)).isDirectory()) js(ruta, salida);
    else if (f.endsWith('.js')) salida.push(ruta);
  }
  return salida;
}
const JS = [...js('app'), ...js('components')];

test('el código de la interfaz no pone colores fijos en estilos en línea', () => {
  const sueltos = [];
  for (const ruta of JS) {
    if (JS_CON_COLORES.has(ruta)) continue;
    readFileSync(join(RAIZ, ruta), 'utf8').split('\n').forEach((l, i) => { if (COLOR_JS.test(l)) sueltos.push(`${ruta}:${i + 1}  ${l.trim().slice(0, 100)}`); });
  }
  assert.deepEqual(sueltos, [], `Color fijo en el código: usa una variable CSS (style={{ color: 'var(--muted)' }}) o añade el archivo a JS_CON_COLORES con su motivo:\n  ${sueltos.join('\n  ')}`);
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. Movimiento reducido
// ---------------------------------------------------------------------------------------------------------------------
// app/globals.css apaga TODA animación y transición con «reducir movimiento» (`*, *::before, *::after`), así que ninguna
// necesita su propio bloque. Esta prueba vigila que ese bloque siga ahí y lo que él no alcanza: lo que se declara con
// !important (que lo vence), los pseudoelementos que `*` no cubre, el scroll suave y el movimiento hecho desde JavaScript.
const enReducido = (d) => d.ats.some((a) => /prefers-reduced-motion:\s*reduce/.test(a));
const esMovimiento = (d) => /^(?:animation(?:-name|-duration)?|transition(?:-duration)?)$/.test(d.prop);
// Un valor «sin movimiento»: none, 0s, 0ms o 0.01s (el truco de la barra, que mantiene el estado final sin animar).
const quieto = (valor) => /^(?:none|0(?:\.0+)?(?:s|ms)?|0?\.0[01]s)(?:\s*!important)?$/i.test(valor.trim());

test('globals.css apaga todas las animaciones y transiciones con prefers-reduced-motion', () => {
  const g = CSS.find((c) => c.ruta === 'app/globals.css').decl;
  const reglas = g.filter((d) => enReducido(d) && /^\*, \*::before, \*::after$/.test(d.selector));
  assert.ok(reglas.some((d) => d.prop === 'animation' && /^none\s*!important$/.test(d.valor)), 'falta «animation: none !important» para todos los elementos');
  assert.ok(reglas.some((d) => d.prop === 'transition' && /^none\s*!important$/.test(d.valor)), 'falta «transition: none !important» para todos los elementos');
});

test('ninguna animación con !important escapa del bloque de movimiento reducido', () => {
  const sueltas = [];
  for (const { ruta, decl } of CSS) {
    for (const d of decl) {
      if (esMovimiento(d) && /!important/.test(d.valor) && !enReducido(d) && !quieto(d.valor)) sueltas.push(`${ruta}:${d.linea}  ${d.selector.slice(0, 60)} { ${d.prop}: ${d.valor} }`);
    }
  }
  assert.deepEqual(sueltas, [], `Estas reglas con !important vencen al bloque global de movimiento reducido; quítales el !important o ponles su versión dentro de @media (prefers-reduced-motion: reduce):\n  ${sueltas.join('\n  ')}`);
});

test('los pseudoelementos que «*» no cubre tienen su versión de movimiento reducido', () => {
  // ::details-content, ::backdrop… no son hijos de ningún elemento: el bloque global no los toca. Las ::view-transition-* van
  // aparte (prueba de más abajo): solo corren cuando lib/transicion.js las pone en marcha, con html[data-vt] y un fundido.
  const FUERA = /::(?:details-content|backdrop|placeholder|selection|marker|file-selector-button|slider-\w+)/;
  const sueltas = [];
  for (const { ruta, decl } of CSS) {
    const reducidos = decl.filter(enReducido).map((d) => d.selector).join(' | ');
    for (const d of decl) {
      if (!esMovimiento(d) || enReducido(d) || quieto(d.valor)) continue;
      const m = d.selector.match(FUERA);
      if (!m) continue;
      // Vale que el mismo archivo tenga, en su bloque reducido, una regla para ese mismo pseudoelemento.
      if (!reducidos.includes(m[0].replace(/\(.*$/, ''))) sueltas.push(`${ruta}:${d.linea}  ${d.selector.slice(0, 70)} { ${d.prop}: ${d.valor.slice(0, 50)} }`);
    }
  }
  assert.deepEqual(sueltas, [], `Animación sobre un pseudoelemento sin su regla en @media (prefers-reduced-motion: reduce) del mismo archivo:\n  ${sueltas.join('\n  ')}`);
});

test('el scroll suave solo se activa si no se pide reducir el movimiento', () => {
  const sueltos = [];
  for (const { ruta, decl } of CSS) {
    for (const d of decl) {
      if (d.prop === 'scroll-behavior' && /smooth/.test(d.valor) && !d.ats.some((a) => /prefers-reduced-motion:\s*no-preference/.test(a))) sueltos.push(`${ruta}:${d.linea}  ${d.selector}`);
    }
  }
  assert.deepEqual(sueltos, [], `scroll-behavior: smooth fuera de @media (prefers-reduced-motion: no-preference):\n  ${sueltos.join('\n  ')}`);
});

test('el movimiento hecho desde JavaScript (scroll suave, Web Animations) respeta reducir movimiento', () => {
  const sueltos = [];
  for (const ruta of JS) {
    const txt = readFileSync(join(RAIZ, ruta), 'utf8');
    const respeta = /prefers-reduced-motion/.test(txt);
    txt.split('\n').forEach((l, i) => {
      if (/behavior:\s*['"]smooth['"]/.test(l) && !/prefers-reduced-motion|reducido/.test(l)) sueltos.push(`${ruta}:${i + 1}  scroll suave sin comprobar reducir movimiento`);
      if (/\.animate\(/.test(l) && !respeta) sueltos.push(`${ruta}:${i + 1}  .animate() en un archivo que no mira prefers-reduced-motion`);
    });
  }
  assert.deepEqual(sueltos, [], `Movimiento que no respeta «reducir movimiento» (usa matchMedia('(prefers-reduced-motion: reduce)') como components/Banco.js o lib/transicion.js):\n  ${sueltos.join('\n  ')}`);
});

test('las transiciones entre pantallas tienen su fundido para movimiento reducido', () => {
  const pulido = CSS.find((c) => c.ruta === 'app/pulido.css').decl.filter(enReducido);
  assert.ok(pulido.some((d) => /view-transition-new\(root\)/.test(d.selector)), 'app/pulido.css debe dejar solo un fundido en ::view-transition-new(root) con movimiento reducido');
  assert.ok(pulido.some((d) => /view-transition-group\(\*\)/.test(d.selector) && /0s/.test(d.valor)), 'app/pulido.css debe quitar el movimiento de ::view-transition-group(*) con movimiento reducido');
  const transicion = readFileSync(join(RAIZ, 'lib/transicion.js'), 'utf8');
  assert.match(transicion, /prefers-reduced-motion: reduce[\s\S]{0,200}fundido/, 'lib/transicion.js debe cambiar a «fundido» con movimiento reducido');
});

test('los CSS analizados son los de la app, no la web pública', () => {
  const rutas = CSS.map((c) => c.ruta);
  assert.ok(rutas.includes('app/globals.css') && rutas.includes('app/pulido.css') && rutas.includes('components/Vacio.module.css'));
  assert.ok(!rutas.some((r) => /web|\(web\)/.test(relative(RAIZ, join(RAIZ, r)).split('/')[1] || '')));
});
