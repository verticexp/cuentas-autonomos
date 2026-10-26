// Un nombre para cada cosa (docs/vocabulario.md): la navegación manda y las demás pantallas la repiten tal cual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const leer = (ruta) => readFileSync(join(RAIZ, ruta), 'utf8');

// Los nombres de la navegación: la barra de pestañas y el menú «Más» (components/TabBar.js, components/secciones.js).
const NAV = new Map();
for (const m of leer('components/secciones.js').matchAll(/\{ href: '([^']+)'[^{}]*?nombre: '([^']+)'/g)) NAV.set(m[1], m[2]);
for (const m of leer('components/TabBar.js').matchAll(/\{ href: '([^']+)', (?:permiso: '[^']+', )?nombre: '([^']+)'/g)) NAV.set(m[1], m[2]);
const ASISTENTE = /ASISTENTE = \{ href: '([^']+)', nombre: '([^']+)'/.exec(leer('components/secciones.js'));
NAV.set(ASISTENTE[1], ASISTENTE[2]);
// Cómo las llama un autónomo (lib/modulos.js PARA_AUTONOMO): «Libros registro» en vez de «Contabilidad».
const PARA_AUTONOMO = new Set(['/contabilidad']);

const pares = (texto, patron) => new Map([...texto.matchAll(patron)].map((m) => [m[1], m[2]]));
const VOLVER = pares(leer('components/Volver.js'), /'(\/[^']*)': '([^']+)'/g);
const NO_EXISTE = pares(leer('app/not-found.js'), /\['(\/[^']+)', '([^']+)'\]/g);

test('la navegación se lee bien (hay más de 20 nombres)', () => {
  assert.ok(NAV.size > 20, `solo ${NAV.size}`);
  assert.equal(NAV.get('/modelos'), 'Impuestos');
  assert.equal(NAV.get('/nominas'), 'Equipo y nóminas');
});

test('el botón «‹ Volver» llama a cada pantalla como la navegación', () => {
  const mal = [];
  for (const [ruta, nombre] of VOLVER) {
    if (NAV.has(ruta) && NAV.get(ruta) !== nombre && !PARA_AUTONOMO.has(ruta)) mal.push(`${ruta}: «${nombre}» en Volver.js y «${NAV.get(ruta)}» en la navegación`);
  }
  assert.deepEqual(mal, []);
});

test('la página «no existe» llama a cada sección como la navegación', () => {
  const mal = [];
  for (const [ruta, nombre] of NO_EXISTE) {
    if (NAV.has(ruta) && NAV.get(ruta) !== nombre && !PARA_AUTONOMO.has(ruta)) mal.push(`${ruta}: «${nombre}» en app/not-found.js y «${NAV.get(ruta)}» en la navegación`);
  }
  assert.deepEqual(mal, []);
});

test('el título de cada pantalla (pestaña del navegador) es su nombre en la navegación', () => {
  const mal = [];
  for (const [ruta, nombre] of NAV) {
    if (ruta === '/' || PARA_AUTONOMO.has(ruta)) continue;
    const pagina = `app${ruta}/page.js`;
    if (!existsSync(join(RAIZ, pagina))) continue;
    const titulo = /export const metadata = \{ title: '([^']+)'/.exec(leer(pagina))?.[1];
    if (titulo && titulo !== nombre) mal.push(`${ruta}: título «${titulo}» y «${nombre}» en la navegación`);
  }
  assert.deepEqual(mal, []);
});

test('Ajustes: cada fila lleva el mismo nombre que la pantalla a la que lleva', () => {
  const titulos = /const TITULOS = \{([^}]+)\}/.exec(leer('app/ajustes/[seccion]/page.js'))[1];
  const delTitulo = new Map([...titulos.matchAll(/(\w+): ('([^']+)'|"([^"]+)")/g)].map((m) => [m[1], m[3] || m[4]]));
  const mal = [];
  for (const m of leer('components/ListaAjustes.js').matchAll(/<Fila href="\/ajustes\/([a-z-]+)"[^>]*? titulo="([^"]+)"/g)) {
    if (delTitulo.has(m[1]) && delTitulo.get(m[1]) !== m[2]) mal.push(`/ajustes/${m[1]}: fila «${m[2]}» y pantalla «${delTitulo.get(m[1])}»`);
  }
  assert.deepEqual(mal, []);
});

// Palabras que ya no se usan para esas cosas en lo que ve el usuario (cada una con el nombre que sí vale).
const PROHIBIDAS = [
  [/fecha del evento|evento el \$\{|después del evento|por su fecha de operación/i, '«Fecha de la operación» (docs/vocabulario.md)'],
  [/Configuración del negocio/, '«Actividades e impuestos» (la fila de Ajustes que lleva ahí)'],
  [/Hacienda por trimestre/, '«Impuestos por trimestre»'],
  [/Abonos de proveedores/, '«Rectificativas de proveedores»'],
  [/Ir al inicio/, '«Ir al Resumen»'],
  [/Ir a Nóminas/, '«Ir a Equipo y nóminas»'],
  [/Estimado con lo apuntado hasta hoy/, '«Previsión del trimestre, con lo apuntado hasta hoy»'],
  [/previsión del trimestre entero/, '«previsión del trimestre»'],
  [/Pagada con tarjeta o Bizum/, '«Cobrada con tarjeta o Bizum» (lo ve quien cobra)'],
  [/>Salir<\/button>/, '«Cerrar sesión»'],
];
function fuentes(dir, salida = []) {
  for (const f of readdirSync(join(RAIZ, dir))) {
    const ruta = join(dir, f);
    if (/^app\/(\(web\)|api)$|^components\/web$|node_modules/.test(ruta)) continue;
    if (statSync(join(RAIZ, ruta)).isDirectory()) fuentes(ruta, salida);
    else if (f.endsWith('.js')) salida.push(ruta);
  }
  return salida;
}

test('los textos visibles no vuelven a usar los nombres descartados', () => {
  const mal = [];
  for (const ruta of [...fuentes('app'), ...fuentes('components'), 'lib/tesoreria.js', 'lib/formato.js', 'lib/paquete.js']) {
    leer(ruta).split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      for (const [patron, mejor] of PROHIBIDAS) if (patron.test(l)) mal.push(`${ruta}:${i + 1}  ${patron.source} → usa ${mejor}`);
    });
  }
  assert.deepEqual(mal, []);
});
