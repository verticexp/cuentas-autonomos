import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { crearBase } from './apoyo/upstash-mem.mjs';

// Redis en memoria con las mismas órdenes y cerrojos. Sin red ni claves reales.
// Los cálculos, la lectura compartida, las rutas, la autorización y los cambios de estado son los reales.
const base = crearBase();
let ordenes = [];
const run = (orden) => { ordenes.push(orden); return base.run(orden); };
const dec = (s) => s === null ? null : JSON.parse(s);
const redis = {
  get: async (k) => dec(run(['get', k])),
  set: async (k, v, o = {}) => run(['set', k, JSON.stringify(v), ...(o.nx ? ['NX'] : []), ...(o.px ? ['PX', o.px] : [])]),
  hget: async (k, f) => dec(run(['hget', k, f])),
  hgetall: async (k) => { const a = run(['hgetall', k]); return Object.fromEntries(Array.from({ length: a.length / 2 }, (_, i) => [a[i * 2], dec(a[i * 2 + 1])])); },
  hset: async (k, obj) => run(['hset', k, ...Object.entries(obj).flatMap(([f, v]) => [f, JSON.stringify(v)])]),
  hdel: async (k, ...fs) => run(['hdel', k, ...fs]),
  smembers: async (k) => run(['smembers', k]),
  sadd: async (k, ...vs) => run(['sadd', k, ...vs]),
  del: async (...ks) => run(['del', ...ks]),
  eval: async (script, keys, args) => run(['eval', script, keys.length, ...keys, ...args.map(JSON.stringify)]),
};
globalThis.__adminCifrasRedis = redis;
const entorno = { OFICINA_CIFRAS_TOKEN: process.env.OFICINA_CIFRAS_TOKEN, CRON_SECRET: process.env.CRON_SECRET };
const modulo = (s) => ({ url: `data:text/javascript,${encodeURIComponent(s)}`, shortCircuit: true });
const stubs = {
  'lib/redis.js': `export const redis = globalThis.__adminCifrasRedis; export const clave = (u,n) => n+':'+u.empresa; export const leer = async (u,n) => Object.values(await redis.hgetall(clave(u,n)));`,
  'lib/auth.js': 'export const borrarUsuario = async () => {}; export const quitarDeEmpresa = async () => {};',
  'lib/buzon.js': 'export const revocarBuzon = async () => {};',
  'lib/justificantes.js': 'export const borrarDeEmpresa = async () => {}; export const borrarJustificantes = async () => {};',
  'lib/bajaDespacho.js': 'export const clienteDeBaja = async () => {}; export const salirDelDespacho = async () => {};',
  'lib/avisosCorreo.js': 'export const avisarSuscripcion = async () => {};',
  'lib/recomendaciones.js': 'export const premiarRecomendacion = async () => {};',
  'lib/stripe.js': 'export const stripe = async () => { throw new Error("Stripe externo no permitido en esta prueba"); };',
  'lib/api.js': 'export const usuarioApi = async () => ({ u: { id: "admin_PRUEBA" } }); export const cuerpo = (req) => req.json(); export const error = (error, status = 400) => Response.json({ error }, { status });',
  'lib/metricas.js': 'export const metrica = () => {};',
};
const raiz = new URL('../', import.meta.url);
const hooks = registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'next/server') return modulo(`export class NextResponse {
      static next() { return new Response(null, { headers: { 'x-middleware-next': '1' } }); }
      static json(b, o) { return Response.json(b, o); }
      static redirect(u) { return Response.redirect(u); }
    }`);
    const url = spec.startsWith('@/') ? new URL(spec.slice(2) + '.js', raiz) : spec.startsWith('.') ? new URL(spec, ctx.parentURL) : null;
    const fuente = url && Object.entries(stubs).find(([p]) => new URL(p, raiz).href === url.href)?.[1];
    if (fuente) return modulo(fuente);
    return next(url?.href || spec, ctx);
  },
});
after(() => {
  hooks.deregister();
  delete globalThis.__adminCifrasRedis;
  for (const [k, v] of Object.entries(entorno)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(() => { base.run(['flushdb']); ordenes = []; delete process.env.OFICINA_CIFRAS_TOKEN; });
const { GET } = await import('../app/api/admin/cifras/route.js');
const { POST: cambiarPlanAdmin } = await import('../app/api/admin/route.js');
const { proxy } = await import('../proxy.js');
const { leerResumenAdmin, iniciarBajasAdmin } = await import('../lib/adminServidor.js');
const { aplicarSuscripcion } = await import('../lib/suscripcion.js');
const { darDeBaja } = await import('../lib/baja.js');
const { PUBLICO } = await import('../lib/rutasPublicas.js');
const TOKEN = 'solo-pruebas-oficina-ñ';
const req = ({ token, ruta = '/api/admin/cifras', metodo = 'GET', cookie = false } = {}) => {
  const r = new Request(`https://fisquo.test${ruta}`, { method: metodo, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: 't=sesion-admin' } : {}) } });
  r.nextUrl = new URL(r.url);
  r.cookies = { get: () => { throw new Error('La consulta de cifras no debe consultar cookies'); } };
  return r;
};
const pago = { tipo: 'aut', nombre: 'Pro', periodo: 'mes', pagado: true, estado: 'active', suscripcion: 'sub_PRIVADO', cliente: 'cus_PRIVADO' };
const empresa = (id, plan = pago, extra = {}) => ({ id, nombre: 'Nombre PRIVADO', emisor: { nif: 'NIF_PRIVADO' }, creada: '2026-01-01T12:00:00.000Z', plan, ...extra });
const sub = (estado, extra = {}) => ({ id: pago.suscripcion, customer: pago.cliente, status: estado, metadata: { empresa: 'empresa_PRIVADA' }, ...extra });

for (const tokenEnv of [undefined, '', '   ']) test(`cifras apagadas: 404 con variable ${JSON.stringify(tokenEnv)}, incluso con token y sesión`, async () => {
  if (tokenEnv !== undefined) process.env.OFICINA_CIFRAS_TOKEN = tokenEnv;
  for (const ejecutar of [GET, proxy]) {
    const r = await ejecutar(req({ token: TOKEN, cookie: true }));
    assert.equal(r.status, 404);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.equal(await r.text(), '');
  }
  assert.equal(ordenes.length, 0);
});

test('cifras: 401 sin token o con token incorrecto; una sesión o el secreto del cron no autorizan', async () => {
  process.env.OFICINA_CIFRAS_TOKEN = TOKEN;
  process.env.CRON_SECRET = 'solo-cron';
  for (const token of [undefined, 'incorrecto', 'solo-cron', 'x'.repeat(1000), 'ñ']) for (const ejecutar of [GET, proxy]) {
    const r = await ejecutar(req({ token, cookie: true }));
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.equal(await r.text(), '');
    assert.equal(r.headers.get('set-cookie'), null);
  }
  const sinBearer = req();
  sinBearer.headers.set('Authorization', TOKEN);
  assert.equal((await GET(sinBearer)).status, 401);
  assert.equal(ordenes.length, 0, 'no se lee la base antes de autorizar');
});

test('200: forma exacta, euros sin IVA, mismos agregados del panel; sin datos personales ni escrituras', async () => {
  process.env.OFICINA_CIFRAS_TOKEN = TOKEN;
  const dia = new Date().toISOString().slice(0, 10);
  const mes = dia.slice(0, 7);
  await redis.set('admin-bajas-desde', `${mes}-01T00:00:00.000Z`);
  await redis.hset('empresas', {
    empresa_PRIVADA: empresa('empresa_PRIVADA'),
    anual_PRIVADA: empresa('anual_PRIVADA', { ...pago, periodo: 'anio' }),
    impago_PRIVADA: empresa('impago_PRIVADA', { ...pago, estado: 'past_due' }),
    prueba_PRIVADA: empresa('prueba_PRIVADA', { tipo: 'aut', nombre: 'Pro', hasta: dia }),
    baja_PRIVADA: empresa('baja_PRIVADA', pago, { baja: { fecha: dia }, historialPagoAdmin: [{ fecha: `${dia}T00:00:00.000Z`, antes: true, despues: false }] }),
  });
  await redis.hset('usuarios', { usuario_PRIVADO: { id: 'usuario_PRIVADO', nombre: 'Persona PRIVADA', email: 'correo_PRIVADO@example.com', empresa: 'empresa_PRIVADA' } });
  await redis.sadd(`actividad:${dia}`, 'usuario_PRIVADO');
  await redis.sadd(`actividad-empresas:${dia}`, 'empresa_PRIVADA');
  ordenes = [];
  const r = await GET(req({ token: TOKEN, cookie: true }));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.equal(r.headers.get('set-cookie'), null);
  const b = await r.json();
  assert.deepEqual(Object.keys(b).sort(), ['generado', 'mrr', 'arr', 'pago', 'impago', 'prueba', 'conversion', 'altasMes', 'bajasMes', 'bajasPct', 'bajasDesde', 'bajasMesParcial', 'pruebasQueAcabanEn7', 'activos7', 'activos30', 'altasSemanas', 'bajasSemanas', 'origenes'].sort());
  assert.equal(new Date(b.generado).toISOString(), b.generado);
  assert.equal(b.mrr, 20.4);
  assert.equal(b.arr, 244.8);
  assert.equal(b.pago, 2);
  assert.equal(b.impago, 1);
  assert.equal(b.prueba, 1);
  assert.equal(b.bajasMes, 1);
  assert.equal(b.bajasPct, 25);
  assert.equal(b.activos7, 1);
  assert.equal(b.activos30, 1);
  for (const a of b.altasSemanas) assert.deepEqual(Object.keys(a), ['desde', 'n']);
  for (const a of b.bajasSemanas) assert.deepEqual(Object.keys(a), ['desde', 'hasta', 'n', 'completa']);
  for (const o of b.origenes) assert.deepEqual(Object.keys(o), ['origen', 'total', 'prueba', 'pagan', 'conversion']);
  assert.doesNotMatch(JSON.stringify(b), /PRIVAD|nombre|nif|email|cliente|suscripcion|\bid\b|filas|usuarios/);
  assert.ok(ordenes.every(([c]) => ['get', 'hgetall', 'smembers'].includes(c)), 'la ruta solo lee');
  const { resumen: panel } = await leerResumenAdmin(new Date(b.generado));
  for (const k of ['conversion', 'altasMes', 'bajasMes', 'bajasPct', 'bajasDesde', 'bajasMesParcial', 'pruebasQueAcabanEn7', 'activos7', 'activos30']) assert.deepEqual(b[k], panel.kpis[k], k);
  assert.deepEqual(b.altasSemanas, panel.altas);
  assert.deepEqual(b.bajasSemanas, panel.bajasSemanas);
  assert.deepEqual(b.origenes, panel.origenes);
});

test('sin seguimiento aún: fecha y porcentaje nulos; la consulta no inicia el seguimiento', async () => {
  process.env.OFICINA_CIFRAS_TOKEN = TOKEN;
  const b = await (await GET(req({ token: TOKEN }))).json();
  assert.equal(b.bajasDesde, null);
  assert.equal(b.bajasPct, null);
  assert.equal(b.bajasMes, 0);
  assert.equal(b.bajasMesParcial, true);
  assert.ok(b.bajasSemanas.every((s) => !s.completa));
  assert.equal(await redis.get('admin-bajas-desde'), null);
});

test('si falla la lectura, devuelve 503 sin detalles internos y sin caché', async () => {
  process.env.OFICINA_CIFRAS_TOKEN = TOKEN;
  const original = redis.hgetall;
  redis.hgetall = async () => { throw new Error('Detalle privado del almacenamiento'); };
  try {
    const r = await GET(req({ token: TOKEN }));
    assert.equal(r.status, 503);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    assert.equal(await r.text(), '');
  } finally { redis.hgetall = original; }
});

test('proxy: excepción exacta y solo GET; no renueva sesiones ni abre otros recursos del administrador', async () => {
  process.env.OFICINA_CIFRAS_TOKEN = TOKEN;
  const r = await proxy(req({ token: TOKEN, cookie: true }));
  assert.equal(r.headers.get('x-middleware-next'), '1');
  assert.equal(r.headers.get('set-cookie'), null);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.equal(ordenes.length, 0);
  for (const metodo of ['POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS']) assert.equal((await proxy(req({ token: TOKEN, metodo }))).status, 405);
  for (const ruta of ['/api/admin', '/api/admin/cifras-extra', '/api/admin/cifras/detalle', '/api/admin/soporte']) {
    assert.equal(PUBLICO.test(ruta), false);
    const r = req({ token: TOKEN, ruta });
    r.cookies = { get: () => undefined };
    assert.equal((await proxy(r)).status, 401, ruta);
  }
});

test('fecha de inicio persistente: no se sustituye al abrir el panel o recibir otro aviso', async () => {
  await iniciarBajasAdmin(new Date('2026-11-05T10:00:00.000Z'));
  await iniciarBajasAdmin(new Date('2026-11-06T10:00:00.000Z'));
  assert.equal(await redis.get('admin-bajas-desde'), '2026-11-05T10:00:00.000Z');
});

test('Stripe: cancelación efectiva guarda fecha observada; reintentos concurrentes y baja posterior no la duplican', async () => {
  await redis.hset('empresas', { empresa_PRIVADA: empresa('empresa_PRIVADA') });
  await aplicarSuscripcion(sub('active', { cancel_at_period_end: true }));
  assert.deepEqual((await redis.hget('empresas', 'empresa_PRIVADA')).historialPagoAdmin, [], 'sigue pagando hasta el fin del periodo');
  const desde = await redis.get('admin-bajas-desde');
  await Promise.all(Array.from({ length: 3 }, () => aplicarSuscripcion(sub('canceled', { canceled_at: 1700000000 }))));
  let e = await redis.hget('empresas', 'empresa_PRIVADA');
  assert.equal(e.historialPagoAdmin.length, 1);
  assert.equal(e.historialPagoAdmin[0].antes, true);
  assert.equal(e.historialPagoAdmin[0].despues, false);
  assert.ok(e.historialPagoAdmin[0].fecha >= desde);
  assert.equal(e.historialPagoAdmin[0].fecha.slice(0, 10), new Date().toISOString().slice(0, 10), 'no se inventa una fecha pasada');
  const fecha = e.historialPagoAdmin[0].fecha;
  await darDeBaja(e.id);
  e = await redis.hget('empresas', e.id);
  assert.equal(e.historialPagoAdmin.length, 1);
  assert.equal(e.historialPagoAdmin[0].fecha, fecha);
  assert.equal((await leerResumenAdmin()).resumen.kpis.bajasMes, 1);
});

test('baja de empresa de pago cuenta aunque desaparezca de filas; avisos posteriores no duplican', async () => {
  await redis.hset('empresas', { empresa_PRIVADA: empresa('empresa_PRIVADA') });
  await darDeBaja('empresa_PRIVADA');
  await aplicarSuscripcion(sub('canceled'));
  const { resumen: r } = await leerResumenAdmin();
  assert.equal(r.filas.length, 0);
  assert.equal(r.kpis.bajasMes, 1);
  assert.equal((await redis.hget('empresas', 'empresa_PRIVADA')).historialPagoAdmin.length, 1);
});

test('Stripe: una prueba sin pagar, Fundador y una cancelación histórica sin pago conocido no generan bajas', async () => {
  for (const plan of [{ ...pago, estado: 'trialing' }, { ...pago, fundador: true }, { ...pago, pagado: false, estado: 'canceled' }]) {
    await redis.hset('empresas', { empresa_PRIVADA: empresa('empresa_PRIVADA', plan) });
    await aplicarSuscripcion(sub('canceled'));
    assert.deepEqual((await redis.hget('empresas', 'empresa_PRIVADA')).historialPagoAdmin, []);
  }
});

test('Stripe: primer pago y reactivación se conservan para calcular la base de meses siguientes', async () => {
  await redis.hset('empresas', { empresa_PRIVADA: empresa('empresa_PRIVADA', { ...pago, pagado: false }) });
  for (const estado of ['active', 'canceled', 'active']) await aplicarSuscripcion(sub(estado));
  const e = await redis.hget('empresas', 'empresa_PRIVADA');
  assert.deepEqual(e.historialPagoAdmin.map(({ antes, despues }) => [antes, despues]), [[false, true], [true, false], [false, true]]);
  assert.equal((await leerResumenAdmin()).resumen.kpis.bajasMes, 1);
});

test('Stripe: una prueba cuyo primer cobro falla no se convierte en baja de pago', async () => {
  await redis.hset('empresas', { empresa_PRIVADA: empresa('empresa_PRIVADA', { ...pago, estado: 'trialing' }) });
  for (const estado of ['trialing', 'past_due', 'unpaid', 'canceled']) await aplicarSuscripcion(sub(estado));
  assert.deepEqual((await redis.hget('empresas', 'empresa_PRIVADA')).historialPagoAdmin, []);
  assert.equal((await leerResumenAdmin()).resumen.kpis.bajasMes, 0);
  // Si el reintento finalmente cobra, la cancelación siguiente sí es una baja.
  for (const estado of ['active', 'past_due', 'canceled']) await aplicarSuscripcion(sub(estado));
  assert.equal((await leerResumenAdmin()).resumen.kpis.bajasMes, 1);
});

test('panel: regalar un plan que se pagaba conserva la baja; repetir la acción no duplica el historial', async () => {
  await redis.hset('empresas', { empresa_PRIVADA: empresa('empresa_PRIVADA', { ...pago, suscripcion: undefined }) });
  const regalar = () => cambiarPlanAdmin(new Request('https://fisquo.test/api/admin', { method: 'POST', body: JSON.stringify({ empresa: 'empresa_PRIVADA', accion: 'fundador' }) }));
  assert.equal((await regalar()).status, 200);
  assert.equal((await regalar()).status, 400);
  const e = await redis.hget('empresas', 'empresa_PRIVADA');
  assert.equal(e.historialPagoAdmin.length, 1);
  assert.equal((await leerResumenAdmin()).resumen.kpis.bajasMes, 1);
  assert.ok(await redis.get('admin-bajas-desde'));
});
