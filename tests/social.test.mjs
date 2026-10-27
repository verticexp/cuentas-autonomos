import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { comprobarIdToken, secretoApple, sha256Hex, urlAutorizar, socialListo } from '../lib/social.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
const buscar = async () => [jwk];
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const firmar = (datos, cab = { alg: 'RS256', kid: 'k1' }, clave = privateKey) => {
  const cuerpo = `${b64(cab)}.${b64(datos)}`;
  return `${cuerpo}.${sign('RSA-SHA256', Buffer.from(cuerpo), clave).toString('base64url')}`;
};
const ahora = 1_800_000_000;
const google = { iss: 'https://accounts.google.com', aud: 'cliente-web', sub: '123', email: 'Ana@Ejemplo.com', email_verified: true, name: 'Ana López', exp: ahora + 600, nonce: 'n1' };

test('un id_token de Google bien firmado da la persona con el email en minúsculas', async () => {
  const p = await comprobarIdToken('google', firmar(google), { audiencia: 'cliente-web', nonce: 'n1', ahora, buscar });
  assert.deepEqual(p, { sub: '123', email: 'ana@ejemplo.com', nombre: 'Ana López' });
});

test('se rechaza el token con otra audiencia, emisor, nonce, caducado o mal firmado', async () => {
  const o = { audiencia: 'cliente-web', nonce: 'n1', ahora, buscar };
  await assert.rejects(comprobarIdToken('google', firmar({ ...google, aud: 'otra' }), o), /Audiencia/);
  await assert.rejects(comprobarIdToken('google', firmar({ ...google, iss: 'https://appleid.apple.com' }), o), /Emisor/);
  await assert.rejects(comprobarIdToken('google', firmar({ ...google, nonce: 'otro' }), o), /Nonce/);
  await assert.rejects(comprobarIdToken('google', firmar({ ...google, exp: ahora - 120 }), o), /caducado/);
  const otra = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  await assert.rejects(comprobarIdToken('google', firmar(google, undefined, otra), o), /Firma/);
  await assert.rejects(comprobarIdToken('google', firmar(google, { alg: 'none', kid: 'k1' }), o), /Algoritmo/);
  await assert.rejects(comprobarIdToken('google', firmar(google, { alg: 'RS256', kid: 'x' }), o), /Clave/);
  await assert.rejects(comprobarIdToken('google', 'basura', o), /Token/);
});

test('sin email verificado no hay email (no se enlaza a ninguna cuenta por email)', async () => {
  const p = await comprobarIdToken('google', firmar({ ...google, email_verified: false }), { audiencia: 'cliente-web', nonce: 'n1', ahora, buscar });
  assert.equal(p.email, '');
});

test('Apple: la hoja nativa compara el SHA-256 del nonce y acepta email_verified en texto', async () => {
  const apple = { iss: 'https://appleid.apple.com', aud: 'com.fisquo.app', sub: '001.abc', email: 'x@privaterelay.appleid.com', email_verified: 'true', exp: ahora + 600, nonce: sha256Hex('n2') };
  const p = await comprobarIdToken('apple', firmar(apple), { audiencia: 'com.fisquo.app', nonce: sha256Hex('n2'), ahora, buscar });
  assert.equal(p.sub, '001.abc');
  assert.equal(p.email, 'x@privaterelay.appleid.com');
});

test('el client_secret de Apple es un JWT ES256 válido para 5 minutos', () => {
  const { privateKey: k, publicKey: pub } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  Object.assign(process.env, { APPLE_TEAM_ID: 'M8D85NH9U7', APPLE_KEY_ID: 'KEY123', APPLE_PRIVATE_KEY: k.export({ format: 'pem', type: 'pkcs8' }).replace(/\n/g, '\\n') });
  const t = secretoApple('com.fisquo.web', ahora);
  const [h, c, f] = t.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
  assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { iss: 'M8D85NH9U7', iat: ahora, exp: ahora + 300, aud: 'https://appleid.apple.com', sub: 'com.fisquo.web' });
  assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url')));
  for (const k of ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']) delete process.env[k];
});

test('la URL de Apple pide form_post y la de Google elige cuenta; sin variables no hay botones', () => {
  const a = new URL(urlAutorizar('apple', { state: 's', nonce: 'n', vuelta: 'https://www.fisquo.com/api/login/social/vuelta' }));
  assert.equal(a.searchParams.get('response_mode'), 'form_post');
  assert.equal(a.searchParams.get('scope'), 'name email');
  const g = new URL(urlAutorizar('google', { state: 's', nonce: 'n', vuelta: 'https://x' }));
  assert.equal(g.searchParams.get('prompt'), 'select_account');
  assert.equal(g.searchParams.get('state'), 's');
  assert.deepEqual(socialListo(), { google: false, apple: false });
});
