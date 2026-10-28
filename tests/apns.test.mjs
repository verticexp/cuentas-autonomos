import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { apnsListo, cargaDe, esToken, tokenProveedor } from '../lib/apns.js';

const claves = ['APPLE_TEAM_ID', 'APNS_KEY_ID', 'APNS_PRIVATE_KEY'];

test('el token del proveedor es un JWT ES256 con el equipo y la clave, y se reutiliza 40 minutos', () => {
  const antes = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  Object.assign(process.env, { APPLE_TEAM_ID: 'M8D85NH9U7', APNS_KEY_ID: 'APNS123456', APNS_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }).replace(/\n/g, '\\n') });
  try {
    assert.equal(apnsListo(), true);
    const t = tokenProveedor(1_800_000_000);
    const [h, c, f] = t.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'APNS123456' });
    assert.deepEqual(JSON.parse(Buffer.from(c, 'base64url')), { iss: 'M8D85NH9U7', iat: 1_800_000_000 });
    assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(f, 'base64url')));
    assert.equal(tokenProveedor(1_800_000_000 + 2000), t, 'antes de 40 minutos, el mismo');
    assert.notEqual(tokenProveedor(1_800_000_000 + 2500), t, 'después, uno nuevo');
  } finally { for (const k of claves) if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
});

test('el aviso de siempre pasa al formato de APNs y solo se aceptan tokens hexadecimales', () => {
  assert.deepEqual(cargaDe({ titulo: 'IVA mañana', cuerpo: 'Toca pagar 320 €', url: '/impuestos' }),
    { aps: { alert: { title: 'IVA mañana', body: 'Toca pagar 320 €' }, sound: 'default' }, url: '/impuestos' });
  assert.equal(cargaDe({}).url, '/');
  assert.equal(esToken('a'.repeat(64)), true);
  assert.equal(esToken('xyz'), false);
  assert.equal(esToken('a'.repeat(64) + '/../'), false);
});

test('mensajes de chat: agrupados por conversación y con el número del icono; solo número al leer', () => {
  assert.deepEqual(cargaDe({ titulo: 'Gestoría Ferrer', cuerpo: '¿Me pasas el ticket?', url: '/tu-gestoria', hilo: 'gestoria-e1', numero: 3 }),
    { aps: { alert: { title: 'Gestoría Ferrer', body: '¿Me pasas el ticket?' }, sound: 'default', 'thread-id': 'gestoria-e1', badge: 3 }, url: '/tu-gestoria' });
  assert.deepEqual(cargaDe({ soloNumero: true, numero: 0 }), { aps: { badge: 0 } });
  assert.equal(cargaDe({ titulo: 'x', numero: -1 }).aps.badge, undefined);
});
