// Informe del 14/10/2026 (R04, R05): editar el gasto de una recepción no desincroniza el pedido ni el inventario, y
// corregir un albarán mientras se factura nunca da dos «hecho» con una corrección perdida. Contra Redis simulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { estadoPedidoProv } from '../lib/albaranes.js';

let srv, R, S, G;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, S, G] = await Promise.all([import('../lib/redis.js'), import('../lib/albaranesServidor.js'), import('../lib/gastosServidor.js')]);
});
after(() => srv.cerrar());

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
let n = 0;
const empresa = () => ({ id: `u${++n}`, empresa: `escrituras-${n}`, rol: 'admin',
  emisor: { nombre: 'Emisora SL', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: 'Madrid' },
  actividades: [{ id: 'ventas', nombre: 'Ventas', serie: '', ivaPct: 21, irpfPct: 0 }] });
const producto = { id: 'bbbbbbbbbbbb' };
const pedido = { id: 'p1', numero: 1, anio: 2026, fecha: '2026-02-01', proveedor: 'Audio SL', lineas: [{ producto: producto.id, concepto: 'Cable', cantidad: 10, coste: 2 }] };
// Lo que haría el PATCH de /api/gastos con este cambio.
const cambiar = (cambios) => (antes) => ({ gasto: { ...antes, ...cambios } });

test('R04: cambiar de 2 a 5 las unidades del gasto de una recepción se rechaza y gasto, pedido e inventario siguen cuadrando', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido);
  const r = await S.recibirPedidoProv(u, { id: 'p1', fecha: '2026-02-02', recibido: [{ linea: 0, cantidad: 2, coste: 2 }] });
  assert.ok(r.gasto, r.error);
  const e = await G.editarGasto(u, r.gasto.id, cambiar({ base: 10, stock: [{ producto: producto.id, cantidad: 5, coste: 2 }] }));
  assert.ok(e.error, 'la edición de unidades debe rechazarse');
  assert.deepEqual((await R.leerUno(u, 'gastos', r.gasto.id)).stock, [{ producto: producto.id, cantidad: 2, coste: 2 }]);
  // Recibir lo pendiente: 8 más y el total es 10, nunca 13.
  const resto = await S.recibirPedidoProv(u, { id: 'p1', fecha: '2026-02-03' });
  assert.ok(resto.gasto, resto.error);
  assert.equal(resto.recepcion.lineas[0].cantidad, 8);
  assert.equal(estadoPedidoProv(resto.pedido).estado, 'recibido');
  const total = ((await R.leer(u, 'gastos')) || []).flatMap((g) => g.stock || []).reduce((s, l) => s + l.cantidad, 0);
  assert.equal(total, 10);
});

test('R04: el resto del gasto de una recepción (concepto, número de factura, pagado) sí se edita', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido);
  const r = await S.recibirPedidoProv(u, { id: 'p1', fecha: '2026-02-02', recibido: [{ linea: 0, cantidad: 2, coste: 2 }] });
  const e = await G.editarGasto(u, r.gasto.id, cambiar({ concepto: 'Factura 33 de Audio', numero: '33', pendiente: undefined }));
  assert.ok(e.gasto, e.error);
  const g = await R.leerUno(u, 'gastos', r.gasto.id);
  assert.equal(g.concepto, 'Factura 33 de Audio');
  assert.equal(g.pedidoProv, 'p1');
});

test('R04: borrar el gasto de una recepción y recibir a la vez nunca deja más unidades que las pedidas', async () => {
  const u = empresa();
  await R.guardar(u, 'pedidosProv', pedido);
  const r = await S.recibirPedidoProv(u, { id: 'p1', fecha: '2026-02-02', recibido: [{ linea: 0, cantidad: 2, coste: 2 }] });
  await Promise.all([G.borrarGasto(u, r.gasto.id), S.recibirPedidoProv(u, { id: 'p1', fecha: '2026-02-03' })]);
  const p = await R.leerUno(u, 'pedidosProv', 'p1');
  const enGastos = ((await R.leer(u, 'gastos')) || []).flatMap((g) => g.stock || []).reduce((s, l) => s + l.cantidad, 0);
  const enPedido = (p.recepciones || []).flatMap((x) => x.lineas).reduce((s, l) => s + l.cantidad, 0);
  assert.equal(enGastos, enPedido, 'gasto y recepciones cuentan lo mismo');
  assert.ok(enGastos <= 10);
  for (const x of p.recepciones || []) assert.ok(await R.leerUno(u, 'gastos', x.gasto), 'cada recepción tiene su gasto');
});

const albaran = (precio) => ({ id: 'A', numero: 1, anio: 2026, tipo: 'albaran', fecha: '2026-02-01', cliente: { nombre: 'Cliente', nif: '12345678Z' },
  lineas: [{ concepto: 'Servicio', cantidad: 1, precio, dto: 0, ivaPct: 21 }] });
const correccion = { tipo: 'albaran', fecha: '2026-02-01', cliente: { nombre: 'Cliente', nif: '12345678Z' }, lineas: [{ concepto: 'Servicio', cantidad: '1', precio: '999', ivaPct: 21 }] };
const facturar = { ids: ['A'], fecha: '2026-02-28', actividad: 'ventas' };

test('R05: si la facturación va primero, la corrección simultánea se rechaza (y el albarán queda a 100 € facturado)', async () => {
  const u = empresa();
  await R.guardar(u, 'albaranes', albaran(100));
  let corrigiendo = null;
  // Justo cuando la facturación va a marcar el albarán como facturado, llega la corrección a 999 €.
  srv.ganchos.antes = async (cuerpo) => {
    if (corrigiendo || !cuerpo.includes('"factura\\"')) return;
    corrigiendo = S.corregirDoc(u, 'A', correccion);
    await Promise.race([corrigiendo, dormir(400)]);
  };
  let f;
  try { f = await S.facturarAlbaranes(u, facturar); } finally { srv.ganchos.antes = null; }
  const c = await corrigiendo;
  assert.ok(f.factura, f.error);
  assert.ok(c, 'la corrección llegó en medio');
  assert.ok(c.error, 'la corrección no puede darse por buena');
  const a = await R.leerUno(u, 'albaranes', 'A');
  assert.equal(a.factura, f.factura.id);
  assert.equal(a.lineas[0].precio, 100);
  assert.equal(f.factura.base, 100);
});

test('R05: si la corrección va primero, la factura recoge los 999 €', async () => {
  const u = empresa();
  await R.guardar(u, 'albaranes', albaran(100));
  const c = await S.corregirDoc(u, 'A', correccion);
  assert.ok(c.doc, c.error);
  const f = await S.facturarAlbaranes(u, facturar);
  assert.equal(f.factura.base, 999);
  assert.equal((await R.leerUno(u, 'albaranes', 'A')).lineas[0].precio, 999);
});

test('R05: corregir y facturar a la vez muchas veces: nunca dos éxitos con una corrección perdida', async () => {
  for (let i = 0; i < 5; i++) {
    const u = empresa();
    await R.guardar(u, 'albaranes', albaran(100));
    const [c, f] = await Promise.all([S.corregirDoc(u, 'A', correccion), S.facturarAlbaranes(u, facturar)]);
    const a = await R.leerUno(u, 'albaranes', 'A');
    if (c.doc && f.factura) {
      assert.equal(f.factura.base, 999, 'si las dos dicen «hecho», la factura lleva la corrección');
      assert.equal(a.lineas[0].precio, 999);
    } else assert.ok(f.factura && c.error, `${c.error} / ${f.error}`);
  }
});

test('R05: borrar un albarán ya facturado se rechaza; borrar uno pendiente, no', async () => {
  const u = empresa();
  await R.guardar(u, 'albaranes', { ...albaran(100), factura: '2026-1' });
  assert.ok((await S.borrarDoc(u, 'A')).error);
  await R.guardar(u, 'albaranes', { ...albaran(100), id: 'B' });
  assert.ok((await S.borrarDoc(u, 'B')).doc);
  assert.equal(await R.leerUno(u, 'albaranes', 'B'), null);
});
