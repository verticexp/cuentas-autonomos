// Avisos de la pestaña «Más» (lib/avisosMas.js) y su resumen guardado por versión de los datos
// (lib/avisosMasServidor.js): la segunda visita no lee documentos y cualquier escritura se ve enseguida.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { avisoDe, cuentaBanco, cuentaInventario, cuentaPresupuestos } from '../lib/avisosMas.js';

const HOY = '2026-10-19';
const presupuesto = (id, extra = {}) => ({ id, numero: 1, anio: 2026, fecha: '2026-10-10', validez: 30, base: 100, estado: 'pendiente', cliente: { nombre: 'C' }, facturas: [], ...extra });
const producto = (id, minimo, extra = {}) => ({ id, nombre: id, precio: 10, ivaPct: 21, coste: 5, minimo, ...extra });
const entrada = (id, producto, cantidad) => ({ id, producto, fecha: '2026-01-01', cantidad, motivo: 'inicial', coste: 5 });
const venta = (id, producto, cantidad, fecha = '2026-10-01') => ({ id, numero: 1, anio: 2026, fecha, base: 10 * cantidad, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'X' }, lineas: [{ concepto: producto, cantidad, precio: 10, ivaPct: 21, producto }] });

test('banco: cuenta los movimientos pendientes (sin estado o «pendiente»), no los emparejados ni los ignorados', () => {
  const movs = [{ id: 'a' }, { id: 'b', estado: 'pendiente' }, { id: 'c', estado: 'emparejado' }, { id: 'd', estado: 'ignorado' }];
  assert.equal(cuentaBanco(movs), 2);
  assert.equal(cuentaBanco([]), 0);
  assert.deepEqual(avisoDe('banco', 2), { tono: 'ambar', texto: '2 sin conciliar' });
  assert.equal(avisoDe('banco', 0), null);
});

test('presupuestos: abiertos son los pendientes sin caducar y los aceptados sin facturar', () => {
  const ps = [
    presupuesto('p1'),
    presupuesto('p2', { estado: 'aceptado' }),
    presupuesto('p3', { fecha: '2026-08-01', validez: 15 }), // caducado
    presupuesto('p4', { estado: 'rechazado' }),
    presupuesto('p5', { estado: 'aceptado', facturas: [{ id: 'f', tipo: 'resto', base: 100 }] }), // facturado
    presupuesto('p6', { estado: 'aceptado', facturas: [{ id: 's', tipo: 'senal', base: 30 }] }), // solo la señal: sigue abierto
  ];
  assert.equal(cuentaPresupuestos(ps, HOY), 3);
  assert.equal(cuentaPresupuestos(ps, '2026-12-31'), 2, 'p1 caduca a los 30 días');
  assert.deepEqual(avisoDe('presupuestos', 1), { tono: 'azul', texto: '1 abierto' });
  assert.deepEqual(avisoDe('presupuestos', 3), { tono: 'azul', texto: '3 abiertos' });
  assert.equal(avisoDe('presupuestos', 0), null);
});

test('inventario: productos en el mínimo o por debajo; rojo si alguno está agotado; los servicios no cuentan', () => {
  const productos = [producto('A', 5), producto('B', 5), producto('C', 0), producto('S', 5, { servicio: true })];
  const ajustes = [entrada('a1', 'A', 10), entrada('a2', 'B', 3), entrada('a3', 'C', 1)];
  // A: 10 − 6 = 4 (bajo); B: 3 (bajo); C: sin mínimo.
  const datos = { productos, ajustes, facturas: [venta('f1', 'A', 6)], gastos: [], albaranes: [] };
  assert.deepEqual(cuentaInventario(datos, HOY), { n: 2, agotados: 0 });
  assert.deepEqual(avisoDe('inventario', { n: 2, agotados: 0 }), { tono: 'ambar', texto: '2 bajo mínimo' });
  // Se vende todo B: agotado.
  const agotado = { ...datos, facturas: [...datos.facturas, venta('f2', 'B', 3)] };
  assert.deepEqual(cuentaInventario(agotado, HOY), { n: 2, agotados: 1 });
  assert.equal(avisoDe('inventario', { n: 2, agotados: 1 }).tono, 'rojo');
  // Una venta con fecha futura todavía no resta.
  assert.deepEqual(cuentaInventario({ ...datos, facturas: [venta('f3', 'A', 1, '2026-12-01')] }, HOY), { n: 1, agotados: 0 });
  assert.equal(avisoDe('inventario', { n: 0, agotados: 0 }), null);
  assert.equal(avisoDe('otro', 3), null);
});

let srv, R, A;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, A] = await Promise.all([import('../lib/redis.js'), import('../lib/avisosMasServidor.js')]);
});
after(() => srv.cerrar());

let n = 0;
const empresa = () => ({ id: `u${++n}`, empresa: `avm${n}` });
// Las órdenes que llegan a Redis mientras corre fn.
async function ordenes(fn) {
  const cmds = [];
  srv.ganchos.antes = async (c) => { cmds.push(c); };
  try { return { r: await fn(), cmds }; } finally { srv.ganchos.antes = null; }
}
const leeDocs = (cmds, u) => cmds.filter((c) => /"(hgetall|hmget)"/.test(c) && ['banco', 'presupuestos', 'productos', 'stock', 'albaranes', 'facturas', 'gastos'].some((col) => c.includes(`"cuentas:${col}:${u.empresa}"`)));
const TODOS = ['banco', 'presupuestos', 'inventario'];

test('avisos guardados: la segunda visita no lee documentos: la versión y lo guardado', async () => {
  const u = empresa();
  await R.redis.hset(R.clave(u, 'banco'), { m1: { id: 'm1', fecha: '2026-10-01', importe: 10 }, m2: { id: 'm2', fecha: '2026-10-02', importe: -5, estado: 'ignorado' } });
  await R.guardar(u, 'presupuestos', presupuesto('p1'));
  await R.guardar(u, 'productos', producto('A', 5));
  await R.guardar(u, 'stock', entrada('a1', 'A', 3));
  const primera = await A.avisosMas(u, TODOS, HOY);
  assert.deepEqual(primera, {
    banco: { tono: 'ambar', texto: '1 sin conciliar' },
    presupuestos: { tono: 'azul', texto: '1 abierto' },
    inventario: { tono: 'ambar', texto: '1 bajo mínimo' },
  });
  const { r: segunda, cmds } = await ordenes(() => A.avisosMas(u, TODOS, HOY));
  assert.deepEqual(segunda, primera);
  assert.deepEqual(leeDocs(cmds, u), [], 'la segunda vez no lee ningún documento');
  // Una lectura de la versión y una por aviso (en paralelo: el cliente las junta en una sola petición); nada más.
  const sueltas = cmds.flatMap((c) => { const j = JSON.parse(c); return Array.isArray(j[0]) ? j : [j]; }).map((c) => c[0].toLowerCase());
  assert.deepEqual(sueltas.sort(), ['get', 'get', 'get', 'hgetall'], cmds.join('\n'));
});

test('avisos guardados: una escritura en cualquier colección que usan se ve en la visita siguiente', async () => {
  const u = empresa();
  await R.guardar(u, 'productos', producto('A', 5));
  await R.guardar(u, 'stock', entrada('a1', 'A', 10));
  assert.deepEqual(await A.avisosMas(u, TODOS, HOY), { banco: null, presupuestos: null, inventario: null });

  await R.guardar(u, 'banco', { id: 'm1', fecha: '2026-10-01', importe: 10 });
  assert.equal((await A.avisosMas(u, ['banco'], HOY)).banco.texto, '1 sin conciliar');
  // Conciliarlo (en una transacción con la factura, como lib/bancoServidor.js) quita el aviso.
  await R.redis.multi().hset(R.clave(u, 'facturas'), { F1: { id: 'F1', numero: 1, anio: 2026, fecha: '2026-10-01', base: 10, ivaPct: 0, irpfPct: 0, cliente: { nombre: 'C' }, cobrada: true } })
    .hset(R.clave(u, 'banco'), { m1: { id: 'm1', fecha: '2026-10-01', importe: 10, estado: 'emparejado' } }).exec();
  assert.equal((await A.avisosMas(u, ['banco'], HOY)).banco, null);

  await R.guardar(u, 'presupuestos', presupuesto('p1'));
  assert.equal((await A.avisosMas(u, ['presupuestos'], HOY)).presupuestos.texto, '1 abierto');
  await R.borrar(u, 'presupuestos', 'p1');
  assert.equal((await A.avisosMas(u, ['presupuestos'], HOY)).presupuestos, null);

  // Inventario: una factura que vende, un albarán que entrega y un cambio del mínimo, cada uno por su colección.
  await R.guardar(u, 'facturas', venta('F2', 'A', 6));
  assert.deepEqual((await A.avisosMas(u, ['inventario'], HOY)).inventario, { tono: 'ambar', texto: '1 bajo mínimo' });
  await R.guardar(u, 'productos', producto('A', 2));
  assert.equal((await A.avisosMas(u, ['inventario'], HOY)).inventario, null);
  await R.guardar(u, 'albaranes', { id: 'al1', tipo: 'albaran', numero: 1, anio: 2026, fecha: '2026-10-05', cliente: { nombre: 'C' }, lineas: [{ concepto: 'A', cantidad: 4, precio: 10, ivaPct: 21, producto: 'A' }] });
  assert.deepEqual((await A.avisosMas(u, ['inventario'], HOY)).inventario, { tono: 'rojo', texto: '1 bajo mínimo' });
  // Borrar la colección entera también cambia la versión.
  await R.redis.del(R.clave(u, 'albaranes'));
  assert.equal((await A.avisosMas(u, ['inventario'], HOY)).inventario, null);
});

test('avisos guardados: los presupuestos caducan al cambiar de día aunque no se escriba nada', async () => {
  const u = empresa();
  await R.guardar(u, 'presupuestos', presupuesto('p1', { validez: 10 })); // caduca el 2026-10-20
  assert.equal((await A.avisosMas(u, ['presupuestos'], HOY)).presupuestos.texto, '1 abierto');
  assert.equal((await A.avisosMas(u, ['presupuestos'], '2026-10-21')).presupuestos, null);
});

test('versión de los datos: sube en la misma transacción que la escritura y es de cada empresa', async () => {
  const u = empresa(), otra = empresa();
  const rev = async (x) => (await R.redis.hgetall(`rev:${x.empresa}`)) || {};
  await R.guardar(u, 'banco', { id: 'm1', fecha: '2026-10-01', importe: 1 });
  await R.redis.hset(R.clave(u, 'banco'), { m2: { id: 'm2' }, m3: { id: 'm3' } });
  await R.guardar(u, 'facturas', venta('F1', 'A', 1));
  await R.redis.hset(R.clave(u, 'clientes'), { c1: { id: 'c1', nombre: 'Sin versión' } });
  assert.deepEqual(await rev(u), { banco: 2, facturas: 1 });
  assert.deepEqual(await rev(otra), {});
  // Una transacción que falla no deja la versión subida ni el dato escrito.
  srv.fallos.exec = 1;
  await assert.rejects(() => R.guardar(u, 'banco', { id: 'm4' }));
  assert.equal((await rev(u)).banco, 2);
  assert.equal(await R.leerUno(u, 'banco', 'm4'), null);
  // del de varias claves sin índice: todas con su prefijo, cada una con su versión.
  await R.guardar(u, 'stock', entrada('a1', 'A', 1));
  await R.redis.del(R.clave(u, 'banco'), R.clave(u, 'stock'), R.clave(u, 'bancos'));
  assert.deepEqual([await R.leer(u, 'banco'), await R.leer(u, 'stock')], [[], []]);
  assert.deepEqual(await rev(u), { banco: 3, facturas: 1, stock: 2 });
});

test('sin datos de avisos que pedir no se lee nada', async () => {
  const { r, cmds } = await ordenes(() => A.avisosMas(empresa(), ['hacienda'], HOY));
  assert.deepEqual(r, {});
  assert.equal(cmds.length, 0);
});
