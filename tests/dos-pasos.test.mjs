// Verificación en dos pasos (lib/totp.js, lib/dosPasos.js) y registro de accesos (lib/accesos.js).
// El flujo, contra el simulador de Upstash; los headers de Next se simulan.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { base32, buscarRecuperacion, claveLegible, codigoTotp, codigosRecuperacion, comprobarTotp, deBase32, huellaRecuperacion, pasoDe, uriOtpauth } from '../lib/totp.js';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === 'next/headers') return { url: 'data:text/javascript,export const headers = async () => new Headers(); export const cookies = async () => ({ get: () => undefined });', shortCircuit: true };
  return next(s, c);
}`), import.meta.url);

// RFC 6238, apéndice B: la clave ASCII «12345678901234567890» con SHA-1 (los 6 últimos dígitos de los 8 del RFC).
const RFC = base32(Buffer.from('12345678901234567890'));

test('TOTP: los vectores del RFC 6238 con SHA-1', () => {
  assert.equal(RFC, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  for (const [s, codigo] of [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']]) {
    assert.equal(codigoTotp(RFC, pasoDe(s * 1000)), codigo, `T = ${s}`);
  }
});

test('TOTP: base32 de ida y vuelta, con espacios y minúsculas', () => {
  const b = Buffer.from([0, 1, 2, 250, 255, 7, 8, 9, 10, 11]);
  assert.deepEqual(deBase32(base32(b)), b);
  assert.deepEqual(deBase32(claveLegible(RFC).toLowerCase()), Buffer.from('12345678901234567890'));
  assert.equal(claveLegible('ABCDEFGHIJ'), 'ABCD EFGH IJ');
  assert.throws(() => deBase32('ABC1'), /no válida/);
});

test('TOTP: acepta el paso anterior y el siguiente, nunca uno ya usado ni otro formato', () => {
  const ahora = 1234567890 * 1000;
  const p = pasoDe(ahora);
  assert.equal(comprobarTotp(RFC, codigoTotp(RFC, p), { ahora }), p);
  assert.equal(comprobarTotp(RFC, codigoTotp(RFC, p - 1), { ahora }), p - 1);
  assert.equal(comprobarTotp(RFC, codigoTotp(RFC, p + 1), { ahora }), p + 1);
  assert.equal(comprobarTotp(RFC, codigoTotp(RFC, p - 2), { ahora }), null);
  assert.equal(comprobarTotp(RFC, ` ${codigoTotp(RFC, p).slice(0, 3)} ${codigoTotp(RFC, p).slice(3)} `, { ahora }), p);
  // Ya usado (ultimo = p): ni ese ni el anterior; el siguiente sí.
  assert.equal(comprobarTotp(RFC, codigoTotp(RFC, p), { ahora, ultimo: p }), null);
  assert.equal(comprobarTotp(RFC, codigoTotp(RFC, p - 1), { ahora, ultimo: p }), null);
  assert.equal(comprobarTotp(RFC, codigoTotp(RFC, p + 1), { ahora, ultimo: p }), p + 1);
  for (const malo of ['', '12345', '1234567', 'abcdef', null]) assert.equal(comprobarTotp(RFC, malo, { ahora }), null);
});

test('TOTP: el enlace para la app de autenticación', () => {
  assert.equal(uriOtpauth({ secreto: 'ABC', email: 'ana+1@ejemplo.es' }), 'otpauth://totp/Fisquo%3Aana%2B1%40ejemplo.es?secret=ABC&issuer=Fisquo&algorithm=SHA1&digits=6&period=30');
});

test('Códigos de recuperación: diez distintos, sin caracteres que se confundan; se reconocen escritos de cualquier forma', () => {
  const c = codigosRecuperacion();
  assert.equal(c.length, 10);
  assert.equal(new Set(c).size, 10);
  for (const x of c) assert.match(x, /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  const huellas = c.map(huellaRecuperacion);
  assert.equal(buscarRecuperacion(huellas, c[3]), 3);
  assert.equal(buscarRecuperacion(huellas, c[3].toUpperCase().replace('-', ' ')), 3);
  assert.equal(buscarRecuperacion(huellas, c[3].replace('-', '')), 3);
  assert.equal(buscarRecuperacion(huellas, 'abcd-efgh'), -1);
  assert.equal(buscarRecuperacion(huellas, '123456'), -1);
});

test('Accesos: el dispositivo a partir del User-Agent', () => {
  const { describirDispositivo } = X;
  assert.equal(describirDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(describirDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FisquoApp/1.0'), 'iPhone · app de Fisquo');
  assert.equal(describirDispositivo('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'), 'Mac · Chrome');
  assert.equal(describirDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'), 'Windows · Edge');
  assert.equal(describirDispositivo('Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0'), 'Android · Firefox');
  assert.equal(describirDispositivo(''), 'Dispositivo desconocido');
  assert.equal(describirDispositivo(null), 'Dispositivo desconocido');
});

// El flujo completo contra el simulador.
let srv, R, A, D, X;
const variables = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES'];
const entorno = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
const clave = 'contraseña de prueba segura';

before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  R = await import('../lib/redis.js');
  A = await import('../lib/auth.js');
  D = await import('../lib/dosPasos.js');
  X = await import('../lib/accesos.js');
});
beforeEach(async () => {
  srv.base.run(['flushdb']);
  process.env.LIMITES = 'activo';
});
after(async () => {
  for (const k of variables) {
    if (entorno[k] === undefined) delete process.env[k];
    else process.env[k] = entorno[k];
  }
  await srv?.cerrar();
});

async function usuario(id = 'u1') {
  const u = { id, empresa: `empresa-${id}`, nombre: 'Ana', email: `${id}@ejemplo.es`, pass: await A.cifrar(clave) };
  await R.redis.hset('usuarios', { [id]: u });
  await R.redis.hset('emails', { [u.email]: id });
  return u;
}
// Activa la verificación como lo haría la pantalla: empezar, leer la clave y mandar el código de ahora.
async function conDosPasos(u) {
  const alta = await D.empezarAlta(u);
  assert.match(alta.qr, /^data:image\/png;base64,/);
  assert.match(alta.uri, /^otpauth:\/\/totp\/Fisquo%3Au1%40ejemplo\.es\?secret=[A-Z2-7]{32}&/);
  const secreto = alta.clave.replace(/ /g, '');
  const r = await D.activar(u, codigoTotp(secreto, pasoDe()));
  assert.equal(r.ok, true);
  return { secreto, codigos: r.codigos };
}

test('Sin verificación en dos pasos, la contraseña basta, como siempre', async () => {
  await usuario();
  const r = await A.entrar('u1@ejemplo.es', clave, '1.1.1.1');
  assert.ok(r.token);
  assert.equal(r.id, 'u1');
  assert.equal(r.segundoPaso, undefined);
});

test('Activarla pide un código bueno de la clave nueva; luego la contraseña sola ya no abre sesión', async () => {
  const u = await usuario();
  await D.empezarAlta(u);
  assert.match((await D.activar(u, '000000')).error, /no coincide/);
  const { secreto, codigos } = await conDosPasos(u);
  assert.equal(codigos.length, 10);
  const guardado = await R.redis.hget('usuarios', 'u1');
  assert.equal(guardado.dosPasos.secreto, secreto);
  assert.equal(guardado.dosPasos.recuperacion.length, 10);
  assert.ok(!guardado.dosPasos.recuperacion.includes(codigos[0]), 'de los códigos solo se guarda la huella');
  assert.equal(await R.redis.get('dos-pasos-alta:u1'), null);
  const r = await A.entrar('u1@ejemplo.es', clave, '1.1.1.1');
  assert.equal(r.token, undefined);
  assert.match(r.segundoPaso, /^[\w-]{24}$/);
  assert.equal(await R.redis.smembers('sesiones:u1').then((x) => x.length), 0, 'sin sesión hasta el código');
  // Contraseña mal: ni reto.
  assert.equal(await A.entrar('u1@ejemplo.es', 'otra cosa', '1.1.1.1'), null);
});

test('Con el reto y un código bueno, sesión; el mismo código no vale dos veces', async () => {
  const u = await usuario();
  const { secreto } = await conDosPasos(u);
  // El código usado al activarla ya no vale: se espera al siguiente paso.
  const p = pasoDe() + 1;
  const { segundoPaso } = await A.entrar('u1@ejemplo.es', clave, '1.1.1.1');
  assert.deepEqual(await D.completarReto(segundoPaso, '123'), { error: 'El código no es correcto. Escribe el que se ve ahora en la app (cambia cada 30 segundos).' });
  const r = await D.completarReto(segundoPaso, codigoTotp(secreto, p));
  assert.ok(r.token);
  assert.equal(r.metodo, 'app');
  assert.equal(await R.redis.get(`sesion:${r.token}`), 'u1');
  // El reto se gasta, y el mismo código no vale con otro reto.
  assert.equal((await D.completarReto(segundoPaso, codigoTotp(secreto, p))).caducado, true);
  const otro = (await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).segundoPaso;
  assert.equal((await D.completarReto(otro, codigoTotp(secreto, p))).token, undefined);
});

test('Un código de recuperación sirve una vez y dice cuántos quedan', async () => {
  const u = await usuario();
  const { codigos } = await conDosPasos(u);
  const reto = (await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).segundoPaso;
  const r = await D.completarReto(reto, codigos[4].toUpperCase());
  assert.ok(r.token);
  assert.equal(r.metodo, 'recuperacion');
  assert.equal(r.quedan, 9);
  const reto2 = (await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).segundoPaso;
  assert.equal((await D.completarReto(reto2, codigos[4])).token, undefined);
});

test('Cinco códigos mal con el mismo reto obligan a volver a la contraseña; diez por persona, a esperar', async () => {
  const u = await usuario();
  const { secreto } = await conDosPasos(u);
  const reto = (await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).segundoPaso;
  for (let i = 0; i < 5; i++) assert.match((await D.completarReto(reto, '000000')).error, /no es correcto/);
  const sexto = await D.completarReto(reto, codigoTotp(secreto, pasoDe() + 1));
  assert.equal(sexto.caducado, true);
  assert.equal(sexto.token, undefined);
  // Por persona: 5 fallos más con otro reto (10 en total) y el undécimo intento, aunque sea bueno, espera.
  const reto2 = (await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).segundoPaso;
  for (let i = 0; i < 5; i++) await D.completarReto(reto2, '000000');
  const reto3 = (await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).segundoPaso;
  assert.equal((await D.completarReto(reto3, codigoTotp(secreto, pasoDe() + 1))).bloqueado, true);
});

test('Si la contraseña cambia entre la contraseña y el código, el reto ya no sirve', async () => {
  const u = await usuario();
  const { secreto } = await conDosPasos(u);
  const reto = (await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).segundoPaso;
  await A.cambiarUsuario('u1', async (x) => ({ ...x, pass: await A.cifrar('otra contraseña distinta') }));
  const r = await D.completarReto(reto, codigoTotp(secreto, pasoDe() + 1));
  assert.equal(r.caducado, true);
  assert.equal(r.token, undefined);
});

test('Desde la pantalla de bloqueo con la sesión de la misma persona no se repite el segundo paso', async () => {
  const u = await usuario();
  await conDosPasos(u);
  const r = await A.entrar('u1@ejemplo.es', clave, '1.1.1.1', { yaDentro: 'u1' });
  assert.ok(r.token);
  const otra = await A.entrar('u1@ejemplo.es', clave, '1.1.1.1', { yaDentro: 'u2' });
  assert.ok(otra.segundoPaso);
});

test('Quitarla pide la contraseña y un código; los códigos nuevos sustituyen a los anteriores', async () => {
  const u = await usuario();
  const { secreto, codigos } = await conDosPasos(u);
  const conDatos = await R.redis.hget('usuarios', 'u1');
  const nuevos = await D.nuevosCodigos(conDatos, codigos[0]);
  assert.equal(nuevos.codigos.length, 10);
  const tras = await R.redis.hget('usuarios', 'u1');
  assert.equal(buscarRecuperacion(tras.dosPasos.recuperacion, codigos[1]), -1, 'los anteriores ya no valen');
  assert.equal(buscarRecuperacion(tras.dosPasos.recuperacion, nuevos.codigos[1]), 1);
  assert.match((await D.desactivar(tras, 'mala', codigoTotp(secreto, pasoDe() + 1))).error, /contraseña no es correcta/);
  assert.match((await D.desactivar(tras, clave, '000000')).error, /no es correcto/);
  assert.equal((await D.desactivar(tras, clave, nuevos.codigos[2])).ok, true);
  assert.equal((await R.redis.hget('usuarios', 'u1')).dosPasos, undefined);
  assert.ok((await A.entrar('u1@ejemplo.es', clave, '1.1.1.1')).token);
});

test('Registro de accesos: los 30 últimos, del más reciente al más antiguo, y se borra con la persona', async () => {
  const u = await usuario('u3');
  const req = (ua, ip) => ({ headers: new Headers({ 'user-agent': ua, 'x-real-ip': ip }) });
  for (let i = 0; i < 32; i++) await X.apuntarAcceso('u3', req('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0 Safari/537.36', `10.0.0.${i}`), 'Contraseña');
  await X.apuntarAcceso('u3', req('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Mobile/15E148 FisquoApp/1.0', '10.0.1.1'), 'Face ID o huella');
  const lista = await X.accesosDe('u3');
  assert.equal(lista.length, 30);
  assert.deepEqual({ ...lista[0], fecha: undefined }, { fecha: undefined, ip: '10.0.1.1', dispositivo: 'iPhone · app de Fisquo', metodo: 'Face ID o huella' });
  assert.equal(lista[1].ip, '10.0.0.31');
  await A.borrarUsuario(u.id);
  assert.deepEqual(await X.accesosDe('u3'), []);
});

test('Soporte (/admin): quitar la verificación de una cuenta deja entrar solo con la contraseña', async () => {
  const u = await usuario('u9');
  await conDosPasos(u);
  assert.ok((await A.entrar('u9@ejemplo.es', clave, '1.1.1.1')).segundoPaso);
  // Lo que hace app/api/admin/dos-pasos: quitar dosPasos con cambiarUsuario.
  await A.cambiarUsuario('u9', ({ dosPasos, ...x }) => (dosPasos ? x : null)); // eslint-disable-line no-unused-vars
  assert.ok((await A.entrar('u9@ejemplo.es', clave, '1.1.1.1')).token);
});
