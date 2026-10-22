import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

// «Atrás» en el móvil (los recorridos de verdad están en tests/e2e/atras-movil.mjs): lo que no debe volver a romperse.
const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), 'utf8');
// mobile/ no se sube a Vercel (.vercelignore), y su compilación también pasa estas pruebas.
const sinApp = !existsSync(new URL('../mobile/ios/App/App/FisquoViewController.swift', import.meta.url)) && 'sin mobile/ (despliegue de Vercel)';

test('la app de iOS vuelve atrás deslizando desde el borde y la web la avisa con el mismo nombre', { skip: sinApp }, async () => {
  const swift = await leer('mobile/ios/App/App/FisquoViewController.swift');
  const web = await leer('components/GestoAtras.js');
  assert.match(swift, /allowsBackForwardNavigationGestures = true/);
  const nombre = swift.match(/userContentController\.add\(\w+, name: "(\w+)"\)/)?.[1];
  assert.equal(nombre, 'gestoAtras');
  assert.match(web, new RegExp(`messageHandlers\\?\\.${nombre}\\b`));
  // Bloquear con una hoja abierta sin apagar y encender el gesto de WebKit (el primer deslizamiento se perdía).
  assert.doesNotMatch(swift, /allowsBackForwardNavigationGestures = (false|activo|!)/);
});

test('el gesto y el cierre de hojas con atrás están en todas las pantallas', async () => {
  assert.match(await leer('app/layout.js'), /<GestoAtras \/>/);
});

test('tras aprobar, descartar, crear o borrar, «atrás» no vuelve a lo ya hecho', async () => {
  const gasto = await leer('components/FormGasto.js');
  const aprobar = gasto.slice(gasto.indexOf("accion: 'aprobar'"), gasto.indexOf('} else if (gasto)'));
  assert.doesNotMatch(aprobar, /router\.push\(/, 'la siguiente por revisar sustituye a la aprobada');
  assert.match(aprobar, /router\.replace\(`\/gastos\/bandeja\//);
  const bandeja = await leer('components/AccionesBandeja.js');
  assert.match(bandeja, /descartar'\) volverA\(router, '\/gastos\?ver=revisar', 'atras', true\)/);
  const ficha = await leer('components/FichaCliente.js');
  assert.match(ficha, /if \(eliminar\) \{ volverA\(router, lista, 'atras', true\)/);
  assert.match(ficha, /if \(!id\) router\.replace\(/);
});

test('volver y luego refrescar va en un solo paso: el refresco no puede adelantarse a la vuelta', async () => {
  const { readdir } = await import('node:fs/promises');
  for (const nombre of await readdir(new URL('../components/', import.meta.url))) {
    if (!nombre.endsWith('.js')) continue;
    const fuente = await leer(`components/${nombre}`);
    assert.doesNotMatch(fuente, /volverA\([^)]*\);\s*router\.refresh\(\)/, nombre);
  }
});

test('el diálogo de confirmación se cancela si se sale de la pantalla', async () => {
  const confirmar = await leer('components/Confirmar.js');
  assert.match(confirmar, /addEventListener\('popstate', salir\)/);
  assert.match(confirmar, /removeEventListener\('popstate', salir\)/);
});
