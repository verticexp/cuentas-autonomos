// «Atrás» en el móvil, con recorridos reales de UI contra una app y un Redis simulados locales. Nunca contra producción.
// BASE=http://localhost:13017 UPSTASH=http://127.0.0.1:18079 PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs CHROME_PATH=/ruta/chrome node tests/e2e/atras-movil.mjs
// Cubre: el gesto de volver de la web guardada en el iPhone (components/GestoAtras.js, toques de verdad por CDP), el atrás
// de Android con una hoja abierta (CloseWatcher), los pasos del registro en el historial, el diálogo de confirmación al
// salir de la pantalla, adónde lleva «atrás» tras crear o borrar una ficha y tras aprobar o descartar en «Por revisar», y
// «¿Salir sin guardar?» en los formularios con cambios (lib/sinGuardar.js).
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import '../apoyo/cargador.mjs';
const BASE = process.env.BASE || 'http://localhost:13017';
const UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:18079';
for (const url of [BASE, UPSTASH]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Solo localhost y Redis simulado');
process.env.KV_REST_API_URL = UPSTASH;
process.env.KV_REST_API_TOKEN = 'prueba-local';
const { crearUsuario, crearSesion, conEmpresa } = await import('../../lib/auth.js');
const { guardar } = await import('../../lib/redis.js');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const sufijo = randomBytes(5).toString('hex');
const r = await crearUsuario({
  nombre: 'Prueba atrás', email: `atras-${sufijo}@fisquo-local.test`, password: randomBytes(24).toString('hex'), empresaNombre: 'Prueba atrás',
  empresaDatos: {
    pendiente: false, fiscal: { tipo: 'autonomo' },
    emisor: { nombre: 'Estudio Atrás', nif: '12345678Z', direccion: 'Calle de Prueba 12', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona' },
    actividades: [{ id: 'diseno', nombre: 'Diseño', serie: '', ivaPct: 21, irpfPct: 15 }],
  },
});
if (r.error) throw new Error(r.error);
const token = await crearSesion(r.usuario.id);
const u = await conEmpresa(r.usuario);
const hoy = new Date().toISOString().slice(0, 10);
const porRevisar = async (n, desde = 0) => {
  const ids = [];
  for (let i = desde; i < desde + n; i++) {
    const id = `b${randomBytes(8).toString('hex')}`;
    await guardar(u, 'bandeja', { id, recibido: new Date(Date.now() - i * 1000).toISOString(), origen: 'subida', nombre: `factura-${i}.pdf`, estado: 'revisar',
      propuesta: { proveedor: `Proveedor ${i} ${sufijo}`, proveedorNif: '', concepto: `Material ${i}`, base: 10 + i, ivaPct: 21, irpfPct: 0, fecha: hoy, cuadra: true, avisos: [] } });
    ids.push(id);
  }
  return ids;
};

// Toques de verdad (CDP): el gesto escucha touchstart/touchmove/touchend como en un iPhone.
async function deslizar(p, { desde = [6, 420], hasta = [280, 424], pasos = 10, ms = 16 } = {}) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: desde[0], y: desde[1] }] });
  for (let i = 1; i <= pasos; i++) {
    await p.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: desde[0] + ((hasta[0] - desde[0]) * i) / pasos, y: desde[1] + ((hasta[1] - desde[1]) * i) / pasos }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const ruta = (p) => { const x = new URL(p.url()); return x.pathname + x.search; };
const sinRastro = (p) => p.evaluate(() => !document.querySelector('body > main')?.style.transform && !document.documentElement.dataset.vt);

const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  const movil = async ({ standalone = false, sesion = true, viewport = { width: 390, height: 844 } } = {}) => {
    const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    if (sesion) await ctx.addCookies([{ name: 't', value: token, url: BASE }]);
    await ctx.addInitScript((standalone) => {
      if (location.origin === 'null') return; // about:blank, al volver más atrás de la primera pantalla
      sessionStorage.setItem('fisquo-arranque', '1');
      sessionStorage.setItem('fisquo-abierta', '1');
      // La web guardada en la pantalla de inicio del iPhone: allí no hay gesto de volver del sistema.
      if (standalone) Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
      // Android: se guardan los CloseWatcher para simular el botón atrás con requestClose().
      if (window.CloseWatcher) {
        const C = window.CloseWatcher;
        window.__vigilantes = [];
        window.CloseWatcher = class extends C {
          constructor(...a) { super(...a); window.__vigilantes.push(this); }
          destroy() { this.__destruido = true; return super.destroy(); }
        };
      }
    }, standalone);
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', (e) => errores.push(e.message));
    return { ctx, p, errores };
  };

  // 1. iPhone, web en la pantalla de inicio: deslizar desde el borde izquierdo.
  {
    const { ctx, p, errores } = await movil({ standalone: true });
    await p.goto(`${BASE}/ajustes`);
    await p.getByRole('link', { name: /Datos de la empresa/ }).click();
    await p.waitForURL('**/ajustes/facturacion');
    await p.locator('a.volver').waitFor();
    await deslizar(p);
    await p.waitForURL((x) => x.pathname === '/ajustes');
    await p.waitForTimeout(500);
    assert(await sinRastro(p), 'la pantalla vuelve sin desplazamiento ni transición a medias');
    // Abierta directamente (nada detrás): el gesto lleva a la pantalla de su «‹ Atrás» y la sustituye.
    await deslizar(p);
    await p.waitForURL((x) => x.pathname === '/mas');
    // En una pestaña principal no hay gesto, como en iOS.
    await p.waitForTimeout(400);
    await deslizar(p);
    await p.waitForTimeout(900);
    assert.equal(ruta(p), '/mas');
    // Desplazar en vertical desde el borde o arrastrar poco y despacio no vuelve.
    await p.goto(`${BASE}/clientes`);
    await p.locator('a.volver').waitFor();
    await deslizar(p, { desde: [6, 700], hasta: [10, 300] });
    await deslizar(p, { hasta: [60, 421], pasos: 6, ms: 60 });
    await p.waitForTimeout(900);
    assert.equal(ruta(p), '/clientes');
    assert(await sinRastro(p));
    // Con una hoja abierta (el «+»), el gesto no saca de la pantalla (en Clientes: Ajustes es una hoja sin barra de pestañas).
    await p.locator('.tabbar .mas').click();
    await p.locator('.hoja-panel').waitFor();
    await deslizar(p);
    await p.waitForTimeout(900);
    assert.equal(ruta(p), '/clientes');
    assert.equal(await p.locator('.hoja-panel').count(), 1);
    assert.deepEqual(errores, []);
    console.log('iPhone (pantalla de inicio): el gesto vuelve, sustituye si no hay nada detrás y respeta pestañas, scroll y hojas OK');
    await ctx.close();
  }

  // 2. Android: el botón atrás con una hoja abierta la cierra y no sale de la pantalla.
  {
    const { ctx, p, errores } = await movil({ viewport: { width: 412, height: 915 } });
    await p.goto(`${BASE}/clientes`);
    await p.locator('.tabbar .mas').click();
    await p.locator('.hoja-panel').waitFor();
    await p.waitForFunction(() => window.__vigilantes?.length > 0);
    await p.evaluate(() => window.__vigilantes.at(-1).requestClose());
    await p.locator('.hoja-panel').waitFor({ state: 'detached' });
    assert.equal(ruta(p), '/clientes');
    // Cerrada con su botón, su vigilante se va: el siguiente atrás ya sale de la pantalla.
    await p.locator('.tabbar .mas').click();
    await p.locator('.hoja-panel').waitFor();
    await p.waitForFunction(() => window.__vigilantes.length > 1);
    await p.locator('.hoja-cerrar').click();
    await p.locator('.hoja-panel').waitFor({ state: 'detached' });
    await p.waitForFunction(() => window.__vigilantes.at(-1).__destruido === true);
    assert.deepEqual(errores, []);
    console.log('Android: atrás cierra la hoja del «+» sin salir de la pantalla OK');
    await ctx.close();
  }

  // 3. Registro: cada paso en el historial. Atrás (sistema o gesto) vuelve al paso anterior, con lo escrito.
  for (const standalone of [false, true]) {
    const { ctx, p, errores } = await movil({ standalone, sesion: false });
    await p.route('**/api/registro/email', (x) => x.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
    await p.goto(`${BASE}/registro`);
    await p.getByRole('heading', { name: 'Crea tu cuenta' }).waitFor();
    await p.locator('form.registro[aria-busy="false"]').waitFor();
    await p.getByLabel('Tu nombre', { exact: true }).fill('Atrás Prueba');
    await p.getByLabel('Email', { exact: true }).fill(`registro-${sufijo}@fisquo-local.test`);
    await p.getByLabel('Contraseña', { exact: true }).fill('Luna!Bosque72Rio');
    await p.getByRole('button', { name: 'Continuar', exact: true }).click();
    await p.getByRole('radio', { name: 'Autónomo', exact: false }).waitFor();
    if (standalone) await deslizar(p); else await p.goBack();
    await p.getByRole('heading', { name: 'Crea tu cuenta' }).waitFor();
    assert.equal(await p.getByLabel('Tu nombre', { exact: true }).inputValue(), 'Atrás Prueba');
    assert.equal(ruta(p), '/registro');
    // Y adelante otra vez, sin repetir el paso: «Continuar» sigue llevando al segundo.
    await p.getByRole('button', { name: 'Continuar', exact: true }).click();
    await p.getByRole('radio', { name: 'Autónomo', exact: false }).waitFor();
    assert.deepEqual(errores, []);
    console.log(`Registro (${standalone ? 'gesto del iPhone' : 'atrás del sistema'}): vuelve al paso anterior con lo escrito OK`);
    await ctx.close();
  }

  // 4. Fichas: crear sustituye el formulario; salir con el diálogo abierto lo cancela; borrar vuelve a la lista.
  {
    const { ctx, p, errores } = await movil();
    await p.goto(`${BASE}/clientes`);
    await p.getByRole('link', { name: /Nuevo cliente|Crear cliente/ }).first().click();
    await p.waitForURL('**/clientes/nuevo');
    await p.getByLabel('Nombre', { exact: true }).fill(`Cliente Atrás ${sufijo}`);
    await p.getByRole('button', { name: 'Crear ficha' }).click();
    await p.waitForURL((x) => /^\/clientes\/(?!nuevo)/.test(x.pathname));
    const ficha = ruta(p);
    await p.goBack();
    await p.waitForURL((x) => x.pathname === '/clientes');
    await p.goForward();
    await p.waitForURL((x) => x.pathname + x.search === ficha);
    await p.getByRole('button', { name: 'Borrar ficha' }).click();
    await p.getByRole('alertdialog').waitFor();
    await p.goBack();
    await p.waitForURL((x) => x.pathname === '/clientes');
    await p.getByRole('alertdialog').waitFor({ state: 'detached' });
    assert.equal(await p.evaluate(() => [...document.body.children].some((el) => el.inert)), false, 'nada queda inerte tras cancelar el diálogo');
    await p.goForward();
    await p.waitForURL((x) => x.pathname + x.search === ficha);
    await p.getByRole('button', { name: 'Borrar ficha' }).click();
    await p.getByRole('alertdialog').getByRole('button', { name: 'Borrar ficha' }).click();
    await p.waitForURL((x) => x.pathname === '/clientes');
    // La lista se pide de nuevo al volver: la ficha borrada desaparece (antes seguía saliendo).
    await p.waitForFunction((n) => !document.body.innerText.includes(n), `Cliente Atrás ${sufijo}`, { timeout: 5000 });
    await p.goBack();
    await p.waitForTimeout(800);
    assert.notEqual(ruta(p), ficha, 'atrás no vuelve a la ficha borrada');
    assert.deepEqual(errores, []);
    console.log('Fichas: crear sustituye el formulario, el diálogo se cancela al salir y borrar vuelve a la lista OK');
    await ctx.close();
  }

  // 5. Por revisar: aprobar lleva a la siguiente en su lugar; la última y descartar vuelven a la lista.
  {
    const [a, b, c] = await porRevisar(3);
    const { ctx, p, errores } = await movil();
    await p.goto(`${BASE}/gastos?ver=revisar`);
    await p.locator(`a[href="/gastos/bandeja/${a}"]`).first().click();
    await p.waitForURL(`**/gastos/bandeja/${a}`);
    await p.getByRole('button', { name: 'Aprobar y guardar el gasto' }).click();
    await p.waitForURL((x) => x.pathname.startsWith('/gastos/bandeja/') && !x.pathname.endsWith(a));
    const siguiente = new URL(p.url()).pathname.split('/').at(-1);
    assert([b, c].includes(siguiente));
    await p.goBack();
    await p.waitForURL((x) => x.pathname === '/gastos' && x.searchParams.get('ver') === 'revisar');
    // Descartar: de vuelta a la lista, sin la descartada detrás.
    await p.locator(`a[href="/gastos/bandeja/${siguiente}"]`).first().click();
    await p.waitForURL(`**/gastos/bandeja/${siguiente}`);
    await p.getByRole('button', { name: 'Descartar', exact: true }).click();
    await p.getByRole('alertdialog').getByRole('button', { name: 'Descartar' }).click();
    await p.waitForURL((x) => x.pathname === '/gastos' && x.searchParams.get('ver') === 'revisar');
    // La última: aprobarla vuelve a la lista (atrás de verdad, no otra lista encima).
    const ultima = siguiente === b ? c : b;
    const posicionLista = await p.evaluate(() => history.state?.__idx);
    await p.locator(`a[href="/gastos/bandeja/${ultima}"]`).first().click();
    await p.waitForURL(`**/gastos/bandeja/${ultima}`);
    await p.getByRole('button', { name: 'Aprobar y guardar el gasto' }).click();
    await p.waitForURL((x) => x.pathname === '/gastos' && x.searchParams.get('ver') === 'revisar');
    assert.equal(await p.evaluate(() => history.state?.__idx), posicionLista, 'vuelve a la lista de antes, no apila otra encima');
    await p.waitForFunction(() => !document.querySelector('a[href^="/gastos/bandeja/"]'), null, { timeout: 5000 }); // ya no queda nada por revisar
    assert.deepEqual(errores, []);
    console.log('Por revisar: aprobar pasa a la siguiente en su lugar y la última y descartar vuelven a la lista OK');
    await ctx.close();
  }

  // 6. «¿Salir sin guardar?» (lib/sinGuardar.js): con cambios, el atrás del sistema, «‹ Atrás» y el gesto del iPhone preguntan
  // antes de salir; seguir editando no deja rastro en el historial y, tras guardar, ni se pregunta ni «atrás» vuelve al formulario.
  const pregunta = (p) => p.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
  const conAviso = (p) => p.waitForFunction(() => Boolean(history.state?.__sinGuardar));
  const concepto = (p) => p.getByPlaceholder('Ej.: Reparación de la instalación (2 horas)');
  // Como una persona: un toque en el campo antes de escribir (fill solo no cuenta como gesto para el navegador).
  const escribir = async (campo, texto) => { await campo.click(); await campo.fill(texto); };
  const facturaNueva = async (p) => {
    await p.locator('.tabbar .mas').click();
    await p.locator('.hoja-panel a[href="/facturas/nueva"]').click();
    await p.waitForURL('**/facturas/nueva');
    await concepto(p).waitFor();
  };
  {
    const { ctx, p, errores } = await movil();
    await p.goto(`${BASE}/facturas`);
    await facturaNueva(p);
    // Sin cambios, atrás sale sin preguntar.
    await p.goBack();
    await p.waitForURL((x) => x.pathname === '/facturas');
    await facturaNueva(p);
    await escribir(concepto(p), 'Diseño de logotipo');
    await conAviso(p);
    const largo = await p.evaluate(() => history.length);
    // Más abajo en el formulario: al preguntar, la pantalla no salta a donde estaba al apilar la entrada.
    await p.getByRole('button', { name: /Detalles: IRPF/ }).click();
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(200);
    const altura = await p.evaluate(() => Math.round(scrollY));
    assert(altura > 100);
    await p.goBack();
    await pregunta(p).waitFor();
    assert.equal(ruta(p), '/facturas/nueva');
    await p.waitForTimeout(300);
    assert.equal(await p.evaluate(() => Math.round(scrollY)), altura, 'la pantalla se queda donde estaba al preguntar');
    await pregunta(p).getByRole('button', { name: 'Seguir editando' }).click();
    await pregunta(p).waitFor({ state: 'detached' });
    await conAviso(p);
    assert.equal(await concepto(p).inputValue(), 'Diseño de logotipo');
    assert.equal(await p.evaluate(() => history.length), largo, 'seguir editando no apila otra entrada');
    assert.equal(await p.evaluate(() => Math.round(scrollY)), altura);
    // Android: el botón atrás con la pregunta abierta la cierra, y se sigue editando. (El vigilante de la pregunta se pone
    // en el fotograma siguiente a que aparezca: components/GestoAtras.js repasa una vez por fotograma.)
    const vigilantes = await p.evaluate(() => window.__vigilantes.length);
    await p.goBack();
    await pregunta(p).waitFor();
    await p.waitForFunction((n) => window.__vigilantes.length > n && !window.__vigilantes.at(-1).__destruido, vigilantes, { timeout: 5000 });
    await p.evaluate(() => window.__vigilantes.at(-1).requestClose());
    await pregunta(p).waitFor({ state: 'detached' });
    await conAviso(p);
    assert.equal(ruta(p), '/facturas/nueva');
    // Salir sin guardar: a la lista, de la que se venía.
    await p.goBack();
    await pregunta(p).getByRole('button', { name: 'Salir sin guardar' }).click();
    await p.waitForURL((x) => x.pathname === '/facturas');
    assert.deepEqual(errores, []);
    console.log('Salir sin guardar (atrás del sistema y de Android): pregunta, seguir editando conserva lo escrito y salir vuelve OK');
    await ctx.close();
  }
  {
    const { ctx, p, errores } = await movil();
    await p.goto(`${BASE}/facturas`);
    await facturaNueva(p);
    await escribir(concepto(p), 'Mantenimiento web');
    await conAviso(p);
    // Abierto con «‹ Atrás» desde abajo: la página no sube (el diálogo bloqueaba el desplazamiento en body y saltaba arriba).
    await p.getByRole('button', { name: /Detalles: IRPF/ }).click();
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await p.waitForTimeout(200);
    const altura = await p.evaluate(() => Math.round(scrollY));
    await p.evaluate(() => document.querySelector('a.volver').click());
    await pregunta(p).waitFor();
    assert.equal(await p.evaluate(() => Math.round(scrollY)), altura);
    await pregunta(p).getByRole('button', { name: 'Seguir editando' }).click();
    await pregunta(p).waitFor({ state: 'detached' });
    assert.equal(ruta(p), '/facturas/nueva');
    assert.equal(await p.evaluate(() => Math.round(scrollY)), altura);
    // Crear: la factura sustituye al formulario sin preguntar; atrás vuelve a la lista.
    await p.getByRole('button', { name: /\+ Cliente nuevo/ }).click();
    await escribir(p.getByLabel('Nombre o razón social'), `Cliente Aviso ${sufijo}`);
    await escribir(p.getByLabel('Precio').first(), '120');
    await p.getByRole('button', { name: 'Crear factura' }).click();
    await p.waitForURL((x) => /^\/facturas\/(?!nueva)/.test(x.pathname));
    await p.waitForTimeout(400);
    assert.equal(await p.getByRole('alertdialog').count(), 0, 'tras guardar no se pregunta');
    await p.goBack();
    await p.waitForURL((x) => x.pathname === '/facturas');
    await p.waitForTimeout(400);
    assert.equal(await p.getByRole('alertdialog').count(), 0);
    // «‹ Atrás» y salir sin guardar.
    await facturaNueva(p);
    await escribir(concepto(p), 'Otra cosa');
    await conAviso(p);
    await p.locator('a.volver').click();
    await pregunta(p).getByRole('button', { name: 'Salir sin guardar' }).click();
    await p.waitForURL((x) => x.pathname === '/facturas');
    // Cerrar la pestaña o recargar con cambios: avisa el navegador.
    await facturaNueva(p);
    await escribir(concepto(p), 'Sin terminar');
    await conAviso(p);
    let dialogo = '';
    p.once('dialog', (d) => { dialogo = d.type(); d.dismiss(); });
    await p.close({ runBeforeUnload: true });
    await p.waitForTimeout(500);
    assert.equal(dialogo, 'beforeunload');
    assert.equal(p.isClosed(), false);
    assert.equal(await concepto(p).inputValue(), 'Sin terminar');
    assert.deepEqual(errores, []);
    console.log('Salir sin guardar («‹ Atrás»): pregunta; crear no pregunta ni deja el formulario detrás; cerrar avisa OK');
    await ctx.close();
  }
  {
    const { ctx, p, errores } = await movil({ standalone: true });
    await p.goto(`${BASE}/facturas`);
    await facturaNueva(p);
    await escribir(concepto(p), 'Fotografía de producto');
    await conAviso(p);
    await deslizar(p);
    await pregunta(p).waitFor();
    await p.waitForTimeout(400);
    assert(await sinRastro(p), 'la pantalla vuelve a su sitio antes de preguntar');
    await pregunta(p).getByRole('button', { name: 'Seguir editando' }).click();
    await pregunta(p).waitFor({ state: 'detached' });
    assert.equal(ruta(p), '/facturas/nueva');
    assert.equal(await concepto(p).inputValue(), 'Fotografía de producto');
    await deslizar(p);
    await pregunta(p).getByRole('button', { name: 'Salir sin guardar' }).click();
    await p.waitForURL((x) => x.pathname === '/facturas');
    await p.waitForTimeout(600);
    assert(await sinRastro(p));
    assert.deepEqual(errores, []);
    console.log('Salir sin guardar (gesto del iPhone): la pantalla vuelve a su sitio y pregunta OK');
    await ctx.close();
  }
  {
    // Editar un gasto y guardarlo vuelve a la lista (atrás de verdad), sin preguntar; aprobar tras corregir, igual.
    const id = `g${randomBytes(6).toString('hex')}`;
    await guardar(u, 'gastos', { id, fecha: hoy, actividad: 'diseno', concepto: `Papel ${sufijo}`, proveedor: 'Papelería', base: 40, ivaPct: 21 });
    const [a] = await porRevisar(2, 10); // otras que las de arriba: si no, saldrían como posibles duplicados
    const { ctx, p, errores } = await movil();
    await p.goto(`${BASE}/gastos`);
    const posicionLista = await p.evaluate(() => history.state?.__idx);
    await p.locator(`a[href="/gastos/${id}"]`).first().click();
    await p.waitForURL(`**/gastos/${id}`);
    await escribir(p.getByLabel('Concepto', { exact: true }), `Papel y sobres ${sufijo}`);
    await conAviso(p);
    await p.getByRole('button', { name: 'Guardar cambios' }).click();
    await p.waitForURL((x) => x.pathname === '/gastos');
    assert.equal(await p.evaluate(() => history.state?.__idx), posicionLista, 'vuelve a la lista de antes');
    await p.waitForFunction((t) => document.body.innerText.includes(t), `Papel y sobres ${sufijo}`, { timeout: 5000 });
    assert.equal(await p.getByRole('alertdialog').count(), 0);
    await p.goto(`${BASE}/gastos?ver=revisar`);
    await p.locator(`a[href="/gastos/bandeja/${a}"]`).first().click();
    await p.waitForURL(`**/gastos/bandeja/${a}`);
    await escribir(p.getByLabel('Concepto', { exact: true }), `Material corregido ${sufijo}`);
    await conAviso(p);
    await p.getByRole('button', { name: 'Aprobar y guardar el gasto' }).click();
    await p.waitForURL((x) => x.pathname.startsWith('/gastos/bandeja/') && !x.pathname.endsWith(a));
    await p.goBack();
    await p.waitForURL((x) => x.pathname === '/gastos' && x.searchParams.get('ver') === 'revisar');
    await p.waitForTimeout(400);
    assert.equal(await p.getByRole('alertdialog').count(), 0, 'ni se pregunta ni se vuelve a la ya aprobada');
    assert.deepEqual(errores, []);
    console.log('Salir sin guardar: guardar un gasto o aprobar tras corregir no pregunta ni deja el formulario detrás OK');
    await ctx.close();
  }
} finally {
  await browser.close();
}
