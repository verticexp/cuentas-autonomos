import test, { before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import './apoyo/cargador.mjs';

let T, S, E, A, B;
const fetchOriginal = globalThis.fetch;
const timeoutOriginal = AbortSignal.timeout;
let proveedorOriginal, asistenteOriginal;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (d = {}) => Response.json(d);
const fallo = (status = 503, retryAfter) => Response.json({ message: 'Proveedor ocupado' }, { status, headers: retryAfter ? { 'Retry-After': retryAfter } : {} });
before(async () => {
  // La IA simulada solo pide herramientas no autorizadas: nunca necesita leer datos reales.
  process.env.KV_REST_API_URL = 'http://redis-e08.test';
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [T, S, E, A, B] = await Promise.all([import('../lib/ticket.js'), import('../lib/stripe.js'), import('../lib/email.js'), import('../lib/asistenteIA.js'), import('../lib/enableBanking.js')]);
  proveedorOriginal = { ...T.PLAZOS_PROVEEDOR };
  asistenteOriginal = { ...A.PLAZOS_ASISTENTE };
});
beforeEach(() => {
  Object.assign(T.PLAZOS_PROVEEDOR, proveedorOriginal, { esperaMs: 1 });
  Object.assign(A.PLAZOS_ASISTENTE, asistenteOriginal);
  process.env.RESEND_API_KEY = 'pruebas';
});
afterEach(() => { globalThis.fetch = fetchOriginal; AbortSignal.timeout = timeoutOriginal; });
after(() => {
  Object.assign(T.PLAZOS_PROVEEDOR, proveedorOriginal);
  Object.assign(A.PLAZOS_ASISTENTE, asistenteOriginal);
});

const usuario = { id: 'u1', empresa: 'e1', rol: 'admin', actividades: [{ id: 'servicios', ivaPct: 21, irpfPct: 0 }] };
const preguntar = () => A.preguntar(usuario, 'Hola', [], '2026-10-14');

test('E08: todos los fetch tienen señal y 15 s; asistente 40 s y banca conserva 20 s', async () => {
  const tiempos = [], llamadas = [];
  assert.deepEqual(A.PLAZOS_ASISTENTE, { totalMs: 50000, llamadaMs: 40000, reservaMs: 5000 });
  AbortSignal.timeout = (ms) => { tiempos.push(ms); return timeoutOriginal(ms); };
  globalThis.fetch = async (url, op) => {
    assert.ok(op.signal instanceof AbortSignal); llamadas.push(op.method);
    return String(url).includes('anthropic') ? ok({ content: [{ type: 'text', text: '{}' }] }) : ok({ id: 'enviado', aspsps: [] });
  };
  await T.leerTicket('YQ==', 'image/png'); await T.leerExtracto('YQ==');
  await S.leerPago('cs_1'); await S.crearPago({ importe: 1, concepto: 'Prueba', volver: 'https://fisquo.test', datos: {} });
  await E.enviarEmail({ para: 'a@b.test', asunto: 'Prueba', html: 'Hola' });
  assert.deepEqual(tiempos, [15000, 15000, 15000, 15000, 15000]);
  await preguntar();
  assert.equal(tiempos[5], 50000); assert.equal(tiempos[6], 40000);
  process.env.ENABLE_BANKING_APP_ID = 'pruebas';
  process.env.ENABLE_BANKING_KEY = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
  await B.listaBancos(); assert.equal(tiempos.at(-1), 20000);
});

test('E08: cerrar una sesión bancaria con 204 no se considera un fallo del proveedor', async () => {
  let llamadas = 0;
  globalThis.fetch = async (_, op) => { llamadas++; assert.equal(op.method, 'DELETE'); return new Response(null, { status: 204 }); };
  for (let i = 0; i < 6; i++) assert.deepEqual(await B.cerrarSesion('sesion-prueba'), {});
  assert.equal(llamadas, 6);
});

test('E08: timeout cubre fetch lento y la lectura lenta del cuerpo', async () => {
  T.PLAZOS_PROVEEDOR.timeoutMs = 20;
  globalThis.fetch = async () => { await dormir(300); return ok(); };
  const inicio = performance.now();
  const r = await E.enviarEmail({ para: 'a@b.test', asunto: 'Prueba', html: '' });
  assert.match(r.error, /tiempo máximo/); assert.ok(performance.now() - inicio < 200);
  globalThis.fetch = async () => ({ ok: true, json: async () => { await dormir(60); return {}; } });
  const cuerpo = await E.enviarEmail({ para: 'a@b.test', asunto: 'Prueba', html: '' });
  assert.match(cuerpo.error, /tiempo máximo/);
  globalThis.fetch = async () => ok({ id: 'recuperado' });
  assert.equal((await E.enviarEmail({ para: 'a@b.test', asunto: 'Prueba', html: '' })).id, 'recuperado');
});

test('E08: Stripe reintenta GET como máximo dos veces; POST y email solo una vez', async () => {
  const metodos = [];
  globalThis.fetch = async (_, op) => { metodos.push(op.method); return metodos.length < 3 ? fallo() : ok({ id: 'cs_1' }); };
  assert.equal((await S.leerPago('cs_1')).id, 'cs_1');
  assert.deepEqual(metodos, ['GET', 'GET', 'GET']);
  metodos.length = 0;
  globalThis.fetch = async (_, op) => { metodos.push(op.method); return fallo(); };
  assert.ok((await S.crearPago({ importe: 1, concepto: 'Prueba', volver: 'https://fisquo.test', datos: {} })).error);
  assert.deepEqual(metodos, ['POST']);
  metodos.length = 0;
  assert.ok((await E.enviarEmail({ para: 'a@b.test', asunto: 'Prueba', html: '' })).error);
  assert.deepEqual(metodos, ['POST']);
  // Un éxito reinicia el contador de errores de Stripe y Resend para las siguientes pruebas.
  globalThis.fetch = async () => ok({ id: 'ok' }); await S.leerPago('cs_1'); await E.enviarEmail({ para: 'a@b.test' });
});

test('E08: las lecturas IA no se reintentan para evitar duplicar consumo, y los errores definitivos tampoco', async () => {
  let llamadas = 0;
  globalThis.fetch = async () => ++llamadas < 3 ? fallo() : ok({ content: [{ text: '{"proveedor":"Comercio"}' }] });
  assert.ok((await T.leerTicket('YQ==', 'image/png')).error);
  assert.equal(llamadas, 1);
  llamadas = 0;
  assert.ok((await T.leerExtracto('YQ==')).error);
  assert.equal(llamadas, 1);
  llamadas = 0; globalThis.fetch = async () => { llamadas++; return fallo(400); };
  assert.ok((await S.leerPago('cs_1')).error); assert.equal(llamadas, 1);
});

test('E08: Retry-After se respeta y una espera que supera el deadline no se inicia', async () => {
  let llamadas = 0; const instantes = [];
  globalThis.fetch = async () => { instantes.push(performance.now()); return ++llamadas === 1 ? fallo(429, '0.025') : ok(); };
  await T.proveedorJSON('retry-after-prueba', 'https://proveedor.test', { method: 'GET' }, { idempotente: true });
  assert.ok(instantes[1] - instantes[0] >= 23); assert.equal(llamadas, 2);
  llamadas = 0; globalThis.fetch = async () => { llamadas++; return fallo(429, '60'); };
  const inicio = performance.now();
  await assert.rejects(T.proveedorJSON('retry-deadline-prueba', 'https://proveedor.test', { method: 'GET' }, { idempotente: true, deadline: Date.now() + 40 }), /ocupado/);
  assert.equal(llamadas, 1); assert.ok(performance.now() - inicio < 35);
});

test('E08: deadline total del asistente y timeout reducido para una segunda vuelta lenta', async () => {
  // 100 ms de prueba equivalen a 50 s: se conserva la proporción del presupuesto y la reserva.
  Object.assign(A.PLAZOS_ASISTENTE, { totalMs: 100, llamadaMs: 80, reservaMs: 10 });
  const tiempos = []; let llamadas = 0;
  AbortSignal.timeout = (ms) => { tiempos.push(ms); return timeoutOriginal(ms); };
  globalThis.fetch = async () => {
    if (++llamadas === 1) { await dormir(55); return ok({ content: [{ type: 'tool_use', id: 't1', name: 'no_autorizada', input: {} }] }); }
    await dormir(100); return ok({ content: [{ type: 'text', text: 'Hola' }] });
  };
  const inicio = performance.now();
  await assert.rejects(preguntar(), /tiempo/);
  assert.ok(performance.now() - inicio < 115, 'el presupuesto se comparte entre vueltas y reintentos');
  assert.equal(llamadas, 2); assert.equal(tiempos[0], 100); assert.equal(tiempos[1], 80);
  assert.ok(tiempos[2] <= 35 && tiempos[2] > 0);
  globalThis.fetch = async () => ok({ content: [{ type: 'text', text: 'Hola' }] });
  assert.equal((await preguntar()).respuesta, 'Hola');
});

test('E08: si no hay tiempo para otra vuelta devuelve un mensaje claro sin llamar a IA', async () => {
  Object.assign(A.PLAZOS_ASISTENTE, { totalMs: 20, llamadaMs: 15, reservaMs: 20 });
  let llamadas = 0; globalThis.fetch = async () => { llamadas++; return ok(); };
  const r = await preguntar();
  assert.equal(llamadas, 0); assert.match(r.respuesta, /agotado el tiempo/); assert.equal(r.sinComprobar, true);
});

for (const proveedor of ['Stripe', 'Resend', 'Anthropic', 'Enable Banking']) {
  test(`E08: circuito ${proveedor} abre tras cinco fallos y se recupera tras 60 s`, async () => {
    let llamadas = 0;
    globalThis.fetch = async () => { llamadas++; return fallo(); };
    const ejecutar = () => T.proveedorJSON(proveedor, 'https://proveedor.test', { method: 'POST' });
    for (let i = 0; i < 5; i++) await assert.rejects(ejecutar(), /ocupado/);
    assert.equal(llamadas, 5);
    await assert.rejects(ejecutar(), /temporalmente.*minuto/); assert.equal(llamadas, 5);
    // Avanzar reloj, sin esperar un minuto ni modificar el circuito interno.
    const ahora = Date.now;
    Date.now = () => ahora() + 60001;
    try {
      globalThis.fetch = async () => { llamadas++; return ok({ id: 'recuperado' }); };
      assert.equal((await ejecutar()).d.id, 'recuperado'); assert.equal(llamadas, 6);
    } finally { Date.now = ahora; }
  });
}
