// BASE=... UPSTASH=... PLAYWRIGHT_MODULE=... CHROME_PATH=... node tests/e2e/movimiento-publico.mjs
// App en localhost con VERIFICAR_EMAIL=off y Redis simulado. Nunca ejecutar contra producción.
import { randomBytes } from 'node:crypto';
import '../apoyo/cargador.mjs';
const BASE = process.env.BASE || 'http://localhost:13021';
const UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:18083';
for (const url of [BASE, UPSTASH]) if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)) throw new Error('Solo app y Redis simulados locales');
process.env.KV_REST_API_URL = UPSTASH; process.env.KV_REST_API_TOKEN = 'prueba-local';
const { crearUsuario } = await import('../../lib/auth.js');
const correo = `movimiento-${randomBytes(5).toString('hex')}@fisquo-local.test`;
const clave = `Brisa!${randomBytes(12).toString('hex')}73a`;
const alta = await crearUsuario({ nombre: 'Prueba de movimiento', email: correo, password: clave, empresaNombre: 'Movimiento (simulada)' });
if (alta.error) throw new Error(alta.error);
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
try {
 const c=await b.newContext({viewport:{width:1280,height:900}});const p=await c.newPage();const errores=[];p.on('pageerror',e=>errores.push(e.message));
 await p.goto(`${BASE}/`);await p.locator('.web-hero h1').waitFor();await p.waitForFunction(()=>document.querySelector('.web')?.dataset!==undefined);
 await p.evaluate(()=>{window.__documentoPrueba='persistente';window.__transiciones=[];const original=document.startViewTransition.bind(document);document.startViewTransition=(...args)=>{const t=original(...args);const registro={types:[],animaciones:[]};window.__transiciones.push(registro);t.ready.then(()=>{registro.types=[...t.types];registro.animaciones=document.getAnimations().map(a=>({duracion:a.effect?.getTiming().duration,pseudo:a.effect?.pseudoElement}));}).catch(()=>{});return t;};});
 assert.equal(await p.locator('[data-r]:not(.visto)').first().evaluate(el=>getComputedStyle(el).opacity),'1');
 await p.locator('.web-cab').getByRole('link',{name:'Precios',exact:true}).click();await p.waitForURL('**/precios');await p.locator('.web-main h1').waitFor();assert.equal(await p.evaluate(()=>window.__documentoPrueba),'persistente');
 await p.locator('.web-cab').getByRole('button',{name:'Producto',exact:true}).focus();await p.keyboard.press('Enter');await p.waitForFunction(()=>document.querySelector('.web-mega').classList.contains('abierto'));await p.keyboard.press('Tab');await p.keyboard.press('Escape');assert.equal(await p.locator('.web-cab').getByRole('button',{name:'Producto',exact:true}).getAttribute('aria-expanded'),'false');
 await p.locator('.web-cab').getByRole('link',{name:'Entrar',exact:true}).click();await p.waitForURL('**/login');await p.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.__documentoPrueba),'persistente');assert.equal(await p.locator('#arranque').isVisible(),false);
 await p.getByRole('link',{name:'Crea una gratis'}).click();await p.waitForURL('**/registro');await p.getByRole('radio',{name:'Autónomo',exact:false}).waitFor();assert.equal(await p.evaluate(()=>window.__documentoPrueba),'persistente');
 await p.getByRole('link',{name:'Inicia sesión',exact:true}).click();await p.waitForURL('**/login');await p.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();await p.goBack();await p.waitForURL('**/registro');
 assert.deepEqual(errores,[]);console.log('Escritorio: web → precios → login → registro → Atrás, sin recargas ni errores.',await p.evaluate(()=>window.__transiciones.length));
await c.close();
 const m=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const q=await m.newPage();q.on('pageerror',e=>errores.push(e.message));await q.goto(`${BASE}/`);await q.getByRole('button',{name:'Abrir menú'}).click();await q.waitForFunction(()=>document.querySelector('.web-main')?.inert===true);await q.locator('.web-cajon').getByRole('link',{name:'Entrar',exact:true}).click();await q.waitForURL('**/login');await q.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();assert.equal(await q.evaluate(()=>document.documentElement.classList.contains('web-sin-scroll')),false);await q.getByRole('link',{name:'Crea una gratis'}).click();await q.waitForURL('**/registro');await q.getByRole('radio',{name:'Autónomo',exact:false}).check();await q.getByRole('button',{name:'Continuar',exact:true}).click();await q.getByRole('button',{name:'Volver al paso anterior'}).click();assert(await q.locator('input[name=tipo][value=aut]').isChecked());assert.equal(await q.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errores,[]);console.log('Móvil: menú → login → registro, scroll liberado y flecha conserva selección.');
await q.goto(`${BASE}/precios`);await q.locator('.web-tabla').waitFor();assert.equal(await q.evaluate(()=>{scrollTo(999,0);return scrollX;}),0);assert(await q.locator('.web-tabla-scroll').evaluate(el=>el.scrollWidth>el.clientWidth));await m.close();

 const normal=await b.newContext({viewport:{width:1280,height:900}});const t=await normal.newPage();t.on('pageerror',e=>errores.push(e.message));
 await t.goto(`${BASE}/`);const tour=t.locator('.web-tour');await tour.scrollIntoViewIfNeeded();
 await tour.getByRole('tab',{name:'Gastos con una foto',exact:false}).click();await t.mouse.move(5,5);await t.evaluate(()=>document.activeElement.blur());await t.waitForTimeout(6300);assert.equal(await tour.getByRole('tab',{name:'Gastos con una foto',exact:false}).getAttribute('aria-selected'),'true');
 await tour.getByRole('button',{name:'Reproducir recorrido'}).click();await t.mouse.move(5,5);await t.waitForTimeout(6300);assert.equal(await tour.getByRole('tab',{name:'Gastos con una foto',exact:false}).getAttribute('aria-selected'),'false');
 await tour.getByRole('button',{name:'Pausar recorrido'}).click();await tour.getByRole('tab',{selected:true}).focus();await t.keyboard.press('ArrowRight');assert.equal(await tour.getByRole('button',{name:'Reproducir recorrido'}).count(),1);
 await t.emulateMedia({reducedMotion:'reduce'});await tour.getByRole('button',{name:'Reproducir recorrido'}).waitFor({state:'hidden'});assert.equal(await t.locator('.web-tour-pantalla').evaluate(el=>getComputedStyle(el).animationName),'none');
 console.log('Recorrido: selección manual no avanza sola; reproducción, pausa, teclado y cambio de movimiento reducido correctos.');await normal.close();
 const sinObservador=await b.newContext({viewport:{width:1280,height:900}});await sinObservador.addInitScript(()=>{window.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}};});const j=await sinObservador.newPage();await j.goto(`${BASE}/funciones`);await j.locator('h1').waitFor();assert.equal(await j.locator('[data-r]').evaluateAll(es=>es.some(el=>getComputedStyle(el).opacity==='0')),false);await sinObservador.close();console.log('Observador detenido: contenido de la web visible.');
 const acceso=await b.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const l=await acceso.newPage();l.on('pageerror',e=>errores.push(e.message));await l.goto(`${BASE}/login`);await l.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor();assert.equal(await l.locator('#arranque').isVisible(),false);await l.getByLabel('Email',{exact:true}).fill(correo);await l.getByLabel('Contraseña',{exact:true}).fill(clave);await l.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await l.waitForURL('**/bienvenida');assert.equal(await l.locator('.web').count(),0);console.log('Autenticación real local: acceso → app sin zoom ni espera adicional.');await acceso.close();
 assert.deepEqual(errores,[]);
} finally {await b.close();}
