import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { escaneosDe } from '../lib/cuotasIAConfig.js';
let srv, redis, C, T;
const originalFetch = globalThis.fetch;
const originales = Object.fromEntries(['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'ANTHROPIC_API_KEY', 'ANTHROPIC_URL', 'ANTHROPIC_MODEL'].map(k => [k, process.env[k]]));
const user = (empresa = 'e1', nombre = 'Esencial', tipo = 'aut') => ({ id: 'u1', empresa, plan: { tipo, nombre, pagado: true, version: 2 } });
const hoy = new Date('2026-10-18T10:00:00Z');
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url; process.env.KV_REST_API_TOKEN = 'prueba-local';
  redis = (await import('../lib/redis.js')).redis;
  C = await import('../lib/cuotasIA.js'); T = await import('../lib/ticket.js');
});
beforeEach(() => { srv.base.run(['flushdb']); process.env.LIMITES = 'off'; delete process.env.ANTHROPIC_URL; delete process.env.ANTHROPIC_MODEL; });
afterEach(() => { globalThis.fetch = originalFetch; });
after(async () => { globalThis.fetch = originalFetch; if (srv) await srv.cerrar(); for (const [k,v] of Object.entries(originales)) if(v === undefined) delete process.env[k]; else process.env[k]=v; });

async function pdf(paginas) { const d=await PDFDocument.create(); for(let i=0;i<paginas;i++)d.addPage(); return Buffer.from(await d.save()); }

test('cuotas por empresa y no por usuario; anual no multiplica la capacidad', async () => {
  assert.deepEqual(['Esencial','Pro','Plus'].map(n=>escaneosDe(user('x',n).plan)),[50,200,500]);
  assert.deepEqual(['Esencial','Pro','Plus'].map(n=>escaneosDe(user('x',n,'pym').plan)),[200,600,1500]);
  const u=user(); u.plan.periodo='anio';
  const a=await C.consumirEscaneos(u,3,hoy);assert.equal(a.cupo.restantes,47);
  assert.equal((await C.cupoEscaneos({...u,id:'gestoria'},hoy)).usadas,3);
  assert.equal((await C.cupoEscaneos(user('otra'),hoy)).usadas,0);
  assert.equal((await C.cupoEscaneos(u,hoy)).limite,50);
});

test('la reserva concurrente nunca rebasa la cuota aunque LIMITES esté desactivado', async () => {
  const u=user(); await C.consumirEscaneos(u,10,hoy);await C.consumirEscaneos(u,10,hoy);await C.consumirEscaneos(u,10,hoy);await C.consumirEscaneos(u,10,hoy);await C.consumirEscaneos(u,8,hoy);
  const rs=await Promise.all(Array.from({length:16},(_,i)=>C.consumirEscaneos({...u,id:`u${i}`},1,hoy)));
  assert.equal(rs.filter(r=>!r.error).length,2);
  const c=await C.cupoEscaneos(u,hoy);assert.equal(c.usadas,50);assert.equal(c.restantes,0);assert.equal(c.agotado,true);
});

test('un PDF necesita todas sus páginas disponibles; el rechazo no descuenta nada', async () => {
  const u=user();for(let i=0;i<5;i++)await C.consumirEscaneos(u,9,hoy);
  const r=await C.consumirEscaneos(u,6,hoy);assert.ok(r.error);assert.equal(r.cupo.usadas,45);
  assert.equal((await C.consumirEscaneos(u,5,hoy)).cupo.usadas,50);
  for(const n of [0,-1,1.5,11,NaN]) await assert.rejects(C.consumirEscaneos(u,n,hoy));
});

test('el mes se renueva en Madrid, incluido el cambio de horario; la prueba no se renueva', async () => {
  const u=user();
  assert.equal(C.periodoEscaneos(u.plan,new Date('2026-03-31T22:30:00Z')).periodo,'2026-04');
  assert.equal(C.periodoEscaneos(u.plan,new Date('2026-11-30T22:30:00Z')).periodo,'2026-11');
  await C.consumirEscaneos(u,1,new Date('2026-10-31T22:59:00Z'));
  assert.equal((await C.cupoEscaneos(u,new Date('2026-10-31T23:01:00Z'))).usadas,0);
  u.plan={...u.plan,pagado:false,hasta:'2026-11-15'};
  await C.consumirEscaneos(u,2,new Date('2026-10-25T10:00:00Z'));
  const c=await C.cupoEscaneos(u,new Date('2026-11-03T10:00:00Z'));assert.equal(c.usadas,2);assert.equal(c.limite,50);assert.equal(c.prueba,true);assert.equal(c.renueva,null);
});

test('cambiar de plan conserva lo consumido, sin crear una bolsa nueva', async () => {
  const u=user();await C.consumirEscaneos(u,10,hoy);u.plan.nombre='Pro';
  assert.equal((await C.cupoEscaneos(u,hoy)).restantes,190);
  u.plan.nombre='Plus';assert.equal((await C.cupoEscaneos(u,hoy)).restantes,490);
  u.plan.nombre='Esencial';assert.equal((await C.cupoEscaneos(u,hoy)).restantes,40);
});

test('valida PDF en servidor, rechaza demasiadas páginas, archivos falsos y tamaños excesivos', async () => {
  assert.deepEqual(await C.paginasIA(await pdf(3),'application/pdf'),{paginas:3});
  assert.match((await C.paginasIA(await pdf(11),'application/pdf')).error,/10 páginas/);
  assert.ok((await C.paginasIA(Buffer.from('no es PDF'),'application/pdf')).error);
  assert.ok((await C.paginasIA(Buffer.from('%PDF-corrupto'),'application/pdf')).error);
  assert.ok((await C.paginasIA(await pdf(2),'image/png')).error,'no se puede disfrazar un PDF como imagen');
  assert.ok((await C.paginasIA(Buffer.alloc(C.MAX_BYTES_IA+1),'image/jpeg')).error);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4eUAAAAASUVORK5CYII=','base64');
  assert.deepEqual(await C.paginasIA(png,'image/png'),{paginas:1});
});

test('registra tokens y coste estimado sin guardar contenido de documentos', async () => {
  const r=await C.consumirEscaneos(user(),1,hoy);
  await C.registrarConsumoIA(r,{modelo:'claude-haiku-4-5-20251001',input_tokens:2000,output_tokens:600,proveedor:'NO GUARDAR',texto:'NO GUARDAR'});
  const d=await redis.hgetall(r.clave);
  assert.equal(Number(d.coste_estimado_micro_usd),5000);
  assert.equal(Number(d['input_tokens:claude-haiku-4-5-20251001']),2000);
  assert.doesNotMatch(JSON.stringify(d),/NO GUARDAR/);
  const c=await C.cupoEscaneos(user(),hoy);assert.equal(c.usadas,1);assert.equal(c.limite,50);
  assert.equal(c.coste_estimado_micro_usd,undefined);
});

test('una cuota corrupta corta la reserva en vez de permitir una llamada sin medir', async () => {
  const r=await C.consumirEscaneos(user(),1,hoy);await redis.hset(r.clave,{paginas:'inválido'});
  await assert.rejects(C.consumirEscaneos(user(),1,hoy),/consumo/);
});

test('preflight gratuito: usa el contador y rechaza documentos de densidad excesiva antes de inferencia', async () => {
  let llamadas=0;
  globalThis.fetch=async(url,op)=>{assert.match(String(url),/\/messages\/count_tokens$/);assert.equal(JSON.parse(op.body).max_tokens,undefined);llamadas++;return Response.json({input_tokens:8001});};
  assert.equal((await T.validarEntradaIA('YQ==','application/pdf',1)).status,400);
  assert.equal((await T.validarEntradaIA('YQ==','application/pdf',2)).inputTokens,8001); // 8.000 por página con Haiku 5.5 (cuenta un 30 % más)
  assert.equal(llamadas,2);
  globalThis.fetch=async()=>Response.json({error:{message:'no disponible'}},{status:503});
  assert.equal((await T.validarEntradaIA('YQ==','image/png',1)).status,503);
});


test('añadir tarjeta durante la prueba no reinicia la bolsa ni la amplía antes del periodo de pago', async () => {
  const u=user();u.plan={...u.plan,pagado:false,hasta:'2026-11-15',nombre:'Plus'};
  await C.consumirEscaneos(u,4,hoy);
  u.plan.pagado=true;u.plan.estado='trialing';
  const c=await C.cupoEscaneos(u,hoy);assert.equal(c.limite,50);assert.equal(c.usadas,4);assert.equal(c.prueba,true);
  u.plan.estado='active';assert.equal((await C.cupoEscaneos(u,hoy)).limite,500);
});

test('tarifa estimada: Haiku 5.5 según la longitud del prompt; Haiku 4.5 como antes; otros, sin estimar', () => {
  assert.deepEqual(C.tarifaIA('claude-haiku-5-5', { input_tokens: 2000, output_tokens: 600 }), [0.1, 0.5]);
  assert.deepEqual(C.tarifaIA('claude-haiku-5-5', { input_tokens: 90000, cache_read_input_tokens: 20000 }), [0.5, 2.5]);
  assert.deepEqual(C.tarifaIA('claude-haiku-4-5-20251001', {}), [1, 5]);
  assert.equal(C.tarifaIA('claude-opus-5-5', {}), null);
});

