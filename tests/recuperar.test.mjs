// F12: recuperación pública, tokens de un solo uso y revocación de sesiones.
// Solo contra el simulador de Upstash; el proveedor de email y headers de Next se simulan.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { register } from 'node:module';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === 'next/headers') return { url: 'data:text/javascript,export const headers = async () => new Headers(); export const cookies = async () => ({ get: () => undefined });', shortCircuit: true };
  return next(s, c);
}`), import.meta.url);

let srv, R, A, F;
const enviados = [];
const fetchReal = globalThis.fetch;
const variables = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'RESEND_API_KEY', 'RESEND_URL', 'LIMITES'];
const entorno = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
const anterior = 'contraseña anterior';
const nueva = 'contraseña nueva segura';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const caducado = { error: 'El enlace ha caducado o ya se ha usado' };

before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  process.env.RESEND_URL = 'https://email.test/enviar';
  globalThis.fetch = async (url, opciones) => {
    if (String(url) === process.env.RESEND_URL) {
      enviados.push(JSON.parse(opciones.body));
      return Response.json({ id: `email-${enviados.length}` });
    }
    return fetchReal(url, opciones);
  };
  R = await import('../lib/redis.js');
  A = await import('../lib/auth.js');
  F = await import('../lib/recuperar.js');
});
beforeEach(async () => {
  srv.base.run(['flushdb']);
  enviados.length = 0;
  process.env.RESEND_API_KEY = 'pruebas';
  process.env.LIMITES = 'activo';
});
after(async () => {
  globalThis.fetch = fetchReal;
  for (const k of variables) {
    if (entorno[k] === undefined) delete process.env[k];
    else process.env[k] = entorno[k];
  }
  await srv?.cerrar();
});

async function usuario(id = 'u1') {
  const u = { id, empresa: `empresa-${id}`, nombre: 'Ana', email: `${id}@ejemplo.es`, pass: await A.cifrar(anterior) };
  await R.redis.hset('usuarios', { [id]: u });
  await R.redis.hset('emails', { [u.email]: id });
  return u;
}
const pedir = (email, ip = '192.0.2.1') => F.solicitarRecuperacion({ email, ip, origen: 'https://netto.test' });
const tokenEnviado = (i = enviados.length - 1) => {
  const enlace = enviados[i].html.match(/https:\/\/netto\.test\/recuperar\?t=([a-f0-9]{64})/);
  assert.ok(enlace, 'el email contiene el enlace al origen de la app');
  return enlace[1];
};

test('F12: mismo resultado exista o no el email; solo la cuenta existente recibe el enlace', async () => {
  const u = await usuario();
  assert.deepEqual(await pedir(`  ${u.email.toUpperCase()}  `), { ok: true });
  assert.deepEqual(await pedir('sin-cuenta@ejemplo.es'), { ok: true });
  assert.deepEqual(await pedir(''), { ok: true });
  assert.equal(enviados.length, 1);
  assert.deepEqual(enviados[0].to, [u.email]);
});

test('F12: Redis guarda solo el sha256, con una caducidad de 30 minutos', async () => {
  const u = await usuario();
  await pedir(u.email);
  const t = tokenEnviado();
  const k = `recuperar:${sha(t)}`;
  assert.equal(await R.redis.get(k), u.id);
  assert.equal(await R.redis.get(`recuperar:${t}`), null);
  assert.equal(await R.redis.get(`recuperar-usuario:${u.id}`), sha(t));
  assert.ok((await R.redis.ttl(k)) >= 1799);
  assert.ok((await R.redis.ttl(k)) <= 1800);
  for (const [clave, valor] of srv.base.db) {
    assert.ok(!clave.includes(t));
    assert.ok(!JSON.stringify([...valor.m || [], valor.v]).includes(t), 'el token no se guarda en ningún valor');
  }
});

test('F12: el token funciona una vez, cambia la contraseña, revoca todas las sesiones y audita', async () => {
  const u = await usuario();
  const sesiones = await Promise.all([A.crearSesion(u.id), A.crearSesion(u.id)]);
  await pedir(u.email);
  const t = tokenEnviado();
  assert.deepEqual(await F.recuperarPassword(t, nueva, '192.0.2.1'), { ok: true });
  assert.deepEqual(await F.recuperarPassword(t, 'otra contraseña segura', '192.0.2.1'), caducado);
  const guardado = await R.redis.hget('usuarios', u.id);
  assert.ok(await A.comprobar(nueva, guardado.pass));
  assert.ok(!(await A.comprobar(anterior, guardado.pass)));
  for (const s of sesiones) assert.equal(await R.redis.get(`sesion:${s}`), null);
  assert.deepEqual(await R.redis.smembers(`sesiones:${u.id}`), []);
  assert.equal(await R.redis.get(`recuperar-usuario:${u.id}`), null);
  assert.equal(srv.base.run(['keys', '*sesion:*']).length, 0, 'no inicia sesión');
  const auditoria = await R.redis.lrange(`auditoria:${u.empresa}`, 0, -1);
  assert.equal(auditoria.length, 1);
  assert.equal(auditoria[0].accion, 'Contraseña recuperada');
  assert.equal(auditoria[0].quien, u.id);
});

test('F12: un token caducado o desconocido no cambia la contraseña', async () => {
  const u = await usuario();
  await pedir(u.email);
  const t = tokenEnviado();
  // El simulador aplica las expiraciones al leer; sin esperar media hora.
  await R.redis.expire(`recuperar:${sha(t)}`, -1);
  assert.deepEqual(await F.recuperarPassword(t, nueva), caducado);
  assert.deepEqual(await F.recuperarPassword('a'.repeat(64), nueva), caducado);
  assert.deepEqual(await F.recuperarPassword('malformado', nueva), caducado);
  assert.ok(await A.comprobar(anterior, (await R.redis.hget('usuarios', u.id)).pass));
});

test('F12: un segundo enlace invalida el primero', async () => {
  const u = await usuario();
  await pedir(u.email);
  const primero = tokenEnviado();
  await pedir(u.email);
  const segundo = tokenEnviado();
  assert.notEqual(primero, segundo);
  assert.equal(await R.redis.get(`recuperar:${sha(primero)}`), null);
  assert.deepEqual(await F.recuperarPassword(primero, nueva), caducado);
  assert.deepEqual(await F.recuperarPassword(segundo, nueva), { ok: true });
});

test('F12: contraseña corta o igual a la anterior se rechaza sin consumir el token', async () => {
  const u = await usuario();
  const s = await A.crearSesion(u.id);
  await pedir(u.email);
  const t = tokenEnviado();
  for (const password of ['123456789', anterior, null]) {
    assert.ok((await F.recuperarPassword(t, password)).error);
    assert.equal(await R.redis.get(`recuperar:${sha(t)}`), u.id);
    assert.equal(await R.redis.get(`sesion:${s}`), u.id);
    assert.ok(await A.comprobar(anterior, (await R.redis.hget('usuarios', u.id)).pass));
  }
  assert.deepEqual(await F.recuperarPassword(t, '1234567890'), { ok: true });
});

test('F12: dos cambios simultáneos solo pueden usar el token una vez', async () => {
  const u = await usuario();
  await pedir(u.email);
  const t = tokenEnviado();
  const resultados = await Promise.all([
    F.recuperarPassword(t, nueva, '192.0.2.1'),
    F.recuperarPassword(t, 'otra contraseña segura', '192.0.2.2'),
  ]);
  assert.equal(resultados.filter((r) => r.ok).length, 1);
  assert.deepEqual(resultados.find((r) => r.error), caducado);
});

test('F12: dos solicitudes simultáneas solo dejan válido el último enlace emitido', async () => {
  const u = await usuario();
  await Promise.all([pedir(u.email), pedir(u.email)]);
  assert.equal(enviados.length, 2);
  const tokens = enviados.map((_, i) => tokenEnviado(i));
  const vigente = await R.redis.get(`recuperar-usuario:${u.id}`);
  for (const t of tokens) assert.equal(await R.redis.get(`recuperar:${sha(t)}`), sha(t) === vigente ? u.id : null);
  assert.equal(srv.base.run(['keys', '*recuperar:*']).length, 1);
});

test('F12: límite de cinco enlaces por email y hora con respuesta idéntica', async () => {
  const u = await usuario();
  for (let i = 0; i < 6; i++) assert.deepEqual(await pedir(i % 2 ? u.email.toUpperCase() : u.email, `192.0.2.${i}`), { ok: true });
  assert.equal(enviados.length, 5);
  const k = `limite:recuperar-email:${sha(u.email)}`;
  assert.equal(await R.redis.get(k), 6);
  assert.ok((await R.redis.ttl(k)) > 3500);
  const t = tokenEnviado();
  assert.deepEqual(await F.recuperarPassword(t, nueva), { ok: true }, 'la petición limitada no invalida el enlace anterior');
  for (let i = 0; i < 6; i++) assert.deepEqual(await pedir('sin-cuenta@ejemplo.es', `198.51.100.${i}`), { ok: true });
});

test('F12: límite de veinte solicitudes por IP y hora, también para emails sin cuenta', async () => {
  const u = await usuario();
  for (let i = 0; i < 20; i++) assert.deepEqual(await pedir(`sin-cuenta-${i}@ejemplo.es`), { ok: true });
  assert.deepEqual(await pedir(u.email), { ok: true });
  assert.equal(enviados.length, 0);
  assert.equal(await R.redis.get('limite:recuperar-ip:192.0.2.1'), 21);
  assert.ok((await R.redis.ttl('limite:recuperar-ip:192.0.2.1')) > 3500);
});

test('F12: los intentos de cambio están limitados por IP sin consumir el enlace', async () => {
  const u = await usuario();
  await pedir(u.email);
  const t = tokenEnviado();
  for (let i = 0; i < 20; i++) assert.deepEqual(await F.recuperarPassword('a'.repeat(64), nueva, '192.0.2.1'), caducado);
  assert.equal((await F.recuperarPassword(t, nueva, '192.0.2.1')).bloqueado, true);
  assert.equal(await R.redis.get(`recuperar:${sha(t)}`), u.id);
  assert.deepEqual(await F.recuperarPassword(t, nueva, '192.0.2.2'), { ok: true });
});

test('F12: respeta LIMITES off y registrar', async () => {
  const u = await usuario();
  process.env.LIMITES = 'off';
  for (let i = 0; i < 6; i++) await pedir(u.email);
  assert.equal(enviados.length, 6);
  assert.equal(await R.redis.get('limite:recuperar-ip:192.0.2.1'), null);
  process.env.LIMITES = 'registrar';
  const warn = console.warn;
  const avisos = [];
  console.warn = (...args) => avisos.push(args.join(' '));
  try { for (let i = 0; i < 6; i++) await pedir(u.email); }
  finally { console.warn = warn; }
  assert.equal(enviados.length, 12);
  assert.ok(avisos.some((a) => a.includes('[limite]')));
  assert.ok(avisos.every((a) => !a.includes(u.email)));
});

test('F12: sin email configurado devuelve éxito y avisa sin revelar el token', async () => {
  const u = await usuario();
  delete process.env.RESEND_API_KEY;
  const warn = console.warn;
  const avisos = [];
  console.warn = (...args) => avisos.push(args.join(' '));
  try { assert.deepEqual(await pedir(u.email), { ok: true }); }
  finally { console.warn = warn; }
  assert.equal(enviados.length, 0);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /no está configurado/);
  assert.ok(!/[a-f0-9]{64}/.test(avisos[0]));
  assert.ok(!avisos[0].includes(u.email));
});

test('F12: un fallo al preparar el enlace devuelve el mismo resultado', async () => {
  const u = await usuario();
  const warn = console.warn;
  console.warn = () => {};
  srv.fallos.exec = 100; // También fallan los reintentos del cliente de Upstash.
  try { assert.deepEqual(await pedir(u.email), { ok: true }); }
  finally { console.warn = warn; srv.fallos.exec = 0; }
  assert.equal(enviados.length, 0);
  assert.equal(srv.base.run(['keys', '*recuperar:*']).length, 0);
});
