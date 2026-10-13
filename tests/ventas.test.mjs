import test from 'node:test';
import assert from 'node:assert/strict';
import { baseDeTotal, limpiarCierre, totalCierre } from '../lib/caja.js';
import { inventario, quePedir } from '../lib/inventario.js';
import { albaranDePedido, enCamino, estadoPedido, facturaDeAlbaranes, gastoDeRecepcion, limpiarDoc, limpiarPedidoProv, numeroDoc } from '../lib/albaranes.js';
import { importes, limpiarLineas } from '../lib/calculos.js';
import { generarAsientos } from '../lib/asientos.js';
import { librosRegistro } from '../lib/librosRegistro.js';
import { modelo347 } from '../lib/modelos.js';

const productos = [
  { id: 'aaaaaaaaaaaa', nombre: 'Champú', sku: 'CH1', precio: 10, ivaPct: 21, coste: 4, minimo: 5, maximo: 20, proveedor: 'Cosmética SL' },
  { id: 'cccccccccccc', nombre: 'Tinte', sku: 'TN1', precio: 8, ivaPct: 21, coste: 3, minimo: 2, proveedor: 'Cosmética SL' },
  { id: 'bbbbbbbbbbbb', nombre: 'Corte', precio: 15, ivaPct: 21, servicio: true },
];
const inicial = [
  { id: 'i1', producto: 'aaaaaaaaaaaa', fecha: '2026-01-01', cantidad: 20, motivo: 'inicial', coste: 4 },
  { id: 'i2', producto: 'cccccccccccc', fecha: '2026-01-01', cantidad: 10, motivo: 'inicial', coste: 3 },
];

test('baseDeTotal cuadra base + IVA con el total al céntimo (o a un céntimo si no hay base exacta)', () => {
  const con = (b, p) => Math.round((b + Math.round(b * p) / 100) * 100) / 100;
  for (const [t, p] of [[12.1, 21], [33.33, 10], [0.99, 4], [1000, 0], [57.77, 21]]) assert.equal(con(baseDeTotal(t, p), p), t, `${t} al ${p}`);
  // 100 € al 21 %: 82,64 + 17,35 = 99,99 y 82,65 + 17,36 = 100,01.
  assert.ok(Math.abs(con(baseDeTotal(100, 21), 21) - 100) <= 0.011);
});

test('cierre de caja: total por IVA, cobro cuadrado y unidades del catálogo', () => {
  const c = limpiarCierre({ fecha: '2026-03-02', porIva: [{ pct: 21, total: '121' }, { pct: 10, total: '22' }], efectivo: '43', unidades: [{ producto: 'aaaaaaaaaaaa', cantidad: 3 }, { producto: 'bbbbbbbbbbbb', cantidad: 1 }, { producto: 'zzz', cantidad: 9 }], desde: '1001', hasta: '1040' }, productos);
  assert.equal(c.base, 120);
  assert.deepEqual(c.caja, { efectivo: 43, tarjeta: 100, otros: 0 });
  assert.equal(importes(c).total, 143);
  assert.equal(totalCierre(c), 143);
  assert.equal(c.simplificada, true);
  assert.equal(c.cobrada, true);
  // Los servicios también se aceptan como unidades (no llevan stock); los que no están en el catálogo, no.
  assert.deepEqual(c.unidades, [{ producto: 'aaaaaaaaaaaa', cantidad: 3, importe: 30 }, { producto: 'bbbbbbbbbbbb', cantidad: 1, importe: 15 }]);
  assert.deepEqual(c.resumen, { desde: '1001', hasta: '1040' });
  assert.match(limpiarCierre({ fecha: '2026-03-02', porIva: [{ pct: 21, total: 100 }], efectivo: 50, tarjeta: 40 }).error, /cuadrar/);
  assert.match(limpiarCierre({ fecha: '2026-03-02', porIva: [] }).error, /vendido/);
});

test('las unidades de un cierre restan stock como venta y cuentan en el margen', () => {
  const c = { id: 'Z2026-1', ...limpiarCierre({ fecha: '2026-03-02', porIva: [{ pct: 21, total: 72.6 }], unidades: [{ producto: 'aaaaaaaaaaaa', cantidad: 6, importe: 60 }] }, productos) };
  const inv = inventario({ productos, facturas: [c], ajustes: inicial }, { hoy: '2026-03-31' });
  const p = inv.productos.find((x) => x.id === 'aaaaaaaaaaaa');
  assert.equal(p.stock, 14);
  assert.equal(p.ventas, 6);
  assert.equal(p.ingresos, 60);
  assert.equal(p.margen, 36);
});

test('consumo: sale del almacén y se cuenta aparte de las ventas', () => {
  const ajustes = [...inicial, { id: 'c1', producto: 'cccccccccccc', fecha: '2026-02-01', cantidad: -4, motivo: 'consumo' }];
  const p = inventario({ productos, ajustes }, { hoy: '2026-03-31' }).productos.find((x) => x.id === 'cccccccccccc');
  assert.equal(p.stock, 6);
  assert.equal(p.consumo, 4);
  assert.equal(p.costeConsumo, 12);
  assert.equal(p.ventas, 0);
});

test('cierre de caja en contabilidad, libros y 347', () => {
  const c = { id: 'Z2026-1', numero: 1, anio: 2026, serie: 'Z', ...limpiarCierre({ fecha: '2026-03-02', porIva: [{ pct: 21, total: 6050 }], efectivo: 50, desde: '1', hasta: '300' }, productos) };
  const A = generarAsientos({ facturas: [c], fiscal: { iva: 'general' } }, '2026-12-31');
  const cobro = A.find((a) => a.concepto.startsWith('Cobro'));
  const linea = (n) => cobro.lineas.find((l) => l.cuenta === n);
  assert.equal(linea('570').debe, 50);
  assert.equal(linea('572').debe, 6000);
  // Asiento resumen (F4) con el primer y el último tique; sin cliente.
  const L = librosRegistro({ facturas: [c], fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'a', nombre: 'Tienda' }] }, 2026, '2026-12-31');
  const fila = L.archivos[0].filas[0];
  assert.ok(fila.includes('F4') && fila.includes('1') && fila.includes('300') && fila.includes('VENTAS A CONSUMIDOR FINAL'));
  // Ventas a consumidores finales: no van en el 347.
  assert.equal(modelo347([c], [], 2026).sinNif.length, 0);
});

test('limpiarLineas conserva el producto y el albarán de cada línea', () => {
  const l = limpiarLineas([{ concepto: 'X', cantidad: '2', precio: '3,5', ivaPct: 21, producto: 'aaaaaaaaaaaa', albaran: 'abc-123' }, { concepto: 'Y', precio: 1, albaran: '<mal>' }]);
  assert.equal(l[0].albaran, 'abc-123');
  assert.equal(l[0].producto, 'aaaaaaaaaaaa');
  assert.equal(l[1].albaran, undefined);
});

test('pedido → albaranes parciales → factura agrupada sin restar el stock dos veces', () => {
  const cliente = { nombre: 'Peluquería Sol', nif: 'B12345678' };
  const pedido = { id: 'p1', tipo: 'pedido', numero: 1, anio: 2026, ...limpiarDoc({ fecha: '2026-04-01', cliente, lineas: [{ concepto: 'Champú', cantidad: 10, precio: 9, ivaPct: 21, producto: 'aaaaaaaaaaaa' }, { concepto: 'Tinte', cantidad: 4, precio: 7, ivaPct: 21, producto: 'cccccccccccc' }] }, 'pedido') };
  assert.equal(estadoPedido(pedido, []).estado, 'pendiente');
  const a1d = albaranDePedido(pedido, [], '2026-04-02');
  a1d.lineas[0].cantidad = 6; // solo hay 6 champús preparados
  const a1 = { id: 'a1', numero: 1, anio: 2026, ...limpiarDoc(a1d, 'albaran') };
  assert.equal(a1.pedido, 'p1');
  let e = estadoPedido(pedido, [a1]);
  assert.equal(e.estado, 'parcial');
  assert.deepEqual(e.lineas.map((l) => l.pendiente), [4, 0]);
  const a2 = { id: 'a2', numero: 2, anio: 2026, ...limpiarDoc(albaranDePedido(pedido, [a1], '2026-04-05'), 'albaran') };
  assert.equal(a2.lineas.length, 1);
  e = estadoPedido(pedido, [a1, a2]);
  assert.equal(e.estado, 'servido');
  assert.equal(numeroDoc(a2), 'ALB2026-002');

  // El stock sale con los albaranes (no con el pedido).
  const albaranes = [pedido, a1, a2];
  const stock = (facturas) => Object.fromEntries(inventario({ productos, ajustes: inicial, albaranes, facturas }, { hoy: '2026-04-30' }).productos.map((p) => [p.id, p.stock]));
  assert.deepEqual(stock([]), { aaaaaaaaaaaa: 10, cccccccccccc: 6, });
  // Factura de los dos albaranes: mismas cantidades, sin volver a restar.
  const fd = facturaDeAlbaranes([a2, a1]);
  assert.equal(fd.lineas.length, 3);
  assert.ok(fd.lineas.every((l) => l.albaran));
  assert.match(fd.lineas[0].concepto, /^ALB2026-001/);
  const f = { id: 'f1', fecha: '2026-04-30', ...fd, lineas: limpiarLineas(fd.lineas) };
  assert.deepEqual(stock([f]), { aaaaaaaaaaaa: 10, cccccccccccc: 6 });
  // Una rectificativa de esa factura sí devuelve.
  const r = { id: 'r1', fecha: '2026-05-02', lineas: limpiarLineas([{ concepto: 'Devolución', cantidad: 1, precio: -9, ivaPct: 21, producto: 'aaaaaaaaaaaa', albaran: 'a1' }]) };
  assert.equal(inventario({ productos, ajustes: inicial, albaranes, facturas: [f, r] }, { hoy: '2026-05-31' }).productos[0].stock, 11);
  // Margen: las ventas cuentan una vez, desde el albarán.
  assert.equal(inventario({ productos, ajustes: inicial, albaranes, facturas: [f] }, { hoy: '2026-04-30' }).productos[0].ventas, 10);
  assert.match(facturaDeAlbaranes([a1, { ...a2, cliente: { nombre: 'Otro' } }]).error, /mismo cliente/);
  assert.match(facturaDeAlbaranes([{ ...a1, factura: 'f1' }]).error, /facturado/);
});

test('pedido a proveedor: «en camino» descuenta de «Qué pedir» y al recibirlo es un gasto con stock', () => {
  const ajustes = [{ id: 'i1', producto: 'aaaaaaaaaaaa', fecha: '2026-01-01', cantidad: 3, motivo: 'inicial', coste: 4 }, { id: 'i2', producto: 'cccccccccccc', fecha: '2026-01-01', cantidad: 1, motivo: 'inicial', coste: 3 }];
  const inv = inventario({ productos, ajustes }, { hoy: '2026-02-01' });
  const sugerido = quePedir(inv.productos);
  assert.equal(sugerido[0].proveedor, 'Cosmética SL');
  assert.deepEqual(sugerido[0].items.map((x) => [x.id, x.cantidad]), [['aaaaaaaaaaaa', 17], ['cccccccccccc', 3]]);
  const pd = limpiarPedidoProv({ fecha: '2026-02-01', proveedor: 'Cosmética SL', lineas: sugerido[0].items.map((x) => ({ producto: x.id, cantidad: x.cantidad, coste: x.unitario })) }, productos);
  const pp = { id: 'pp1', numero: 1, anio: 2026, ...pd };
  assert.equal(pp.lineas[0].concepto, 'Champú');
  assert.deepEqual(enCamino([pp]), { aaaaaaaaaaaa: 17, cccccccccccc: 3 });
  assert.equal(quePedir(inv.productos, enCamino([pp])).length, 0);
  // Llegan 15 champús a 4,20 y los 3 tintes.
  const g = gastoDeRecepcion(pp, { fecha: '2026-02-05', recibido: [{ producto: 'aaaaaaaaaaaa', cantidad: 15, coste: '4,20' }, { producto: 'cccccccccccc', cantidad: 3, coste: 3 }] });
  assert.equal(g.base, 72);
  assert.equal(g.pendiente, true);
  assert.equal(g.categoria, '600');
  assert.deepEqual(g.stock, [{ producto: 'aaaaaaaaaaaa', cantidad: 15, coste: 4.2 }, { producto: 'cccccccccccc', cantidad: 3, coste: 3 }]);
  assert.match(g.concepto, /^Pedido PP2026-001/);
  assert.deepEqual(enCamino([{ ...pp, recibido: '2026-02-05' }]), {});
  const stock = inventario({ productos, ajustes, gastos: [{ id: 'g', ...g }] }, { hoy: '2026-02-28' }).productos[0].stock;
  assert.equal(stock, 18);
});
