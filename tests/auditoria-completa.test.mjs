// Auditoría completa (21-10-2026): permisos del paquete de la gestoría y de adónde se envían los datos, carreras al
// numerar presupuestos, generar nóminas y facturar señal y resto, mensajes de correo, nombres de archivo y cámara.
// Rutas reales con Redis simulado sin abrir puertos (mismo método que tests/seguridad-auditoria.test.mjs).
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';
import { motivoEnvio } from '../lib/email.js';
import { nombreArchivoDoc } from '../lib/formato.js';
import config from '../next.config.mjs';

const base = crearBase();
const estado = { cookies: new Map(), headers: new Headers() };
globalThis.__auditoriaCompleta = estado;
const urlRedis = 'http://redis-auditoria-completa.test';
const fetchAnterior = globalThis.fetch;
const env = Object.fromEntries(['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'HIBP', 'BLOQUEO_SERVIDOR', 'VERCEL_ENV'].map((k) => [k, process.env[k]]));
let A, R;
const modulos = new Map();
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
// Lo que se sustituye por un doble en estas pruebas (lo demás es el código real).
const DOBLES = ['facturas', 'auditoria', 'gestoriaEnvio', 'trabajos'];

async function cargar(archivo) {
  if (modulos.has(archivo)) return import(modulos.get(archivo));
  let fuente = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8');
  fuente = fuente.replace(/import \{([^}]+)\} from '([^']+)';/g, (_, nombres, origen) => {
    let destino;
    const lib = origen.match(/^(?:@\/lib\/|\.\/)([^/]+?)(?:\.js)?$/)?.[1];
    if (lib === 'auth') destino = modulos.get('lib/auth.js');
    else if (lib === 'api') destino = modulos.get('lib/api.js');
    else if (origen === 'react') destino = modulo('export const cache = (fn) => fn;');
    else if (['next/headers', 'next/headers.js'].includes(origen)) destino = modulo('const s=globalThis.__auditoriaCompleta; export const cookies=async()=>({get:(k)=>s.cookies.has(k)?{value:s.cookies.get(k)}:undefined,set:(k,v)=>s.cookies.set(k,v)}); export const headers=async()=>s.headers;');
    else if (origen === 'next/server') destino = modulo('export const NextResponse = { redirect:(url,status=307)=>new Response(null,{status,headers:{location:url}}),json:Response.json }; export const after = () => {};');
    else if (lib && DOBLES.includes(lib)) destino = modulo(nombres.split(',').map((x) => `export const ${x.trim()}=(...a)=>globalThis.__auditoriaCompleta[${JSON.stringify(x.trim())}](...a);`).join('\n'));
    else if (lib) destino = new URL(`../lib/${lib}.js`, import.meta.url).href;
    else destino = import.meta.resolve(origen === 'next/navigation' ? 'next/navigation.js' : origen);
    return `import {${nombres}} from '${destino}';`;
  });
  const url = modulo(fuente);
  modulos.set(archivo, url);
  return import(url);
}

before(async () => {
  process.env.KV_REST_API_URL = urlRedis;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  process.env.HIBP = 'off';
  delete process.env.VERCEL_ENV;
  globalThis.fetch = async (url, opciones) => {
    if (!String(url).startsWith(urlRedis)) throw new Error('Red externa no permitida en esta prueba');
    const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
    const uno = (cmd) => {
      const result = base.run(cmd);
      return { result: new Headers(opciones.headers).get('upstash-encoding') === 'base64' ? b64(result) : result };
    };
    const j = JSON.parse(opciones.body);
    // Las peticiones se intercalan como en Upstash: cada una espera un poco (las carreras se ven).
    await new Promise((ok) => setTimeout(ok, 1));
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  R = await import('../lib/redis.js');
  A = await cargar('lib/auth.js');
  await cargar('lib/api.js');
});
beforeEach(() => {
  base.run(['flushdb']); estado.cookies.clear(); estado.headers = new Headers();
  process.env.LIMITES = 'activo'; process.env.BLOQUEO_SERVIDOR = 'off';
  Object.assign(estado, { auditar: async () => {}, secundarios: async () => {}, enviarPaqueteGestoria: async () => ({ ok: true, para: 'g@x.test' }) });
});
after(() => {
  globalThis.fetch = fetchAnterior; delete globalThis.__auditoriaCompleta;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

const req = (ruta, b, method = 'POST') => Object.assign(new Request(`http://fisquo.test${ruta}`, {
  method, headers: { 'content-type': 'application/json', 'x-real-ip': '1.2.3.4' }, ...(b === undefined ? {} : { body: JSON.stringify(b) }),
}), { nextUrl: new URL(`http://fisquo.test${ruta}`) });
const ACT = [{ id: 'eventos', nombre: 'Eventos', serie: '', ivaPct: 21, irpfPct: 0 }];
async function entrar({ rol = 'admin', permisos } = {}) {
  const u = { id: 'u', empresa: 'e', rol, ...(permisos ? { permisos } : {}), nombre: 'Prueba', email: 'prueba@example.test', creado: new Date().toISOString() };
  await R.redis.hset('usuarios', { u }); await R.redis.hset('emails', { [u.email]: u.id });
  await R.redis.hset('empresas', { e: { id: 'e', nombre: 'Empresa', emisor: { nombre: 'EMPRESA SL', nif: 'B12345674' }, actividades: ACT, fiscal: { tipo: 'sociedad', iva: 'general' } } });
  estado.cookies.set('t', await A.crearSesion(u.id));
  return u;
}
const ruta = (r, m) => { estado.headers = new Headers({ 'x-ruta': r, 'x-metodo': m }); };

test('paquete: mandarlo a la gestoría exige, además de «Datos de la empresa», poder ver facturas y gastos', async () => {
  const p = await cargar('app/api/paquete/route.js');
  await entrar({ rol: 'miembro', permisos: ['empresa'] }); ruta('/api/paquete', 'POST');
  assert.equal((await p.POST(req('/api/paquete', { anio: 2026, t: 3 }))).status, 403);
  await entrar({ rol: 'miembro', permisos: ['empresa', 'resumen', 'facturas', 'gastos'] });
  assert.equal((await p.POST(req('/api/paquete', { anio: 2026, t: 3 }))).status, 200);
});

test('gestoría y Google Drive: elegir adónde se envían los datos exige poder verlos', async () => {
  const c = await cargar('app/api/cuenta/route.js');
  await entrar({ rol: 'miembro', permisos: ['empresa'] }); ruta('/api/cuenta', 'PATCH');
  const gestoria = { gestoria: { nombre: 'Yo', email: 'yo@example.test', auto: true } };
  const drive = { drive: { url: 'https://script.google.com/macros/s/abc/exec', token: 'x' } };
  assert.equal((await c.PATCH(req('/api/cuenta', gestoria, 'PATCH'))).status, 403);
  assert.equal((await c.PATCH(req('/api/cuenta', drive, 'PATCH'))).status, 403);
  assert.equal((await R.redis.hget('empresas', 'e')).gestoria, undefined);
  await entrar({ rol: 'miembro', permisos: ['empresa', 'resumen', 'facturas', 'gastos'] });
  assert.equal((await c.PATCH(req('/api/cuenta', gestoria, 'PATCH'))).status, 200);
  assert.equal((await R.redis.hget('empresas', 'e')).gestoria.email, 'yo@example.test');
});

test('presupuestos: dos a la vez tienen números distintos y ninguno pisa al otro', async () => {
  const p = await cargar('app/api/presupuestos/route.js');
  await entrar(); ruta('/api/presupuestos', 'POST');
  const datos = (n) => ({ fecha: '2026-10-21', actividad: 'eventos', cliente: { nombre: `Cliente ${n}` }, concepto: `Servicio ${n}`, base: '100', ivaPct: 21, irpfPct: 0 });
  estado.limpiar = (b) => ({ fecha: b.fecha, actividad: b.actividad, cliente: b.cliente, concepto: b.concepto, base: Number(b.base), ivaPct: 21, irpfPct: 0 });
  estado.guardarCliente = async () => {};
  const rs = await Promise.all([1, 2, 3].map((n) => p.POST(req('/api/presupuestos', datos(n)))));
  const ids = await Promise.all(rs.map(async (r) => (await r.json()).presupuesto.id));
  assert.equal(new Set(ids).size, 3, ids.join());
  const guardados = Object.values((await R.redis.hgetall('presupuestos:e')) || {});
  assert.deepEqual(guardados.map((x) => x.concepto).sort(), ['Servicio 1', 'Servicio 2', 'Servicio 3']);
});

test('presupuestos: señal y resto a la vez no facturan más que el presupuesto', async () => {
  const f = await cargar('app/api/presupuestos/facturar/route.js');
  await entrar(); ruta('/api/presupuestos/facturar', 'POST');
  await R.redis.hset('presupuestos:e', { 'P2026-1': { id: 'P2026-1', numero: 1, anio: 2026, serie: 'P', fecha: '2026-10-01', validez: 90, actividad: 'eventos', cliente: { nombre: 'Cliente' }, concepto: 'Boda', base: 100, ivaPct: 21, irpfPct: 0, senalPct: 30, estado: 'aceptado', facturas: [] } });
  let n = 0;
  const bases = [];
  estado.crearFactura = async (_u, datos) => {
    bases.push(datos.base);
    await new Promise((ok) => setTimeout(ok, 30)); // la emisión tarda: la otra petición tendría tiempo de leer
    return { factura: { id: `2026-${++n}`, numero: n, anio: 2026, serie: '', fecha: datos.fecha, base: datos.base } };
  };
  const rs = await Promise.all([f.POST(req('/api/presupuestos/facturar', { id: 'P2026-1', tipo: 'senal' })), f.POST(req('/api/presupuestos/facturar', { id: 'P2026-1', tipo: 'resto' }))]);
  assert.deepEqual(rs.map((r) => r.status), [200, 200]);
  assert.equal(bases.reduce((s, x) => s + x, 0), 100, `bases facturadas: ${bases.join(' + ')}`);
  const p = await R.redis.hget('presupuestos:e', 'P2026-1');
  assert.deepEqual(p.facturas.map((x) => x.tipo).sort(), ['resto', 'senal']);
});

test('nóminas: dos «Generar» a la vez no duplican nóminas ni gastos', async () => {
  const r = await cargar('app/api/nominas/route.js');
  await entrar(); ruta('/api/nominas', 'POST');
  await R.redis.hset('empleados:e', { e1: { id: 'e1', nombre: 'Ana', alta: '2026-01-01', baja: '', bruto: 1500, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 }, e2: { id: 'e2', nombre: 'Bea', alta: '2026-01-01', baja: '', bruto: 1800, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 } });
  const rs = await Promise.all([r.POST(req('/api/nominas', { mes: '2026-10' })), r.POST(req('/api/nominas', { mes: '2026-10' }))]);
  assert.deepEqual(rs.map((x) => x.status), [200, 200]);
  const nominas = Object.values((await R.redis.hgetall('nominas:e')) || {});
  assert.deepEqual(nominas.map((x) => x.empleado).sort(), ['e1', 'e2']);
  const gastos = Object.keys((await R.redis.hgetall('gastos:e')) || {}).filter((k) => k.startsWith('nomina-'));
  assert.equal(gastos.length, 2);
});

test('nóminas: el bruto corregido debe ser un importe positivo y razonable; los % que no llegan no cambian', async () => {
  const r = await cargar('app/api/nominas/route.js');
  await entrar(); ruta('/api/nominas', 'PATCH');
  await R.redis.hset('nominas:e', { n1: { id: 'n1', mes: '2026-10', empleado: 'e1', empleadoNombre: 'Ana', bruto: 1500, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 } });
  for (const bruto of [-1000, 1e309, 'abc', 0, 5e6]) assert.equal((await r.PATCH(req('/api/nominas', { id: 'n1', bruto }, 'PATCH'))).status, 400, String(bruto));
  assert.equal((await r.PATCH(req('/api/nominas', { id: 'n1', bruto: '1.600,50' }, 'PATCH'))).status, 200);
  const n = await R.redis.hget('nominas:e', 'n1');
  assert.deepEqual([n.bruto, n.irpfPct, n.ssEmpresaPct], [1600.5, 12, 31.65]);
});

test('email: el motivo dice qué hacer (dirección mal escrita, configuración o reintentar)', () => {
  assert.match(motivoEnvio(Object.assign(new Error('The to address is invalid'), { status: 422 })), /dirección de email esté bien escrita/);
  assert.match(motivoEnvio(Object.assign(new Error('Invalid `to` field.'), { status: 422 })), /bien escrita/);
  assert.match(motivoEnvio(Object.assign(new Error('API key is invalid'), { status: 401 })), /no está bien configurado/);
  assert.match(motivoEnvio(Object.assign(new Error('The domain is not verified'), { status: 403 })), /no está bien configurado/);
  assert.match(motivoEnvio(new Error('Resend ha superado el tiempo máximo de respuesta.')), /Inténtalo de nuevo en unos minutos/);
});

test('nombre de archivo de un documento: conserva acentos y eñes y quita signos', () => {
  assert.equal(nombreArchivoDoc('01-2024', 'Fundació Música Viva'), '01-2024 FUNDACIÓ MÚSICA VIVA');
  assert.equal(nombreArchivoDoc('A2026-001', 'Peña & Hijos, S.L.', 'Presupuesto '), 'Presupuesto A2026-001 PEÑA HIJOS SL');
  assert.equal(nombreArchivoDoc('7', '  a/b\\c:d  '), '7 ABCD');
});

test('la cámara se permite a la propia web (la usa «Varios tickets»); micrófono y ubicación, no', async () => {
  const cabeceras = (await config.headers())[0].headers;
  const pp = cabeceras.find((h) => h.key === 'Permissions-Policy').value;
  assert.match(pp, /camera=\(self\)/);
  assert.match(pp, /microphone=\(\)/);
  assert.match(pp, /geolocation=\(\)/);
});
