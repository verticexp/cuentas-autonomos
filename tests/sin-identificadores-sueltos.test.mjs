// Ningún archivo de la app usa un nombre que no existe (una función que se quitó o se renombró y quedó llamada en otro punto
// del archivo): el compilador de Next no lo ve y la pantalla se rompía al abrirla («ReferenceError: diaMes is not defined»,
// 26-10-2026, que se coló al unificar el formato de fechas). Usa el analizador y el recorrido de Babel que lleva Next.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const requerir = createRequire(import.meta.url);
const parser = requerir('next/dist/compiled/babel/parser.js');
const recorrido = requerir('next/dist/compiled/babel/traverse.js');
const traverse = recorrido.default || recorrido;

// Lo que el navegador o Node ponen a mano en el ámbito global y el código usa sin declararlo.
const GLOBALES = new Set(`window document navigator location history localStorage sessionStorage fetch console setTimeout clearTimeout setInterval
clearInterval requestAnimationFrame cancelAnimationFrame Promise Math Date JSON Object Array String Number Boolean Set Map WeakMap WeakSet Symbol Error
RegExp URL URLSearchParams FormData Blob File FileReader Intl Infinity NaN undefined parseInt parseFloat isNaN isFinite encodeURIComponent
decodeURIComponent encodeURI decodeURI process globalThis AbortController AbortSignal Response Request Headers crypto performance matchMedia
getComputedStyle alert confirm prompt atob btoa BigInt Uint8Array ArrayBuffer TextEncoder TextDecoder structuredClone queueMicrotask Buffer Image
Audio Notification ResizeObserver IntersectionObserver MutationObserver CSS innerWidth innerHeight scrollTo scrollY scrollX visualViewport screen
self Event CustomEvent KeyboardEvent MouseEvent HTMLElement Node DOMParser XMLSerializer Reflect Proxy eval require module exports React
Float32Array Float64Array Int8Array Int16Array Int32Array Uint16Array Uint32Array Uint8ClampedArray DataView WebAssembly BroadcastChannel Worker
PerformanceObserver PointerEvent TouchEvent DOMException AggregateError WeakRef getSelection requestIdleCallback cancelIdleCallback devicePixelRatio
DOMMatrixReadOnly PublicKeyCredential createImageBitmap ClipboardItem ReadableStream open close print focus blur stop addEventListener removeEventListener scrollBy`.split(/\s+/));

function archivos(dir, salida = []) {
  for (const f of readdirSync(join(RAIZ, dir))) {
    const ruta = join(dir, f);
    if (/^app\/(\(web\)|api)$|^components\/web$/.test(ruta)) continue;
    if (statSync(join(RAIZ, ruta)).isDirectory()) archivos(ruta, salida);
    else if (f.endsWith('.js')) salida.push(ruta);
  }
  return salida;
}

test('ningún archivo de app, components y lib llama a algo que no existe', () => {
  const mal = [];
  for (const ruta of ['app', 'components', 'lib'].flatMap((d) => archivos(d))) {
    let ast;
    try { ast = parser.parse(readFileSync(join(RAIZ, ruta), 'utf8'), { sourceType: 'module', plugins: ['jsx'] }); } catch (e) { mal.push(`${ruta}: no se puede analizar (${e.message.slice(0, 60)})`); continue; }
    const faltan = new Set();
    traverse(ast, { Program(p) { for (const nombre of Object.keys(p.scope.globals)) if (!GLOBALES.has(nombre)) faltan.add(nombre); } });
    if (faltan.size) mal.push(`${ruta}: ${[...faltan].join(', ')}`);
  }
  assert.deepEqual(mal, [], `Nombres usados sin declarar ni importar:\n  ${mal.join('\n  ')}`);
});
