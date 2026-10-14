// Regresiones de numeración contra Redis simulado, sin usar una base de datos real.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { limpiarDoc, limpiarPedidoProv } from '../lib/albaranes.js';

let srv, R, S;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  R = await import('../lib/redis.js');
  S = await import('../lib/albaranesServidor.js');
});
after(async () => { if (srv) await srv.cerrar(); });

let n = 0;
const empresa = () => ({ id: `usuario-${++n}`, empresa: `numeracion-docs-${n}` });
const datosDoc = (tipo = 'albaran', fecha = '2026-02-01') => limpiarDoc({
  fecha, cliente: { nombre: 'Cliente' },
  lineas: [{ concepto: 'Servicio', cantidad: 1, precio: 30, ivaPct: 21 }],
}, tipo);
const datosProv = (fecha = '2026-02-01') => limpiarPedidoProv({
  fecha, proveedor: 'Audio SL', lineas: [{ concepto: 'Cable', cantidad: 10, coste: 4 }],
});
const numeros = (docs) => docs.map((d) => d.numero).sort((a, b) => a - b);
const veinte = Array.from({ length: 20 }, (_, i) => i + 1);
const contador = (u, campo) => R.redis.hget(R.clave(u, 'numeracionDocs'), campo);

test('R02: dos altas normales de albarán reciben los números 1 y 2', async () => {
  const u = empresa();
  const a = await S.guardarDoc(u, datosDoc());
  const b = await S.guardarDoc(u, datosDoc());
  assert.deepEqual([a.numero, b.numero], [1, 2]);
  assert.deepEqual(await R.leerUno(u, 'albaranes', b.id), JSON.parse(JSON.stringify(b)));
});

test('R02: veinte altas simultáneas por tipo tienen números únicos e independientes', async () => {
  const u = empresa();
  const [albaranes, pedidos] = await Promise.all(['albaran', 'pedido'].map((tipo) =>
    Promise.all(veinte.map((i) => S.guardarDoc({ ...u, id: `empleado-${i}` }, datosDoc(tipo))))));
  assert.equal(new Set([...albaranes, ...pedidos].map((d) => d.id)).size, 40);
  assert.deepEqual(numeros(albaranes), veinte);
  assert.deepEqual(numeros(pedidos), veinte);
  assert.equal((await R.leer(u, 'albaranes')).length, 40);
  assert.equal(await contador(u, 'albaran|2026'), 20);
  assert.equal(await contador(u, 'pedido|2026'), 20);
});

test('R02: borrar el último albarán no permite reutilizar su número', async () => {
  const u = empresa();
  await S.guardarDoc(u, datosDoc());
  const ultimo = await S.guardarDoc(u, datosDoc());
  await R.borrar(u, 'albaranes', ultimo.id);
  assert.equal((await S.guardarDoc(u, datosDoc())).numero, 3);
});

test('R02: documentos antiguos sin contador se respetan por tipo y año', async () => {
  const u = empresa();
  // Los documentos de antes del contador ya están guardados cuando llega la primera alta (E05: se verifican una vez).
  for (const tipo of ['albaran', 'pedido']) {
    await R.guardar(u, 'albaranes', { ...datosDoc(tipo), id: tipo, numero: 7, anio: 2026 });
    await R.guardar(u, 'albaranes', { ...datosDoc(tipo, '2025-02-01'), id: `${tipo}-viejo`, numero: 99, anio: 2025 });
  }
  for (const tipo of ['albaran', 'pedido']) assert.equal((await S.guardarDoc(u, datosDoc(tipo))).numero, 8);
  assert.equal((await S.guardarDoc(u, datosDoc('albaran', '2025-03-01'))).numero, 100);
});

test('R02: corregir en el mismo año conserva número y contador', async () => {
  const u = empresa();
  const antes = await S.guardarDoc(u, datosDoc());
  const cont = await contador(u, 'albaran|2026');
  const corregido = await S.guardarDoc(u, { ...datosDoc(), nota: 'Corregido' }, antes);
  assert.equal(corregido.id, antes.id);
  assert.equal(corregido.numero, antes.numero);
  assert.equal(corregido.creado, antes.creado);
  assert.equal(corregido.por, antes.por);
  assert.ok(corregido.editado);
  assert.equal(corregido.nota, 'Corregido');
  assert.equal(await contador(u, 'albaran|2026'), cont);
  assert.equal((await S.guardarDoc(u, datosDoc())).numero, 2);
});

test('R03: veinte pedidos a proveedores simultáneos; borrar el último deja el siguiente en 21', async () => {
  const u = empresa();
  const pedidos = await Promise.all(veinte.map((i) => S.crearPedidoProv({ ...u, id: `empleado-${i}` }, datosProv())));
  assert.equal(new Set(pedidos.map((p) => p.id)).size, 20);
  assert.deepEqual(numeros(pedidos), veinte);
  assert.equal((await R.leer(u, 'pedidosProv')).length, 20);
  const ultimo = pedidos.find((p) => p.numero === 20);
  assert.equal(ultimo.estado, 'pendiente');
  assert.ok(ultimo.creado);
  assert.ok(ultimo.por);
  await R.borrar(u, 'pedidosProv', ultimo.id);
  const nuevo = await S.crearPedidoProv(u, datosProv());
  assert.equal(nuevo.numero, 21);
  assert.equal(await contador(u, 'proveedor|2026'), 21);
  assert.deepEqual(await R.leerUno(u, 'pedidosProv', nuevo.id), nuevo);
});

test('R02: cambiar de año numera de nuevo, con contadores independientes y sin bajar el anterior', async () => {
  const u = empresa();
  const antes = await S.guardarDoc(u, datosDoc());
  await S.guardarDoc(u, datosDoc('albaran', '2027-02-01'));
  const corregido = await S.guardarDoc(u, datosDoc('albaran', '2027-02-01'), antes);
  assert.equal(corregido.id, antes.id);
  assert.equal(corregido.anio, 2027);
  assert.equal(corregido.numero, 2);
  assert.equal(await contador(u, 'albaran|2026'), 1);
  assert.equal((await S.guardarDoc(u, datosDoc())).numero, 2);
});

test('R03: respeta pedidos antiguos, separa años y usa el usuario si no hay empresa', async () => {
  const u = { id: empresa().id };
  await R.guardar(u, 'pedidosProv', { ...datosProv(), id: 'antiguo', numero: 7, anio: 2026 });
  assert.equal((await S.crearPedidoProv(u, datosProv())).numero, 8);
  assert.equal((await S.crearPedidoProv(u, datosProv('2027-02-01'))).numero, 1);
  assert.equal((await S.crearPedidoProv(empresa(), datosProv())).numero, 1);
});

test('R02/R03: un fallo de EXEC no guarda el documento ni consume contador', async () => {
  assert.ok(R.DATOS.includes('numeracionDocs'));
  for (const [nombre, campo, crear] of [
    ['albaranes', 'albaran|2026', (u) => S.guardarDoc(u, datosDoc())],
    ['pedidosProv', 'proveedor|2026', (u) => S.crearPedidoProv(u, datosProv())],
  ]) {
    const u = empresa();
    const multi = R.redis.multi;
    R.redis.multi = () => {
      const tx = multi();
      tx.exec = async () => { throw new Error('Corte simulado antes de EXEC'); };
      return tx;
    };
    try {
      await assert.rejects(crear(u), /Corte simulado/);
    } finally { R.redis.multi = multi; }
    assert.equal((await R.leer(u, nombre)).length, 0);
    assert.equal(await contador(u, campo), null);
    assert.equal((await crear(u)).numero, 1);
  }
});
