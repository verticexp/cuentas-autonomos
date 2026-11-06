import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { crearBase } from './apoyo/upstash-mem.mjs';
import { firmarComoApple, RAIZ_PRUEBAS } from './apoyo/appleJws.mjs';

// Compras dentro de la app de iOS (lib/compraApple.js): transacciones firmadas con una cadena de prueba (tests/apoyo/
// apple-pruebas), Redis en memoria con los cerrojos de verdad y las rutas reales. Sin red ni claves reales.
const base = crearBase();
const dec = (s) => (s === null ? null : JSON.parse(s));
const run = (o) => base.run(o);
const redis = {
  get: async (k) => dec(run(['get', k])),
  set: async (k, v, o = {}) => run(['set', k, JSON.stringify(v), ...(o.nx ? ['NX'] : []), ...(o.px ? ['PX', o.px] : [])]),
  hget: async (k, f) => dec(run(['hget', k, String(f)])),
  hgetall: async (k) => { const a = run(['hgetall', k]); return Object.fromEntries(Array.from({ length: a.length / 2 }, (_, i) => [a[i * 2], dec(a[i * 2 + 1])])); },
  hset: async (k, obj) => run(['hset', k, ...Object.entries(obj).flatMap(([f, v]) => [f, JSON.stringify(v)])]),
  hsetnx: async (k, f, v) => run(['hsetnx', k, String(f), JSON.stringify(v)]),
  hdel: async (k, ...fs) => run(['hdel', k, ...fs]),
  del: async (...ks) => run(['del', ...ks]),
  eval: async (script, keys, args) => run(['eval', script, keys.length, ...keys, ...args.map(JSON.stringify)]),
};
globalThis.__compraAppleRedis = redis;
const correos = [];
globalThis.__compraAppleCorreos = correos;
const llamadasStripe = [];
globalThis.__compraAppleStripe = llamadasStripe;
let usuario = null;
globalThis.__compraAppleUsuario = () => usuario;
const entorno = Object.fromEntries(['KV_REST_API_URL', 'VERCEL', 'APPLE_RAIZ_PRUEBAS', 'APPLE_XCODE', 'APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_PRIVATE_KEY', 'STRIPE_SECRET_KEY'].map((k) => [k, process.env[k]]));
const modulo = (s) => ({ url: `data:text/javascript,${encodeURIComponent(s)}`, shortCircuit: true });
const stubs = {
  'lib/redis.js': 'export const redis = globalThis.__compraAppleRedis; export const leer = async () => []; export const leerUno = async () => null; export const mismoId = (a, b) => String(a) === String(b);',
  'lib/avisosCorreo.js': 'export const avisarSuscripcion = async (empresa, antes, ahora) => { globalThis.__compraAppleCorreos.push({ empresa, antes: antes?.estado, ahora: ahora?.estado }); };',
  'lib/recomendaciones.js': 'export const premiarRecomendacion = async () => {};',
  'lib/stripe.js': 'export const stripe = async (ruta, datos) => { globalThis.__compraAppleStripe.push([ruta, datos]); return { id: "sub_x" }; }; export const stripeListo = () => true;',
  'lib/metricas.js': 'export const metrica = () => {};',
  'lib/actividad.js': 'export const actividadReciente = async () => []; export const ultimaActividad = async () => ({});',
  'lib/limite.js': 'export const pasado = async () => false; export const MUCHOS = "Demasiados intentos";',
  'lib/api.js': `export const error = (msg, status = 400) => Response.json({ error: msg }, { status });
    export async function cuerpo(req) { try { return await req.json(); } catch { return {}; } }
    export async function usuarioApi() { const u = globalThis.__compraAppleUsuario(); return u ? { u } : { res: error('No autorizado', 401) }; }`,
};
const raiz = new URL('../', import.meta.url);
const hooks = registerHooks({
  resolve(spec, ctx, next) {
    const url = spec.startsWith('@/') ? new URL(`${spec.slice(2)}.js`, raiz) : spec.startsWith('.') ? new URL(spec, ctx.parentURL) : null;
    const fuente = url && Object.entries(stubs).find(([p]) => new URL(p, raiz).href === url.href)?.[1];
    if (fuente) return modulo(fuente);
    return next(url?.href || spec, ctx);
  },
});
after(() => {
  hooks.deregister();
  delete globalThis.__compraAppleRedis; delete globalThis.__compraAppleCorreos; delete globalThis.__compraAppleUsuario;
  for (const [k, v] of Object.entries(entorno)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

const ca = await import('../lib/compraApple.js');
const { GET: datosApp, POST: enviarApp } = await import('../app/api/suscripcion/apple/route.js');
const { POST: avisoApple } = await import('../app/api/appstore/route.js');
const { POST: stripeSuscripcion } = await import('../app/api/suscripcion/route.js');
const { aplicarSuscripcion } = await import('../lib/suscripcion.js');
const { pagaSuPlan } = await import('../lib/licencias.js');
const { cambioDePlan, estadoEmpresa } = await import('../lib/admin.js');
const { PUBLICO } = await import('../lib/rutasPublicas.js');
const { soloLectura } = await import('../lib/planes.js');

const DIA = 86400000;
// Las rutas usan la hora real: las fechas de las transacciones van respecto a ahora.
const AHORA = Date.now();
const hoy = new Date(AHORA);
const AUT_PRO = 'com.fisquo.app.aut.pro.mes';
let siguiente = 1000;
const tx = (extra = {}) => ({
  transactionId: String(siguiente++), originalTransactionId: '2000000001', bundleId: 'com.fisquo.app', productId: AUT_PRO,
  purchaseDate: AHORA - DIA, originalPurchaseDate: AHORA - DIA, expiresDate: AHORA + 29 * DIA, type: 'Auto-Renewable Subscription',
  inAppOwnershipType: 'PURCHASED', environment: 'Production', signedDate: AHORA, ...extra,
});
const firmar = (p) => firmarComoApple(p);
const empresa = (id, plan) => redis.hset('empresas', { [id]: { id, nombre: `Empresa ${id}`, plan } });
const planDe = async (id) => (await redis.hget('empresas', id))?.plan;
const PRUEBA = { tipo: 'aut', nombre: 'Pro', version: 3, periodo: 'mes', hasta: new Date(AHORA + 14 * DIA).toISOString().slice(0, 10) };

beforeEach(() => {
  base.run(['flushdb']);
  correos.length = 0;
  delete process.env.VERCEL;
  delete process.env.APPLE_XCODE;
  for (const k of ['APPLE_IAP_KEY_ID', 'APPLE_IAP_ISSUER_ID', 'APPLE_IAP_PRIVATE_KEY']) delete process.env[k];
  process.env.APPLE_RAIZ_PRUEBAS = RAIZ_PRUEBAS;
  process.env.KV_REST_API_URL = 'http://127.0.0.1:8079';
  delete process.env.STRIPE_SECRET_KEY;
  llamadasStripe.length = 0;
  usuario = null;
});

test('12 productos: autónomo y pyme, cada plan en mensual y anual', () => {
  assert.equal(Object.keys(ca.PRODUCTOS).length, 12);
  assert.deepEqual(ca.planDeProducto('com.fisquo.app.pym.plus.anio'), { tipo: 'pym', nombre: 'Plus', periodo: 'anio' });
  assert.equal(ca.planDeProducto('com.fisquo.app.gra.plus.mes'), null);
  assert.equal(ca.planDeProducto('__proto__'), null);
  assert.ok(ca.productosPara(['pym']).every((id) => id.startsWith('com.fisquo.app.pym.')));
  assert.equal(ca.productosPara(['aut', 'pym']).length, 12);
});

test('el token de la empresa no cambia y lleva a la empresa', async () => {
  const t = await ca.tokenDe('e1');
  assert.match(t, /^[0-9a-f-]{36}$/);
  assert.equal(await ca.tokenDe('e1'), t);
  assert.notEqual(await ca.tokenDe('e2'), t);
  assert.equal(await redis.hget('apple-empresa', t), 'e1');
});

test('solo valen las transacciones firmadas por la cadena de confianza, de esta app y de un plan conocido', () => {
  assert.ok(ca.verificarTransaccion(firmar(tx())).tx);
  assert.match(ca.verificarTransaccion(firmar(tx({ bundleId: 'com.otra.app' }))).error, /otra app/);
  assert.match(ca.verificarTransaccion(firmar(tx({ productId: 'com.fisquo.app.gra.plus.mes' }))).error, /desconocido/);
  const jws = firmar(tx());
  assert.ok(ca.verificarTransaccion(`${jws.slice(0, -4)}AAAA`).error);
  // En Vercel (también en las vistas previas) la raíz de pruebas no vale.
  process.env.VERCEL = '1';
  assert.ok(ca.verificarTransaccion(jws).error);
  delete process.env.VERCEL;
  // Ni contra una base de datos que no esté en esta máquina.
  process.env.KV_REST_API_URL = 'https://fisquo.upstash.io';
  assert.ok(ca.verificarTransaccion(jws).error);
  process.env.KV_REST_API_URL = 'http://localhost.atacante.com';
  assert.ok(ca.verificarTransaccion(jws).error);
  process.env.KV_REST_API_URL = 'http://127.0.0.1:8079';
  delete process.env.APPLE_RAIZ_PRUEBAS;
  assert.ok(ca.verificarTransaccion(jws).error);
});

test('StoreKit de Xcode sin firma: solo fuera de Vercel, con APPLE_XCODE=1 y entorno Xcode', () => {
  delete process.env.APPLE_RAIZ_PRUEBAS;
  const sinFirma = (p) => `${Buffer.from(JSON.stringify({ alg: 'ES256', x5c: ['AAAA'] })).toString('base64url')}.${Buffer.from(JSON.stringify(p)).toString('base64url')}.${Buffer.alloc(64).toString('base64url')}`;
  assert.ok(ca.verificarTransaccion(sinFirma(tx({ environment: 'Xcode' }))).error);
  process.env.APPLE_XCODE = '1';
  assert.ok(ca.verificarTransaccion(sinFirma(tx({ environment: 'Xcode' }))).tx);
  assert.ok(ca.verificarTransaccion(sinFirma(tx({ environment: 'Production' }))).error);
  process.env.VERCEL = '1';
  assert.ok(ca.verificarTransaccion(sinFirma(tx({ environment: 'Xcode' }))).error);
});

test('planTrasApple: vigente, en gracia, terminada y reembolsada', () => {
  const antes = { ...PRUEBA, suscripcion: 'sub_1', estado: 'canceled', cliente: 'cus_1', descuento: { pct: 10 } };
  const activo = ca.planTrasApple(antes, tx({ productId: 'com.fisquo.app.pym.esencial.anio' }), { autoRenewStatus: 1, autoRenewProductId: 'com.fisquo.app.pym.esencial.anio' }, hoy);
  assert.equal(activo.pagado, true);
  assert.equal(activo.estado, 'active');
  assert.deepEqual([activo.tipo, activo.nombre, activo.periodo, activo.version], ['pym', 'Esencial', 'anio', 3]);
  assert.equal(activo.apple.estado, 'active');
  assert.equal(activo.apple.renueva, true);
  assert.equal(activo.suscripcion, undefined);
  assert.equal(activo.descuento, undefined);
  assert.equal(activo.cliente, 'cus_1');
  assert.equal(soloLectura(activo, hoy), false);

  const gracia = ca.planTrasApple(antes, tx({ expiresDate: AHORA - DIA }), { autoRenewStatus: 1, gracePeriodExpiresDate: AHORA + 5 * DIA }, hoy);
  assert.deepEqual([gracia.pagado, gracia.estado, gracia.apple.estado], [true, 'past_due', 'grace']);

  const fin = ca.planTrasApple(antes, tx({ expiresDate: AHORA - DIA }), { autoRenewStatus: 0 }, hoy);
  assert.deepEqual([fin.pagado, fin.estado, fin.apple.estado, fin.hasta], [false, 'canceled', 'expired', new Date(AHORA - DIA).toISOString().slice(0, 10)]);
  assert.equal(soloLectura(fin, hoy), true);

  // Sandbox (TestFlight, revisión de Apple): al terminar vuelve a la prueba que le quedaba.
  const sandbox = ca.planTrasApple(antes, tx({ expiresDate: AHORA - DIA, environment: 'Sandbox' }), { autoRenewStatus: 0 }, hoy);
  assert.deepEqual([sandbox.pagado, sandbox.hasta, soloLectura(sandbox, hoy)], [false, antes.hasta, false]);

  const reembolso = ca.planTrasApple(antes, tx({ revocationDate: AHORA - 1000, revocationReason: 0 }), null, hoy);
  assert.deepEqual([reembolso.pagado, reembolso.apple.estado], [false, 'revoked']);

  const cambia = ca.planTrasApple(antes, tx(), { autoRenewStatus: 1, autoRenewProductId: 'com.fisquo.app.aut.plus.mes' }, hoy);
  assert.equal(cambia.apple.siguiente, 'com.fisquo.app.aut.plus.mes');
});

test('una compra se guarda en la empresa de su token, una sola vez, y no la pisa algo más viejo', async () => {
  await empresa('e1', PRUEBA);
  const token = await ca.tokenDe('e1');
  const r = await ca.aplicarTransaccion(tx({ appAccountToken: token, transactionId: '50' }), { empresa: 'otra', hoy });
  assert.equal(r.empresa, 'e1');
  assert.equal(r.cambiado, true);
  const plan = await planDe('e1');
  assert.deepEqual([plan.pagado, plan.estado, plan.apple.original, plan.apple.transaccion], [true, 'active', '2000000001', '50']);
  assert.equal(await redis.hget('apple-original', '2000000001'), 'e1');
  assert.deepEqual(correos, [{ empresa: 'e1', antes: undefined, ahora: 'active' }]);
  // La misma otra vez: nada cambia ni se avisa.
  assert.equal((await ca.aplicarTransaccion(tx({ appAccountToken: token, transactionId: '50' }), { hoy })).cambiado, false);
  assert.equal(correos.length, 1);
  // Una anterior (compra más vieja) o una mejorada (isUpgraded) no la pisan.
  await ca.aplicarTransaccion(tx({ appAccountToken: token, transactionId: '49', purchaseDate: AHORA - 40 * DIA, expiresDate: AHORA - 10 * DIA }), { hoy });
  await ca.aplicarTransaccion(tx({ appAccountToken: token, transactionId: '51', isUpgraded: true, expiresDate: AHORA - DIA }), { hoy });
  assert.equal((await planDe('e1')).apple.transaccion, '50');
  assert.equal((await planDe('e1')).pagado, true);
});

test('sin token: por la suscripción ya conocida o, si es nueva, la empresa de quien la manda', async () => {
  await empresa('e1', PRUEBA);
  await empresa('e2', PRUEBA);
  assert.equal((await ca.aplicarTransaccion(tx(), { empresa: 'e2', hoy })).empresa, 'e2');
  // La renovación llega por aviso, sin empresa: va a la de su suscripción.
  const r = await ca.aplicarTransaccion(tx({ purchaseDate: AHORA, expiresDate: AHORA + 30 * DIA }), { hoy });
  assert.equal(r.empresa, 'e2');
  assert.equal((await ca.aplicarTransaccion(tx({ originalTransactionId: '999' }), { hoy })).error, 'Sin empresa');
});

test('la misma suscripción pasa a otra empresa: allí termina', async () => {
  await empresa('e1', PRUEBA);
  await empresa('e2', PRUEBA);
  await ca.aplicarTransaccion(tx({ appAccountToken: await ca.tokenDe('e1') }), { hoy });
  const r = await ca.aplicarTransaccion(tx({ appAccountToken: await ca.tokenDe('e2'), productId: 'com.fisquo.app.pym.pro.mes', purchaseDate: AHORA }), { hoy });
  assert.equal(r.empresa, 'e2');
  assert.equal((await planDe('e2')).pagado, true);
  const e1 = await planDe('e1');
  assert.deepEqual([e1.pagado, e1.apple.estado], [false, 'moved']);
  assert.equal(await redis.hget('apple-original', '2000000001'), 'e2');
});

test('una suscripción terminada de otro ID de Apple no quita la que sigue vigente', async () => {
  await empresa('e1', PRUEBA);
  const token = await ca.tokenDe('e1');
  await ca.aplicarTransaccion(tx({ appAccountToken: token }), { hoy });
  await ca.aplicarTransaccion(tx({ appAccountToken: token, originalTransactionId: '3000000001', expiresDate: AHORA - DIA }), { hoy });
  assert.equal((await planDe('e1')).apple.original, '2000000001');
  assert.equal((await planDe('e1')).pagado, true);
});

test('el periodo de gracia no se pierde cuando la app reenvía la transacción sin datos de renovación', async () => {
  await empresa('e1', PRUEBA);
  const t = tx({ appAccountToken: await ca.tokenDe('e1'), expiresDate: AHORA - DIA });
  await ca.aplicarTransaccion(t, { renovacion: { autoRenewStatus: 1, gracePeriodExpiresDate: AHORA + 5 * DIA }, hoy });
  assert.deepEqual([(await planDe('e1')).pagado, (await planDe('e1')).estado], [true, 'past_due']);
  await ca.aplicarTransaccion(t, { hoy });
  const plan = await planDe('e1');
  assert.deepEqual([plan.pagado, plan.estado, plan.apple.estado, plan.apple.gracia], [true, 'past_due', 'grace', AHORA + 5 * DIA]);
});

test('una suscripción de Apple que ya no vale no quita lo que se paga con Stripe o con la licencia de la gestoría', async () => {
  const STRIPE = { ...PRUEBA, pagado: true, suscripcion: 'sub_1', estado: 'active', cliente: 'cus_1' };
  const LICENCIA = { ...PRUEBA, pagado: true, porDespacho: { id: 'd1', nombre: 'Gestoría', desde: '2026-10-01' } };
  for (const plan of [STRIPE, LICENCIA]) {
    base.run(['flushdb']);
    await empresa('e1', plan);
    const token = await ca.tokenDe('e1');
    await ca.aplicarTransaccion(tx({ appAccountToken: token, expiresDate: AHORA - DIA }), { hoy });
    await ca.aplicarTransaccion(tx({ appAccountToken: token, revocationDate: AHORA - 1000 }), { hoy });
    assert.deepEqual(await planDe('e1'), plan);
  }
});

test('comprar en Apple con Stripe aún cobrando: manda Apple y Stripe deja de renovarse', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  await empresa('e1', { ...PRUEBA, pagado: true, suscripcion: 'sub_1', estado: 'active', cliente: 'cus_1' });
  await ca.aplicarTransaccion(tx({ appAccountToken: await ca.tokenDe('e1') }), { hoy });
  const plan = await planDe('e1');
  assert.deepEqual([plan.pagado, plan.apple.estado, plan.suscripcion, plan.cliente], [true, 'active', undefined, 'cus_1']);
  assert.deepEqual(llamadasStripe, [['subscriptions/sub_1', { cancel_at_period_end: 'true' }]]);
  // El aviso de Stripe de esa cancelación (aún activa hasta fin de periodo) no cambia el plan de Apple.
  await aplicarSuscripcion({ id: 'sub_1', status: 'active', cancel_at_period_end: true, customer: 'cus_1', metadata: { empresa: 'e1', tipo: 'pym', nombre: 'Plus', periodo: 'anio' } });
  assert.deepEqual(await planDe('e1'), plan);
});

test('Fundador y empresas de baja no cambian', async () => {
  await empresa('f', { fundador: true });
  const token = await ca.tokenDe('f');
  assert.equal((await ca.aplicarTransaccion(tx({ appAccountToken: token }), { hoy })).cambiado, false);
  assert.deepEqual(await planDe('f'), { fundador: true });
  await redis.hset('empresas', { b: { id: 'b', baja: true, plan: PRUEBA } });
  assert.equal((await ca.aplicarTransaccion(tx(), { empresa: 'b', hoy })).error, 'Sin empresa');
});

test('avisos de Apple: renovación, baja, otra app, prueba y firma falsa', async () => {
  await empresa('e1', PRUEBA);
  const token = await ca.tokenDe('e1');
  await ca.aplicarTransaccion(tx({ appAccountToken: token }), { hoy });
  const aviso = (tipo, t, ren = null, data = {}) => firmar({ notificationType: tipo, notificationUUID: `u-${siguiente++}`, version: '2.0', signedDate: AHORA, data: { bundleId: 'com.fisquo.app', environment: 'Production', signedTransactionInfo: t && firmar(t), ...(ren ? { signedRenewalInfo: firmar(ren) } : {}), ...data } });
  const pedir = (signedPayload) => avisoApple(new Request('https://fisquo.test/api/appstore', { method: 'POST', body: JSON.stringify({ signedPayload }) }));

  let r = await pedir(aviso('DID_RENEW', tx({ appAccountToken: token, transactionId: '77', purchaseDate: AHORA, expiresDate: AHORA + 31 * DIA }), { autoRenewStatus: 1, signedDate: AHORA }));
  assert.equal(r.status, 200);
  assert.equal((await planDe('e1')).apple.expira, AHORA + 31 * DIA);

  r = await pedir(aviso('EXPIRED', tx({ appAccountToken: token, transactionId: '77', purchaseDate: AHORA, expiresDate: AHORA - 1000 }), { autoRenewStatus: 0, signedDate: AHORA }));
  assert.equal(r.status, 200);
  const fin = await planDe('e1');
  assert.deepEqual([fin.pagado, fin.estado, fin.apple.estado, fin.apple.renueva], [false, 'canceled', 'expired', false]);
  assert.equal(correos.at(-1).ahora, 'canceled');

  assert.equal((await pedir(aviso('TEST', null))).status, 200);
  assert.equal((await pedir(aviso('DID_RENEW', tx(), null, { bundleId: 'com.otra.app' }))).status, 400);
  assert.equal((await pedir(`${aviso('TEST', null).slice(0, -4)}AAAA`)).status, 400);
  assert.equal((await avisoApple(new Request('https://fisquo.test/api/appstore', { method: 'POST', body: 'no' }))).status, 400);
});

test('el cron: sin la API, a los 7 días sin noticias se da por terminada; con la API, manda Apple', async () => {
  await empresa('e1', PRUEBA);
  await ca.aplicarTransaccion(tx({ appAccountToken: await ca.tokenDe('e1'), expiresDate: AHORA + DIA }), { hoy });
  assert.equal(ca.tocaRevisar(await planDe('e1'), hoy), false);
  const pasado = new Date(AHORA + 3 * DIA);
  assert.equal(ca.tocaRevisar(await planDe('e1'), pasado), true);
  assert.deepEqual(await ca.revisarApple('e1', pasado), { cambiado: false });
  assert.equal((await ca.revisarApple('e1', new Date(AHORA + 9 * DIA))).cambiado, true);
  assert.deepEqual([(await planDe('e1')).pagado, (await planDe('e1')).apple.estado], [false, 'expired']);

  // Con la API: Apple dice que se renovó.
  base.run(['flushdb']);
  await empresa('e1', PRUEBA);
  await ca.aplicarTransaccion(tx({ appAccountToken: await ca.tokenDe('e1'), expiresDate: AHORA + DIA }), { hoy });
  const { generateKeyPairSync } = await import('node:crypto');
  process.env.APPLE_IAP_KEY_ID = 'CLAVEPRUEBA';
  process.env.APPLE_IAP_ISSUER_ID = '00000000-0000-0000-0000-000000000000';
  process.env.APPLE_IAP_PRIVATE_KEY = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  let pedido = null;
  const renovada = tx({ transactionId: '88', purchaseDate: AHORA + DIA, expiresDate: AHORA + 31 * DIA });
  const pedir = async (url, o) => { pedido = { url, auth: o.headers.Authorization }; return Response.json({ data: [{ lastTransactions: [{ originalTransactionId: '2000000001', status: 1, signedTransactionInfo: firmar(renovada), signedRenewalInfo: firmar({ autoRenewStatus: 1, signedDate: AHORA }) }] }] }); };
  const r = await ca.revisarApple('e1', pasado, { pedir });
  assert.deepEqual(r, { cambiado: true, api: true });
  assert.match(pedido.url, /^https:\/\/api\.storekit\.itunes\.apple\.com\/inApps\/v1\/subscriptions\/2000000001$/);
  assert.match(pedido.auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  const cuerpoJwt = JSON.parse(Buffer.from(pedido.auth.split('.')[1], 'base64url').toString());
  assert.deepEqual([cuerpoJwt.aud, cuerpoJwt.bid, cuerpoJwt.iss], ['appstoreconnect-v1', 'com.fisquo.app', '00000000-0000-0000-0000-000000000000']);
  assert.deepEqual([(await planDe('e1')).pagado, (await planDe('e1')).apple.transaccion], [true, '88']);
});

test('ruta de la app: datos para comprar y compras enviadas', async () => {
  await empresa('e1', PRUEBA);
  usuario = { id: 'u1', empresa: 'e1', rol: 'admin', plan: PRUEBA, fiscal: { tipo: 'autonomo' } };
  let d = await (await datosApp()).json();
  assert.equal(d.motivo, null);
  assert.deepEqual(d.tipos, ['aut', 'pym']);
  assert.equal(d.productos.length, 12);
  assert.equal(d.token, await ca.tokenDe('e1'));
  usuario = { ...usuario, rol: 'usuario', fiscal: { tipo: 'sociedad' } };
  d = await (await datosApp()).json();
  assert.deepEqual([d.motivo, d.token, d.tipos], ['admin', null, ['pym']]);
  usuario = { ...usuario, rol: 'admin', plan: { ...PRUEBA, pagado: true, suscripcion: 'sub_1', estado: 'active' } };
  assert.equal((await (await datosApp()).json()).motivo, 'web');
  usuario = { ...usuario, plan: { fundador: true } };
  assert.equal((await (await datosApp()).json()).motivo, 'fundador');

  usuario = { id: 'u1', empresa: 'e1', rol: 'admin', plan: PRUEBA };
  const enviar = (transacciones) => enviarApp(new Request('https://fisquo.test/api/suscripcion/apple', { method: 'POST', body: JSON.stringify({ transacciones }) }));
  const compra = firmar(tx({ appAccountToken: await ca.tokenDe('e1') }));
  let r = await enviar([compra]);
  let b = await r.json();
  assert.equal(r.status, 200);
  assert.deepEqual([b.plan.pagado, b.vigente, b.cambiado, b.deOtra, b.apple.producto], [true, true, true, false, AUT_PRO]);
  r = await enviar([compra]);
  assert.equal((await r.json()).cambiado, false);
  assert.equal((await enviar(['basura'])).status, 400);
  // Sin token y de nadie: solo la asigna un administrador.
  usuario = { ...usuario, rol: 'usuario' };
  assert.equal((await enviar([firmar(tx({ originalTransactionId: '5000000001' }))])).status, 400);
  assert.equal(await redis.hget('apple-original', '5000000001'), null);
  usuario = { ...usuario, rol: 'admin' };
  assert.equal((await enviar([])).status, 400);
  // Una de otra empresa: se guarda allí y aquí no cambia nada.
  await empresa('e2', PRUEBA);
  b = await (await enviar([firmar(tx({ appAccountToken: await ca.tokenDe('e2'), originalTransactionId: '4000000001' }))])).json();
  assert.deepEqual([b.deOtra, b.cambiado], [true, false]);
  assert.equal((await planDe('e2')).pagado, true);
});

test('lo pagado en el App Store no se paga dos veces ni lo quita Stripe ni el panel', async () => {
  await empresa('e1', PRUEBA);
  await ca.aplicarTransaccion(tx({ appAccountToken: await ca.tokenDe('e1') }), { hoy });
  const plan = await planDe('e1');
  assert.equal(pagaSuPlan(plan), true);
  assert.equal(estadoEmpresa({ plan }, hoy), 'pago');
  assert.equal(estadoEmpresa({ plan: { ...plan, apple: { ...plan.apple, entorno: 'Sandbox' } } }, hoy), 'prueba');
  assert.match(cambioDePlan({ plan }, 'fundador').error, /App Store/);
  assert.match(cambioDePlan({ plan }, 'plan', { tipo: 'aut', nombre: 'Plus' }).error, /App Store/);
  // Contratar en la web: no.
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  usuario = { id: 'u1', empresa: 'e1', rol: 'admin', plan, fiscal: { tipo: 'autonomo' }, email: 'a@b.c' };
  const r = await stripeSuscripcion(new Request('https://fisquo.test/api/suscripcion', { method: 'POST', headers: { 'user-agent': 'Mozilla/5.0' }, body: JSON.stringify({ tipo: 'aut', nombre: 'Plus', periodo: 'mes' }) }));
  assert.equal(r.status, 409);
  // Una suscripción vieja de Stripe que termina no la quita.
  await aplicarSuscripcion({ id: 'sub_viejo', status: 'canceled', customer: 'cus_1', metadata: { empresa: 'e1', tipo: 'aut', nombre: 'Pro', periodo: 'mes' } });
  assert.equal((await planDe('e1')).pagado, true);
  // Terminada en Apple: la empresa queda como cancelada en el panel.
  await ca.aplicarTransaccion(tx({ appAccountToken: await ca.tokenDe('e1'), expiresDate: AHORA - 1000 }), { hoy });
  assert.equal(estadoEmpresa({ plan: await planDe('e1') }, hoy), 'cancelada');
});

test('los avisos del App Store entran sin sesión; nada más con ese nombre', () => {
  assert.ok(PUBLICO.test('/api/appstore'));
  assert.ok(!PUBLICO.test('/api/appstorex'));
  assert.ok(!PUBLICO.test('/api/suscripcion/apple'));
});
