// Regresiones de seguridad: rutas reales y Redis simulado sin abrir puertos.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scrypt } from 'node:crypto';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';

const base = crearBase();
const estado = { cookies: new Map(), headers: new Headers(), hashes: 0, pausarHash: null };
globalThis.__seguridadAuditoria = estado;
const urlRedis = 'http://redis-seguridad.test';
const fetchAnterior = globalThis.fetch;
const env = Object.fromEntries(['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'HIBP', 'BLOQUEO_SERVIDOR'].map((k) => [k, process.env[k]]));
let A, R, API, L;
const modulos = new Map();
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
const diferido = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

async function cargar(archivo) {
  if (modulos.has(archivo)) return import(modulos.get(archivo));
  let fuente = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8');
  fuente = fuente.replace(/import \{([^}]+)\} from '([^']+)';/g, (_, nombres, origen) => {
    let destino;
    const lib = origen.match(/^(?:@\/lib\/|\.\/)([^/]+?)(?:\.js)?$/)?.[1];
    if (lib === 'auth') destino = modulos.get('lib/auth.js');
    else if (lib === 'api') destino = modulos.get('lib/api.js');
    else if (lib === 'portal') destino = modulos.get('lib/portal.js');
    else if (origen === 'react') destino = modulo('export const cache = (fn) => fn;');
    else if (['next/headers', 'next/headers.js'].includes(origen)) destino = modulo(`const s=globalThis.__seguridadAuditoria; export const cookies=async()=>({get:(k)=>s.cookies.has(k)?{value:s.cookies.get(k)}:undefined,set:(k,v)=>s.cookies.set(k,v)}); export const headers=async()=>s.headers;`);
    else if (origen === 'next/server') destino = modulo('export const NextResponse = { redirect:(url,status=307)=>new Response(null,{status,headers:{location:url}}),json:Response.json };');
    else if (origen === 'crypto') destino = modulo(`import {randomBytes,randomUUID,timingSafeEqual,createHash} from 'node:crypto'; export {randomBytes,randomUUID,timingSafeEqual,createHash}; export const scrypt=(...a)=>globalThis.__seguridadAuditoria.scrypt(...a);`);
    else if (lib && ['facturas', 'marca', 'empresa', 'auditoria', 'enableBanking', 'bancoServidor', 'pdf', 'documento'].includes(lib)) {
      destino = modulo(nombres.split(',').map((x) => `export const ${x.trim()}=(...a)=>globalThis.__seguridadAuditoria[${JSON.stringify(x.trim())}](...a);`).join('\n'));
    } else if (lib) destino = new URL(`../lib/${lib}.js`, import.meta.url).href;
    else destino = import.meta.resolve(origen === 'next/navigation' ? 'next/navigation.js' : origen);
    assert.ok(destino, origen);
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
  globalThis.fetch = async (url, opciones) => {
    if (!String(url).startsWith(urlRedis)) throw new Error('Red externa no permitida en esta prueba');
    const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
    const uno = (cmd) => {
      estado.comandos.push(cmd);
      const result = base.run(cmd);
      return { result: new Headers(opciones.headers).get('upstash-encoding') === 'base64' ? b64(result) : result };
    };
    const j = JSON.parse(opciones.body);
    await estado.antes?.(j);
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  R = await import('../lib/redis.js');
  L = await import('../lib/limite.js');
  A = await cargar('lib/auth.js');
  API = await cargar('lib/api.js');
});
beforeEach(() => {
  base.run(['flushdb']); estado.cookies.clear(); estado.headers = new Headers(); estado.hashes = 0; estado.pausarHash = null; estado.antes = null; estado.comandos = [];
  process.env.LIMITES = 'activo'; process.env.BLOQUEO_SERVIDOR = 'activo';
  estado.scrypt = (...args) => {
    estado.hashes++;
    const cb = args.pop();
    scrypt(...args, async (e, b) => { await estado.pausarHash?.(); cb(e, b); });
  };
  Object.assign(estado, { auditar: async () => {}, congelarInstantaneas: async () => {}, bancoDirectoPermitido: () => true,
    urlApp: () => 'http://netto.test', abrirSesion: async () => ({ cuentas: [{ uid: 'c', iban: 'ES1' }] }), sincronizar: async () => {} });
});
after(() => {
  globalThis.fetch = fetchAnterior; delete globalThis.__seguridadAuditoria;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const req = (ruta, b, method = 'POST', ip = '1.2.3.4') => Object.assign(new Request(`http://netto.test${ruta}`, {
  method, headers: { 'content-type': 'application/json', 'x-real-ip': ip }, ...(b === undefined ? {} : { body: JSON.stringify(b) }),
}), { nextUrl: new URL(`http://netto.test${ruta}`) });
const antigua = 'Bosque!72RioGrande';
const nueva = 'Faro!89LunaAzul';
async function usuario(extra = {}, empresa = {}) {
  const u = { id: 'u', empresa: 'e', rol: 'admin', nombre: 'Prueba', email: 'prueba@example.test', creado: new Date().toISOString(), ...extra };
  await R.redis.hset('usuarios', { u }); await R.redis.hset('emails', { [u.email]: u.id });
  await R.redis.hset('empresas', { e: { id: 'e', nombre: 'Empresa', emisor: {}, ...empresa } });
  return u;
}
async function sesion(u) { const t = await A.crearSesion(u.id); estado.cookies.set('t', t); return t; }
function cabeceras(ruta, metodo) { estado.headers = new Headers({ 'x-ruta': ruta, 'x-metodo': metodo }); }

// 1: ambas fases del alta y la baja de llaves respetan el bloqueo.
test('S1: sin d no se pueden registrar ni borrar llaves; desbloqueada sí permite borrarlas', async () => {
  const u = await usuario({ bloqueoPantalla: true }); const t = await sesion(u);
  await R.redis.hset('passkeys:u', { llave: { nombre: 'Móvil' } }); await R.redis.hset('passkey-usuario', { llave: 'u' });
  const ruta = await cargar('app/api/passkey/route.js');
  for (const accion of ['registro-opciones', 'registro']) assert.equal((await ruta.POST(req('/api/passkey', { accion }))).status, 423);
  assert.equal((await ruta.DELETE(req('/api/passkey?id=llave', undefined, 'DELETE'))).status, 423);
  assert.ok(await R.redis.hget('passkeys:u', 'llave'));
  estado.cookies.set('d', await A.desbloqueo(t));
  assert.equal((await ruta.DELETE(req('/api/passkey?id=llave', undefined, 'DELETE'))).status, 200);
  assert.equal(await R.redis.hget('passkeys:u', 'llave'), null);
  assert.equal(await R.redis.hget('passkey-usuario', 'llave'), null);
});

// 2: nombre en /cuenta es la razón social, no el nombre personal.
test('S2: cuenta caducada bloquea todas las ramas de empresa y permite preferencias y contraseña', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) }, { plan: { tipo: 'aut', nombre: 'Pro', hasta: '2020-01-01' } });
  await sesion(u); cabeceras('/api/cuenta', 'PATCH');
  const ruta = await cargar('app/api/cuenta/route.js');
  for (const b of [{ nombre: 'Otra empresa' }, { configuracion: {} }, { verifactu: 'real' }, { marca: {} }, { drive: {} },
    { presentado: {} }, { presentado303: {} }, { presentado202: {} }, { rend130: {} }, { cuotaIS: {} },
    { configuracion: {}, nueva, actual: antigua }]) {
    const r = await ruta.PATCH(req('/api/cuenta', b, 'PATCH'));
    assert.equal(r.status, 402, JSON.stringify(b)); assert.equal((await r.json()).soloLectura, true);
  }
  assert.deepEqual((await R.redis.hget('empresas', 'e')).emisor, {});
  assert.equal((await ruta.PATCH(req('/api/cuenta', { bloqueoPantalla: false }, 'PATCH'))).status, 200);
  assert.equal((await ruta.PATCH(req('/api/cuenta', { actual: antigua, nueva }, 'PATCH'))).status, 200);
});

// 3: el GET tiene efectos de escritura; el estado debe seguir disponible al rechazarlo.
test('S3: vuelta bancaria exige desbloqueo y plan antes de consumir el estado', async () => {
  const u = await usuario({ bloqueoPantalla: true }); const t = await sesion(u);
  await R.redis.set('banco-estado:s', { u: 'u', empresa: 'e' });
  cabeceras('/api/banco/vuelta', 'GET');
  const ruta = await cargar('app/api/banco/vuelta/route.js');
  const r = () => ruta.GET(req('/api/banco/vuelta?state=s&code=c', undefined, 'GET'));
  let x = await r(); assert.equal(x.status, 303); assert.match(x.headers.get('location'), /error=bloqueada/); assert.ok(await R.redis.get('banco-estado:s'));
  estado.cookies.set('d', await A.desbloqueo(t));
  await R.redis.hset('empresas', { e: { id: 'e', emisor: {}, plan: { hasta: '2020-01-01' } } });
  x = await r(); assert.equal(x.status, 303); assert.match(x.headers.get('location'), /error=solo-lectura/); assert.ok(await R.redis.get('banco-estado:s'));
  await R.redis.hset('empresas', { e: { id: 'e', emisor: {} } });
  assert.equal((await r()).status, 303); assert.equal(await R.redis.get('banco-estado:s'), null);
  assert.ok(await R.redis.hlen('bancos:e'));
});

// 4: la ráfaga se lanza antes de que termine ningún hash.
test('S4: reserva atómica de los 10 intentos por email y 30 por IP, con TTL de 15 minutos', async () => {
  const rs = await Promise.all(Array.from({ length: 18 }, () => A.entrar('nadie@example.test', 'mal', 'ip')));
  assert.equal(rs.filter((r) => r?.bloqueado).length, 8); assert.equal(estado.hashes, 10);
  assert.ok(await R.redis.ttl('intentos:nadie@example.test:ip') <= 900);
  assert.ok(await R.redis.ttl('intentos:nadie@example.test:ip') > 0);
  base.run(['flushdb']); estado.hashes = 0;
  const ips = await Promise.all(Array.from({ length: 36 }, (_, i) => A.entrar(`nadie${i}@example.test`, 'mal', 'misma')));
  assert.equal(ips.filter((r) => r?.bloqueado).length, 6); assert.equal(estado.hashes, 30);
  assert.ok(await R.redis.ttl('intentos-ip:misma') > 0);
});

// 5: se pausa el hash del login mientras cambia la contraseña y se cierran las sesiones.
test('S5: un login antiguo pendiente no sobrevive al cambio de contraseña; sesiones antiguas compatibles', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) });
  await R.redis.set('sesion:legada', 'u'); estado.cookies.set('t', 'legada'); assert.ok(await A.usuarioActual());
  const vieja = await sesion(u);
  const entra = diferido(), fin = diferido(); let primera = true;
  estado.pausarHash = async () => { if (primera) { primera = false; entra.resolve(); await fin.promise; } };
  const login = A.entrar(u.email, antigua, 'ip'); await entra.promise;
  let cambio;
  try { cambio = await A.cambiarPassword(u, antigua, nueva); assert.equal(cambio.ok, true); }
  finally { fin.resolve(); }
  const pendiente = await login;
  if (pendiente?.token) { estado.cookies.set('t', pendiente.token); assert.equal(await A.usuarioActual(), null); }
  estado.cookies.set('t', vieja); assert.equal(await A.usuarioActual(), null);
  estado.cookies.set('t', cambio.token); assert.ok(await A.usuarioActual());
  assert.equal(await R.redis.get(`intentos:${u.email}:ip`), null);
});

test('S5: la lectura rechaza una sesión versionada si las credenciales cambian sin borrar su clave', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) }); await sesion(u);
  await R.redis.hset('usuarios', { u: { ...u, pass: await A.cifrar(nueva) } });
  assert.equal(await A.usuarioActual(), null);
});

// 6: solo una aceptación puede fijar credenciales y emitir sesión.
test('S6: una invitación solo crea una sesión bajo aceptaciones simultáneas', async () => {
  await usuario(); await R.redis.hset('invitaciones', { codigo: 'u' });
  assert.ok((await A.aceptarInvitacion('codigo', 'corta')).error);
  assert.equal(await R.redis.hget('invitaciones', 'codigo'), 'u', 'una contraseña inválida no consume la invitación');
  const rs = await Promise.all([A.aceptarInvitacion('codigo', antigua), A.aceptarInvitacion('codigo', nueva)]);
  assert.equal(rs.filter((r) => r.token).length, 1);
  assert.equal((await R.redis.smembers('sesiones:u')).length, 1);
  assert.equal(await R.redis.hget('invitaciones', 'codigo'), null);
});

// 7: PDF y lectura pública comparten las cuotas antes de resolver enlaces/documentos.
test('S7: portal y PDF cortan por IP (60/10 min) y token (120/h), incluso con enlaces inválidos', async () => {
  const P = await cargar('lib/portal.js');
  const pdf = await cargar('app/api/portal/pdf/route.js');
  estado.portalDe = P.portalDe;
  for (let i = 0; i < 60; i++) assert.equal(await P.portalDe(`invalido${i}`, req('/portal/t', undefined, 'GET')), null);
  estado.comandos = [];
  const r = await pdf.GET(req('/api/portal/pdf?t=otro', undefined, 'GET'));
  assert.ok(!estado.comandos.some((c) => c[0] === 'hget'), 'la IP limitada no lee enlaces ni documentos');
  assert.equal(r.status, 429); assert.equal((await r.json()).error, L.MUCHOS);
  assert.ok(await R.redis.ttl('limite:portal-ip:1.2.3.4') <= 600);
  base.run(['flushdb']);
  for (let i = 0; i < 120; i++) assert.equal(await P.portalDe('mismo', req('/portal/t', undefined, 'GET', `ip${i}`)), null);
  estado.comandos = [];
  const token = await P.portalDe('mismo', req('/portal/t', undefined, 'GET', 'otra'));
  assert.ok(!estado.comandos.some((c) => c[0] === 'hget'), 'el token limitado no lee enlaces ni documentos');
  assert.equal(token.status, 429); assert.equal((await token.json()).error, L.MUCHOS);
  assert.ok(await R.redis.ttl('limite:portal-token:mismo') <= 3600);
});

test('S1: el login por llave sigue disponible con la sesión bloqueada', async () => {
  await sesion(await usuario({ bloqueoPantalla: true }));
  const ruta = await cargar('app/api/passkey/route.js');
  const r = await ruta.POST(req('/api/passkey', { accion: 'entrar-opciones' }));
  assert.equal(r.status, 200); assert.ok((await r.json()).challenge);
});

test('S4: un acierto limpia el email y devuelve su reserva a la IP (oficinas con una IP)', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) });
  const r = await A.entrar(u.email, antigua, 'ip');
  assert.ok(r.token); assert.equal(await R.redis.get(`intentos:${u.email}:ip`), null);
  assert.equal(Number(await R.redis.get(`intentos:${u.email}`)), 0);
  assert.equal(Number(await R.redis.get('intentos-ip:ip')), 0);
});

test('S4: quien prueba contraseñas desde su IP no deja sin entrar a la persona desde la suya', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) });
  for (let i = 0; i < 12; i++) await A.entrar(u.email, 'mal', 'atacante');
  assert.equal((await A.entrar(u.email, antigua, 'atacante'))?.bloqueado, true);
  assert.ok((await A.entrar(u.email, antigua, 'victima'))?.token);
});

test('S4: tope alto por email contra una prueba repartida entre muchas IP', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) });
  const rs = [];
  for (let i = 0; i < 105; i++) rs.push(await A.entrar(u.email, 'mal', `ip${i}`));
  assert.ok(rs.slice(100).every((r) => r?.bloqueado));
});

test('S5: una emisión pausada antes de guardar tampoco publica credenciales anteriores', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) });
  const entra = diferido(), fin = diferido(); let primera = true;
  estado.antes = async (j) => {
    const cmds = Array.isArray(j[0]) ? j : [j];
    if (primera && cmds.some((c) => c[0] === 'set' && c[1].startsWith('cuentas:sesion:'))) {
      primera = false; entra.resolve(); await fin.promise;
    }
  };
  const pendiente = A.crearSesion(u.id, u.pass); await entra.promise;
  let cambio;
  try { cambio = await A.cambiarPassword(u, antigua, nueva); }
  finally { fin.resolve(); estado.antes = null; }
  assert.equal(await pendiente, null);
  estado.cookies.set('t', cambio.token); assert.ok(await A.usuarioActual());
});

test('S7: la página limitada termina en un endpoint 429 con MUCHOS y conserva Retry-After', async () => {
  const ruta = await cargar('app/api/portal/limite/route.js');
  for (const espera of [600, 3600]) {
    const r = await ruta.GET(req(`/api/portal/limite?espera=${espera}`, undefined, 'GET'));
    assert.equal(r.status, 429); assert.equal((await r.json()).error, L.MUCHOS);
    assert.equal(r.headers.get('retry-after'), String(espera));
  }
  // La página debe tratar el límite antes de leer/renderizar los documentos.
  const pagina = await readFile(new URL('../app/portal/[token]/page.js', import.meta.url), 'utf8');
  assert.match(pagina, /if \(d instanceof Response\) redirect\(`/);
  assert.ok(pagina.indexOf('d instanceof Response') < pagina.indexOf('const { cliente'));
});

test('S7: dentro de cuota el portal y el PDF siguen devolviendo los documentos del cliente', async () => {
  const u = await usuario({}, { emisor: { nombre: 'Empresa', nif: 'B12345678', iban: 'ES1' } });
  await R.guardar(u, 'clientes', { id: 'CLIENTE', nombre: 'Cliente', nif: '12345678Z' });
  await R.guardar(u, 'facturas', { id: 'F1', fecha: '2026-01-01', numero: 1, cliente: { nombre: 'Cliente', nif: '12345678Z' } });
  await R.redis.hset('portal-enlaces', { valido: { empresa: 'e', cliente: 'CLIENTE' } });
  const P = await cargar('lib/portal.js');
  assert.equal((await P.portalDe('valido', req('/portal/valido', undefined, 'GET'))).facturas[0].id, 'F1');
  estado.identidadDoc = async () => ({ emisor: { nif: 'B12345678', iban: 'ES1' } });
  estado.facturaPdf = async () => Buffer.from('%PDF-prueba');
  const pdf = await cargar('app/api/portal/pdf/route.js');
  const r = await pdf.GET(req('/api/portal/pdf?t=valido&id=F1', undefined, 'GET'));
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(await r.text(), '%PDF-prueba');
});
