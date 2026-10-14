// Auditoría de octubre de 2026 (N01, N02): el portal no mezcla clientes homónimos y la baja de una empresa cierra sus
// enlaces públicos (portal, PDF, pago) sin borrar los documentos que hay que conservar. Contra un Upstash simulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, P, R, C, B;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [P, R, C, B] = await Promise.all([import('../lib/portal.js'), import('../lib/redis.js'), import('../lib/cobros.js'), import('../lib/baja.js')]);
});
after(() => srv.cerrar());

const doc = (id, nombre, nif, fecha = '2026-03-01') => ({ id, numero: 1, anio: 2026, fecha, cliente: { nombre, ...(nif ? { nif } : {}) }, concepto: 'x', base: 100, ivaPct: 21, irpfPct: 0 });

test('N01: dos clientes con el mismo nombre y distinto NIF no se mezclan', () => {
  const docs = [doc('A', 'Homonimo', '12345678Z'), doc('B', 'Homonimo', '87654321X'), doc('C', 'Homonimo', '')];
  const a = { id: 'HOMONIMO', nif: '12345678Z' };
  assert.deepEqual(P.delCliente(a, docs).map((d) => d.id), ['A'], 'la sin NIF tampoco se cuela: el nombre es ambiguo');
  assert.deepEqual(P.delCliente({ id: 'HOMONIMO', nif: '87654321X' }, docs).map((d) => d.id), ['B']);
  // Sin ambigüedad (un solo NIF con ese nombre), la factura antigua sin NIF sigue siendo suya.
  assert.deepEqual(P.delCliente(a, [docs[0], docs[2]]).map((d) => d.id).sort(), ['A', 'C']);
  // Mismo NIF con otro nombre (cambio de denominación): sigue siendo el mismo cliente.
  assert.deepEqual(P.delCliente(a, [doc('D', 'Homonimo SL', '12345678Z')]).map((d) => d.id), ['D']);
});

test('N01: el enlace recuerda su NIF; el homónimo posterior no hereda ni pisa el portal', async () => {
  const u = { id: 'u1', empresa: 'p1' };
  await R.redis.hset('empresas', { p1: { id: 'p1', emisor: { nombre: 'Emisora' } } });
  await R.guardar(u, 'clientes', { id: 'HOMONIMO', nombre: 'Homonimo', nif: '12345678Z' });
  await R.guardar(u, 'facturas', doc('A', 'Homonimo', '12345678Z'));
  const rutaA = await P.enlacePortal(u, 'Homonimo');
  // Entra otro cliente con el mismo nombre y su ficha ocupa la del primero.
  await R.guardar(u, 'facturas', doc('B', 'Homonimo', '87654321X', '2026-04-01'));
  await R.guardar(u, 'clientes', { id: 'HOMONIMO', nombre: 'Homonimo', nif: '87654321X' });
  const rutaB = await P.enlacePortal(u, 'Homonimo');
  assert.notEqual(rutaA, rutaB, 'el nuevo cliente no reutiliza el enlace público del anterior');
  const a = await P.portalDe(rutaA.split('/').pop());
  const b = await P.portalDe(rutaB.split('/').pop());
  assert.deepEqual(a.facturas.map((f) => f.id), ['A']);
  assert.deepEqual(b.facturas.map((f) => f.id), ['B']);
});

test('N02: la baja revoca portal, pago y apertura; los documentos se conservan', async () => {
  const u = { id: 'u2', empresa: 'p2' };
  await R.redis.hset('empresas', { p2: { id: 'p2', emisor: { nombre: 'Baja SL' } } });
  await R.guardar(u, 'clientes', { id: 'CLI', nombre: 'Cli', nif: '12345678Z' });
  await R.guardar(u, 'facturas', { ...doc('F1', 'Cli', '12345678Z'), envios: [{ token: 'tkenvio', para: 'a@b.es', fecha: '2026-03-02' }] });
  const ruta = await P.enlacePortal(u, 'Cli');
  const { ruta: pago } = await C.enlacePago(u, await R.leerUno(u, 'facturas', 'F1'));
  await R.redis.hset('factura-envios', { tkenvio: { empresa: 'p2', id: 'F1' } });
  const tPortal = ruta.split('/').pop(), tPago = pago.split('/').pop();
  assert.ok(await P.portalDe(tPortal) && await C.facturaDePago(tPago), 'antes de la baja resuelven');
  await B.darDeBaja('p2');
  assert.equal(await P.portalDe(tPortal), null);
  assert.equal(await C.facturaDePago(tPago), null);
  assert.equal(await R.redis.hget('portal-enlaces', tPortal), null, 'el índice global ya no tiene el token');
  assert.equal(await R.redis.hget('factura-pagos', tPago), null);
  assert.equal(await R.redis.hget('factura-envios', 'tkenvio'), null);
  assert.ok(await R.leerUno(u, 'facturas', 'F1'), 'la factura se conserva (bloqueada)');
});

test('N02: una empresa dada de baja antes de esta corrección, con sus enlaces aún en el índice, tampoco resuelve', async () => {
  const u = { id: 'u3', empresa: 'p3' };
  await R.redis.hset('empresas', { p3: { id: 'p3', emisor: { nombre: 'Vieja SL' } } });
  await R.guardar(u, 'clientes', { id: 'CLI', nombre: 'Cli', nif: '12345678Z' });
  await R.guardar(u, 'facturas', doc('F1', 'Cli', '12345678Z'));
  const tPortal = (await P.enlacePortal(u, 'Cli')).split('/').pop();
  const tPago = (await C.enlacePago(u, await R.leerUno(u, 'facturas', 'F1'))).ruta.split('/').pop();
  await R.redis.hset('empresas', { p3: { id: 'p3', baja: { fecha: '2026-01-01', borrarEl: '2032-01-01' } } });
  assert.equal(await P.portalDe(tPortal), null);
  assert.equal(await C.facturaDePago(tPago), null);
  // Un cobro de Stripe ya hecho sí puede aplicarse a una empresa de baja (el dinero ya se movió).
  assert.ok(await C.facturaDePago(tPago, { conBaja: true }));
});
