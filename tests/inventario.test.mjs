import test from 'node:test';
import assert from 'node:assert/strict';
import { emparejarLineas, inventario, quePedir, valorInventario } from '../lib/inventario.js';
import { r2 } from '../lib/redondeo.js';
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
  assert.equal(p.ingresos, 375);
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
  const i06 = l.hojas[0].filas.find((f) => f[6] === 'I06');
  assert.equal(i06[7], '62,50'); // las existencias suben de 0 a 62,50 €
});

// Auditoría completa (21-10-2026, revisión de Codex).
test('devolver una venta que salió con albarán vuelve a su coste de entonces (sin margen ficticio)', () => {
  const p = [{ id: 'cccccccccccc', nombre: 'Foco', precio: 30, ivaPct: 21, coste: 10 }];
  const d = {
    productos: p,
    ajustes: [{ id: 'a1', producto: 'cccccccccccc', fecha: '2026-01-01', cantidad: 10, motivo: 'inicial', coste: 10 }],
    albaranes: [{ id: 'alb1', tipo: 'albaran', fecha: '2026-02-01', lineas: [{ concepto: 'Foco', cantidad: 5, precio: 30, ivaPct: 21, producto: 'cccccccccccc' }] }],
    facturas: [
      { id: 'f1', fecha: '2026-02-05', base: 150, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'X' }, lineas: [{ concepto: 'Foco', cantidad: 5, precio: 30, ivaPct: 21, producto: 'cccccccccccc', albaran: 'alb1' }] },
      { id: 'r1', serie: 'R', fecha: '2026-04-01', base: -150, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'X' }, rectifica: { id: 'f1' }, lineas: [{ concepto: 'Foco', cantidad: -5, precio: 30, ivaPct: 21, producto: 'cccccccccccc', albaran: 'alb1' }] },
    ],
    gastos: [{ id: 'g1', fecha: '2026-03-01', concepto: 'Focos', base: 100, ivaPct: 21, categoria: '600', stock: [{ producto: 'cccccccccccc', cantidad: 5, coste: 20 }] }],
  };
  const x = inventario(d, { hoy: '2026-12-31', desde: '2026-01-01' }).productos[0];
  assert.equal(x.stock, 15);
  assert.equal(x.valor, 200);
  assert.equal(r2(x.ingresos - x.costeVentas), 0);
});

test('emparejar líneas: el código entero y el nombre más concreto', () => {
  const p = [{ id: 'dddddddddddd', nombre: 'Cable', codigo: '12', precio: 1, ivaPct: 21 }, { id: 'eeeeeeeeeeee', nombre: 'Cable XLR', codigo: '1234', precio: 1, ivaPct: 21 }];
  assert.deepEqual(emparejarLineas([{ descripcion: 'Producto 1234', cantidad: 1, precio: 5 }], p).map((x) => x.producto), ['eeeeeeeeeeee']);
  assert.deepEqual(emparejarLineas([{ descripcion: 'Cable XLR negro', cantidad: 1, precio: 5 }], p).map((x) => x.producto), ['eeeeeeeeeeee']);
  assert.deepEqual(emparejarLineas([{ descripcion: 'Cableado eléctrico', cantidad: 1, precio: 5 }], p), []);
});

test('aviso de stock bajo los lunes', () => {
  assert.equal(avisosDelDia({ stockBajo: ['Cable XLR 10 m'] }, '2026-10-12')[0].titulo, 'Cable XLR 10 m: bajo mínimo');
  assert.equal(avisosDelDia({ stockBajo: ['Cable XLR 10 m'] }, '2026-10-13').length, 0);
});

test('N10: venta y devolución total anulan unidades, ingresos, coste y margen', () => {
  const producto = productos[0].id;
  for (const linea of [{ cantidad: 1, precio: -30 }, { cantidad: -1, precio: 30 }]) {
    const facturas = [
      { id: 'v', fecha: '2026-02-01', lineas: [{ producto, cantidad: 1, precio: 30 }] },
      { id: 'r', fecha: '2026-02-02', rectifica: { id: 'v' }, lineas: [{ producto, ...linea }] },
    ];
    const inv = inventario({ productos, facturas, ajustes }, { hoy: '2026-02-28' });
    const p = inv.productos[0];
    assert.deepEqual([p.ventas, p.ingresos, p.costeVentas, p.margen], [0, 0, 0, 0]);
    assert.equal(p.stock, 10);
    assert.equal(inv.movimientos.find((m) => m.tipo === 'devolucion').ingreso, -30);
  }
});

test('N10: devolución parcial resta el importe de la línea con descuento', () => {
  const producto = productos[0].id;
  const facturas = [
    { id: 'v', fecha: '2026-02-01', lineas: [{ producto, cantidad: 4, precio: 30, dto: 10 }] },
    { id: 'r', fecha: '2026-02-02', lineas: [{ producto, cantidad: 1, precio: -30, dto: 10 }] },
  ];
  const p = inventario({ productos, facturas, ajustes }, { hoy: '2026-02-28' }).productos[0];
  assert.deepEqual([p.ventas, p.ingresos, p.costeVentas, p.margen], [3, 81, 30, 51]);
});

test('N10: devolver en otro periodo resta ingresos y margen solo en ese periodo', () => {
  const producto = productos[0].id;
  const facturas = [
    { id: 'v', fecha: '2026-01-10', lineas: [{ producto, cantidad: 2, precio: 30 }] },
    { id: 'r', fecha: '2026-02-10', lineas: [{ producto, cantidad: 1, precio: -30 }] },
  ];
  const d = { productos, facturas, ajustes };
  const enero = inventario(d, { hoy: '2026-01-31' }).productos[0];
  const febrero = inventario(d, { hoy: '2026-02-28', desde: '2026-02-01' }).productos[0];
  const acumulado = inventario(d, { hoy: '2026-02-28' }).productos[0];
  assert.deepEqual([enero.ventas, enero.ingresos, enero.costeVentas, enero.margen], [2, 60, 20, 40]);
  assert.deepEqual([febrero.ventas, febrero.ingresos, febrero.costeVentas, febrero.margen], [-1, -30, -10, -20]);
  assert.deepEqual([acumulado.ventas, acumulado.ingresos, acumulado.costeVentas, acumulado.margen], [1, 30, 10, 20]);
});

test('N10: cierres de caja devuelven el importe proporcional indicado en sus unidades', () => {
  const producto = productos[0].id;
  for (const devueltas of [1, 4]) {
    const facturas = [
      { id: 'v', fecha: '2026-02-01', unidades: [{ producto, cantidad: 4, importe: 120 }] },
      { id: 'r', fecha: '2026-02-02', unidades: [{ producto, cantidad: -devueltas, importe: 30 * devueltas }] },
    ];
    const p = inventario({ productos, facturas, ajustes }, { hoy: '2026-02-28' }).productos[0];
    assert.deepEqual([p.ventas, p.ingresos, p.costeVentas, p.margen], [4 - devueltas, 30 * (4 - devueltas), 10 * (4 - devueltas), 20 * (4 - devueltas)]);
  }
});
