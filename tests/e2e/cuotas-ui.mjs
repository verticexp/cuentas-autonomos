// Solo localhost, con la app y Redis simulados. PLAYWRIGHT_MODULE y CHROME_PATH permiten usar un Chrome instalado.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import '../apoyo/cargador.mjs';
const BASE = process.env.BASE || 'http://localhost:13719', UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:18719';
for (const url of [BASE, UPSTASH]) if (!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Solo app y Redis ficticios locales');
process.env.KV_REST_API_URL=UPSTASH;process.env.KV_REST_API_TOKEN='local';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {redis}=await import('../../lib/redis.js');
const {crearSesion}=await import('../../lib/auth.js');
const {nuevoPlan}=await import('../../lib/prueba.js');
const {periodoEscaneos}=await import('../../lib/cuotasIA.js');
const empresa=`cuota-ui-${randomBytes(4).toString('hex')}`, plan={...nuevoPlan('aut','Esencial'),pagado:true};
await redis.hset('empresas',{[empresa]:{id:empresa,nombre:'UI Cuotas (ficticia)',pendiente:false,plan,fiscal:{tipo:'autonomo',iva:'general'},emisor:{nombre:'Prueba ficticia'},actividades:[{id:'servicios',nombre:'Servicios',serie:'',ivaPct:21,irpfPct:0}]}});
await redis.hset('usuarios',{[empresa]:{id:empresa,empresa,rol:'admin',admin:false,emailVerificado:true,nombre:'Prueba ficticia'}});
await redis.hset(`gastos:${empresa}`,{manual:{id:'manual',fecha:'2026-10-18',actividad:'servicios',concepto:'Gasto manual ficticio',base:10,ivaPct:21}});
const token=await crearSesion(empresa),clave=`escaneos-ia:${empresa}:${periodoEscaneos(plan).periodo}`;
const salida=process.env.QA_SALIDA || '/private/tmp/fisquo-cuotas-ui';await mkdir(salida,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
const errores=[];
try {
 for(const width of [390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390});
  await ctx.addCookies([{name:'t',value:token,url:BASE,httpOnly:true,sameSite:'Lax'}]);
  const p=await ctx.newPage();p.on('pageerror',e=>errores.push(e.message));
  await redis.hset(clave,{paginas:40});await p.goto(`${BASE}/gastos`);
  await p.locator('.ticket-cupo').getByText('40 de 50 páginas este mes',{exact:true}).waitFor();
  if(width===390){
   await p.getByRole('button',{name:'Varios tickets',exact:true}).click();
   await p.getByRole('dialog').locator('.ticket-cupo').getByText('40 de 50 páginas este mes',{exact:true}).waitFor();
   await p.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
  }
  await p.getByRole('button',{name:'A mano',exact:true}).click();
  await p.locator('.ticket-cupo').getByText('40 de 50 páginas este mes',{exact:true}).waitFor();
  await p.getByText('Te quedan pocas páginas de lectura IA.',{exact:false}).waitFor();
  assert((await p.locator('form.formulario input').count())>0,'Esencial debe mostrar el formulario manual');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.locator('.ticket-ia').screenshot({path:`${salida}/aviso-${width}.png`});
  await redis.hset(clave,{paginas:50});await p.evaluate(()=>window.dispatchEvent(new Event('fisquo:escaneos')));
  await p.getByText('Has agotado las lecturas disponibles.',{exact:false}).waitFor();
  await p.getByRole('link',{name:'Solicitar ampliación',exact:true}).click();
  await p.getByRole('heading',{name:'Más páginas para tu negocio'}).waitFor();
  assert.match(await p.locator('.web-sub').innerText(),/precio y las condiciones/);
  await p.screenshot({path:`${salida}/ampliacion-${width}.png`,fullPage:true});
  await p.goto(`${BASE}/ajustes/plan`);await p.locator('.ticket-cupo').getByText('50 de 50 páginas este mes',{exact:true}).waitFor();
  assert.match(await p.getByLabel('Planes disponibles').innerText(),/200 páginas/);
  await ctx.clearCookies();await p.goto(`${BASE}/precios`);
  assert.match(await p.locator('.web-plan').first().innerText(),/50 páginas\/mes/);
  await p.getByRole('tab',{name:'Pymes',exact:true}).click();assert.match(await p.locator('.web-plan-fuerte').innerText(),/600 páginas\/mes/);
  await p.screenshot({path:`${salida}/precios-${width}.png`,fullPage:true});
  await ctx.close();
 }
 assert.deepEqual(errores,[]);console.log('OK navegador 390/1280: Esencial permite gastos, contador antes de escanear, ráfaga, aviso80%, agotamiento, Tu plan y ampliación por contacto.');
}finally{await browser.close();}
