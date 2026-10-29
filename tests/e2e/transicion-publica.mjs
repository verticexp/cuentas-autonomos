// Solo lectura: BASE=http://localhost:13023 PLAYWRIGHT_MODULE=... CHROME_PATH=... node tests/e2e/transicion-publica.mjs
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const BASE = process.env.BASE || 'http://localhost:13023';
const b = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
  for (const width of [390, 1280]) {
    const p = await b.newPage({ viewport: { width, height: 900 } });
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.route('**/api/**', (r) => r.request().method() === 'POST' ? r.abort() : r.continue());
    await p.addInitScript(() => {
      window.__documentoMovimiento = 'mismo'; window.__movimientos = [];
      const original = document.startViewTransition.bind(document);
      document.startViewTransition = (...args) => {
        const registro = { start: performance.now(), y: scrollY }; window.__movimientos.push(registro);
        const t = original(...args);
        t.ready.then(() => {
          registro.ready = performance.now() - registro.start; registro.yReady = scrollY;
          registro.root = getComputedStyle(document.documentElement, '::view-transition-group(root)').height;
          registro.animaciones = document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith('::view-transition')).map((a) => ({ nombre: a.animationName, pseudo: a.effect.pseudoElement, frames: a.effect.getKeyframes() }));
        }).catch(() => { registro.omitida = true; });
        t.finished.catch(() => {}).then(() => { registro.fin = true; }); return t;
      };
    });
    await p.goto(BASE, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.querySelector('.web-main')?.dataset.publicoRuta === '/');
    const seguridadAntes = width > 500 ? await p.locator('.web-cab').getByRole('link', { name: 'Seguridad', exact: true }).boundingBox() : null;
    await p.locator('.web-pie').scrollIntoViewIfNeeded();
    // El menú contiene el mismo enlace en móvil y escritorio.
    if (width < 500) await p.getByRole('button', { name: 'Abrir menú' }).click();
    const enlace = width < 500 ? p.locator('.web-cajon').getByRole('link', { name: 'Precios', exact: true }) : p.locator('.web-cab').getByRole('link', { name: 'Precios', exact: true });
    await enlace.click(); await p.waitForURL('**/precios'); await p.locator('.web-tabla').waitFor();
    await p.waitForFunction(() => window.__movimientos.length === 1 && window.__movimientos[0].fin);
    if (seguridadAntes) assert.equal((await p.locator('.web-cab').getByRole('link', { name: 'Seguridad', exact: true }).boundingBox()).x, seguridadAntes.x, 'La cabecera no se desplaza al activar Precios');
    const [registro] = await p.evaluate(() => window.__movimientos);
    assert(!registro.omitida, 'La ruta precargada debe tener un fundido real');
    assert.equal(registro.yReady, 0, 'El scroll se coloca antes del fundido'); assert.equal(registro.root, '900px');
    // La página vieja se apaga y la nueva se enciende; la cabecera va en su propia capa (app/publico-motion.css).
    const raiz = registro.animaciones.filter((a) => a.pseudo.endsWith('(root)'));
    assert.deepEqual(raiz.map((a) => `${a.pseudo} ${a.nombre}`).sort(), ['::view-transition-new(root) publico-fundido', '::view-transition-old(root) publico-sale']);
    assert(raiz.every((a) => a.frames.every((f) => !f.transform && !f.height && !f.width)), 'Solo cambia la opacidad');
    assert(registro.animaciones.some((a) => a.pseudo.endsWith('(web-cab)')), 'La cabecera tiene su propia capa');
    assert.equal(await p.evaluate(() => window.__documentoMovimiento), 'mismo');
    // Atrás: React pinta la página anterior en el mismo popstate, así que no hay captura que hacer; solo se restaura el scroll.
    await p.goBack(); await p.waitForURL(BASE + '/');
    await p.waitForFunction(() => scrollY > 1000 && !document.documentElement.hasAttribute('data-publico-transicion'));
    // El teclado y movimiento reducido navegan sin crear una captura.
    const n = await p.evaluate(() => window.__movimientos.length);
    if (width < 500) await p.getByRole('button', { name: 'Abrir menú' }).click();
    await enlace.focus(); await p.keyboard.press('Enter'); await p.waitForURL('**/precios'); await p.locator('.web-tabla').waitFor();
    assert.equal(await p.evaluate(() => window.__movimientos.length), n);
    await p.emulateMedia({ reducedMotion: 'reduce' });
    if (width < 500) await p.getByRole('button', { name: 'Abrir menú' }).click();
    const entrar = width < 500 ? p.locator('.web-cajon').getByRole('link', { name: 'Entrar', exact: true }) : p.locator('.web-cab').getByRole('link', { name: 'Entrar', exact: true });
    await entrar.click(); await p.waitForURL('**/login'); await p.locator('main.login').waitFor();
    assert.equal(await p.evaluate(() => window.__movimientos.length), n); assert.deepEqual(errors, []);
    // Al llegar, el título de la página nueva entra escalonado.
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    await p.goto(BASE + '/precios', { waitUntil: 'networkidle' });
    if (width < 500) await p.getByRole('button', { name: 'Abrir menú' }).click();
    await (width < 500 ? p.locator('.web-cajon') : p.locator('.web-cab')).getByRole('link', { name: 'Seguridad', exact: true }).click();
    await p.waitForURL('**/seguridad'); await p.locator('.web-main h1').waitFor();
    assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector('.web-main h1')).animationName), 'web-sube', 'El título de la página nueva entra');
    console.log(`${width}px: fundido de viewport sin geometría, cabecera quieta y título que entra; scroll, Atrás, teclado y movimiento reducido correctos.`);
    await p.close();
  }
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.route('**/api/**', (r) => r.request().method() === 'POST' ? r.abort() : r.continue());
  await p.route('**/seguridad?*', async (r) => { await new Promise((resolve) => setTimeout(resolve, 1000)); await r.continue(); });
  await p.goto(BASE, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelector('.web-main')?.dataset.publicoRuta === '/');
  await p.locator('.web-cab').getByRole('link', { name: 'Seguridad', exact: true }).click();
  await p.waitForTimeout(650);
  assert.equal(await p.evaluate(() => document.documentElement.hasAttribute('data-publico-transicion')), false, 'La red lenta no mantiene la captura bloqueada');
  await p.waitForURL('**/seguridad'); await p.locator('.web-main h1').waitFor();
  // Dos pulsaciones sin esperar a terminar el primer fundido: gana la última navegación.
  await p.locator('.web-cab').getByRole('link', { name: 'Precios', exact: true }).dispatchEvent('click', { button: 0, detail: 1 });
  await p.locator('.web-cab').getByRole('link', { name: 'Seguridad', exact: true }).dispatchEvent('click', { button: 0, detail: 1 });
  await p.waitForURL('**/seguridad'); await p.waitForFunction(() => !document.documentElement.hasAttribute('data-publico-transicion'));
  await p.waitForTimeout(300); assert.equal(new URL(p.url()).pathname, '/seguridad'); assert.deepEqual(errors, []);
  console.log('Red lenta y pulsaciones seguidas: captura liberada y destino final correcto.'); await p.close();
  const sinAPI = await b.newContext(); await sinAPI.addInitScript(() => { document.startViewTransition = undefined; });
  const f = await sinAPI.newPage(); await f.goto(BASE, { waitUntil: 'networkidle' });
  await f.locator('.web-cab').getByRole('link', { name: 'Precios', exact: true }).click(); await f.waitForURL('**/precios'); await f.locator('.web-tabla').waitFor();
  assert.equal(await f.evaluate(() => document.documentElement.hasAttribute('data-publico-transicion')), false); await sinAPI.close();
  console.log('Sin API de transiciones: navegación normal correcta.');
} finally { await b.close(); }
