// Numeración correlativa: dentro de una serie, los números y las fechas van en el mismo orden (lib/facturas.js
// fechaFueraDeOrden). Antes se podía emitir la A2026-040 con fecha anterior a la A2026-039.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, F;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  F = await import('../lib/facturas.js');
});
after(() => srv.cerrar());

const usuario = (empresa) => ({
  id: `u-${empresa}`, empresa, emisor: { nombre: 'E', nif: 'B12345674', plazo: 30 },
  actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }, { id: 'alquiler', nombre: 'Alquiler', serie: 'A', ivaPct: 21, irpfPct: 0 }],
});
const datos = (fecha, actividad = 'servicios') => ({ fecha, actividad, cliente: { nombre: 'Cliente Uno', nif: '12345678Z', direccion: 'C/ Sol', ciudad: 'Madrid' }, concepto: 'S', base: 100, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false });

test('una factura nueva no puede ir con fecha anterior a la anterior de su serie', async () => {
  const u = usuario('orden1');
  assert.ok((await F.crearFactura(u, datos('2026-10-15'))).factura);
  const r = await F.crearFactura(u, datos('2026-10-13'));
  assert.match(r.error, /anterior a la de la factura 0?1-2026 \(15\/10\/2026\)/);
  assert.ok((await F.crearFactura(u, datos('2026-10-15'))).factura, 'el mismo día sí');
  assert.ok((await F.crearFactura(u, datos('2026-10-20'))).factura, 'después sí');
});

test('cada serie lleva su propio orden', async () => {
  const u = usuario('orden2');
  assert.ok((await F.crearFactura(u, datos('2026-10-15'))).factura);
  const otra = await F.crearFactura(u, datos('2026-10-01', 'alquiler'));
  assert.ok(otra.factura, otra.error);
  assert.equal(otra.factura.id, 'A2026-1');
});

test('al editar: la fecha nueva tiene que quedar entre la anterior y la siguiente de la serie', async () => {
  const u = usuario('orden3');
  for (const f of ['2026-10-01', '2026-10-10', '2026-10-20']) assert.ok((await F.crearFactura(u, datos(f))).factura);
  assert.equal(await F.fechaFueraDeOrden(u, { serie: '', anio: 2026, numero: 2, fecha: '2026-10-12' }), null);
  assert.match(await F.fechaFueraDeOrden(u, { serie: '', anio: 2026, numero: 2, fecha: '2026-09-30' }), /anterior a la de la factura 0?1-2026/);
  assert.match(await F.fechaFueraDeOrden(u, { serie: '', anio: 2026, numero: 2, fecha: '2026-10-21' }), /posterior a la de la factura 0?3-2026 \(20\/10\/2026\)/);
});

test('si la anterior se borró, manda la que haya antes', async () => {
  const u = usuario('orden4');
  for (const f of ['2026-10-01', '2026-10-10']) assert.ok((await F.crearFactura(u, datos(f))).factura);
  const { redis, clave } = await import('../lib/redis.js');
  await redis.hdel(clave(u, 'facturas'), '2026-2');
  assert.equal(await F.fechaFueraDeOrden(u, { serie: '', anio: 2026, numero: 3, fecha: '2026-10-05' }), null);
  assert.match(await F.fechaFueraDeOrden(u, { serie: '', anio: 2026, numero: 3, fecha: '2026-09-01' }), /factura 0?1-2026/);
});
