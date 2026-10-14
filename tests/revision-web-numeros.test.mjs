import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { mismoCliente } from '../lib/terceros.js';
import { carteraCobros } from '../lib/cartera.js';
import { asientosPersonal } from '../lib/personal.js';
import { analisis } from '../lib/analisis.js';
import { generarAsientos, balanceContable, pygContable } from '../lib/asientos.js';

let srv, redis, S;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'local';
  ({ redis } = await import('../lib/redis.js'));
  S = await import('../lib/tercerosServidor.js');
});
after(() => srv.cerrar());

test('WEB01: un abono compensa el albarán antes de limitar el riesgo a cero', async () => {
  const cliente = { nombre: 'Aurora', nif: 'B12345674' }, u = { empresa: 'web01' };
  await redis.hset('facturas:web01', { r: { id: 'r', numero: 1, serie: 'R', anio: 2026, fecha: '2026-10-01', cliente, base: -100, ivaPct: 21, cobrada: false } });
  await redis.hset('albaranes:web01', { a: { id: 'a', tipo: 'albaran', fecha: '2026-10-02', cliente, lineas: [{ cantidad: 1, precio: 100, ivaPct: 21 }] } });
  assert.equal((await S.riesgoCliente(u, cliente)).riesgo, 0);
  assert.equal((await S.riesgosPendientes(u)).get('AURORA'), 0);
});

test('WEB02: el NIF conserva la identidad al cambiar el nombre en una factura', () => {
  assert.equal(mismoCliente({ nombre: 'Aurora', nif: 'B12345674' }, { nombre: 'Aurora SL', nif: 'B12345674' }), true);
  assert.equal(mismoCliente({ nombre: 'Aurora', nif: 'B12345674' }, { nombre: 'Aurora', nif: '12345678Z' }), false);
});

test('WEB04: recibir un cheque no equivale a recibir el pagaré posterior de la ficha', () => {
  const f = { id: 'f', numero: 1, anio: 2026, fecha: '2026-10-01', base: 100, ivaPct: 21, cliente: { nombre: 'Aurora' }, efecto: { recibido: true, fecha: '2026-10-02', forma: 'cheque' } };
  const d = carteraCobros([f], { hoy: '2026-10-14', clientes: [{ nombre: 'Aurora', formaCobro: 'pagare' }] });
  assert.deepEqual(d.porRecibir, { n: 1, importe: 121 });
  assert.equal(d.efectos[0].fechaRecepcion, '');
});

test('WEB05: plazos medios usan ventas y compras netas de abonos', () => {
  const doc = (id, base) => ({ id, numero: id === 'f' ? 1 : 2, anio: 2025, fecha: '2025-01-01', base, ivaPct: 21, cliente: { nombre: 'Aurora' }, pendiente: true });
  const facturas = [doc('f', 1000), { ...doc('r', -900), serie: 'R' }];
  const gastos = [doc('g', 1000), doc('d', -900)];
  const A = generarAsientos({ facturas, gastos, fiscal: { tipo: 'sociedad', iva: 'general' } }, '2025-12-31');
  const per = { desde: '2025-01-01', hasta: '2025-12-31' };
  const d = analisis({ pyg: pygContable(A, per), bal: balanceContable(A, per.hasta), per, hoy: per.hasta, facturas, gastos });
  assert.equal(d.ratios.find((r) => r.id === 'cobro').valor, 365);
  assert.equal(d.ratios.find((r) => r.id === 'pago').valor, 365);
});

test('WEB06: un gasto de personal ilegible se rechaza en lugar de desaparecer', () => {
  assert.match(asientosPersonal({ fecha: '2026-10-01', sueldos: 1000, otros: [{ cuenta: '649', importe: 'abc' }] }).error || '', /importe/i);
});
