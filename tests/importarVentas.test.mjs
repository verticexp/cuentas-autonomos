import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarFormato, ventasDesdeFilas, limpiarDia } from '../lib/importarVentas.js';
import { r2 } from '../lib/calculos.js';

const productos = [
  { id: 'cafe', nombre: 'Café molido', sku: 'CAF-1', codigo: '841000001', ivaPct: 10 },
  { id: 'taza', nombre: 'Taza azul', sku: 'TAZ-1', codigo: '841000002', ivaPct: 21 },
  { id: 'libro', nombre: 'Libro de recetas', sku: 'LIB-1', ivaPct: 4 },
  { id: 'curso', nombre: 'Curso de café', sku: 'CURSO', servicio: true, ivaPct: 21 },
];

const SHOPIFY = [
  ['Exportación de pedidos'],
  ['Name', 'Created at', 'Paid at', 'Financial Status', 'Payment Method', 'Lineitem quantity', 'Lineitem name', 'Lineitem price', 'Lineitem sku', 'Lineitem discount', 'Taxes', 'Total', 'Tax 1 Name', 'Tax 1 Value', 'Refunded Amount', 'Cancelled at'],
  ['#1001', '2026-03-01 18:22:11 +0100', '2026-03-02 09:00:00 +0100', 'paid', 'Shopify Payments', 2, 'Café molido', 11, 'caf-1', 0, 4.1, 34.1, '', '', 0, ''],
  ['#1001', '', '', '', '', 1, 'Taza azul', 12.1, 'TAZ-1', 0],
  ['#1002', '2026-03-01 19:00:00 +0100', '', 'paid', 'Cash', 1, 'Taza azul', 12.1, 'TAZ-1', 0, 2.1, 12.1, 'ES VAT 21%', 2.1, 0, ''],
  ['#1003', '2026-03-02', '', 'pending', 'PayPal', 1, 'No contar', 99, '', 0, 0, 99],
  ['#1003', '', '', '', '', 2, 'Tampoco contar', 10, '', 0],
];
const WOO = [
  ['Order Number', 'Order ID', 'Order Date', 'Order Status', 'Payment Method Title', 'Order Total', 'Order Total Tax', 'SKU', 'Item Name', 'Quantity', 'Item Cost', 'Item Total', 'Item Tax'],
  ['2001', 90, '01/03/2026 18:22', 'wc-completed', 'Stripe', 34.1, 4.1, 'CAF-1', 'Café molido', 2, 10, 20, 2],
  ['2001', 90, '01/03/2026 18:22', 'wc-completed', 'Stripe', 34.1, 4.1, 'TAZ-1', 'Taza azul', 1, 10, 10, 2.1],
  ['2002', 91, '01/03/2026', 'completed', 'PayPal', 10.4, 0.4, 'LIB-1', 'Libro de recetas', 1, 10, 10, 0.4],
  ['2003', 92, '01/03/2026', 'wc-cancelled', 'Stripe', 100, 0, '', 'Ignorar', 1, 100, 100, 0],
];
const SUMUP = [
  ['Fecha', 'ID de transacción', 'Método de pago', 'Estado', 'Importe total', 'Descripción', 'Cantidad', 'Precio', 'IVA'],
  ['01/03/2026 18:22', 'S1', 'Metálico', 'Correcto', '22,00 €', 'Café molido', 2, '11,00', '10 %'],
  ['01/03/2026 18:30', 'S2', '', 'Successful', '12.10 EUR', 'Taza azul', 1, '12.10', '21%'],
  ['02/03/2026', 'S3', 'Bizum', 'Correcto', '5,00', 'Servicio externo', 1, 5, 0],
  ['02/03/2026', 'S4', 'Tarjeta', 'Fallido', 99, 'Ignorar', 1, 99, 21],
];
const SQUARE = [
  ['Date', 'Time', 'Item', 'SKU', 'Qty', 'Gross Sales', 'Discounts', 'Net Sales', 'Tax', 'Payment Method', 'Transaction ID'],
  ['2026-03-01', '18:22', 'Café molido', 'CAF-1', 2, '$22.00', '$2.00', '$20.00', '$2.00', 'Visa', 'Q1'],
  ['2026-03-01', '18:22', 'Taza azul', 'TAZ-1', 1, 10, 0, 10, 2.1, 'Visa', 'Q1'],
  ['2026-03-01', '19:00', 'Libro de recetas', 'LIB-1', 1, 10, 0, 10, 0.4, 'Cash', 'Q2'],
];

function cuadra(r) {
  assert.equal(r.error, undefined);
  for (const d of r.dias) {
    assert.equal(r2(d.efectivo + d.tarjeta + d.otros), d.total);
    assert.equal(r2(d.porIva.reduce((s, x) => s + x.total, 0)), d.total);
    assert.deepEqual(limpiarDia(d), d);
  }
}

test('detecta los cuatro formatos reales y el genérico bajo títulos', () => {
  for (const [filas, formato] of [[SHOPIFY, 'shopify'], [WOO, 'woocommerce'], [SUMUP, 'sumup'], [SQUARE, 'square'], [[['Fecha', 'Producto', 'Total']], 'generico']]) {
    assert.equal(detectarFormato(filas), formato);
    const cabecera = filas.find((f) => f.length > 1).map((h) => `  ${h.toUpperCase()}  `);
    assert.equal(detectarFormato([...Array.from({ length: 9 }, () => ['Informe']), cabecera]), formato);
    assert.equal(detectarFormato([...Array.from({ length: 10 }, () => ['Informe']), cabecera]), 'generico');
  }
});

test('Shopify hereda el pedido, cuenta su total una vez y usa la fecha de cobro', () => {
  const r = ventasDesdeFilas(SHOPIFY, productos);
  cuadra(r);
  assert.deepEqual(r.dias, [
    { fecha: '2026-03-01', total: 12.1, efectivo: 12.1, tarjeta: 0, otros: 0, porIva: [{ pct: 21, total: 12.1 }], unidades: [{ producto: 'taza', cantidad: 1, importe: 10 }], pedidos: 1 },
    { fecha: '2026-03-02', total: 34.1, efectivo: 0, tarjeta: 34.1, otros: 0, porIva: [{ pct: 10, total: 22 }, { pct: 21, total: 12.1 }], unidades: [{ producto: 'cafe', cantidad: 2, importe: 20 }, { producto: 'taza', cantidad: 1, importe: 10 }], pedidos: 1 },
  ]);
  assert.deepEqual(r.sinEmparejar, []);
  assert.match(r.avisos.join(' '), /2 fila.*estado/);
});

test('Shopify admite líneas sin Name y precios sin IVA con descuento', () => {
  const r = ventasDesdeFilas([
    ['Name', 'Created at', 'Lineitem quantity', 'Lineitem name', 'Lineitem price', 'Lineitem discount', 'Taxes', 'Total', 'Tax 1 Name'],
    ['#1', '2026-03-01', 2, 'Taza azul', 10, 2, 5.88, 33.88, 'ES VAT 21%'],
    ['', '', 1, 'Taza azul', 10, 0],
  ], productos);
  cuadra(r);
  assert.equal(r.dias[0].total, 33.88);
  assert.equal(r.dias[0].pedidos, 1);
  assert.deepEqual(r.dias[0].unidades, [{ producto: 'taza', cantidad: 3, importe: 28 }]);
});

test('WooCommerce reparte por líneas netas, no duplica totales y cuenta pedidos', () => {
  const r = ventasDesdeFilas(WOO, productos);
  cuadra(r);
  assert.deepEqual(r.dias[0], {
    fecha: '2026-03-01', total: 44.5, efectivo: 0, tarjeta: 34.1, otros: 10.4,
    porIva: [{ pct: 10, total: 22 }, { pct: 21, total: 12.1 }, { pct: 4, total: 10.4 }],
    unidades: [{ producto: 'cafe', cantidad: 2, importe: 20 }, { producto: 'taza', cantidad: 1, importe: 10 }, { producto: 'libro', cantidad: 1, importe: 10 }], pedidos: 2,
  });
});

test('WooCommerce en español permite pedidos sin detalle de precio', () => {
  const r = ventasDesdeFilas([
    ['Número de pedido', 'Fecha del pedido', 'Estado', 'Método de pago', 'Total del pedido', 'Cantidad', 'Nombre del artículo'],
    [1, '01/03/2026', 'Completado', '', '12,10', 1, 'Taza azul'],
    [2, '01/03/2026', 'Cancelado', '', 100, 1, 'No contar'],
  ], productos);
  cuadra(r);
  assert.equal(r.formato, 'woocommerce');
  assert.equal(r.dias[0].tarjeta, 12.1);
  assert.deepEqual(r.dias[0].unidades, [{ producto: 'taza', cantidad: 1, importe: 10 }]);
});

test('SumUp suma efectivo, tarjeta por defecto y otros, y excluye fallidos', () => {
  const r = ventasDesdeFilas(SUMUP, productos);
  cuadra(r);
  assert.equal(r.formato, 'sumup');
  assert.deepEqual(r.dias.map((d) => [d.total, d.efectivo, d.tarjeta, d.otros, d.pedidos]), [[34.1, 22, 12.1, 0, 2], [5, 0, 0, 5, 1]]);
  assert.deepEqual(r.sinEmparejar, [{ descripcion: 'Servicio externo', sku: '', cantidad: 1 }]);
  assert.deepEqual(r.dias[1].porIva, [{ pct: 0, total: 5 }]);
});

test('SumUp en inglés reconoce tipos de Excel y precios cuando falta el total', () => {
  const r = ventasDesdeFilas([
    ['Date', 'Transaction ID', 'Payment method', 'Status', 'Description', 'Quantity', 'Price', 'VAT rate'],
    ['2026-03-01', 'S1', 'contactless', 'paid', 'Taza azul', 2, 12.1, 0.21],
  ], productos);
  cuadra(r);
  assert.equal(r.formato, 'sumup');
  assert.equal(r.dias[0].total, 24.2);
  assert.deepEqual(r.dias[0].unidades, [{ producto: 'taza', cantidad: 2, importe: 20 }]);
});

test('Square añade Tax a Net Sales y agrupa las líneas de una transacción', () => {
  const r = ventasDesdeFilas(SQUARE, productos);
  cuadra(r);
  assert.equal(r.dias[0].total, 44.5);
  assert.equal(r.dias[0].efectivo, 10.4);
  assert.equal(r.dias[0].tarjeta, 34.1);
  assert.equal(r.dias[0].pedidos, 2);
  assert.deepEqual(r.dias[0].porIva, [{ pct: 10, total: 22 }, { pct: 21, total: 12.1 }, { pct: 4, total: 10.4 }]);
});

test('Square en español resta descuentos de las ventas brutas e interpreta IVA como cuota', () => {
  const r = ventasDesdeFilas([
    ['Fecha', 'Hora', 'Artículo', 'SKU', 'Cantidad', 'Ventas brutas', 'Descuentos', 'IVA', 'Método de pago', 'ID de transacción'],
    ['01/03/2026', '12:00', 'Taza azul', 'TAZ-1', 2, '25,00 €', '-5,00 €', '4,20 €', '', 'Q1'],
  ], productos);
  cuadra(r);
  assert.equal(r.formato, 'square');
  assert.deepEqual(r.dias[0].porIva, [{ pct: 21, total: 24.2 }]);
  assert.deepEqual(r.dias[0].unidades, [{ producto: 'taza', cantidad: 2, importe: 20 }]);
});

test('genérico empareja SKU, código de barras y nombre; no descuenta stock de servicios', () => {
  const filas = [
    ['FECHA', 'PRODUCTO', 'REFERENCIA', 'CÓDIGO DE BARRAS', 'CANTIDAD', 'IMPORTE', 'IVA %', 'FORMA DE PAGO'],
    ['02/03/2026', 'Nombre externo', ' caf -1 ', '', 2, '22,00 €', '', 'efectivo'],
    ['01/03/2026 18:22', 'Nombre distinto', '', ' 841 000 002 ', 1, '12.10', '', 'Mastercard'],
    ['01/03/2026', 'Pack Libro de recetas', '', '', 1, 10.4, '', 'Transferencia'],
    ['01/03/2026', 'Curso de café', 'CURSO', '', 1, 121, '', 'PayPal'],
    ['01/03/2026', 'Sin catálogo', 'X', '', 2, 10, 0, ''],
    ['02/03/2026', ' sin catálogo ', 'x', '', 3, 15, 0, 'Bizum'],
  ];
  const copia = structuredClone({ filas, productos });
  const r = ventasDesdeFilas(filas, productos);
  cuadra(r);
  assert.equal(r.formato, 'generico');
  assert.deepEqual(r.dias[0].unidades, [{ producto: 'taza', cantidad: 1, importe: 10 }, { producto: 'libro', cantidad: 1, importe: 10 }]);
  assert.deepEqual(r.dias[1].unidades, [{ producto: 'cafe', cantidad: 2, importe: 20 }]);
  assert.deepEqual(r.sinEmparejar, [{ descripcion: 'Sin catálogo', sku: 'X', cantidad: 5 }]);
  assert.deepEqual({ filas, productos }, copia);
});

test('el tipo explícito precede a la cuota, la cuota al catálogo y el catálogo al predeterminado', () => {
  const r = ventasDesdeFilas([
    ['Fecha', 'SKU', 'Descripción', 'Total', 'IVA %', 'Importe IVA'],
    ['01/03/2026', 'TAZ-1', 'Taza azul', 110, 10, 21],
    ['01/03/2026', 'TAZ-1', 'Taza azul', 104, '', 4],
    ['01/03/2026', 'LIB-1', 'Libro de recetas', 52, '', ''],
    ['01/03/2026', '', 'No conocido', 105, '', ''],
    ['01/03/2026', '', 'Exento', 30, '', 0],
  ], productos, { ivaPct: 5 });
  cuadra(r);
  assert.deepEqual(r.dias[0].porIva, [{ pct: 4, total: 156 }, { pct: 10, total: 110 }, { pct: 5, total: 105 }, { pct: 0, total: 30 }]);
});

test('las cuotas redondeadas se ajustan al tipo legal más cercano', () => {
  const r = ventasDesdeFilas([
    ['Fecha', 'Total', 'Importe IVA'],
    ['01/03/2026', 1.05, 0.05], ['01/03/2026', 0.21, 0.01], ['01/03/2026', 1.21, 0.21],
  ]);
  assert.deepEqual(r.dias[0].porIva, [{ pct: 5, total: 1.26 }, { pct: 21, total: 1.21 }]);
});

test('estados no cobrados y cancelación de Shopify se aplican a todas las líneas', () => {
  for (const estado of ['cancelled', 'refunded', 'failed', 'pending', 'voided', 'cancelado', 'reembolsado', 'fallido', 'wc-on-hold']) {
    const r = ventasDesdeFilas([['Fecha', 'Total', 'Estado', 'Producto'], ['01/03/2026', 10, estado, 'Ignorar']]);
    assert.deepEqual(r.dias, [], estado);
    assert.deepEqual(r.sinEmparejar, []);
    assert.match(r.avisos[0], /estado/);
  }
  for (const extra of [{ 'Cancelled at': '2026-03-01' }, { 'Refunded Amount': 12.1 }]) {
    const r = ventasDesdeFilas([
      ['Name', 'Created at', 'Lineitem name', 'Lineitem price', 'Total', ...Object.keys(extra)],
      ['#1', '2026-03-01', 'Taza azul', 12.1, 12.1, ...Object.values(extra)],
      ['#1', '', 'Taza azul', 12.1],
    ], productos);
    assert.deepEqual(r.dias, []);
  }
});

test('reembolso parcial conserva el cobro restante y avisa de las unidades', () => {
  const r = ventasDesdeFilas([
    ['Name', 'Created at', 'Financial Status', 'Lineitem name', 'Lineitem quantity', 'Lineitem price', 'Total', 'Refunded Amount'],
    ['#1', '2026-03-01', 'partially_refunded', 'Taza azul', 2, 12.1, 24.2, 12.1],
  ], productos);
  cuadra(r);
  assert.equal(r.dias[0].total, 12.1);
  assert.match(r.avisos[0], /reembolso parcial.*unidades/);
});

test('normaliza fechas Excel sin mover el día al quitar la hora, y avisa de filas inválidas', () => {
  const r = ventasDesdeFilas([
    ['Fecha', 'Producto', 'Cantidad', 'Total'],
    [46082.9, 'Taza azul', 1, 12.1], ['31/02/2026', 'No contar', 1, 10],
    ['', 'No contar', 1, 10], ['01/03/2026', 'No contar', 0, 10],
    ['01/03/2026', 'No contar', 1, 'no disponible'], ['', '', '', ''],
  ], productos);
  cuadra(r);
  assert.equal(r.dias[0].fecha, '2026-03-01');
  assert.equal(r.dias[0].total, 12.1);
  assert.equal(r.avisos.length, 4);
});

test('admite monedas y separadores españoles e internacionales', () => {
  const r = ventasDesdeFilas([
    ['Fecha', 'Total'],
    ['01/03/2026', '1.234,56 €'], ['01/03/2026', '$1,234.56'], ['01/03/2026', '12,50'], ['01/03/2026', 12.5],
  ]);
  cuadra(r);
  assert.equal(r.dias[0].total, 2494.12);
  assert.equal(r.dias[0].otros, 2494.12);
});

test('reparte todos los métodos conocidos y los desconocidos', () => {
  const casos = { efectivo: ['cash', 'Efectivo', 'Metálico'], tarjeta: ['card', 'tarjeta', 'visa', 'mastercard', 'SumUp', 'Stripe', 'TPV', 'Contactless', 'Shopify Payments'], otros: ['Bizum', 'PayPal', 'transfer', 'Cheque', ''] };
  for (const [partida, metodos] of Object.entries(casos)) {
    for (const metodo of metodos) {
      const r = ventasDesdeFilas([['Fecha', 'Total', 'Método de pago'], ['01/03/2026', 1, metodo]]);
      assert.equal(r.dias[0][partida], 1, metodo);
    }
  }
});

test('los céntimos del pedido cuadran con varios tipos y cantidades fraccionarias', () => {
  const r = ventasDesdeFilas([
    ['Name', 'Created at', 'Lineitem quantity', 'Lineitem name', 'Lineitem price', 'Total'],
    ['#1', '2026-03-01', 0.5, 'Café molido', 2, 1],
    ['#1', '', 1, 'Taza azul', 1], ['#1', '', 1, 'Libro de recetas', 1],
  ], productos);
  cuadra(r);
  assert.deepEqual(r.dias[0].porIva, [{ pct: 10, total: 0.34 }, { pct: 21, total: 0.33 }, { pct: 4, total: 0.33 }]);
  assert.equal(r.dias[0].unidades[0].cantidad, 0.5);
});

test('un pedido con muchos artículos baratos nunca produce partidas negativas', () => {
  const filas = [['Name', 'Created at', 'Lineitem quantity', 'Lineitem name', 'Lineitem price', 'Total']];
  for (let i = 0; i < 100; i += 1) filas.push(['#1', i ? '' : '2026-03-01', 1, i % 2 ? 'Taza azul' : 'Café molido', 0.01, i ? '' : 0.5]);
  const r = ventasDesdeFilas(filas, productos);
  cuadra(r);
  assert.equal(r.dias[0].total, 0.5);
  assert.ok(r.dias[0].porIva.every((x) => x.total >= 0));
  assert.ok(r.dias[0].unidades.every((x) => x.importe >= 0));
  assert.equal(r.dias[0].unidades.reduce((s, x) => s + x.cantidad, 0), 100);
});

test('las líneas de pedidos pueden estar separadas y los identificadores no son objetos', () => {
  const r = ventasDesdeFilas([
    ['Name', 'Created at', 'Lineitem name', 'Lineitem quantity', 'Lineitem price', 'Total', 'Payment Method'],
    ['__proto__', '2026-03-01', 'Taza azul', 1, 12.1, 24.2, 'Cash'],
    ['#2', '2026-03-02', 'Café molido', 1, 11, 11, 'PayPal'],
    ['__proto__', '', 'Taza azul', 1, 12.1],
  ], productos);
  cuadra(r);
  assert.deepEqual(r.dias.map((d) => [d.total, d.pedidos]), [[24.2, 1], [11, 1]]);
  assert.equal(r.dias[0].efectivo, 24.2);
});

test('un SKU exacto precede a una coincidencia parcial y al nombre', () => {
  const catalogo = [{ id: 'corto', sku: 'TAZ', nombre: 'Taza', ivaPct: 4 }, ...productos];
  const r = ventasDesdeFilas([['Fecha', 'SKU', 'Producto', 'Total'], ['01/03/2026', 'taz - 1', 'Taza', 12.1]], catalogo);
  assert.deepEqual(r.dias[0].unidades, [{ producto: 'taza', cantidad: 1, importe: 10 }]);
  assert.deepEqual(r.dias[0].porIva, [{ pct: 21, total: 12.1 }]);
});

test('los servicios por nombre se reconocen sin crear unidades ni pendientes', () => {
  const r = ventasDesdeFilas([['Fecha', 'Producto', 'Total'], ['01/03/2026', 'Curso de café', 121]], productos);
  assert.deepEqual(r.dias[0].unidades, []);
  assert.deepEqual(r.sinEmparejar, []);
});

test('un identificador genérico cuenta una transacción sin perder métodos de pago por línea', () => {
  const r = ventasDesdeFilas([
    ['Fecha', 'Transaction ID', 'Producto', 'Total', 'Método de pago'],
    ['01/03/2026', 'X1', 'Taza azul', 12.1, 'cash'],
    ['01/03/2026', 'X1', 'Taza azul', 12.1, 'visa'],
  ], productos);
  cuadra(r);
  assert.equal(r.formato, 'generico');
  assert.equal(r.dias[0].pedidos, 1);
  assert.equal(r.dias[0].efectivo, 12.1);
  assert.equal(r.dias[0].tarjeta, 12.1);
});

test('importes negativos y textos con números no se convierten en cobros', () => {
  for (const valor of [-12.1, '€ -12,10', '(12,10)', 'error 12', '12,10 pendiente', '12,3,4', Infinity]) {
    const r = ventasDesdeFilas([['Fecha', 'Total'], ['01/03/2026', valor]]);
    assert.deepEqual(r.dias, [], String(valor));
    assert.match(r.avisos[0], /importe/);
  }
  const r = ventasDesdeFilas([['Date', 'Transaction ID', 'Status', 'Total amount', 'Price'], ['2026-03-01', 'S1', 'paid', 'error 12', 12]]);
  assert.deepEqual(r.dias, []);
  assert.match(r.avisos[0], /total del pedido/);
});

test('faltan columnas imprescindibles y una tabla vacía no se importa', () => {
  for (const filas of [[], [['Producto', 'Total']], [['Fecha', 'Producto']]]) {
    const r = ventasDesdeFilas(filas, productos);
    assert.deepEqual(Object.keys(r), ['error']);
    assert.match(r.error, /Falta.*(fecha|total)/);
  }
  assert.deepEqual(ventasDesdeFilas([['Fecha', 'Total']]), { formato: 'generico', dias: [], sinEmparejar: [], avisos: [] });
});

const dia = { fecha: '2026-03-01', total: 34.1, efectivo: 22, tarjeta: 12.1, otros: 0, porIva: [{ pct: 10, total: 22 }, { pct: 21, total: 12.1 }], unidades: [{ producto: 'cafe', cantidad: 2, importe: 20 }], pedidos: 2 };

test('limpiarDia normaliza y copia sin conservar propiedades del navegador', () => {
  const entrada = { ...dia, fecha: '01/03/2026 18:22', total: '34,10', efectivo: '22', tarjeta: '12,10', pedidos: '2', admin: true,
    porIva: [{ pct: '21%', total: '12,10' }, { pct: 10, total: 11 }, { pct: 0.1, total: 11 }],
    unidades: [{ producto: ' cafe ', cantidad: 1, importe: '10' }, { producto: 'cafe', cantidad: '1', importe: 10 }] };
  const copia = structuredClone(entrada);
  assert.deepEqual(limpiarDia(entrada), dia);
  assert.deepEqual(entrada, copia);
});

test('limpiarDia ajusta la mayor partida por céntimos y rechaza descuadres materiales', () => {
  const limpio = limpiarDia({ ...dia, efectivo: 21.99, porIva: [{ pct: 10, total: 21.99 }, { pct: 21, total: 12.1 }] });
  assert.deepEqual(limpio, dia);
  assert.equal(limpiarDia({ ...dia, efectivo: 20 }), null);
  assert.equal(limpiarDia({ ...dia, porIva: [{ pct: 21, total: 1 }] }), null);
});

test('limpiarDia rechaza fechas, números, tipos y estructuras inválidos', () => {
  const cambios = [
    { fecha: '2026-02-31' }, { fecha: ['2026-03-01'] }, { total: NaN }, { total: Infinity }, { total: -1 }, { total: {} }, { total: '' }, { total: 'error 34.1' },
    { efectivo: -2 }, { tarjeta: 'no' }, { pedidos: 1.5 }, { pedidos: -1 },
    { porIva: null }, { porIva: [] }, { porIva: [null] }, { porIva: [{ pct: 101, total: 34.1 }] },
    { unidades: {} }, { unidades: [null] }, { unidades: [{ producto: {}, cantidad: 1, importe: 2 }] },
    { unidades: [{ producto: 'cafe', cantidad: 0, importe: 2 }] }, { unidades: [{ producto: 'cafe', cantidad: 1, importe: -2 }] },
  ];
  for (const cambio of cambios) assert.equal(limpiarDia({ ...dia, ...cambio }), null, JSON.stringify(cambio));
  for (const valor of [null, undefined, [], 'día', 1]) assert.equal(limpiarDia(valor), null);
});
