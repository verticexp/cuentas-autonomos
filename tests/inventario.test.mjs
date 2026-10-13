import test from 'node:test';
import assert from 'node:assert/strict';
import { emparejarLineas, inventario, quePedir, valorInventario } from '../lib/inventario.js';
import { generarAsientos, balanceContable } from '../lib/asientos.js';
import { librosRegistro } from '../lib/librosRegistro.js';
import { avisosDelDia } from '../lib/avisos.js';

const productos = [
  { id: 'aaaaaaaaaaaa', nombre: 'Cable XLR 10 m', sku: 'XLR10', precio: 25, ivaPct: 21, coste: 10, minimo: 5, proveedor: 'Audio Pro' },
  { id: 'bbbbbbbbbbbb', nombre: 'Montaje', precio: 300, ivaPct: 21, servicio: true },
];
const ajustes = [{ id: 'a1', producto: 'aaaaaaaaaaaa', fecha: '2025-01-01', cantidad: 10, motivo: 'inicial', coste: 10 }];
const gastos = [{ id: 'g1', fecha: '2025-03-01', concepto: 'Compra de cables', base: 140, ivaPct: 21, categoria: '600', stock: [{ producto: 'aaaaaaaaaaaa', cantidad: 10, coste: 14 }] }];
const facturas = [
  { id: 'f1', numero: 1, anio: 2025, fecha: '2025-02-01', base: 100, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'X' }, lineas: [{ concepto: 'Cable', cantidad: 4, precio: 25, ivaPct: 21, producto: 'aaaaaaaaaaaa' }] },
  { id: 'f2', numero: 2, anio: 2025, fecha: '2025-06-01', base: 300, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'X' }, lineas: [{ concepto: 'Cable', cantidad: 12, precio: 25, ivaPct: 21, producto: 'aaaaaaaaaaaa' }, { concepto: 'Montaje', cantidad: 1, precio: 0, ivaPct: 21, producto: 'bbbbbbbbbbbb' }] },
  // Rectificativa: devuelven 1.
  { id: 'r1', numero: 1, anio: 2025, serie: 'R', fecha: '2025-06-10', base: -25, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'X' }, rectifica: { id: 'f2' }, lineas: [{ concepto: 'Cable', cantidad: 1, precio: -25, ivaPct: 21, producto: 'aaaaaaaaaaaa' }] },
];
const datos = { productos, facturas, gastos, ajustes };

test('stock, coste medio ponderado, ventas y margen', () => {
  const inv = inventario(datos, { hoy: '2025-12-31', desde: '2025-01-01' });
  assert.equal(inv.productos.length, 1); // el servicio no lleva stock
  const p = inv.productos[0];
  // 10 iniciales − 4 vendidos = 6 a 10 €; entran 10 a 14 € → medio (60 + 140) / 16 = 12,50; salen 12; vuelve 1.
  assert.equal(p.stock, 5);
  assert.equal(p.costeMedio, 12.5);
  assert.equal(p.valor, 62.5);
  assert.equal(p.ventas, 15);
  assert.equal(p.ingresos, 400);
  assert.equal(p.costeVentas, 40 + 150 - 12.5);
  assert.ok(p.bajo);
  assert.equal(valorInventario(datos, '2025-02-28'), 60);
  const [pedido] = quePedir(inv.productos);
  assert.equal(pedido.proveedor, 'Audio Pro');
  assert.equal(pedido.items[0].cantidad, 5); // hasta el doble del mínimo
  assert.deepEqual(emparejarLineas([{ descripcion: 'XLR10 Cable XLR 10 metros', cantidad: 3, precio: 13.5 }, { descripcion: 'Portes', cantidad: 1, precio: 5 }], productos), [{ producto: 'aaaaaaaaaaaa', cantidad: 3, coste: 13.5 }]);
});

test('el valor del almacén entra en la contabilidad y en los libros registro', () => {
  const A = generarAsientos({ ...datos, fiscal: { tipo: 'sociedad', iva: 'general' } }, '2026-02-01');
  const v = A.find((a) => a.concepto === 'Variación de existencias de 2025');
  assert.deepEqual(v.lineas, [{ cuenta: '300', debe: 62.5, haber: 0 }, { cuenta: '610', debe: 0, haber: 62.5 }]);
  const b = balanceContable(A, '2025-12-31', { sociedad: true });
  assert.equal(b.total, b.totalPasivo);
  assert.equal(b.activo.find((x) => x.id === 'ac').detalle.find((x) => x.id === '300').importe, 62.5);
  const l = librosRegistro({ ...datos, fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'x' }], empresa: { nif: '1Z' } }, 2025, '2026-02-01');
  const i06 = l.archivos[0].filas.find((f) => f[6] === 'I06');
  assert.equal(i06[7], '62,50'); // las existencias suben de 0 a 62,50 €
});

test('aviso de stock bajo los lunes', () => {
  assert.equal(avisosDelDia({ stockBajo: ['Cable XLR 10 m'] }, '2026-10-12')[0].titulo, 'Cable XLR 10 m: bajo mínimo');
  assert.equal(avisosDelDia({ stockBajo: ['Cable XLR 10 m'] }, '2026-10-13').length, 0);
});
