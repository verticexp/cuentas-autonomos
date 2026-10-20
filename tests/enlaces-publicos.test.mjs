// Informe de seguridad de octubre de 2026 (M2): los enlaces públicos caducan y la empresa puede cambiarlos.
// Contra un Upstash simulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { enlaceCaducado } from '../lib/presupuestos.js';

let srv, P, R, C, E;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [P, R, C, E] = await Promise.all([import('../lib/portal.js'), import('../lib/redis.js'), import('../lib/cobros.js'), import('../lib/enlaces.js')]);
});
after(() => srv.cerrar());

const doc = (id, extra = {}) => ({ id, numero: 1, anio: 2026, fecha: '2026-03-01', cliente: { nombre: 'Cli', nif: '12345678Z' }, concepto: 'x', base: 100, ivaPct: 21, irpfPct: 0, ...extra });
const token = (ruta) => ruta.split('/').pop();

test('M2: cambiar el enlace del portal anula el anterior y los enlaces de pago de sus facturas', async () => {
  const u = { id: 'u1', empresa: 'e1' };
  await R.redis.hset('empresas', { e1: { id: 'e1', emisor: { nombre: 'Emisora' } } });
  await R.guardar(u, 'clientes', { id: 'CLI', nombre: 'Cli', nif: '12345678Z' });
  await R.guardar(u, 'facturas', doc('F1'));
  const viejo = await P.enlacePortal(u, 'Cli', '12345678Z');
  const { ruta: pago } = await C.enlacePago(u, await R.leerUno(u, 'facturas', 'F1'));
  assert.ok(await P.portalDe(token(viejo)) && await C.facturaDePago(token(pago)));
  const nuevo = await E.cambiarEnlacePortal(u, 'Cli', '12345678Z');
  assert.notEqual(nuevo, viejo);
  assert.equal(await P.portalDe(token(viejo)), null, 'el enlace viejo ya no abre');
  assert.deepEqual((await P.portalDe(token(nuevo))).facturas.map((f) => f.id), ['F1']);
  assert.equal(await P.enlacePortal(u, 'Cli', '12345678Z'), nuevo, 'el nuevo es el que se sigue dando');
  assert.equal(await C.facturaDePago(token(pago)), null, 'el pago viejo tampoco abre');
  assert.ok(await C.facturaDePago(token(pago), { conBaja: true }), 'pero un pago de Stripe en marcha se sigue aplicando');
  assert.equal((await R.leerUno(u, 'facturas', 'F1')).pago, undefined, 'la factura ya no apunta al enlace viejo');
});

test('M2: un portal sin usar en un año caduca; usarlo renueva la caducidad', async () => {
  const u = { id: 'u2', empresa: 'e2' };
  await R.redis.hset('empresas', { e2: { id: 'e2', emisor: { nombre: 'Emisora' } } });
  await R.guardar(u, 'clientes', { id: 'CLI', nombre: 'Cli', nif: '12345678Z' });
  const ruta = await P.enlacePortal(u, 'Cli', '12345678Z');
  const e = await R.redis.hget('portal-enlaces', token(ruta));
  assert.ok(Date.parse(e.hasta) > Date.now() + 360 * 864e5);
  await R.redis.hset('portal-enlaces', { [token(ruta)]: { ...e, hasta: '2020-01-01T00:00:00.000Z' } });
  assert.equal(await P.portalDe(token(ruta)), null, 'caducado no abre');
  const otra = await P.enlacePortal(u, 'Cli', '12345678Z');
  assert.notEqual(otra, ruta, 'al volver a pedirlo sale uno nuevo');
  // Un enlace de antes, sin fecha: empieza a contar al abrirlo.
  await R.redis.hset('portal-enlaces', { antiguo: { empresa: 'e2', cliente: 'CLI', nif: '12345678Z' } });
  assert.ok(await P.portalDe('antiguo'));
  assert.ok((await R.redis.hget('portal-enlaces', 'antiguo')).hasta);
});

test('M2: la página de pago de una factura cobrada caduca a los 90 días', () => {
  const ahora = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(C.pagoCaducado({ cobrada: false }, ahora), false);
  assert.equal(C.pagoCaducado({ cobrada: true, cobro: { fecha: '2026-09-01' } }, ahora), false);
  assert.equal(C.pagoCaducado({ cobrada: true, cobro: { fecha: '2026-06-01' } }, ahora), true);
  assert.equal(C.pagoCaducado({ cobrada: true, pagos: [{ fecha: '2026-05-01' }, { fecha: '2026-10-01' }] }, ahora), false, 'cuenta el último pago');
});

test('M2: el enlace del presupuesto deja de abrir 180 días después de caducar o responderse', () => {
  const p = { fecha: '2026-01-01', validez: 15 };
  assert.equal(enlaceCaducado(p, '2026-07-01'), false);
  assert.equal(enlaceCaducado(p, '2026-07-20'), true);
  assert.equal(enlaceCaducado({ ...p, respuesta: { fecha: '2026-06-01T10:00:00Z' } }, '2026-07-20'), false, 'cuenta desde la respuesta');
});
