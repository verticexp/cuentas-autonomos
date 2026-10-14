// Informe de capacidad E06: totales precalculados en la misma ejecución atómica que cada escritura. Deben cuadrar
// siempre con lo que sale de los documentos, también con escrituras a la vez del mismo documento.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, I, C;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, I, C] = await Promise.all([import('../lib/redis.js'), import('../lib/indices.js'), import('../lib/calculos.js')]);
});
after(() => srv.cerrar());

let n = 0;
const empresa = () => ({ id: `u${++n}`, empresa: `tot${n}` });
const factura = (i, extra = {}) => ({ id: `F${i}`, numero: i, anio: 2026, fecha: `2026-0${1 + (i % 3)}-1${i % 9}`, actividad: i % 2 ? 'a' : 'b', cliente: { nombre: 'C' }, concepto: 'x', base: 100 + i, ivaPct: 21, irpfPct: i % 4 ? 15 : 0, cobrada: i % 3 === 0, ...extra });
const gasto = (i, extra = {}) => ({ id: `G${i}`, fecha: `2026-0${1 + (i % 3)}-0${1 + (i % 9)}`, concepto: 'y', proveedor: i % 2 ? 'Prov' : '', base: 50 + i, ivaPct: 21, pendiente: i % 2 === 0, ...extra });
// Lo mismo calculado a mano desde los documentos.
function esperado(fs) {
  const m = {}, add = (k, v) => { m[k] = Math.round(((m[k] || 0) + v) * 100) / 100; };
  for (const f of fs) {
    const mes = f.fecha.slice(0, 7);
    add(`m:${mes}`, f.base); add(`m:${mes}:${f.actividad}`, f.base);
    if (!f.cobrada) { add('pc', C.pendienteDe(f)); add(`mp:${mes}`, f.base); add(`mp:${mes}:${f.actividad}`, f.base); }
  }
  return m;
}

test('E06: los totales de facturas cuadran con los documentos tras altas, cambios, cobros, cambios de mes y borrados', async () => {
  const u = empresa();
  const fs = new Map(Array.from({ length: 60 }, (_, i) => [`F${i}`, factura(i)]));
  await R.redis.hset(R.clave(u, 'facturas'), Object.fromEntries(fs));
  // Cambios: cobrar, cambiar de mes y de actividad, cobro parcial, rectificativa negativa y borrados.
  const cambia = (id, c) => { fs.set(id, { ...fs.get(id), ...c }); return R.guardar(u, 'facturas', fs.get(id)); };
  await cambia('F1', { cobrada: true });
  await cambia('F2', { fecha: '2026-03-05', actividad: 'a' });
  await cambia('F4', { pagos: [{ fecha: '2026-02-01', importe: 30 }] });
  await R.guardar(u, 'facturas', factura(99, { base: -40, serie: 'R' })); fs.set('F99', factura(99, { base: -40, serie: 'R' }));
  await R.borrar(u, 'facturas', 'F5'); fs.delete('F5');
  await R.redis.multi().hdel(R.clave(u, 'facturas'), 'F6').exec(); fs.delete('F6');
  const e = esperado([...fs.values()]);
  const t = await I.totales(u, 'facturas', Object.keys(e));
  for (const [k, v] of Object.entries(e)) assert.equal(t[k], v, k);
  assert.deepEqual(await I.comprobarTotales(u, 'facturas'), []);
});

test('E06: dos escrituras a la vez del mismo documento no descuadran los totales', async () => {
  const u = empresa();
  await R.guardar(u, 'facturas', factura(1, { cobrada: false, base: 100 }));
  await Promise.all(Array.from({ length: 20 }, (_, i) => R.guardar(u, 'facturas', factura(1, { cobrada: i % 2 === 0, base: 100 + i }))));
  const actual = await R.leerUno(u, 'facturas', 'F1');
  const e = esperado([actual]);
  const t = await I.totales(u, 'facturas', ['pc', 'm:2026-02', 'mp:2026-02']);
  assert.equal(t.pc, e.pc || 0);
  assert.equal(t['m:2026-02'], e['m:2026-02']);
  assert.equal(t['mp:2026-02'], e['mp:2026-02'] || 0);
  assert.deepEqual(await I.comprobarTotales(u, 'facturas'), []);
});

test('E06: totales de gastos (lo que debes, sin pagar, por mes) y reconstrucción desde datos sin índice', async () => {
  const u = empresa();
  const gs = Array.from({ length: 40 }, (_, i) => gasto(i));
  for (const g of gs) srv.base.run(['hset', `cuentas:gastos:${u.empresa}`, g.id, JSON.stringify(g)]); // sin índice
  srv.base.run(['hset', `cuentas:gastos:${u.empresa}`, 'MIG', JSON.stringify(gasto(100, { migrado: true }))]);
  const t = await I.totales(u, 'gastos', ['dc', 'sn', 'm:2026-01', 'mp:2026-01']);
  const P = await import('../lib/proveedores.js');
  const pend = gs.filter((g) => g.pendiente);
  assert.equal(t.dc, Math.round(pend.filter((g) => g.proveedor).reduce((s, g) => s + P.totalDe(g), 0) * 100) / 100);
  assert.equal(Math.round(t.sn * 100), pend.length);
  assert.equal(t['m:2026-01'], gs.filter((g) => g.fecha.startsWith('2026-01')).reduce((s, g) => s + g.base, 0));
  assert.equal(t['mp:2026-01'], pend.filter((g) => g.fecha.startsWith('2026-01')).reduce((s, g) => s + g.base, 0));
  assert.deepEqual(await I.comprobarTotales(u, 'gastos'), []);
});

test('E06: vencidas por el índice de vencimientos, también las de antes sin vencimiento guardado', async () => {
  const u = empresa();
  await R.guardar(u, 'facturas', factura(1, { cobrada: false, vence: '2026-10-01' }));
  await R.guardar(u, 'facturas', factura(2, { cobrada: false, vence: '2026-12-01' }));
  await R.guardar(u, 'facturas', factura(4, { cobrada: false, fecha: '2026-01-10' })); // sin vence: fecha + plazo
  await R.guardar(u, 'facturas', factura(3, { cobrada: true, vence: '2026-01-01' }));
  assert.deepEqual((await I.vencidas(u, 30, '2026-10-14')).map((f) => f.id).sort(), ['F1', 'F4']);
  await R.guardar(u, 'facturas', factura(1, { cobrada: true, vence: '2026-10-01' }));
  assert.deepEqual((await I.vencidas(u, 30, '2026-10-14')).map((f) => f.id), ['F4']);
});

test('E06: el Resumen se guarda por versión de los datos y se recalcula al cambiar una factura o los ajustes', async () => {
  const PC = await import('../lib/panelCache.js');
  const u = { ...empresa(), emisor: { plazo: 30 }, fiscal: { tipo: 'autonomo' } };
  for (let i = 0; i < 30; i++) await R.guardar(u, 'facturas', factura(i));
  const op = { anio: 2026, hoy: '2026-10-14' };
  const a = await PC.panelDe(u, op);
  const cmds = [];
  srv.ganchos.antes = async (c) => { cmds.push(c); };
  const b = await PC.panelDe(u, op);
  srv.ganchos.antes = null;
  assert.deepEqual(b, JSON.parse(JSON.stringify(a)));
  const leeDocs = (c) => /"(hmget|hgetall)"/.test(c) && c.includes(`"cuentas:facturas:${u.empresa}"`);
  assert.ok(!cmds.some(leeDocs), 'la segunda vez no lee facturas');
  await R.guardar(u, 'facturas', factura(1, { base: 1000, cobrada: false }));
  const c = await PC.panelDe(u, op);
  assert.notEqual(c.P.facturado, a.P.facturado, 'una factura cambiada se ve enseguida');
  const d = await PC.panelDe({ ...u, pagos130: { 2026: { 1: 0 } } }, op);
  assert.ok(d, 'otros ajustes, otra clave');
});
