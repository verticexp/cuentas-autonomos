// Regresiones de integridad del 23/10/2026: código real y simulador Upstash sin puertos.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';

const base = crearBase();
const srv = { ganchos: { antes: null }, comandos: [], sesiones: new Map(), intentos: new Map(), peticiones: [] };
const originalFetch = globalThis.fetch;
const variables = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'STRIPE_SECRET_KEY', 'STRIPE_URL'];
const entorno = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
let R, B, G, C, S, COP, I, CAL, POST;
const u = { id: 'u', empresa: 'e', rol: 'admin', actividades: [{ id: 'servicios', nombre: 'Servicios' }] };
const gasto = (extra = {}) => ({ id: 'g', fecha: '2026-10-01', actividad: 'servicios', concepto: 'Material', base: 100, ivaPct: 0, pendiente: true, ...extra });
const movimiento = (extra = {}) => ({ id: 'm', fecha: '2026-10-01', importe: -100, concepto: 'Material', estado: 'pendiente', ...extra });
const factura = (extra = {}) => ({ id: 'f', fecha: '2026-10-01', numero: 1, anio: 2026, emisor: { nombre: 'Emisora' }, cliente: { email: 'cliente@example.com' }, concepto: 'Servicio', base: 100, ivaPct: 0, cobrada: false, pago: 'token', ...extra });
const guardar = (col, doc) => R.guardar(u, col, doc);
const leer = (col, id) => R.leerUno(u, col, id);
const ordenes = (j) => Array.isArray(j[0]) ? j : [j];
const diferida = () => { let resolver; const promesa = new Promise((ok) => { resolver = ok; }); return { promesa, resolver }; };
function pausar(cuando) {
  const entro = diferida(), seguir = diferida();
  srv.ganchos.antes = async (j) => {
    if (!cuando(j)) return;
    srv.ganchos.antes = null;
    entro.resolver();
    await seguir.promesa;
  };
  return { entro: entro.promesa, seguir: seguir.resolver };
}
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
async function cargar(archivo, dobles = {}) {
  const texto = (await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8')).replace(/from (['"])([^'"]+)\1/g, (_, _c, origen) => {
    const destino = dobles[origen] || (origen.startsWith('.') ? new URL(origen, new URL(`../${archivo}`, import.meta.url)).href : import.meta.resolve(origen));
    return `from ${JSON.stringify(destino)}`;
  });
  return import(modulo(texto));
}
async function cargarRuta() {
  const dobles = {
    '@/lib/limite': modulo(`export const pasado=async()=>false; export const ipDe=()=> '127.0.0.1'; export const MUCHOS='Demasiados intentos';`),
    '@/lib/stripeConnect': modulo(`export const actualizarEstado=async()=>({estado:'activa'});`),
  };
  const texto = (await readFile(new URL('../app/api/pagar/route.js', import.meta.url), 'utf8')).replace(/from (['"])([^'"]+)\1/g, (_, _c, origen) => {
    const destino = dobles[origen] || (origen.startsWith('@/') ? new URL(`../${origen.slice(2)}.js`, import.meta.url).href : import.meta.resolve(origen === 'next/server' ? 'next/server.js' : origen));
    return `from ${JSON.stringify(destino)}`;
  });
  return (await import(modulo(texto))).POST;
}
before(async () => {
  process.env.KV_REST_API_URL = 'http://redis-integridad.test';
  process.env.KV_REST_API_TOKEN = 'pruebas';
  process.env.STRIPE_SECRET_KEY = 'pruebas';
  process.env.STRIPE_URL = 'http://stripe-integridad.test';
  globalThis.fetch = async (url, op = {}) => {
    if (!String(url).startsWith(process.env.KV_REST_API_URL)) return stripeSimulado(String(url), op);
    const j = JSON.parse(op.body);
    const fallo = await srv.ganchos.antes?.(j);
    if (fallo) return Response.json(Array.isArray(j[0]) ? j.map(() => ({ error: 'corte simulado' })) : { error: 'corte simulado' });
    const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
    const uno = (cmd) => {
      srv.comandos.push(cmd);
      const result = base.run(cmd);
      return { result: new Headers(op.headers).get('upstash-encoding') === 'base64' ? b64(result) : result };
    };
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  [R, B, G, C, S, COP, I, CAL] = await Promise.all([
    import('../lib/redis.js'), import('../lib/bancoServidor.js'), import('../lib/gastosServidor.js'), import('../lib/cobros.js'),
    import('../lib/stripe.js'), import('../lib/copias.js'), import('../lib/integridad.js'), import('../lib/calculos.js'),
  ]);
  const auditoria = await cargar('lib/auditoria.js', { 'next/headers': modulo(`export const headers=async()=>new Headers();`) });
  globalThis.__auditarIntegridad = auditoria.auditar;
  C = await cargar('lib/cobros.js', { './auditoria.js': modulo(`export const auditar=(...a)=>globalThis.__auditarIntegridad(...a);`) });
  POST = await cargarRuta();
});
beforeEach(() => {
  base.run(['flushdb']); srv.ganchos.antes = null; srv.comandos = []; srv.sesiones.clear(); srv.intentos.clear(); srv.peticiones = [];
});
after(() => {
  globalThis.fetch = originalFetch; delete globalThis.__auditarIntegridad;
  for (const [k, v] of Object.entries(entorno)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
function stripeSimulado(url, op) {
  const ruta = new URL(url).pathname;
  const cabeceras = new Headers(op.headers);
  srv.peticiones.push({ ruta, op, cuenta: cabeceras.get('Stripe-Account') });
  if (ruta === '/v1/checkout/sessions' && op.method === 'POST') {
    const clave = cabeceras.get('Idempotency-Key');
    if (clave && srv.intentos.has(clave)) return Response.json(srv.intentos.get(clave));
    const datos = new URLSearchParams(op.body);
    const id = `cs_prueba_${srv.sesiones.size + 1}`;
    const s = { id, status: 'open', payment_status: 'unpaid', url: `https://checkout.stripe.test/${id}`, amount_total: Number(datos.get('line_items[0][price_data][unit_amount]')), expires_at: Number(datos.get('expires_at')) || Math.floor(Date.now() / 1000) + 86400 };
    srv.sesiones.set(id, s);
    if (clave) srv.intentos.set(clave, s);
    return Response.json(s);
  }
  const [, id, accion] = /^\/v1\/checkout\/sessions\/(cs_[\w]+)(?:\/(expire))?$/.exec(ruta) || [];
  const s = srv.sesiones.get(id);
  if (!s) return Response.json({ error: { message: 'Sesión desconocida' } }, { status: 404 });
  if (s.expires_at * 1000 <= Date.now() && s.status === 'open') s.status = 'expired';
  if (accion === 'expire') s.status = 'expired';
  return Response.json(s);
}
async function prepararFactura(extra = {}) {
  await guardar('facturas', factura(extra));
  await R.redis.hset('factura-pagos', { token: { empresa: 'e', id: 'f' } });
  await R.redis.hset('empresas', { e: { id: 'e', nombre: 'Emisora', stripeConnect: { estado: 'activa', cuenta: 'acct_empresa' } } });
}
const pagar = () => {
  const form = new FormData(); form.set('token', 'token');
  const req = new Request('http://fisquo.test/api/pagar', { method: 'POST', body: form }); req.nextUrl = new URL(req.url);
  return POST(req);
};

test('C1-03/S-04: una importación pausada no pisa la conciliación de otra importación', async () => {
  await guardar('gastos', gasto());
  const pausa = pausar((j) => ordenes(j).some(([c, k]) => ['hset', 'hsetnx'].includes(c.toLowerCase()) && k === 'cuentas:banco:e'));
  const segunda = B.guardarMovimientos(u, [movimiento()]);
  await pausa.entro;
  try {
    assert.deepEqual(await B.guardarMovimientos(u, [movimiento()]), { nuevos: 1, repetidos: 0 });
    assert.equal((await B.emparejar(u, 'm', 'gasto', 'g')).ok, true);
  } finally { pausa.seguir(); }
  assert.deepEqual(await segunda, { nuevos: 0, repetidos: 1 });
  assert.deepEqual((await leer('banco', 'm')).enlace, { tipo: 'gasto', id: 'g' });
});
test('C1-03: duplicados dentro del lote se cuentan una sola vez y se aíslan por empresa', async () => {
  assert.deepEqual(await B.guardarMovimientos(u, [movimiento(), movimiento(), movimiento({ id: 'otro' })]), { nuevos: 2, repetidos: 1 });
  assert.deepEqual(await B.guardarMovimientos({ ...u, empresa: 'otra' }, [movimiento()]), { nuevos: 1, repetidos: 0 });
});
test('C1-05: una operación caducada no escribe ni borra los cerrojos de su sucesora', async (t) => {
  await guardar('gastos', gasto()); await guardar('banco', movimiento());
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const pausa = pausar((j) => ordenes(j).some(([c, k]) => c.toLowerCase() === 'hget' && k === 'cuentas:gastos:e'));
  const primera = B.emparejar(u, 'm', 'gasto', 'g');
  await pausa.entro;
  const cerrojos = ['cuentas:cerrojo:banco-m:e', 'cuentas:cerrojo:gasto-g:e'];
  try {
    t.mock.timers.tick(31000);
    for (const k of cerrojos) base.run(['set', k, 'otra-operacion', 'PX', 20000]);
    pausa.seguir();
    assert.equal((await primera).status, 409);
    assert.equal((await leer('banco', 'm')).estado, 'pendiente');
    assert.equal((await leer('gastos', 'g')).banco, undefined);
    for (const k of cerrojos) assert.equal(base.run(['get', k]), 'otra-operacion');
  } finally { pausa.seguir(); t.mock.timers.reset(); }
});
test('C1-05: el cerrojo de factura vigente no permite escribir si el del movimiento caducó', async (t) => {
  await guardar('facturas', factura()); await guardar('banco', movimiento({ importe: 100 }));
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const pausa = pausar((j) => ordenes(j).some(([c, k]) => c.toLowerCase() === 'hget' && k === 'cuentas:facturas:e'));
  const operacion = B.emparejar(u, 'm', 'factura', 'f');
  await pausa.entro;
  try {
    t.mock.timers.tick(21000);
    base.run(['set', 'cuentas:cerrojo:banco-m:e', 'sucesora', 'PX', 20000]);
    pausa.seguir();
    assert.equal((await operacion).status, 409);
    assert.equal((await leer('banco', 'm')).estado, 'pendiente');
    assert.equal(CAL.pagadoDe(await leer('facturas', 'f')), 0);
    assert.equal(base.run(['get', 'cuentas:cerrojo:banco-m:e']), 'sucesora');
  } finally { pausa.seguir(); t.mock.timers.reset(); }
});
test('C1-05: al estar ocupado un segundo cerrojo se conserva y se libera solo el adquirido', async () => {
  base.run(['set', 'cuentas:cerrojo:gasto-g:e', 'otra-operacion', 'PX', 20000]);
  assert.equal((await B.emparejar(u, 'm', 'gasto', 'g')).status, 409);
  assert.equal(base.run(['get', 'cuentas:cerrojo:banco-m:e']), null);
  assert.equal(base.run(['get', 'cuentas:cerrojo:gasto-g:e']), 'otra-operacion');
});
test('C1-04: editar no puede guardar una copia anterior a la conciliación', async () => {
  await guardar('gastos', gasto()); await guardar('banco', movimiento());
  const entro = diferida(), seguir = diferida();
  const edicion = G.editarGasto(u, 'g', async (antes) => { entro.resolver(); await seguir.promesa; return { gasto: { ...antes, concepto: 'Editado' } }; });
  await entro.promesa;
  let banco;
  try { banco = await B.emparejar(u, 'm', 'gasto', 'g'); } finally { seguir.resolver(); }
  await edicion;
  assert.equal(banco.status, 409);
  assert.equal((await B.emparejar(u, 'm', 'gasto', 'g')).ok, true);
  const g = await leer('gastos', 'g');
  assert.equal(g.concepto, 'Editado'); assert.equal(g.banco, 'm'); assert.equal(g.pagado, '2026-10-01');
});
for (const accion of ['editar', 'borrar', 'pagar']) test(`C1-04: ${accion} espera a la conciliación y relee dentro del cerrojo`, async () => {
  await guardar('gastos', gasto()); await guardar('banco', movimiento());
  const pausa = pausar((j) => ordenes(j).some(([c, k]) => c.toLowerCase() === 'hget' && k === 'cuentas:gastos:e'));
  const banco = B.emparejar(u, 'm', 'gasto', 'g');
  await pausa.entro;
  // Se pausa el intento de tomar el cerrojo del gasto para comprobar que ya lo tiene el banco.
  const intenta = pausar((j) => ordenes(j).some(([c, k]) => c.toLowerCase() === 'set' && k === 'cuentas:cerrojo:gasto-g:e'));
  const cambio = accion === 'editar' ? G.editarGasto(u, 'g', (g) => ({ gasto: { ...g, concepto: 'Después' } }))
    : accion === 'borrar' ? G.borrarGasto(u, 'g') : G.pagarGasto(u, 'g', '2026-10-23');
  // Con el código anterior no se intenta adquirir el cerrojo: se observa también la finalización para no colgar la prueba.
  const observado = await Promise.race([intenta.entro.then(() => 'cerrojo'), cambio.then(() => 'sin-cerrojo')]);
  pausa.seguir(); intenta.seguir();
  assert.equal((await banco).ok, true);
  const r = await cambio;
  assert.equal(observado, 'cerrojo');
  if (accion === 'editar') { assert.equal(r.gasto.banco, 'm'); assert.equal(r.gasto.pagado, '2026-10-01'); }
  if (accion === 'borrar') { assert.equal(await leer('gastos', 'g'), null); assert.equal((await leer('banco', 'm')).estado, 'pendiente'); }
  if (accion === 'pagar') { assert.equal(r.status, 409); assert.equal((await leer('gastos', 'g')).pagado, '2026-10-01'); }
});
test('C1-04: deshacer y editar tampoco pierden los cambios del gasto', async () => {
  await guardar('gastos', gasto()); await guardar('banco', movimiento());
  assert.equal((await B.emparejar(u, 'm', 'gasto', 'g')).ok, true);
  const entro = diferida(), seguir = diferida();
  const edicion = G.editarGasto(u, 'g', async (antes) => { entro.resolver(); await seguir.promesa; return { gasto: { ...antes, concepto: 'Editado' } }; });
  await entro.promesa;
  let deshacer;
  try { deshacer = await B.deshacer(u, 'm'); } finally { seguir.resolver(); }
  await edicion;
  assert.equal(deshacer.status, 409);
  assert.equal((await B.deshacer(u, 'm')).ok, true);
  const g = await leer('gastos', 'g');
  assert.equal(g.concepto, 'Editado'); assert.equal(g.banco, undefined); assert.equal(g.pendiente, true);
});
for (const [clase, col] of [['comision', 'gastos'], ['prestamo', 'asientos']]) {
  test(`C1-06: ${clase} y enlace se guardan juntos; un corte no deja documentos sueltos`, async () => {
    await guardar('banco', movimiento());
    srv.ganchos.antes = async (j) => {
      if (!JSON.stringify(j).includes('cuentas:banco:e') || !JSON.stringify(j).includes('emparejado')) return;
      srv.ganchos.antes = null; return true;
    };
    await assert.rejects(B.contabilizar(u, 'm', clase), /corte simulado/);
    assert.deepEqual(await R.leer(u, col), []);
    assert.equal((await leer('banco', 'm')).estado, 'pendiente');
    assert.equal((await B.contabilizar(u, 'm', clase)).ok, true);
    assert.equal((await R.leer(u, col)).length, 1);
    assert.equal((await leer('banco', 'm')).enlace.id, 'banco-m');
  });
  test(`C1-06: el reintento de ${clase} usa la identidad del movimiento`, async () => {
    await guardar('banco', movimiento());
    // Simula un documento que alcanzó Redis pero cuyo enlace se perdió en un corte anterior.
    await guardar(col, col === 'gastos' ? gasto({ id: 'banco-m', banco: 'm', deBanco: true }) : { id: 'banco-m', banco: 'm', fecha: '2026-10-01', lineas: [] });
    assert.equal((await B.contabilizar(u, 'm', clase)).ok, true);
    assert.equal((await R.leer(u, col)).length, 1);
    assert.equal((await leer('banco', 'm')).enlace.id, 'banco-m');
  });
}
test('C1-08: 30 explícitos + 70 a mano + 40 Stripe quedan en 140 y avisan del exceso', async () => {
  await prepararFactura({ cobrada: true, cobro: { fecha: '2026-10-03', metodo: 'manual', liquidado: 'liquidacion' }, pagos: [{ fecha: '2026-10-02', importe: 30, metodo: 'banco', banco: 'anterior' }] });
  const sesion = { id: 'cs_nueva', payment_status: 'paid', currency: 'eur', amount_total: 4000, metadata: { token: 'token', empresa: 'e', factura: 'f' } };
  assert.equal((await C.marcarPagada(sesion, { cuenta: 'acct_empresa' })).aplicado, true);
  const f = await leer('facturas', 'f');
  assert.equal(CAL.pagadoDe(f), 140);
  assert.equal(f.pagos[1].liquidado, 'liquidacion');
  assert.deepEqual(f.pagos.map((p) => [p.importe, p.fecha]), [[30, '2026-10-02'], [70, '2026-10-03'], [40, f.cobro.fecha]]);
  assert.ok(srv.comandos.some((c) => JSON.stringify(c).includes('Cobro de más')));
  assert.equal((await C.marcarPagada(sesion, { cuenta: 'acct_empresa' })).motivo, 'ya aplicado');
  assert.equal((await leer('facturas', 'f')).pagos.length, 3);
});
test('S-09: dos peticiones de la ruta reutilizan la sesión abierta por factura e importe', async () => {
  await prepararFactura();
  const [a, b] = await Promise.all([pagar(), pagar()]);
  assert.equal(a.status, 303); assert.equal(a.headers.get('location'), b.headers.get('location'));
  assert.equal(srv.sesiones.size, 1);
  assert.equal([...srv.sesiones.values()][0].amount_total, 10000);
  const activa = await R.redis.get('checkout:e:f');
  assert.equal(activa.id, [...srv.sesiones.keys()][0]); assert.equal(activa.importe, 10000); assert.ok(activa.caduca > Date.now() / 1000);
});
test('S-09: al cambiar el saldo se caduca la anterior antes de crear otra por el resto', async () => {
  await prepararFactura(); await pagar();
  await guardar('facturas', factura({ pagos: [{ fecha: '2026-10-02', importe: 30, metodo: 'banco' }] }));
  await pagar();
  const [a, b] = [...srv.sesiones.values()];
  assert.equal(a.status, 'expired'); assert.equal(b.amount_total, 7000); assert.equal(b.status, 'open');
  assert.equal(srv.peticiones.find((p) => p.ruta.endsWith('/expire')).cuenta, 'acct_empresa');
});
test('S-09: una sesión caducada se sustituye y una completada espera al webhook', async (t) => {
  await prepararFactura(); await pagar();
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try { t.mock.timers.tick(86401000); await pagar(); } finally { t.mock.timers.reset(); }
  assert.equal(srv.sesiones.size, 2);
  const ultima = [...srv.sesiones.values()].at(-1); ultima.status = 'complete'; ultima.payment_status = 'paid';
  const r = await pagar();
  assert.equal(srv.sesiones.size, 2);
  // El cliente ve que se está confirmando, no que pague por transferencia (sería un cobro doble).
  assert.match(decodeURIComponent(r.headers.get('location')), /El pago se está confirmando/);
});
test('S-09: un pago completado y ya apuntado en la factura deja pagar lo que falte', async () => {
  await prepararFactura(); await pagar();
  const [s] = srv.sesiones.values(); s.status = 'complete'; s.payment_status = 'paid';
  await guardar('facturas', factura({ base: 150, pagos: [{ fecha: '2026-10-02', importe: 100, metodo: 'stripe', ref: s.id }] }));
  await pagar();
  assert.equal(srv.sesiones.size, 2);
  assert.equal([...srv.sesiones.values()][1].amount_total, 5000);
});
test('S-09: si se pierde el guardado de la sesión, se recupera con idempotencia', async () => {
  await prepararFactura();
  srv.ganchos.antes = async (j) => {
    if (!ordenes(j).some(([c, k, v]) => c.toLowerCase() === 'set' && k === 'cuentas:checkout:e:f' && JSON.parse(v).id)) return;
    srv.ganchos.antes = null; return true;
  };
  await assert.rejects(pagar(), /corte simulado/);
  assert.equal(srv.sesiones.size, 1);
  await pagar();
  assert.equal(srv.sesiones.size, 1);
  assert.equal((await R.redis.get('checkout:e:f')).id, [...srv.sesiones.keys()][0]);
});

// Adaptador crudo para restaurar: conserva los strings del hash, como el script de copias.
const crudo = Object.fromEntries(['type', 'exists', 'del', 'hdel', 'pexpire'].map((c) => [c, async (...a) => base.run([c, ...a])]));
crudo.hgetall = async (k) => base.run(['hgetall', k]);
crudo.hset = async (k, o) => base.run(['hset', k, ...Object.entries(o).flat()]);
function copiaUsuario(usuario) {
  return COP.copiaDeDatos({
    'cuentas:empresas': { tipo: 'hash', valor: { e: JSON.stringify({ id: 'e' }) } },
    'cuentas:usuarios': { tipo: 'hash', valor: { u: JSON.stringify(usuario) } },
    'cuentas:emails': { tipo: 'hash', valor: { [usuario.email]: 'u' } },
  });
}
test('C1-01: restaurar una empresa conserva correo, hash, sesiones y otras membresías actuales', async () => {
  const origen = { id: 'u', empresa: 'e', email: 'antiguo@example.com', password: 'hash-antiguo', sesiones: ['antigua'], empresas: { e: { rol: 'admin' }, otra: { rol: 'admin' } } };
  const actual = { ...origen, empresa: 'otra', email: 'actual@example.com', password: 'hash-actual', sesiones: ['actual'], empresas: { e: { rol: 'miembro', permisos: [] }, otra: { rol: 'miembro', permisos: ['resumen'], pv: 2 } } };
  base.run(['hset', 'cuentas:usuarios', 'u', JSON.stringify(actual)]);
  base.run(['hset', 'cuentas:emails', actual.email, 'u']);
  base.run(['set', 'cuentas:sesion:actual', 'u']);
  await COP.restaurar(crudo, copiaUsuario(origen), { empresa: 'e', sobrescribir: true, escribir: true });
  const restaurado = JSON.parse(base.run(['hget', 'cuentas:usuarios', 'u']));
  assert.equal(restaurado.email, actual.email); assert.equal(restaurado.password, actual.password);
  assert.deepEqual(restaurado.sesiones, actual.sesiones); assert.equal(restaurado.empresa, 'otra');
  assert.deepEqual(restaurado.empresas.otra, actual.empresas.otra); assert.deepEqual(restaurado.empresas.e, { rol: 'admin' });
  assert.equal(base.run(['hget', 'cuentas:emails', actual.email]), 'u'); assert.equal(base.run(['hget', 'cuentas:emails', origen.email]), null);
  assert.equal(base.run(['get', 'cuentas:sesion:actual']), 'u');
});
test('C1-01: si no existe el usuario se recrea con su identidad de la copia', async () => {
  const origen = { id: 'u', empresa: 'e', email: 'antiguo@example.com', password: 'hash-antiguo', empresas: { e: { rol: 'admin' } } };
  await COP.restaurar(crudo, copiaUsuario(origen), { empresa: 'e', sobrescribir: true, escribir: true });
  // Vuelve con su identidad y su papel en la empresa (el rol de arriba sigue a la principal).
  assert.deepEqual(JSON.parse(base.run(['hget', 'cuentas:usuarios', 'u'])), { ...origen, rol: 'admin' });
  assert.equal(base.run(['hget', 'cuentas:emails', origen.email]), 'u');
});
test('C1-02: sin registros, las facturas vivas y borradas y la cabeza siguen comprobándose', () => {
  const f = factura({ verifactu: { huella: 'huella-f' } });
  const b = factura({ id: 'b', numero: 2, verifactu: { huella: 'huella-b', anulacion: 'anulada' } });
  const inc = I.comprobarIntegridad({ facturas: [f], borradas: [b], cabeza: 'huella-cabeza' });
  assert.deepEqual(inc.map((x) => [x.tipo, x.detalle]).sort(), [
    ['cabeza-desconocida', 'huella-cabeza'], ['factura-sin-registro', 'b'], ['factura-sin-registro', 'f'],
  ]);
  assert.deepEqual(I.comprobarIntegridad({}), []);
  assert.deepEqual(I.comprobarIntegridad({ cabeza: 'sola' }), [{ tipo: 'cabeza-desconocida', detalle: 'sola' }]);
});
