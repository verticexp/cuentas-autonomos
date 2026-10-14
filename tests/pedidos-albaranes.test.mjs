// Regresiones contra Redis simulado: las rutas delegan toda la operación protegida a estas funciones.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { enCamino, estadoPedidoProv } from '../lib/albaranes.js';
import { inventario } from '../lib/inventario.js';

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
const empresa = (extra = {}) => ({
  id: `usuario-${++n}`, empresa: `pedidos-albaranes-${n}`,
  emisor: { nombre: 'Emisora SL', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: 'Madrid' },
  actividades: [{ id: 'ventas', nombre: 'Ventas', serie: '', ivaPct: 21, irpfPct: 0 }], ...extra,
});
const producto = { id: 'aaaaaaaaaaaa', nombre: 'Cable', coste: 4 };
const pedido = (extra = {}) => ({
  id: 'p1', numero: 1, anio: 2026, fecha: '2026-02-01', proveedor: 'Audio SL',
  lineas: [{ producto: producto.id, concepto: 'Cable', cantidad: 10, coste: 4 }], ...extra,
});
const albaran = (id, numero = 1, extra = {}) => ({
  id, numero, anio: 2026, tipo: 'albaran', fecha: '2026-02-01',
  cliente: { nombre: 'Cliente', nif: '12345678Z' },
  lineas: [{ producto: producto.id, concepto: 'Cable', cantidad: 1, precio: 30, dto: 0, ivaPct: 21 }], ...extra,
});
const facturar = (ids) => ({ ids, fecha: '2026-02-28', actividad: 'ventas' });
const recibir = (extra = {}) => ({ id: 'p1', fecha: '2026-02-02', ...extra });
const estadoStock = async (u) => inventario({ productos: [producto], gastos: (await R.leer(u, 'gastos')) || [] }, { hoy: '2026-02-28' });

test('P06: normaliza y deduplica ids antes de facturar: una línea y una sola base', async () => {
  const u = empresa();
  await R.guardar(u, 'albaranes', albaran('A'));
  assert.deepEqual(S.normalizarIdsAlbaranes([' A ', 'A', '', 'B', 'B']), ['A', 'B']);
  const r = await S.facturarAlbaranes(u, facturar([' A ', 'A', 'A']));
  assert.ok(r.factura, r.error);
  assert.equal(r.factura.lineas.length, 1);
  assert.equal(r.factura.base, 30);
  assert.equal((await R.leer(u, 'facturas')).length, 1);
  assert.equal((await R.leerUno(u, 'albaranes', 'A')).factura, r.factura.id);
});

test('P06: selecciones simultáneas [A] y [B,A] entre usuarios de la misma empresa no facturan A dos veces', async () => {
  const u = empresa();
  await R.guardar(u, 'albaranes', albaran('A'));
  await R.guardar(u, 'albaranes', albaran('B', 2));
  const rs = await Promise.all([
    S.facturarAlbaranes(u, facturar(['A'])),
    S.facturarAlbaranes({ ...u, id: 'otro-usuario' }, facturar(['B', 'A'])),
  ]);
  assert.equal(rs.filter((r) => r.factura).length, 1);
  assert.equal(rs.find((r) => r.error).error, 'Alguno de esos albaranes ya está facturado');
  const facturas = await R.leer(u, 'facturas');
  assert.equal(facturas.length, 1);
  assert.equal(facturas.flatMap((f) => f.lineas).filter((l) => l.albaran === 'A').length, 1);
  assert.equal((await R.leerUno(u, 'albaranes', 'A')).factura, facturas[0].id);
});

test('P06: fallo de crearFactura no marca albaranes; permite corregir y reintentar', async () => {
  const u = empresa({ verifactu: 'pruebas' });
  await R.guardar(u, 'albaranes', albaran('A', 1, { cliente: { nombre: 'Sin NIF', nif: '' } }));
  const r = await S.facturarAlbaranes(u, facturar(['A']));
  assert.match(r.error, /NIF/);
  assert.equal((await R.leerUno(u, 'albaranes', 'A')).factura, undefined);
  assert.equal((await R.leer(u, 'facturas')).length, 0);
  await R.guardar(u, 'albaranes', albaran('A'));
  const reintento = await S.facturarAlbaranes(u, facturar(['A']));
  assert.ok(reintento.factura, reintento.error);
  assert.equal((await R.leerUno(u, 'albaranes', 'A')).factura, reintento.factura.id);
});

test('N05: ocho recepciones simultáneas con la misma idem crean un gasto y una entrada de stock', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido());
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => S.recibirPedidoProv({ ...u, id: `empleado-${i}` }, recibir({ idem: 'doble-clic' }))));
  assert.ok(rs.every((r) => r.gasto), rs.find((r) => r.error)?.error);
  assert.equal(new Set(rs.map((r) => r.gasto.id)).size, 1);
  assert.equal(rs.filter((r) => !r.repetida).length, 1);
  const p = await R.leerUno(u, 'pedidosProv', 'p1');
  assert.equal(p.recepciones.length, 1);
  assert.equal(p.estado, 'recibido');
  assert.equal(p.gasto, rs[0].gasto.id);
  assert.equal(p.recibido, '2026-02-02');
  assert.equal((await R.leer(u, 'gastos')).length, 1);
  const inv = await estadoStock(u);
  assert.equal(inv.productos[0].stock, 10);
  assert.equal(inv.movimientos.filter((m) => m.tipo === 'compra').length, 1);
  const reintento = await S.recibirPedidoProv(u, recibir({ idem: 'doble-clic' }));
  assert.equal(reintento.repetida, true);
  assert.deepEqual(reintento.recepcion, p.recepciones[0]);
  assert.deepEqual(reintento.gasto, rs[0].gasto);
});

test('N05: ocho recepciones distintas de 2 unidades nunca superan las 10 pedidas', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido());
  const rs = await Promise.all(Array.from({ length: 8 }, (_, i) => S.recibirPedidoProv(u, recibir({ idem: `recepcion-${i}`, recibido: [{ linea: 0, cantidad: 2 }] }))));
  assert.equal(rs.filter((r) => r.gasto).length, 5);
  assert.equal(rs.filter((r) => r.error).length, 3);
  const p = await R.leerUno(u, 'pedidosProv', 'p1');
  assert.equal(p.recepciones.length, 5);
  assert.equal(estadoPedidoProv(p).lineas[0].recibida, 10);
  assert.equal(p.estado, 'recibido');
  assert.equal((await R.leer(u, 'gastos')).length, 5);
  assert.equal((await estadoStock(u)).productos[0].stock, 10);
});

test('N09: recibir 2, reintentar y recibir las 8 pendientes completa el pedido solo al final', async () => {
  const u = empresa({ empresa: undefined }); // Compatibilidad: el cerrojo usa u.id si no hay empresa.
  await R.guardar(u, 'pedidosProv', pedido());
  const a = await S.recibirPedidoProv(u, recibir({ idem: 'primer-envio', recibido: [{ producto: producto.id, cantidad: 2, coste: 4 }] }));
  assert.ok(a.gasto, a.error);
  assert.equal(a.gasto.base, 8);
  assert.equal(a.pedido.estado, 'parcial');
  assert.equal(a.pedido.recibido, undefined);
  assert.equal(a.pedido.gasto, undefined);
  assert.deepEqual(enCamino([a.pedido]), { [producto.id]: 8 });
  assert.equal((await S.recibirPedidoProv(u, recibir({ idem: 'primer-envio' }))).gasto.id, a.gasto.id);
  const exceso = await S.recibirPedidoProv(u, recibir({ recibido: [{ linea: 0, cantidad: 9 }] }));
  assert.match(exceso.error, /Superas lo pendiente/);
  assert.equal((await R.leer(u, 'gastos')).length, 1);
  const b = await S.recibirPedidoProv(u, recibir({ idem: 'resto' }));
  assert.ok(b.gasto, b.error);
  assert.notEqual(b.gasto.id, a.gasto.id);
  assert.equal(b.gasto.stock[0].cantidad, 8);
  assert.equal(b.gasto.base, 32);
  assert.equal(b.pedido.recepciones.length, 2);
  assert.equal(b.pedido.estado, 'recibido');
  assert.equal(b.pedido.recibido, b.gasto.fecha);
  assert.equal(b.pedido.gasto, b.gasto.id);
  assert.deepEqual(enCamino([b.pedido]), {});
  assert.equal((await estadoStock(u)).productos[0].stock, 10);
});

test('cancelar el resto conserva las recepciones y prohíbe recibir y borrar el pedido', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido());
  const a = await S.recibirPedidoProv(u, recibir({ idem: 'parcial', recibido: [{ linea: 0, cantidad: 2 }] }));
  assert.match((await S.borrarPedidoProv(u, 'p1')).error, /recepciones/);
  const c = await S.cancelarPedidoProv(u, 'p1');
  assert.equal(c.pedido.estado, 'cancelado');
  assert.deepEqual(c.pedido.recepciones, a.pedido.recepciones);
  assert.deepEqual(enCamino([c.pedido]), {});
  assert.equal((await S.cancelarPedidoProv(u, 'p1')).pedido.cancelado, c.pedido.cancelado);
  assert.match((await S.recibirPedidoProv(u, recibir())).error, /cancelado/);
  assert.equal((await S.recibirPedidoProv(u, recibir({ idem: 'parcial' }))).gasto.id, a.gasto.id);
  assert.match((await S.borrarPedidoProv(u, 'p1')).error, /recepciones/);
  assert.equal((await R.leer(u, 'gastos')).length, 1);
  assert.equal((await estadoStock(u)).productos[0].stock, 2);
});

test('pedidos antiguos con recibido y sin historial se consideran completos', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido({ recibido: '2026-02-02', gasto: 'viejo' }));
  assert.match((await S.recibirPedidoProv(u, recibir())).error, /ya está recibido/);
  assert.match((await S.cancelarPedidoProv(u, 'p1')).error, /ya está recibido/);
  assert.match((await S.borrarPedidoProv(u, 'p1')).error, /recepciones/);
  assert.equal((await R.leer(u, 'gastos')).length, 0);
});

test('recepciones por posición conservan líneas sin producto y productos repetidos', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido({ lineas: [
    { producto: producto.id, concepto: 'Cable', cantidad: 10, coste: 4 },
    { producto: producto.id, concepto: 'Cable', cantidad: 5, coste: 6 },
    { concepto: 'Portes', cantidad: 2, coste: 8 },
  ] }));
  const a = await S.recibirPedidoProv(u, recibir({ recibido: [{ linea: 1, cantidad: 2 }, { linea: 2, cantidad: 1 }] }));
  assert.ok(a.gasto, a.error);
  assert.equal(a.gasto.base, 20);
  assert.deepEqual(a.gasto.stock, [{ producto: producto.id, cantidad: 2, coste: 6 }]);
  assert.deepEqual(estadoPedidoProv(a.pedido).lineas.map((l) => l.pendiente), [10, 3, 1]);
  const b = await S.recibirPedidoProv(u, recibir());
  assert.ok(b.gasto, b.error);
  assert.equal(b.gasto.base, 66);
  assert.equal(b.pedido.estado, 'recibido');
  assert.equal((await estadoStock(u)).productos[0].stock, 15);
});

test('fechas imposibles en recepción y factura no crean ni marcan documentos', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido());
  await R.guardar(u, 'albaranes', albaran('A'));
  assert.match((await S.recibirPedidoProv(u, recibir({ fecha: '2026-02-31' }))).error, /Fecha/);
  assert.equal((await R.leer(u, 'gastos')).length, 0);
  assert.equal((await R.leerUno(u, 'pedidosProv', 'p1')).recepciones, undefined);
  assert.ok((await S.facturarAlbaranes(u, { ...facturar(['A']), fecha: '2026-02-31' })).error);
  assert.equal((await R.leer(u, 'facturas')).length, 0);
  assert.equal((await R.leerUno(u, 'albaranes', 'A')).factura, undefined);
});

test('un fallo al guardar la recepción no deja stock ni historial; el reintento conserva el id determinista', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido());
  const multi = R.redis.multi;
  let idIntentado;
  R.redis.multi = () => {
    const tx = multi();
    const hset = tx.hset;
    tx.hset = (k, datos) => {
      if (k === R.clave(u, 'gastos')) idIntentado = Object.keys(datos)[0];
      return hset(k, datos);
    };
    tx.exec = async () => { throw new Error('Corte simulado antes de EXEC'); };
    return tx;
  };
  try {
    await assert.rejects(S.recibirPedidoProv(u, recibir({ idem: 'reintento' })), /Corte simulado/);
  } finally { R.redis.multi = multi; }
  assert.equal((await R.leer(u, 'gastos')).length, 0);
  assert.equal((await R.leerUno(u, 'pedidosProv', 'p1')).recepciones, undefined);
  const r = await S.recibirPedidoProv(u, recibir({ idem: 'reintento' }));
  assert.ok(r.gasto, r.error);
  assert.equal(r.gasto.id, idIntentado);
  assert.equal((await R.leer(u, 'gastos')).length, 1);
  assert.equal(r.pedido.recepciones.length, 1);
});

test('borrar la compra de una recepción devuelve sus unidades al pedido y la siguiente recepción no repite id', async () => {
  const { sinRecepcionDeGasto } = await import('../lib/albaranes.js');
  const u = { id: 'ur', empresa: 'er' };
  await R.guardar(u, 'pedidosProv', { id: 'pr', numero: 1, anio: 2026, fecha: '2026-03-01', proveedor: 'Prov', lineas: [{ concepto: 'Cosa', cantidad: 10, coste: 2 }] });
  const a = await S.recibirPedidoProv(u, { id: 'pr', fecha: '2026-03-02', recibido: [{ linea: 0, cantidad: 4 }] });
  const b = await S.recibirPedidoProv(u, { id: 'pr', fecha: '2026-03-03', recibido: [{ linea: 0, cantidad: 3 }] });
  const sin = sinRecepcionDeGasto(b.pedido, a.gasto.id);
  assert.equal(sin.recepciones.length, 1);
  assert.equal(estadoPedidoProv(sin).lineas[0].pendiente, 7);
  assert.equal(sin.estado, 'parcial');
  assert.equal(sinRecepcionDeGasto(b.pedido, 'otro'), null);
  await R.guardar(u, 'pedidosProv', sin);
  await R.borrar(u, 'gastos', a.gasto.id);
  const c = await S.recibirPedidoProv(u, { id: 'pr', fecha: '2026-03-04', recibido: [{ linea: 0, cantidad: 7 }] });
  assert.ok(!c.error, c.error);
  assert.notEqual(c.gasto.id, b.gasto.id, 'el id de la nueva recepción no choca con el de la segunda');
  assert.equal(c.pedido.estado, 'recibido');
});
