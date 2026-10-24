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

test('en la app de iOS solo se vuelve deslizando desde pantallas con «‹ Atrás», y nunca hacia delante', { skip: sinApp }, async () => {
  const swift = await leer('mobile/ios/App/App/FisquoViewController.swift');
  const web = await leer('components/GestoAtras.js');
  // WebKit también pone deslizar desde el borde derecho para ir adelante: se apaga.
  assert.match(swift, /edges\.contains\(\.right\) \{ borde\.isEnabled = false \}/);
  // El tapón decide al empezar, sin encenderlo ni apagarlo (eso perdía el primer deslizamiento).
  assert.match(swift, /func gestureRecognizerShouldBegin[^}]*bloqueado/);
  assert.doesNotMatch(swift, /tapon\.isEnabled = /);
  // Una página nueva empieza sin bloqueo antes de que corra su JavaScript, no al terminar de cargar (llegaba tarde).
  assert.match(swift, /alEmpezarPagina = \{[^}]*bloquear\(false\)/);
  assert.match(await leer('mobile/ios/App/App/DelegadoWeb.swift'), /didCommit[\s\S]*alEmpezarPagina\?\(\)/);
  // La web dice que hay gesto solo sin capas encima y con «‹ Atrás» (o un paso anterior): las pestañas no lo tienen.
  assert.match(web, /const libre = abiertas\.length === 0 && destino\(\) !== null;/);
  assert.doesNotMatch(web, /RAICES/);
});

test('la vibración pasa siempre por lib/haptica.js (en iOS navigator.vibrate no existe)', async () => {
  const { readdir } = await import('node:fs/promises');
  for (const nombre of await readdir(new URL('../components/', import.meta.url))) {
    if (!nombre.endsWith('.js')) continue;
    assert.doesNotMatch(await leer(`components/${nombre}`), /navigator\.vibrate|setAttribute\('switch'/, nombre);
  }
  const haptica = await leer('lib/haptica.js');
  assert.match(haptica, /messageHandlers\?\.haptica/);
  if (!sinApp) assert.match(await leer('mobile/ios/App/App/FisquoViewController.swift'), /add\(Haptica\(\), name: "haptica"\)/);
});

test('tocar la pestaña en la que se está sube arriba o vuelve a ella, como en iOS', async () => {
  const barra = await leer('components/TabBar.js');
  assert.match(barra, /if \(h === path\) \{ subirArriba\(\); return; \}/);
  assert.match(barra, /if \(movil && h === activo\) \{ volverHasta\(router, h\); return; \}/);
  const despacho = await leer('components/NavDespacho.js');
  assert.match(despacho, /subirArriba\(\)/);
  assert.match(despacho, /volverHasta\(router, t\.href\)/);
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

test('barra de título compacta: en todas las pantallas del móvil, sin tapar lo fijo de arriba', async () => {
  assert.match(await leer('app/layout.js'), /<TituloCompacto \/>/);
  const barra = await leer('components/TituloCompacto.js');
  // «‹ Atrás» de la barra pulsa el de la página: mismo destino y mismo «¿Salir sin guardar?».
  assert.match(barra, /partes\.current\.volver\?\.click\(\)/);
  const css = await leer('app/titulo-compacto.css');
  // Solo en el móvil; el resumen de las listas y el total de Caja bajan con ella.
  assert.match(css, /^\.titulo-compacto \{ display: none; \}/m);
  assert.match(css, /html\[data-titulo-compacto\] \.resumen-fijo, html\[data-titulo-compacto\] \.pagina \.caja-total \{ top: calc\(env\(safe-area-inset-top, 0px\) \+ 44px\); \}/);
});

test('transiciones como en iOS: sin esperar al servidor, pestañas sin deslizar, modales que bajan al salir', async () => {
  const vt = await leer('lib/transicion.js');
  // En el móvil la pantalla nueva entra a los 100 ms como mucho: si no ha llegado, con una pantalla de espera.
  assert.match(vt, /if \(aqui\(\) === desde\) ponerEspera\(tipo\);\s*soltar\(\);\s*\}, 100\);/);
  assert.match(await leer('components/Llegada.js'), /quitarEspera\(\)/);
  // «Atrás» deshace como se entró: el formulario que subió baja; la hoja se cierra.
  assert.match(vt, /const SALIDA = \{ subir: 'cerrar', hoja: 'bajar' \};/);
  assert.match(vt, /if \(tipo === 'atras'\) tipo = SALIDA\[historia\.vias\[historia\.idx\]\] \|\| tipo;/);
  assert.match(await leer('app/mas/page.js'), /<Ir href="\/ajustes" tipo="hoja"/);
  const css = await leer('app/diseno.css');
  for (const t of ['subir', 'cerrar', 'hoja', 'bajar']) assert.match(css, new RegExp(`html\\[data-vt=${t}\\]::view-transition-new\\(root\\)`), t);
  // La barra de abajo no desliza la pantalla: fundido corto encima de la de antes.
  assert.match(css, /html\[data-vt\^=tab-\]::view-transition-old\(root\) \{ animation: none; mix-blend-mode: normal; \}/);
  assert.doesNotMatch(css, /vt-tab-desde-der; \}\nhtml\[data-vt=tab/);
  // Nada entra desenfocado: eso es de web, no de app.
  assert.doesNotMatch(css, /@keyframes (paso|hero) \{[^}]*blur/);
});

test('la barra de título compacta no cambia estado en un efecto de diseño (error 185 de React en WebKit)', async () => {
  // Dentro de una transición de vista, el setState de un useLayoutEffect encadenaba repintados en WebKit hasta que React
  // cortaba y salía «No se ha podido cargar Fisquo» al cambiar de pestaña (24-10-2026).
  assert.doesNotMatch(await leer('components/TituloCompacto.js'), /useLayoutEffect\s*\(|import \{[^}]*useLayoutEffect/);
});
