// Recorridos reales de UI contra una app y un Redis simulados locales. Nunca contra producción.
// BASE=http://localhost:13017 UPSTASH=http://127.0.0.1:18079 PLAYWRIGHT_MODULE=/ruta/playwright/index.mjs CHROME_PATH=/ruta/chrome node tests/e2e/registro-fluido.mjs
// Registro: solo las respuestas de email/alta se simulan; las validaciones servidor se cubren en registro-alta.test.mjs.
// Bienvenida: sesión y guardado reales, más un fallo de red simulado para comprobar la recuperación.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import '../apoyo/cargador.mjs';
const BASE = process.env.BASE || 'http://localhost:13017';
const UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:18079';
for (const url of [BASE, UPSTASH]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Solo localhost y Redis simulado');
process.env.KV_REST_API_URL = UPSTASH;
process.env.KV_REST_API_TOKEN = 'prueba-local';
const { crearUsuario, crearSesion } = await import('../../lib/auth.js');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sesiones = {};
const sufijo = randomBytes(5).toString('hex');
for (const [clave, datos] of Object.entries({
  aut: { fiscal: { tipo: 'autonomo' }, emisor: { nombre: 'Estudio Prueba', nif: '12345678Z', direccion: 'Calle de Prueba 12', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona' } },
  sociedad: { fiscal: { tipo: 'sociedad' }, emisor: { nombre: 'Prueba Sociedad SL', nif: 'B12345674', direccion: 'Calle de Prueba 12', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona' } },
  vacia: {},
})) {
  const r = await crearUsuario({ nombre: 'Prueba de registro', email: `${clave}-${sufijo}@fisquo-local.test`, password: randomBytes(24).toString('hex'), empresaNombre: `Prueba ${clave}`, empresaDatos: datos });
  if (r.error) throw new Error(r.error);
  sesiones[clave] = { token: await crearSesion(r.usuario.id) };
}
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
for (const width of [320,768,1280]) {
 const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',colorScheme:width===768?'dark':'light'});
 await ctx.addInitScript(()=>{sessionStorage.setItem('fisquo-arranque','1');});
 const p=await ctx.newPage();const errores=[];p.on('pageerror',e=>errores.push(e.message));
 await p.route('**/api/registro/email',r=>r.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'}));
 let enviados=0;
 await p.route('**/api/registro',async r=>{enviados++;const body=r.request().postData();assert(body.includes('Diseño Prueba'));assert(body.includes('08001'));await r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Hacienda no reconoce ese NIF con ese nombre.',paso:2})});});
 await p.goto(`${BASE}/registro?tipo=aut&plan=Pro&periodo=anio`);
 await p.getByRole('radio',{name:'Autónomo',exact:false}).waitFor();
 await p.locator('form.registro[aria-busy="false"]').waitFor();
 assert.equal(await p.getByRole('button',{name:'Volver al paso anterior'}).count(),0);
 assert(await p.locator('input[name=tipo][value=aut]').isChecked());
 // Teclado nativo: ArrowDown cambia de opción y ArrowUp vuelve al autónomo.
 await p.locator('input[name=tipo][value=aut]').focus();await p.keyboard.press('ArrowDown');assert(await p.locator('input[name=tipo][value=pym]').isChecked());await p.keyboard.press('ArrowUp');
 await p.getByRole('button',{name:'Continuar',exact:true}).click();
 await p.getByRole('button',{name:'Continuar',exact:true}).click();
 await p.locator('#registro-error').waitFor();assert.equal(await p.locator('#razon').getAttribute('aria-invalid'),'true');
 await p.getByLabel('Nombre y apellidos como en Hacienda').fill('Diseño Prueba');
 await p.getByLabel('NIF/NIE',{exact:true}).fill('12345678Z');
 await p.getByLabel('Dirección fiscal (calle y número)').fill('Calle de Prueba 12');
 await p.getByLabel('Código postal').fill('08001');await p.getByLabel('Ciudad',{exact:true}).fill('Barcelona');await p.getByLabel('Provincia').selectOption('Barcelona');
 await p.getByRole('button',{name:'Continuar',exact:true}).click();
 assert(await p.locator('input[name=plan][value=Pro]').isChecked());assert(await p.locator('input[name=periodo][value=anio]').isChecked());
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.getByRole('button',{name:'Volver al paso anterior',exact:true}).click();assert.equal(await p.getByLabel('Código postal').inputValue(),'08001');
 await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('button',{name:'Continuar',exact:true}).click();
 await p.getByLabel('Nombre',{exact:true}).fill('Prueba');await p.getByLabel('Email',{exact:true}).fill('prueba@fisquo-local.test');await p.getByLabel('Contraseña',{exact:true}).fill('Luna!Bosque72Rio');
 await p.getByRole('button',{name:'Continuar',exact:true}).click();await p.getByRole('heading',{name:'Revisar y crear'}).waitFor();
 await p.getByRole('button',{name:'Crear cuenta',exact:true}).click();await p.locator('#registro-error').waitFor();assert.equal(enviados,0);
 await p.locator('#acepto').check();await p.getByRole('button',{name:'Crear cuenta',exact:true}).click();await p.locator('#registro-error').waitFor();
 await p.getByRole('heading',{name:'Datos fiscales',exact:true}).waitFor();assert.equal(enviados,1);assert.equal(await p.getByLabel('Código postal').inputValue(),'08001');assert.equal(await p.locator('#nif').getAttribute('aria-invalid'),'true');
 assert.deepEqual(errores,[]);console.log(`${width}px: teclado, validación, plan previo, atrás, consentimiento y rechazo fiscal OK`);
 await ctx.close();
}
for (const [clave, viewport] of [['aut',{width:390,height:844}], ['sociedad',{width:1280,height:900}], ['vacia',{width:390,height:844}]]) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{ name:'t',value:sesiones[clave].token,url:BASE }]);
  await ctx.addInitScript(() => { sessionStorage.setItem('fisquo-arranque','1'); sessionStorage.setItem('fisquo-abierta','1'); });
  const page=await ctx.newPage(); const errores=[];
  page.on('pageerror', e=>errores.push(e.message));
  await page.goto(`${BASE}/bienvenida`);
  await page.waitForSelector('.cuestionario');
  if (clave==='vacia') {
    await page.getByRole('radio',{name:'Sociedad'}).check();
    await page.getByRole('button',{name:'Siguiente'}).click();
    await page.getByLabel('Razón social (obligatorio)').fill('Empresa de pruebas');
    await page.getByLabel('CIF (obligatorio)').fill('B12345674');
    await page.getByRole('button',{name:'Volver al paso anterior'}).click();
    await page.getByRole('button',{name:'Siguiente'}).click();
    assert.equal(await page.getByLabel('Razón social (obligatorio)').inputValue(),'Empresa de pruebas');
    await page.getByRole('button',{name:'Siguiente'}).click();
  } else {
    await page.getByRole('heading',{name:'¿A qué te dedicas?'}).waitFor();
    assert.match(await page.locator('.alta-etapa').innerText(),/Paso 1 de 3/);
  }
  await page.getByLabel('Nombre de tu actividad').fill('Diseño y eventos');
  await page.getByRole('button',{name:'Siguiente'}).click();
  await page.getByRole('switch',{name:'Alquilo un local u oficina'}).check();
  await page.getByRole('button',{name:'Volver al paso anterior'}).click();
  assert.equal(await page.getByLabel('Nombre de tu actividad').inputValue(),'Diseño y eventos');
  await page.getByRole('button',{name:'Siguiente'}).click();
  assert(await page.getByRole('switch',{name:'Alquilo un local u oficina'}).isChecked());
  await page.getByRole('button',{name:'Siguiente'}).click();
  await page.getByRole('heading',{name:'Tus modelos'}).waitFor();
  assert.match(await page.locator('.paso').innerText(),/115/);
  await page.locator('.paso').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(clave==='aut') {
    await page.route('**/api/cuenta', route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Error de prueba: vuelve a intentarlo.'})}));
    await page.getByRole('button',{name:'Guardar y continuar'}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.locator('.alta-final').count(),0);
    await page.unroute('**/api/cuenta');
  }
  await page.getByRole('button',{name:'Guardar y continuar'}).click();
  await page.getByRole('heading',{name:'Tu negocio ya está preparado'}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Crear mi primera factura'}).getAttribute('href'),'/facturas/nueva');
  assert.equal(await page.getByRole('link',{name:'Importar mis datos'}).getAttribute('href'),'/ajustes/importar');
  await page.getByRole('link',{name:clave==='sociedad'?'Importar mis datos':'Crear mi primera factura'}).click();
  await page.waitForURL(clave==='sociedad'?'**/ajustes/importar':'**/facturas/nueva');
  assert(!page.url().includes('bienvenida'));
  assert.deepEqual(errores,[]);
  console.log(`${clave}: recorrido, atrás, datos conservados, guardado y destino OK`);
  await ctx.close();
}
} finally { await browser.close(); }
