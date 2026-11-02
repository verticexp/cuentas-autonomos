import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { fcmListo, cargaFcm, esTokenFcm, enviarFcm } from '../lib/fcm.js';

test('FCM necesita un JSON con los tres campos de la cuenta de servicio', () => {
  const antes = process.env.FCM_CUENTA_SERVICIO;
  try {
    delete process.env.FCM_CUENTA_SERVICIO;
    assert.equal(fcmListo(), false);
    for (const valor of ['{', '{}', 'null', '{"project_id":"p","client_email":"c","private_key":1}']) {
      process.env.FCM_CUENTA_SERVICIO = valor;
      assert.equal(fcmListo(), false);
    }
    process.env.FCM_CUENTA_SERVICIO = JSON.stringify({ project_id: 'p', client_email: 'c', private_key: 'clave' });
    assert.equal(fcmListo(), true);
  } finally { if (antes === undefined) delete process.env.FCM_CUENTA_SERVICIO; else process.env.FCM_CUENTA_SERVICIO = antes; }
});

test('el aviso de siempre pasa a FCM con datos de texto, hilo y número', () => {
  assert.deepEqual(cargaFcm('dispositivo', { titulo: 'IVA mañana', cuerpo: 'Toca pagar 320 €', url: '/impuestos', hilo: 'gestoria-e1', numero: 3 }), {
    message: { token: 'dispositivo', notification: { title: 'IVA mañana', body: 'Toca pagar 320 €' }, data: { url: '/impuestos' }, android: { priority: 'HIGH', ttl: '86400s', notification: { channel_id: 'avisos', tag: 'gestoria-e1', notification_count: 3 } } },
  });
  const m = cargaFcm('t', {}).message;
  assert.deepEqual(m.notification, { title: 'Fisquo', body: '' });
  assert.deepEqual(m.data, { url: '/' });
  assert.equal(m.android.notification.tag, undefined);
  assert.equal(cargaFcm('t', { numero: -1 }).message.android.notification.notification_count, undefined);
  assert.equal(cargaFcm('t', { numero: 1.5 }).message.android.notification.notification_count, undefined);
  assert.equal(cargaFcm('t', { numero: 0 }).message.android.notification.notification_count, 0);
  assert.equal(cargaFcm('t', { url: 123 }).message.data.url, '123');
});

test('solo se aceptan tokens FCM de 100 a 4096 caracteres permitidos', () => {
  for (const t of ['a'.repeat(100), 'a'.repeat(4096), 'A0_:-'.repeat(20)]) assert.equal(esTokenFcm(t), true);
  for (const t of [null, 123, 'a'.repeat(99), 'a'.repeat(4097), 'a'.repeat(100) + '/', 'a'.repeat(100) + '\n']) assert.equal(esTokenFcm(t), false);
});

test('JWT RS256 verificable, canje cacheado y envíos con fetch simulado', async () => {
  const claves = ['FCM_CUENTA_SERVICIO', 'FCM_URL', 'FCM_TOKEN_URL'];
  const antes = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  const fetchAntes = globalThis.fetch, warnAntes = console.warn;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  Object.assign(process.env, { FCM_CUENTA_SERVICIO: JSON.stringify({ project_id: 'proyecto', client_email: 'servicio@example.test', private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }).replace(/\n/g, '\\n') }), FCM_TOKEN_URL: 'https://simulador.test/token', FCM_URL: 'https://simulador.test/envio' });
  let canjes = 0, envios = 0;
  const avisos = [];
  console.warn = (...args) => avisos.push(args);
  globalThis.fetch = async (url, opciones) => {
    assert.equal(opciones.method, 'POST');
    assert.ok(opciones.signal instanceof AbortSignal);
    if (url === process.env.FCM_TOKEN_URL) {
      canjes++;
      assert.equal(opciones.body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      const [h, c, f] = opciones.body.get('assertion').split('.');
      assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, 'RS256');
      const datos = JSON.parse(Buffer.from(c, 'base64url'));
      assert.equal(datos.iss, 'servicio@example.test');
      assert.equal(datos.scope, 'https://www.googleapis.com/auth/firebase.messaging');
      assert.equal(datos.aud, 'https://oauth2.googleapis.com/token');
      assert.equal(datos.exp, datos.iat + 3600);
      assert.ok(Math.abs(datos.iat - Date.now() / 1000) < 5);
      assert.ok(verify('sha256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(f, 'base64url')));
      return Response.json({ access_token: 'acceso', expires_in: 3600 });
    }
    envios++;
    assert.equal(url, process.env.FCM_URL);
    assert.equal(opciones.headers.Authorization, 'Bearer acceso');
    const t = JSON.parse(opciones.body).message.token;
    if (t === 'ok') return Response.json({ name: 'mensaje' });
    if (t === '404') return Response.json({}, { status: 404 });
    if (t === 'borrado') return Response.json({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 400 });
    if (t === 'token-malo') return Response.json({ error: { message: 'The registration token is not valid', details: [{ errorCode: 'INVALID_ARGUMENT' }] } }, { status: 400 });
    if (t === 'carga-mala') return Response.json({ error: { message: 'Invalid message data', details: [{ errorCode: 'INVALID_ARGUMENT' }] } }, { status: 400 });
    return Response.json({ error: { message: 'Fallo temporal' } }, { status: 500 });
  };
  try {
    assert.deepEqual(await enviarFcm(['ok', '404', 'borrado', '500', 'token-malo', 'carga-mala'], {}), { enviados: 1, caducados: ['404', 'borrado', 'token-malo'] });
    assert.deepEqual(await enviarFcm(['ok'], {}), { enviados: 1, caducados: [] });
    assert.equal(canjes, 1);
    assert.equal(envios, 7);
    assert.ok(avisos.some((a) => a[0] === '[fcm]' && a[1] === 500));
    assert.deepEqual(await enviarFcm(['ok'], { soloNumero: true, numero: 0 }), { enviados: 0, caducados: [] });
    assert.deepEqual(await enviarFcm([], {}), { enviados: 0, caducados: [] });
    delete process.env.FCM_CUENTA_SERVICIO;
    assert.deepEqual(await enviarFcm(['ok'], {}), { enviados: 0, caducados: [] });
    assert.equal(envios, 7);
  } finally {
    globalThis.fetch = fetchAntes;
    console.warn = warnAntes;
    for (const k of claves) if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k];
  }
});
