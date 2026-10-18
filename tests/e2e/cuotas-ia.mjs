// App compilada con IA y Redis simulados, nunca ejecutar contra producción:
// KV_REST_API_URL=http://127.0.0.1:18719 KV_REST_API_TOKEN=local ANTHROPIC_API_KEY=local
// ANTHROPIC_URL=http://127.0.0.1:18720/v1/messages VERIFICAR_EMAIL=off LIMITES=activo npm start -- --port 13719
// BASE=http://localhost:13719 UPSTASH=http://127.0.0.1:18719 node tests/e2e/cuotas-ia.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import '../apoyo/cargador.mjs';
import { arrancarIA } from '../apoyo/ia-escaneo-mem.mjs';
const BASE = process.env.BASE || 'http://localhost:13719', UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:18719';
for (const url of [BASE, UPSTASH]) if (!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Solo servicios ficticios en localhost');
process.env.KV_REST_API_URL = UPSTASH; process.env.KV_REST_API_TOKEN = 'local';
const { redis } = await import('../../lib/redis.js');
const { crearSesion } = await import('../../lib/auth.js');
const { nuevoPlan } = await import('../../lib/prueba.js');
const { periodoEscaneos } = await import('../../lib/cuotasIA.js');
const ia = await arrancarIA();
const empresa = `cuota-e2e-${randomBytes(4).toString('hex')}`;
const plan = { ...nuevoPlan('aut','Esencial'), pagado: true };
await redis.hset('empresas', { [empresa]: { id: empresa, nombre: 'Cuotas IA (ficticia)', pendiente: false, plan, fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: { nombre: 'Prueba ficticia' }, actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] } });
await redis.hset('usuarios', { [empresa]: { id: empresa, empresa, rol: 'admin', admin: false, emailVerificado: true, nombre: 'Prueba ficticia' } });
const token = await crearSesion(empresa);
const headers = { Cookie: `t=${token}`, Origin: 'null', 'Sec-Fetch-Site': 'same-origin' };
const clave = `escaneos-ia:${empresa}:${periodoEscaneos(plan).periodo}`;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4eUAAAAASUVORK5CYII=';
const get = async () => { const r=await fetch(`${BASE}/api/gastos/ticket`,{headers});return r.json(); };
const foto = async (imagen=png) => { const r=await fetch(`${BASE}/api/gastos/ticket`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({imagen})});return {status:r.status,d:await r.json()}; };
async function pdf(n){const p=await PDFDocument.create();for(let i=0;i<n;i++)p.addPage();return Buffer.from(await p.save());}
async function banco(buf,nombre){const form=new FormData();form.set('archivo',new Blob([buf]),nombre);const r=await fetch(`${BASE}/api/banco/importar`,{method:'POST',headers,body:form});return {status:r.status,d:await r.json()};}
try {
  assert.equal((await get()).cupo.limite,50);
  assert.equal((await foto('data:application/pdf;base64,'+Buffer.from('falso').toString('base64'))).status,400);
  assert.equal(ia.estado.inferencias,0);assert.equal((await get()).cupo.usadas,0);
  ia.estado.falloConteo=true;
  assert.equal((await foto()).status,503);assert.equal((await get()).cupo.usadas,0);assert.equal(ia.estado.inferencias,0);
  ia.estado.falloConteo=false; ia.estado.entrada=6001;
  assert.equal((await foto()).status,400);assert.equal((await get()).cupo.usadas,0);
  ia.estado.entrada=2000;
  const leida=await foto();assert.equal(leida.status,200);assert.equal(leida.d.cupo.usadas,1);assert.equal(leida.d.gasto.base,100);
  assert.equal((await foto('data:application/pdf;base64,'+(await pdf(3)).toString('base64'))).d.cupo.usadas,4);
  assert.equal((await foto('data:application/pdf;base64,'+(await pdf(11)).toString('base64'))).status,400);
  assert.equal((await get()).cupo.usadas,4);
  ia.estado.respuestaInvalida=true;
  assert.equal((await foto()).status,502);assert.equal((await get()).cupo.usadas,5);
  ia.estado.respuestaInvalida=false;
  const b=await banco(await pdf(2),'extracto.pdf');assert.equal(b.status,200,JSON.stringify(b));assert.equal((await get()).cupo.usadas,7);
  const medicion=await redis.hgetall(clave);assert.ok(Number(medicion.coste_estimado_micro_usd)>0);assert.equal(medicion.proveedor,undefined);
  // Reservas simultáneas de dos usuarios de la misma empresa con una sola página disponible.
  await redis.hset(clave,{paginas:49});
  const otro=`${empresa}-g`;await redis.hset('usuarios',{[otro]:{id:otro,empresa,rol:'miembro',permisos:['gastos','gastar'],emailVerificado:true}});
  const t2=await crearSesion(otro);
  const r=await Promise.all([foto(),fetch(`${BASE}/api/gastos/ticket`,{method:'POST',headers:{...headers,Cookie:`t=${t2}`,'Content-Type':'application/json'},body:JSON.stringify({imagen:png})}).then(async x=>({status:x.status,d:await x.json()}))]);
  assert.deepEqual(r.map(x=>x.status).sort(),[200,429]);assert.equal((await get()).cupo.usadas,50);
  const antes=ia.estado.inferencias;assert.equal((await foto()).status,429);assert.equal(ia.estado.inferencias,antes);
  const csv=await banco(Buffer.from('Fecha;Concepto;Importe;Saldo\n18/10/2026;Otro cobro ficticio;50;171'),'extracto.csv');
  assert.equal(csv.status,200,JSON.stringify(csv));assert.equal((await get()).cupo.usadas,50);assert.equal(ia.estado.inferencias,antes);
  const manual=await fetch(`${BASE}/api/gastos`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({fecha:'2026-10-18',actividad:'servicios',concepto:'Gasto manual ficticio',base:10,ivaPct:21})});
  assert.equal(manual.status,200,await manual.text());
  console.log(JSON.stringify({resultado:'OK',empresa,limite:50,pruebas:['validación','preflight','OCR','páginas PDF','PDF banco','telemetría','concurrencia','bloqueo antes de inferencia','CSV sin IA','registro manual'] }));
} finally { await ia.cerrar(); }
