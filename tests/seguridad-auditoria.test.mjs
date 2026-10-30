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
const env = Object.fromEntries(['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'HIBP', 'BLOQUEO_SERVIDOR', 'VERCEL_ENV'].map((k) => [k, process.env[k]]));
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
  // Fuera de producción: en el build de Vercel VERCEL_ENV vale «production» y Face ID solo admite los dominios de Fisquo.
  delete process.env.VERCEL_ENV;
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
    urlApp: () => 'http://fisquo.test', abrirSesion: async () => ({ cuentas: [{ uid: 'c', iban: 'ES1' }] }), sincronizar: async () => {} });
});
after(() => {
  globalThis.fetch = fetchAnterior; delete globalThis.__seguridadAuditoria;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const req = (ruta, b, method = 'POST', ip = '1.2.3.4') => Object.assign(new Request(`http://fisquo.test${ruta}`, {
  method, headers: { 'content-type': 'application/json', 'x-real-ip': ip }, ...(b === undefined ? {} : { body: JSON.stringify(b) }),
}), { nextUrl: new URL(`http://fisquo.test${ruta}`) });
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

test('m4: en producción Face ID solo responde en los dominios de Fisquo', async () => {
  const ruta = await cargar('app/api/passkey/route.js');
  const desde = (origen) => Object.assign(new Request(`${origen}/api/passkey`, { method: 'POST', headers: { 'content-type': 'application/json', origin: origen, 'x-real-ip': '9.9.9.9' }, body: JSON.stringify({ accion: 'entrar-opciones' }) }), { nextUrl: new URL(`${origen}/api/passkey`) });
  process.env.VERCEL_ENV = 'production';
  try {
    assert.equal((await ruta.POST(desde('https://otra-web.example'))).status, 403);
    for (const host of ['www.fisquo.com', 'fisquo.com']) {
      const r = await ruta.POST(desde(`https://${host}`));
      assert.equal(r.status, 200, host); assert.equal((await r.json()).rpId, host);
    }
    assert.equal((await ruta.POST(desde('https://www.fisquo.com.otra-web.example'))).status, 403);
    assert.equal((await ruta.POST(desde('https://www.nettohq.com'))).status, 403);
  } finally { delete process.env.VERCEL_ENV; }
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
  estado.identidadDoc = async () => ({ emisor: { nombre: 'Empresa', nif: 'B12345678', direccion: 'C/ Uno, 1', iban: 'ES1' } });
  estado.faltanDatosFactura = (await import('../lib/empresa.js')).faltanDatosFactura;
  estado.facturaPdf = async () => Buffer.from('%PDF-prueba');
  const pdf = await cargar('app/api/portal/pdf/route.js');
  const r = await pdf.GET(req('/api/portal/pdf?t=valido&id=F1', undefined, 'GET'));
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(await r.text(), '%PDF-prueba');
});

// lib/empresa.js va simulada en este archivo: S8 y S9 necesitan la de verdad para el cuestionario.
async function empresaReal() {
  const E = await import('../lib/empresa.js');
  Object.assign(estado, { fiscalDe: E.fiscalDe, actividadesDe: E.actividadesDe, limpiarActividades: E.limpiarActividades, limpiarFiscal: E.limpiarFiscal, usaIgic: E.usaIgic });
}

// 8: una sociedad no puede quedarse en un plan de autónomo cambiando sus datos después del alta (lib/formaJuridica.js).
test('S8: Ajustes no deja poner un CIF en un plan de autónomo y pasar a sociedad cambia la prueba a Pymes', async () => {
  const plan = { tipo: 'aut', nombre: 'Pro', version: 3, periodo: 'mes', hasta: '2099-01-01' };
  const emisor = { nombre: 'Ana López García', nif: '12345678Z' };
  await empresaReal();
  const u = await usuario({}, { plan, emisor, fiscal: { tipo: 'autonomo' } });
  await R.redis.hset('empresa-nif', { '12345678Z': 'e' });
  await sesion(u); cabeceras('/api/cuenta', 'PATCH');
  const ruta = await cargar('app/api/cuenta/route.js');
  let r = await ruta.PATCH(req('/api/cuenta', { ...emisor, nif: 'B12345674' }, 'PATCH'));
  assert.equal(r.status, 400); assert.match((await r.json()).error, /NIF es de una sociedad/);
  r = await ruta.PATCH(req('/api/cuenta', { ...emisor, nombre: 'Ana López SL' }, 'PATCH'));
  assert.equal(r.status, 400);
  assert.equal((await R.redis.hget('empresas', 'e')).emisor.nif, '12345678Z');
  const sociedad = { fiscal: { tipo: 'sociedad' }, actividades: [{ nombre: 'Consultoría', ivaPct: 21, irpfPct: 0 }], emisor: { nombre: 'Ana López SL', nif: 'B12345674' } };
  r = await ruta.PATCH(req('/api/cuenta', { configuracion: sociedad }, 'PATCH'));
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const e = await R.redis.hget('empresas', 'e');
  assert.equal(e.plan.tipo, 'pym'); assert.equal(e.plan.nombre, 'Pro'); assert.equal(e.nombre, 'Ana López SL');
  assert.equal(await R.redis.hget('empresa-nif', 'B12345674'), 'e');
  assert.equal(await R.redis.hget('empresa-nif', '12345678Z'), null);
});

test('S9: pagando un plan de autónomo no se pasa a sociedad, y un NIF de otra cuenta no se reutiliza', async () => {
  await empresaReal();
  const u = await usuario({}, { plan: { tipo: 'aut', nombre: 'Plus', version: 3, periodo: 'mes', pagado: true, suscripcion: 'sub_1' }, emisor: { nombre: 'Ana', nif: '12345678Z' }, fiscal: { tipo: 'autonomo' } });
  await R.redis.hset('empresa-nif', { '87654321X': 'otra' });
  await sesion(u); cabeceras('/api/cuenta', 'PATCH');
  const ruta = await cargar('app/api/cuenta/route.js');
  let r = await ruta.PATCH(req('/api/cuenta', { configuracion: { fiscal: { tipo: 'sociedad' }, actividades: [{ nombre: 'Consultoría' }], emisor: { nombre: 'Ana SL', nif: 'B12345674' } } }, 'PATCH'));
  assert.equal(r.status, 400); assert.match((await r.json()).error, /Tu plan es de Autónomos/);
  r = await ruta.PATCH(req('/api/cuenta', { nombre: 'Ana', nif: '87654321X' }, 'PATCH'));
  assert.equal(r.status, 400); assert.match((await r.json()).error, /otra cuenta de Fisquo/);
  assert.equal((await R.redis.hget('empresas', 'e')).plan.tipo, 'aut');
});

test('Canarias: configuración real valida actividades IGIC y el 420 usa pres303 con pago identificado como 420', async () => {
  await empresaReal();
  const emisor = { nombre: 'Canarias SL', nif: 'B12345674' };
  const u = await usuario({}, { plan: { tipo: 'pym', nombre: 'Pro', version: 3, periodo: 'mes', hasta: '2099-01-01' }, emisor, fiscal: { tipo: 'sociedad', iva: 'general' } });
  await sesion(u); cabeceras('/api/cuenta', 'PATCH');
  const ruta = await cargar('app/api/cuenta/route.js');
  const configuracion = { fiscal: { tipo: 'sociedad', territorio: 'canarias', iva: 'general', intracom: true, oss: true }, emisor, actividades: [{ nombre: 'Servicios', ivaPct: 7, irpfPct: 0 }] };
  let r = await ruta.PATCH(req('/api/cuenta', { configuracion }, 'PATCH'));
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const empresa = await R.redis.hget('empresas', 'e');
  assert.equal(empresa.fiscal.territorio, 'canarias');
  assert.equal(empresa.fiscal.intracom, false);
  assert.equal(empresa.fiscal.oss, undefined);
  assert.equal(empresa.actividades[0].ivaPct, 7);
  r = await ruta.PATCH(req('/api/cuenta', { configuracion: { ...configuracion, actividades: [{ nombre: 'Servicios', ivaPct: 21 }] } }, 'PATCH'));
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /IGIC/);
  r = await ruta.PATCH(req('/api/cuenta', { presentado303: { anio: 2026, t: 1, hecho: true } }, 'PATCH'));
  assert.equal(r.status, 200);
  const presentada = await R.redis.hget('empresas', 'e');
  assert.equal(presentada.pres303[2026][1], true);
  assert.ok(presentada.pagadosHacienda['2026-1-420']);
  assert.equal(presentada.pagadosHacienda['2026-1-303'], undefined);
});

test('despachos: dos gestorías con clientes distintos no se ven entre sí, ni las solicitudes sin aceptar', async () => {
  const D = await import('../lib/despachos.js');
  const emp = (id, datos = {}) => R.redis.hset('empresas', { [id]: { id, nombre: id, ...datos } });
  for (const id of ['propiaA', 'propiaB', 'cA', 'cB', 'cP']) await emp(id);
  const dA = (await D.crearDespacho({ nombre: 'Asesoría A', codigo: 'ASESA', titular: 'ta', empresa: 'propiaA' })).despacho;
  const dB = (await D.crearDespacho({ nombre: 'Asesoría B', codigo: 'ASESB', titular: 'tb', empresa: 'propiaB' })).despacho;
  dA.miembros.ga = { rol: 'gestor' };
  await R.redis.hset('despachos', { [dA.id]: dA });
  for (const [c, d] of [['cA', dA], ['cB', dB]]) { await D.unirCliente(c, d); await D.aceptarCliente(c, d.id); }
  await D.unirCliente('cP', dA); // solicitud sin aceptar
  const ta = { id: 'ta', empresa: 'propiaA', despacho: dA.id };
  const ga = { id: 'ga', empresa: 'propiaA', despacho: dA.id };
  const tb = { id: 'tb', empresa: 'propiaB', despacho: dB.id };
  const entra = async (u, pedida) => { const r = await A.conEmpresa(u, pedida); return [r.empresa, r.viaDespacho?.id || null]; };

  assert.deepEqual(await entra(ga, 'cA'), ['cA', dA.id]);
  assert.deepEqual(await entra(tb, 'cB'), ['cB', dB.id]);
  // Pedir el cliente de la otra gestoría (cookie «e» puesta a mano) deja en la empresa propia, sin perfil Gestoría.
  assert.deepEqual(await entra(ga, 'cB'), ['propiaA', null]);
  assert.deepEqual(await entra(ta, 'cB'), ['propiaA', null]);
  assert.deepEqual(await entra(tb, 'cA'), ['propiaB', null]);
  // La solicitud sin aceptar no la ve nadie, tampoco el titular.
  assert.deepEqual(await entra(ta, 'cP'), ['propiaA', null]);
  assert.deepEqual(await entra(ga, 'cP'), ['propiaA', null]);
  assert.deepEqual((await D.clientesVisibles(dA, 'ta')).map((x) => x.id), ['cA']);
  assert.deepEqual((await D.clientesVisibles(dB, 'tb')).map((x) => x.id), ['cB']);
  // Aceptada, ya entra; y si el cliente se va a la otra gestoría, la primera deja de verlo al momento.
  await D.aceptarCliente('cP', dA.id);
  assert.deepEqual(await entra(ga, 'cP'), ['cP', dA.id]);
  await D.separarCliente('cP', dA.id);
  await D.unirCliente('cP', dB); await D.aceptarCliente('cP', dB.id);
  assert.deepEqual(await entra(ga, 'cP'), ['propiaA', null]);
  assert.deepEqual(await entra(tb, 'cP'), ['cP', dB.id]);
});

// Face ID nativo de la app (app/api/dispositivo): la credencial solo se guarda como huella, sirve para entrar sin
// sesión, deja de valer al quitarla o al recuperar la contraseña (borrarLlaves) y fuera de la app no existe.
test('Face ID nativo: alta con sesión, entrada sin ella, retirada y solo en la app', async () => {
  const APP = 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 FisquoApp/1';
  const deApp = (ruta, b, method = 'POST') => { const r = req(ruta, b, method); r.headers.set('user-agent', APP); return r; };
  const u = await usuario(); await sesion(u); cabeceras('/api/dispositivo', 'POST');
  const ruta = await cargar('app/api/dispositivo/route.js');
  assert.equal((await ruta.POST(req('/api/dispositivo', { accion: 'alta' }))).status, 404, 'en el navegador no existe');
  const alta = await (await ruta.POST(deApp('/api/dispositivo', { accion: 'alta', nombre: 'iPhone de prueba' }))).json();
  assert.ok(alta.valor && alta.id);
  const guardado = await R.redis.hget('dispositivos:u', alta.id);
  assert.notEqual(guardado.huella, alta.valor, 'no se guarda la credencial, solo su huella');
  // Sin sesión: entra y abre una nueva.
  estado.cookies.clear(); estado.headers = new Headers();
  const r = await ruta.POST(deApp('/api/dispositivo', { accion: 'entrar', valor: alta.valor }));
  assert.equal(r.status, 200);
  assert.ok(estado.cookies.get('t') && estado.cookies.get('d'));
  assert.equal((await ruta.POST(deApp('/api/dispositivo', { accion: 'entrar', valor: 'x'.repeat(43) }))).status, 401);
  // Al recuperar la contraseña se retira: la app recibe «retirada» y borra la suya.
  await A.borrarLlaves('u');
  const fuera = await ruta.POST(deApp('/api/dispositivo', { accion: 'entrar', valor: alta.valor }));
  assert.equal(fuera.status, 401);
  assert.equal((await fuera.json()).retirada, true);
  assert.equal(await R.redis.hlen('dispositivo-credencial'), 0);
});

// Auditoría de seguridad de octubre de 2026 (skill security-audit): regresiones de identidad y sesiones.
test('A1: reenviar o aceptar una invitación no pone contraseña a una cuenta activa de Google o Apple', async () => {
  const s = await usuario({ social: { google: { sub: 'g1' } } });
  assert.equal(A.invitacionPendiente(s), false, 'sin contraseña pero con Google: ya está activa');
  assert.equal(A.invitacionPendiente({ ...s, social: undefined }), true);
  await R.redis.hset('invitaciones', { cod1: s.id });
  const r = await A.aceptarInvitacion('cod1', nueva);
  assert.ok(r.error && !r.token);
  assert.equal((await R.redis.hget('usuarios', s.id)).pass, undefined);
});

test('A2: Google o Apple no se enlazan por email a una cuenta con el email sin confirmar', async () => {
  const S = await cargar('lib/socialServidor.js');
  await usuario({ emailVerificado: false, pass: 'x' });
  assert.deepEqual(await S.cuentaDe('google', { sub: 'g2', email: 'prueba@example.test' }), { sinConfirmar: true });
  assert.equal(await R.redis.hget('social-usuario', 'google:g2'), null);
  await R.redis.hset('usuarios', { u: { ...(await R.redis.hget('usuarios', 'u')), emailVerificado: true } });
  assert.equal((await S.cuentaDe('google', { sub: 'g2', email: 'prueba@example.test' })).id, 'u');
});

test('A3: Face ID nativo pide haber entrado hace poco o la contraseña, y cambiar la contraseña lo quita', async () => {
  const APP = 'Mozilla/5.0 (iPhone) FisquoApp/1';
  const deApp = (b) => { const r = req('/api/dispositivo', b); r.headers.set('user-agent', APP); return r; };
  const u = await usuario({ pass: await A.cifrar(antigua) });
  const t = await sesion(u); cabeceras('/api/dispositivo', 'POST');
  await R.redis.del(`sesion-reciente:${t}`);
  const ruta = await cargar('app/api/dispositivo/route.js');
  const sin = await ruta.POST(deApp({ accion: 'alta', nombre: 'iPhone' }));
  assert.equal(sin.status, 401);
  assert.equal((await sin.json()).reautenticar, true);
  assert.equal((await ruta.POST(deApp({ accion: 'alta', nombre: 'iPhone', password: antigua }))).status, 200);
  assert.equal(Object.keys((await R.redis.hgetall('dispositivos:u')) || {}).length, 1);
  await A.cambiarPassword(await R.redis.hget('usuarios', 'u'), antigua, nueva);
  assert.equal(Object.keys((await R.redis.hgetall('dispositivos:u')) || {}).length, 0, 'el cambio de contraseña retira Face ID');
});

test('A4: activar la verificación en dos pasos pide la contraseña', async () => {
  const u = await usuario({ pass: await A.cifrar(antigua) });
  await sesion(u); cabeceras('/api/dos-pasos', 'POST');
  const ruta = await cargar('app/api/dos-pasos/route.js');
  assert.equal((await ruta.POST(req('/api/dos-pasos', { accion: 'empezar' }))).status, 400);
  const bien = await ruta.POST(req('/api/dos-pasos', { accion: 'empezar', password: antigua }));
  assert.equal(bien.status, 200);
  assert.ok((await bien.json()).clave);
});

test('A5: quitar los accesos sin contraseña también desconecta WhatsApp', async () => {
  await usuario();
  await R.redis.set('whatsapp:de:u', '34600000000'); await R.redis.set('whatsapp:tel:34600000000', { usuario: 'u', empresa: 'e' });
  await A.borrarLlaves('u');
  assert.equal(await R.redis.get('whatsapp:tel:34600000000'), null);
});

test('A6: el código de «Continuar con Google» de la app solo se canjea en la vista web que lo pidió', async () => {
  const S = await cargar('lib/socialServidor.js');
  const v = 'a'.repeat(64);
  const c = await S.codigoCanje({ id: 'u' }, { token: 't' }, 'google', v);
  assert.equal(await S.canjear(c, 'b'.repeat(64)), null, 'otra vista web (u otro navegador) no lo canjea');
  const c2 = await S.codigoCanje({ id: 'u' }, { token: 't' }, 'google', v);
  assert.equal((await S.canjear(c2, v)).id, 'u');
  assert.equal(await S.canjear(c2, v), null, 'un solo uso');
});

test('A7: abrir el enlace para unirse a otra empresa no une; solo el POST con la sesión', async () => {
  const u = await usuario();
  await R.redis.hset('empresas', { e2: { id: 'e2', nombre: 'Otra', emisor: {} } });
  await R.redis.set('union:c7', { usuario: 'u', empresa: 'e2', rol: 'miembro', permisos: [] });
  await sesion(u); cabeceras('/api/invitacion/unirse', 'GET');
  const ruta = await cargar('app/api/invitacion/unirse/route.js');
  const abrir = await ruta.GET(req('/api/invitacion/unirse?c=c7', undefined, 'GET'));
  assert.match(abrir.headers.get('location'), /\/invitacion\/unirse\?c=c7$/);
  assert.equal(Boolean((await R.redis.hget('usuarios', 'u')).empresas?.e2), false);
  const f = new FormData(); f.set('c', 'c7');
  const post = Object.assign(new Request('http://fisquo.test/api/invitacion/unirse', { method: 'POST', body: f }), { nextUrl: new URL('http://fisquo.test/api/invitacion/unirse') });
  // (el NextResponse de esta prueba no tiene cookies: basta con que la membresía se guarde)
  await ruta.POST(post).catch(() => {});
  assert.ok((await R.redis.hget('usuarios', 'u')).empresas?.e2);
});

test('A8: los ids nuevos de empresa y usuario son largos, con letra, y no pisan uno existente', async () => {
  const { usuario: n } = await A.crearUsuario({ nombre: 'Nueva', email: 'nueva@example.test', password: nueva });
  assert.match(n.id, /^[a-f0-9]{16}$/);
  assert.match(n.id, /[a-df]/);
  assert.ok(await R.redis.hget('empresas', n.id));
  const { id } = await A.nuevaEmpresa(n.id, 'Segunda SL');
  assert.ok(id && id !== n.id && /^[a-f0-9]{16}$/.test(id));
});

test('A9: borrar una empresa revoca sus enlaces de presupuesto y borra sus presupuestos', async () => {
  await usuario({ admin: false }, {});
  await R.redis.hset(R.clave({ empresa: 'e' }, 'presupuestos'), { P1: { id: 'P1', token: 'tokp1' } });
  await R.redis.hset('presupuesto-enlaces', { tokp1: { empresa: 'e', id: 'P1' } });
  await A.borrarEmpresa('e');
  assert.equal(await R.redis.hget('presupuesto-enlaces', 'tokp1'), null);
  assert.equal(await R.redis.hget(R.clave({ empresa: 'e' }, 'presupuestos'), 'P1'), null);
});
