// App y Redis ficticios locales. Intercepta contratación/portal: nunca se efectúan pagos.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import '../apoyo/cargador.mjs';
const BASE=process.env.BASE || 'http://localhost:13723', UPSTASH=process.env.UPSTASH || 'http://127.0.0.1:18721';
for (const u of [BASE,UPSTASH]) if (!['localhost','127.0.0.1'].includes(new URL(u).hostname)) throw new Error('Solo datos ficticios locales');
process.env.KV_REST_API_URL=UPSTASH; process.env.KV_REST_API_TOKEN='local';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {redis}=await import('../../lib/redis.js');
const {crearSesion}=await import('../../lib/auth.js');
const {nuevoPlan}=await import('../../lib/prueba.js');
const {periodoEscaneos}=await import('../../lib/cuotasIA.js');
const id=`planes-ui-${randomBytes(4).toString('hex')}`;
const empresa={id,nombre:'Demo Esencial',pendiente:false,fiscal:{tipo:'autonomo',iva:'general'},emisor:{nombre:'Empresa ficticia'},actividades:[]};
const usuario={id,empresa:id,rol:'admin',emailVerificado:true,nombre:'Demo'};
const pagado={...nuevoPlan('aut','Esencial'),pagado:true,suscripcion:'sub_ficticia',cliente:'cus_ficticio',estado:'active'};
async function sembrar(plan=pagado,miembro=false){
 await redis.hset('empresas',{[id]:{...empresa,plan}});
 await redis.hset('usuarios',{[id]:miembro?{...usuario,rol:'miembro',permisos:['empresa']}:usuario});
 await redis.hset(`escaneos-ia:${id}:${periodoEscaneos(plan).periodo}`,{paginas:18});
}
await sembrar();
const token=await crearSesion(id);
const salida=process.env.SALIDA || '/private/tmp/fisquo-planes-diseno-capturas'; await mkdir(salida,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox']});
async function abrir(width=1440,colorScheme='light',app=false){
 const ctx=await browser.newContext({viewport:{width,height:1050},colorScheme,...(app?{userAgent:'Mozilla/5.0 FisquoApp/1'}:{})});
 await ctx.addCookies([{name:'t',value:token,url:BASE}]);
 await ctx.addInitScript(()=>{sessionStorage.setItem('fisquo-arranque','1');sessionStorage.setItem('fisquo-abierta','1');});
 const p=await ctx.newPage();
 await p.goto(`${BASE}/ajustes/plan`);
 await p.getByRole('heading',{name:'Tu plan',exact:true}).waitFor();
 await p.locator('#arranque').waitFor({state:'hidden'});
 return {ctx,p};
}
try{
 for(const [nombre,width,tema] of [['escritorio',1440,'light'],['movil',390,'light'],['oscuro',1280,'dark'],['estrecho',320,'light'],['tableta',820,'light'],['portatil',1024,'light']]){
  await sembrar(); const {ctx,p}=await abrir(width,tema);
  const planes=p.getByLabel('Planes disponibles');
  await p.getByText('18 de 50 páginas este mes',{exact:true}).waitFor();
  assert.equal(await planes.getByRole('article').count(),3);
  assert.match(await planes.innerText(),/200 páginas/);
  await p.screenshot({path:`${salida}/${nombre}.png`,fullPage:true});
  await p.getByRole('radio',{name:/Anual/}).check();
  assert.match(await planes.getByRole('article').nth(1).innerText(),/8,40 €/);
  assert.match(await planes.getByRole('article').nth(1).innerText(),/100,80 € facturados al año/);
  await p.getByRole('radio',{name:'Pyme',exact:true}).check();
  assert.match(await planes.innerText(),/600 páginas/);
  assert.match(await planes.getByRole('article').nth(1).innerText(),/294 € facturados al año/);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Desbordamiento ${nombre}`);
  if(nombre==='escritorio'){
   await p.screenshot({path:`${salida}/pymes-anual.png`,fullPage:true});
   const peticiones=[];
   await p.route('**/api/suscripcion',async r=>{peticiones.push(r.request().postDataJSON());await r.fulfill({status:503,json:{error:'Pago simulado no disponible. Inténtalo otra vez.'}});});
   p.on('dialog',d=>d.accept());
   await p.getByRole('button',{name:'Cambiar a Pro',exact:true}).click();
   await p.getByRole('alert').filter({hasText:'Pago simulado'}).waitFor();
   assert.deepEqual(peticiones.pop(),{tipo:'pym',nombre:'Pro',periodo:'anio'});
   await p.getByRole('button',{name:'Gestionar facturación'}).click();
   await p.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('Pago simulado'));
   assert.deepEqual(peticiones.pop(),{portal:true});
   await p.unroute('**/api/suscripcion');
   const cambiado={...pagado,tipo:'pym',nombre:'Pro',periodo:'anio'};
   await p.route('**/api/suscripcion',async r=>{
    assert.deepEqual(r.request().postDataJSON(),{tipo:'pym',nombre:'Pro',periodo:'anio'});
    await redis.hset('empresas',{[id]:{...empresa,plan:cambiado}});
    await r.fulfill({json:{plan:cambiado}});
   });
   await p.getByRole('button',{name:'Cambiar a Pro',exact:true}).click();
   await p.getByText('Pyme Pro',{exact:true}).waitFor();
   await planes.getByRole('article').nth(1).getByText('Tu plan actual',{exact:true}).waitFor();
  }
  await ctx.close();
 }
 for(const [nombre,plan,miembro] of [['prueba',nuevoPlan('aut','Esencial'),false],['caducada',{...nuevoPlan('aut','Esencial'),hasta:'2020-01-01'},false],['impago',{...pagado,estado:'past_due'},false],['miembro',pagado,true],['anterior',{...pagado,version:1},false]]){
  await sembrar(plan,miembro);const {ctx,p}=await abrir();
  if(nombre==='caducada') await p.getByText('Prueba finalizada',{exact:true}).waitFor();
  if(nombre==='prueba'){
   await p.getByText('18 de 50 páginas de prueba usadas',{exact:true}).waitFor();
   await p.getByRole('radio',{name:/Anual/}).check();
   const req=[];await p.route('**/api/suscripcion',async r=>{req.push(r.request().postDataJSON());await r.fulfill({status:503,json:{error:'Fallo simulado'}});});
   await p.getByRole('button',{name:'Elegir Esencial',exact:true}).click();
   await p.getByRole('alert').filter({hasText:'Fallo simulado'}).waitFor();assert.equal(req.pop().periodo,'anio','Seleccionar pago anual contrata ese periodo');
   await p.getByRole('button',{name:'Activar Esencial · pago mensual',exact:true}).click();
   await p.getByRole('alert').filter({hasText:'Fallo simulado'}).waitFor();assert.equal(req[0].periodo,'mes','Activar plan actual respeta su periodo guardado');
  }
  if(nombre==='impago') await p.getByText('El último cobro ha fallado. Revisa tu método de pago.',{exact:true}).waitFor();
  if(miembro) assert.equal(await p.getByRole('button',{name:/Cambiar a|Elegir |Gestionar facturación|Activar/}).count(),0);
  if(nombre==='anterior') await p.getByText(/Tu suscripción conserva las condiciones anteriores/).waitFor();
  await ctx.close();
 }
 await sembrar();const {ctx,p}=await abrir(390,'light',true);
 await p.getByText('El plan se gestiona desde la web de Fisquo, entrando con tu cuenta en un navegador.',{exact:true}).waitFor();
 assert.equal(await p.getByLabel('Planes disponibles').count(),0);await ctx.close();
 console.log('OK: 6 tamaños/temas, precios anuales, cambio de plan, portal, recuperación de errores, prueba, caducidad, impago, miembro, condiciones anteriores e iOS.');
}finally{await browser.close();}
