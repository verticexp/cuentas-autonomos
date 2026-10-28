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
  // Sin llegar, o con el esqueleto de carga de Next en su sitio (que no tiene la forma de lo que viene).
  assert.match(vt, /if \(aqui\(\) === desde \|\| document\.querySelector\('\.cargando'\)\) ponerEspera\(tipo, destino, desde\);\s*soltar\(\);\s*\}, 100\);/);
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

test('la hoja de Ajustes se cierra arrastrándola hacia abajo, entera, con la pantalla de detrás', async () => {
  const layout = await leer('app/ajustes/layout.js');
  assert.match(layout, /<ArrastrarAjustes \/>/);
  assert.match(layout, /<HojaAjustes \/>/);
  const arrastre = await leer('components/ArrastrarAjustes.js');
  // Desde cualquier pantalla de dentro se vuelve a la de antes de abrir Ajustes, como el «OK», siguiendo al dedo.
  assert.match(arrastre, /cerrarHoja\(router, vel\)/);
  assert.match(await leer('components/CerrarAjustes.js'), /cerrarHoja\(router\)/);
  const vt = await leer('lib/transicion.js');
  assert.match(vt, /export function cerrarHoja\(router, vel = 0\)/);
  // Sin la copia de la pantalla de detrás (o con «reducir movimiento»), la transición de siempre.
  assert.match(vt, /\{ salirDe\(router, '\/ajustes', '\/mas', 'bajar'\); return; \}/);
  // La copia se queda delante como pantalla de espera hasta que la de verdad está pintada, a su misma altura.
  assert.match(vt, /capa\.className = 'espera-pantalla espera-fondo';/);
  assert.match(vt, /if \(capa\.dataset\.ruta === aqui\(\) && capa\.dataset\.y\) scrollTo\(0, Number\(capa\.dataset\.y\)\);/);
  // Mientras se arrastra, la pantalla de detrás recupera su tamaño; detrás ya no hay un fondo negro pintado a mano.
  assert.match(arrastre, /ponerFondo\(g\.fondo, Math\.min\(1, d \/ g\.alto\)\)/);
  assert.doesNotMatch(arrastre, /document\.body\.style/);
});

test('la hoja de Ajustes se desplaza por dentro, sin asa y con la pantalla de antes detrás', async () => {
  const css = await leer('app/hoja-ajustes.css');
  // El marco se queda quieto bajo la barra de estado y lo de dentro se desplaza: Next no puede subir la página entera
  // (dejaba «‹ Ajustes» bajo la hora y una franja negra abajo).
  assert.match(css, /\.aj-marco, \.hoja-espera \{ position: fixed;[^}]*top: var\(--aj-cima\);[^}]*height: calc\(100dvh - var\(--aj-cima\)\);[^}]*overflow: hidden;/);
  // Con el teclado fuera la hoja no se encoge (se veía cortada, con la pantalla de detrás bajo el teclado): deja debajo un
  // hueco del alto del teclado para subir lo que tapa.
  assert.match(css, /\.aj-desliza \{[^}]*padding-bottom: var\(--teclado, 0px\);/);
  assert.match(await leer('components/HojaAjustes.js'), /html\.style\.setProperty\('--teclado', /);
  assert.doesNotMatch(css, /--vv-alto/);
  assert.match(css, /\.aj-desliza \{ position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain;[^}]*\}/);
  assert.match(css, /html:has\(\.aj-marco\), html:has\(\.aj-marco\) body \{ overflow: hidden;/);
  assert.match(await leer('app/layout.js'), /import '\.\/hoja-ajustes\.css';/); // la espera de la hoja sale antes que los estilos de Ajustes
  assert.doesNotMatch(await leer('components/ListaAjustes.js'), /aj-asa/);
  // Cada ajuste empieza arriba; la lista, donde se dejó.
  assert.match(await leer('components/HojaAjustes.js'), /hoja\.scrollTop = 0;|hoja\.scrollTop = y;/);
  // La copia de la pantalla de antes: al entrar en Ajustes desde fuera, siempre como hoja.
  const vt = await leer('lib/transicion.js');
  assert.match(vt, /tipo = 'hoja';\s*capturarFondo\(\);/);
  const copia = await leer('lib/hojaAjustes.js');
  assert.match(copia, /removeAttribute\('id'\)/);
  assert.match(copia, /classList\?\.remove\('cargando'\)/); // Llegada esperaría a que se fuera un esqueleto copiado
  assert.match(css, /\.aj-fondo \*, \.aj-fondo \*::before, \.aj-fondo \*::after \{ animation: none !important; transition: none !important; view-transition-name: none !important; \}/);
  // La transición «hoja»: la de antes se encoge encima de su copia ya encogida y la hoja sube con su propia capa.
  const dis = await leer('app/diseno.css');
  assert.match(dis, /html\[data-vt=hoja\]::view-transition-old\(root\) \{[^}]*vt-al-fondo; transform-origin: 50% 0; z-index: 1;/);
  assert.match(dis, /html\[data-vt=hoja\]::view-transition-new\(hoja\) \{[^}]*vt-hoja-sube; \}/);
  // De un ajuste a otro solo se mueve lo de dentro de la hoja.
  assert.match(dis, /html\[data-vt-hoja\]\[data-vt\]::view-transition-old\(root\), html\[data-vt-hoja\]\[data-vt\]::view-transition-new\(root\) \{ animation: none;/);
});

test('cerrar la hoja de Ajustes con cambios sin guardar pregunta antes, también arrastrándola', async () => {
  // Los formularios de Ajustes se registran (sin eso, salirDe descartaba lo escrito sin avisar) y las dos salidas pasan por el aviso.
  assert.match(await leer('components/Ajustes.js'), /useCambiosSinGuardar\(cambiado\)/);
  assert.match(await leer('components/CerrarAjustes.js'), /salirSinGuardar\(\(\) => cerrarHoja\(router\)\)/);
  const arrastre = await leer('components/ArrastrarAjustes.js');
  // Si la persona se queda, la hoja (y la pantalla de detrás) vuelven a su sitio.
  assert.match(arrastre, /salirSinGuardar\(\(\) => cerrarHoja\(router, vel\)\)\.then\(\(salio\) => \{ if \(!salio\) devolver\(marco, fondo\); \}\)/);
});

test('al abrir una factura que tarda, la fila se convierte en la cabecera de la espera (no se queda suelta)', async () => {
  assert.match(await leer('components/FilaFactura.js'), /abrirFila\(fila\);/);
  const vt = await leer('lib/transicion.js');
  // La fila suelta los nombres de la transición (los lleva la cabecera de la espera, con su cliente y su total).
  assert.match(vt, /filaAbierta\.style\.removeProperty\('view-transition-name'\);/);
  assert.match(vt, /capa\.querySelector\('\.fh-cliente'\)\.textContent = cliente;/);
  assert.match(vt, /capa\.querySelector\('\.fh-total'\)\.textContent = total;/);
  // Llegada la quita cuando llega lo de verdad, también si antes llegó el esqueleto de carga de Next.
  const llegada = await leer('components/Llegada.js');
  assert.match(llegada, /if \(!document\.querySelector\('\.cargando'\)\) quitarEspera\(\);/);
  assert.match(llegada, /mo\.disconnect\(\);\s*quitarEspera\(\);/);
});

test('la pantalla de espera recoge los toques mientras dura y los suelta al fundirse', async () => {
  const css = await leer('app/diseno.css');
  assert.match(css, /\.espera-pantalla \{[^}]*pointer-events: auto;/);
  assert.match(css, /\.espera-pantalla\.saliendo \{[^}]*pointer-events: none;/);
  // Si la navegación no llega nunca, a los 8 s se quita.
  assert.match(await leer('lib/transicion.js'), /ponerEspera\.t = setTimeout\(quitarEspera, 8000\)/);
});

test('Ajustes sin barra solo en el móvil: en el ordenador sigue la barra del despacho y la lateral', async () => {
  const { SIN_BARRA, CONVERSACION } = await import('../lib/transicion.js');
  for (const ruta of ['/ajustes', '/ajustes/marca', '/ajustes?x=1']) {
    assert.ok(SIN_BARRA.test(ruta), `${ruta} sin barra en el móvil`);
    assert.ok(!CONVERSACION.test(ruta), `${ruta} con barra en el ordenador`);
  }
  for (const ruta of ['/despacho/mensajes/abc', '/tu-gestoria']) assert.ok(SIN_BARRA.test(ruta) && CONVERSACION.test(ruta), ruta);
  assert.ok(!SIN_BARRA.test('/facturas') && !CONVERSACION.test('/facturas'));
  const barra = await leer('components/SelectorCuenta.js');
  assert.match(barra, /\(movil \? SIN_BARRA : CONVERSACION\)\.test\(path\)/);
  assert.match(await leer('lib/transicion.js'), /const sinBarra = \(ruta\) => CONVERSACION\.test\(ruta\) \|\| \(SIN_BARRA\.test\(ruta\) && movil\(\)\);/);
});

test('los clientes recientes del selector son de cada usuario y se borran al cerrar sesión', async () => {
  const selector = await leer('components/SelectorCuenta.js');
  assert.match(selector, /const claveDe = \(usuario\) => `\$\{CLAVE\}:\$\{usuario\}`;/);
  assert.match(selector, /\/api\/logout'\) olvidar\(usuario\)/);
  assert.match(await leer('app/layout.js'), /<BarraDespacho [^>]*usuario=\{u\.id\}/);
});

test('el menú del selector de cuenta se maneja con el teclado y la barra de título compacta ve el contenido que llega', async () => {
  const selector = await leer('components/SelectorCuenta.js');
  assert.match(selector, /ArrowDown/);
  assert.match(selector, /pastilla\.current\?\.focus\(\)/); // Escape devuelve el foco a la pastilla
  assert.match(selector, /addEventListener\('focusin', fuera\)/); // tabular fuera lo cierra
  assert.match(await leer('components/TituloCompacto.js'), /mo\.observe\(document\.body,/);
  assert.match(await leer('app/movil.css'), /@media \(display-mode: standalone\) and \(pointer: coarse\)/);
});
