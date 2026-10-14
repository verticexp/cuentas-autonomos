// Informe de capacidad (14/10/2026), E01 y E05: índices mantenidos en la misma transacción que los documentos, páginas
// que no descargan el histórico y emisión que no relee todas las facturas. Contra el Redis simulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, I, F, Fi, P;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, I, F, Fi, P] = await Promise.all([import('../lib/redis.js'), import('../lib/indices.js'), import('../lib/facturas.js'), import('../lib/fichas.js'), import('../lib/portal.js')]);
});
after(() => srv.cerrar());

let n = 0;
const empresa = () => ({ id: `u${++n}`, empresa: `cap${n}`, emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', plazo: 30 },
  actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] });
const factura = (i, extra = {}) => ({ id: `2026-${i}`, numero: i, anio: 2026, fecha: `2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  actividad: i % 2 ? 'servicios' : 'otra', cliente: { nombre: i % 5 ? 'Ana Pérez' : 'Luis Gil', nif: i % 5 ? '' : 'B-1234567-4' }, concepto: `Trabajo ${i}`, base: 100, ivaPct: 21, irpfPct: 0, cobrada: i % 3 === 0, ...extra });
// Comandos que llegan al Redis simulado (para comprobar qué se lee).
async function registrar(fn) {
  const cmds = [];
  srv.ganchos.antes = async (cuerpo) => { const j = JSON.parse(cuerpo || 'null'); for (const c of Array.isArray(j?.[0]) ? j : [j]) if (c) cmds.push(c); };
  try { await fn(); } finally { srv.ganchos.antes = null; }
  return cmds;
}
const todasLasPaginas = async (u, col, op = {}) => {
  const ids = []; let cursor;
  do { const p = await I.pagina(u, col, { ...op, cursor }); ids.push(...p.ids); cursor = p.siguiente; assert.ok(p.ids.length <= (op.limite || 50)); } while (cursor);
  return ids;
};
const orden = (fs) => [...fs].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero).map((f) => f.id);

test('E01: guardar, cambiar y borrar mantienen índice, pendientes y fichas en la misma transacción', async () => {
  const u = empresa();
  const fs = Array.from({ length: 30 }, (_, i) => factura(i + 1));
  await R.redis.hset(R.clave(u, 'facturas'), Object.fromEntries(fs.map((f) => [f.id, f])));
  assert.equal(await I.contar(u, 'facturas'), 30);
  assert.deepEqual((await I.fichasMarcadas(u, 'facturas', 'p')).map((f) => f.id).sort(), fs.filter((f) => !f.cobrada).map((f) => f.id).sort());
  // Una transacción de la app (multi) también lleva sus índices: cobrar quita la factura de las pendientes.
  await R.redis.multi().hset(R.clave(u, 'facturas'), { '2026-1': { ...fs[0], cobrada: true } }).exec();
  assert.ok(!(await I.fichasMarcadas(u, 'facturas', 'p')).some((f) => f.id === '2026-1'));
  await R.borrar(u, 'facturas', '2026-2');
  assert.equal(await I.contar(u, 'facturas'), 29);
  assert.deepEqual(await todasLasPaginas(u, 'facturas', { limite: 7 }), orden(fs.filter((f) => f.id !== '2026-2')));
  // Un corte en la transacción no deja índice sin documento ni documento sin índice.
  srv.fallos.exec = 1;
  await assert.rejects(R.guardar(u, 'facturas', factura(99)));
  assert.equal(await R.leerUno(u, 'facturas', '2026-99'), null);
  assert.equal(await I.contar(u, 'facturas'), 29);
});

test('E01: datos de antes del índice se indexan solos y las páginas recorren todo sin repetir', async () => {
  const u = empresa();
  const fs = Array.from({ length: 173 }, (_, i) => factura(i + 1));
  // Escritos sin pasar por la app (como los de antes o una restauración): sin índice.
  for (const f of fs) srv.base.run(['hset', `cuentas:facturas:${u.empresa}`, f.id, JSON.stringify(f)]);
  assert.deepEqual(await todasLasPaginas(u, 'facturas'), orden(fs));
  const deLuis = await todasLasPaginas(u, 'facturas', { filtro: (f) => f.c === 'Luis Gil', limite: 5 });
  assert.deepEqual(deLuis, orden(fs.filter((f) => f.cliente.nombre === 'Luis Gil')));
  const busca = await todasLasPaginas(u, 'facturas', { buscar: 'trabajo 17' });
  assert.deepEqual(busca, orden(fs.filter((f) => f.concepto.toLowerCase().includes('trabajo 17'))));
  const pend = await todasLasPaginas(u, 'facturas', { marca: 'p' });
  assert.deepEqual(pend, orden(fs.filter((f) => !f.cobrada)));
  // Un documento añadido por fuera hace que el índice no cuadre y se reconstruye.
  srv.base.run(['hset', `cuentas:facturas:${u.empresa}`, '2026-500', JSON.stringify(factura(500))]);
  assert.equal(await I.contar(u, 'facturas'), 174);
});

test('E01: una página lee como mucho 50 documentos aunque haya miles', async () => {
  const u = empresa();
  const fs = Array.from({ length: 2000 }, (_, i) => factura(i + 1));
  await R.redis.hset(R.clave(u, 'facturas'), Object.fromEntries(fs.map((f) => [f.id, f])));
  await I.asegurar(u, 'facturas');
  let docs;
  const cmds = await registrar(async () => { const p = await I.pagina(u, 'facturas'); docs = await I.documentos(u, 'facturas', p.ids); });
  assert.equal(docs.length, 50);
  assert.ok(!cmds.some((c) => c[0] === 'hgetall'), 'sin HGETALL');
  const leidos = cmds.filter((c) => c[0] === 'hmget' && c[1] === `cuentas:facturas:${u.empresa}`).reduce((s, c) => s + c.length - 2, 0);
  assert.equal(leidos, 50);
  // Por rango de fechas: solo las de ese mes.
  const marzo = await I.leerRango(u, 'facturas', '2026-03-01', '2026-03-31');
  assert.deepEqual(marzo.map((f) => f.id).sort(), fs.filter((f) => f.fecha.startsWith('2026-03')).map((f) => f.id).sort());
});

test('E01: el portal solo lee los documentos de su cliente y sigue la regla del NIF (N01)', async () => {
  const u = empresa();
  const fs = Array.from({ length: 40 }, (_, i) => factura(i + 1));
  await R.redis.hset(R.clave(u, 'facturas'), Object.fromEntries(fs.map((f) => [f.id, f])));
  await R.guardar(u, 'clientes', { id: 'LUIS GIL', nombre: 'Luis Gil', nif: 'B12345674' });
  await R.redis.hset('empresas', { [u.empresa]: { id: u.empresa, nombre: 'Emisora S.L.' } });
  const enlace = await P.enlacePortal(u, 'Luis Gil', 'B12345674');
  const token = String(enlace).split('/').pop();
  assert.ok(token);
  await P.portalDe(token); // la primera lectura construye el índice (una sola vez)
  let d;
  const cmds = await registrar(async () => { d = await P.portalDe(token); });
  assert.deepEqual(d.facturas.map((f) => f.id).sort(), fs.filter((f) => f.cliente.nombre === 'Luis Gil').map((f) => f.id).sort());
  assert.ok(!cmds.some((c) => c[0] === 'hgetall' && String(c[1]).startsWith('cuentas:facturas')));
  // Cambiar el cliente de una factura (subsanación) la saca de su portal.
  await R.guardar(u, 'facturas', { ...fs[4], cliente: { nombre: 'Otra', nif: 'X' } });
  assert.ok(!(await P.portalDe(token)).facturas.some((f) => f.id === fs[4].id));
});

test('E05: emitir con histórico no lo relee; el contador se verifica una sola vez', async () => {
  const u = empresa();
  // Histórico de antes del contador: 300 facturas sin contador y una borrada con el número más alto.
  const fs = Array.from({ length: 300 }, (_, i) => factura(i + 1, { actividad: 'servicios', fecha: '2026-02-01' }));
  for (const f of fs) srv.base.run(['hset', `cuentas:facturas:${u.empresa}`, f.id, JSON.stringify(f)]);
  srv.base.run(['hset', `cuentas:facturasBorradas:${u.empresa}`, '2026-310', JSON.stringify(factura(310))]);
  const datos = { fecha: '2026-10-14', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'x', base: 10, ivaPct: 21, irpfPct: 0 };
  assert.equal((await F.crearFactura(u, datos)).factura.numero, 311);
  const cmds = await registrar(async () => { assert.equal((await F.crearFactura(u, datos)).factura.numero, 312); });
  const historico = (c) => c[0] === 'hgetall' && /^cuentas:(facturas|facturasBorradas):/.test(c[1]);
  assert.ok(!cmds.some(historico), `sin leer el histórico: ${cmds.map((c) => `${c[0]} ${c[1]}`).join(', ')}`);
  // Veinte emisiones a la vez: números consecutivos y únicos.
  const r = await Promise.all(Array.from({ length: 20 }, () => F.crearFactura(u, datos)));
  assert.deepEqual(r.map((x) => x.factura.numero).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => 313 + i));
});

test('E05: importar facturas sube el contador para que la siguiente emisión no repita número', async () => {
  const u = empresa();
  await F.guardarImportadas(u, [factura(41, { actividad: 'servicios' }), factura(7, { actividad: 'servicios' })]);
  const datos = { fecha: '2026-10-14', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'x', base: 10, ivaPct: 21, irpfPct: 0 };
  assert.equal((await F.crearFactura(u, datos)).factura.numero, 42);
  assert.ok(Fi.ordenDe(factura(41)) > 0);
});

test('E01: delosAnios trae esos años, los bienes de inversión de antes y, si se pide, lo pendiente', async () => {
  const u = empresa();
  const g = (id, fecha, extra = {}) => ({ id, fecha, concepto: id, base: 100, ivaPct: 21, actividad: 'servicios', ...extra });
  await R.redis.hset(R.clave(u, 'gastos'), Object.fromEntries([g('viejo', '2020-03-01'), g('bien', '2021-05-01', { inversion: { anios: 5 } }), g('debe', '2019-01-01', { pendiente: true }), g('este', '2026-02-01')].map((x) => [x.id, x])));
  const ids = async (op) => (await I.delosAnios(u, [2026], op)).gastos.map((x) => x.id).sort();
  assert.deepEqual(await ids(), ['bien', 'este']);
  assert.deepEqual(await ids({ pendientes: true }), ['bien', 'debe', 'este']);
});

test('E05: el número previsto en «Nueva factura» es el que sale al emitir', async () => {
  const u = empresa();
  for (const f of Array.from({ length: 12 }, (_, i) => factura(i + 1, { actividad: 'servicios' }))) srv.base.run(['hset', `cuentas:facturas:${u.empresa}`, f.id, JSON.stringify(f)]);
  assert.equal(await F.numeroPrevisto(u, '', 2026), 13);
  const datos = { fecha: '2026-10-14', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'x', base: 10, ivaPct: 21, irpfPct: 0 };
  assert.equal((await F.crearFactura(u, datos)).factura.numero, 13);
  assert.equal(await F.numeroPrevisto(u, '', 2026), 14);
});
