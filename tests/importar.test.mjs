import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { xlsx } from '../lib/xlsx.js';
import { crc32 } from '../lib/zip.js';
import { leerHoja } from '../lib/hoja.js';
import { columnas, leerFecha, numeroDe, previa } from '../lib/importar.js';
import { numeroFactura } from '../lib/calculos.js';

// Zip comprimido (deflate) con directorio central y tamaños en el directorio, como los de Excel o LibreOffice.
function zipDeflate(archivos) {
  const locales = [], dir = [];
  let pos = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const datos = Buffer.from(texto), comp = deflateRawSync(datos), n = Buffer.from(nombre);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 6); l.writeUInt16LE(8, 8); l.writeUInt16LE(n.length, 26);
    locales.push(l, n, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc32(datos), 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(datos.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(pos, 42);
    dir.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const d = Buffer.concat(dir), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(archivos && Object.keys(archivos).length, 8); fin.writeUInt16LE(Object.keys(archivos).length, 10); fin.writeUInt32LE(d.length, 12); fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...locales, d, fin]);
}

test('lee el Excel que genera la propia app', () => {
  const b = xlsx([{ nombre: 'Clientes', filas: [['Nombre', 'NIF'], ['Sala Apolo', 'B12345678'], ['Ana & Co', ''], ['Importe', 1234.5]] }]);
  assert.deepEqual(leerHoja(b), [['Nombre', 'NIF'], ['Sala Apolo', 'B12345678'], ['Ana & Co'], ['Importe', 1234.5]]);
});

test('lee un Excel comprimido con textos compartidos, celdas vacías, fechas y la hoja que diga el libro', () => {
  const b = zipDeflate({
    'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Facturas" sheetId="1" r:id="rId3"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId3" Type="ws" Target="worksheets/hoja.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Num</t></si><si><t>Fecha</t></si><si><r><t>Café </t></r><r><t xml:space="preserve">&amp; Co</t></r></si></sst>',
    'xl/worksheets/hoja.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"/><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" t="inlineStr"><is><t>x</t></is></c><c r="C3"><v>45658</v></c></row></sheetData></worksheet>',
  });
  assert.deepEqual(leerHoja(b), [['Num', '', 'Fecha'], ['Café & Co', 'x', 45658]]);
  // Con vacias: la fila 2 (vacía) se conserva, y las que faltan en el XML también (r salta de 3 a 6).
  assert.deepEqual(leerHoja(b, { vacias: true }), [['Num', '', 'Fecha'], [], ['Café & Co', 'x', 45658]]);
  const hueco = zipDeflate({ 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>a</t></is></c></row><row r="4"><c r="A4" t="inlineStr"><is><t>b</t></is></c></row><row r="7"><c r="A7" t="inlineStr"><is><t>c</t></is></c></row></sheetData></worksheet>' });
  const h = leerHoja(hueco, { vacias: true });
  assert.deepEqual(h.slice(0, 4), [['a'], [], [], ['b']]);
  assert.ok(h.length < 60);
  assert.deepEqual(leerHoja(hueco), [['a'], ['b'], ['c']]);
  assert.equal(leerFecha(45658), '2025-01-01');
});

test('lee CSV con punto y coma, comillas y Latin-1', () => {
  const b = Buffer.from('Nombre;NIF;Notas\r\n"Bar ""El Puerto""";B1;"dos\nlíneas"\r\nPeña;;\r\n', 'latin1');
  assert.deepEqual(leerHoja(b), [['Nombre', 'NIF', 'Notas'], ['Bar "El Puerto"', 'B1', 'dos\nlíneas'], ['Peña', '', '']]);
});

test('fechas y números de factura', () => {
  assert.equal(leerFecha('05/03/2026'), '2026-03-05');
  assert.equal(leerFecha('5-3-26'), '2026-03-05');
  assert.equal(leerFecha('2026-03-05 10:00'), '2026-03-05');
  assert.equal(leerFecha('31/02/2026'), null);
  assert.deepEqual(numeroDe('F260012'), { serie: 'F', numero: 260012, original: 'F260012' });
  assert.deepEqual(numeroDe('2026/015'), { serie: '', numero: 15, original: '2026/015' });
  assert.equal(numeroDe('borrador'), null);
});

const HOLDED = [
  ['Listado de facturas'],
  ['Num', 'Fecha', 'Contacto', 'NIF', 'Descripción', 'Subtotal', 'IVA', 'Retención', 'Total', 'Estado'],
  ['F260001', '10/01/2026', 'Sala Apolo', 'B12345678', 'Bolo', '1.000,00', '210,00', '150,00', '1.060,00', 'Cobrada'],
  ['F260002', '12/02/2026', 'Ana', '', 'Boda', 500, 105, 0, 605, 'Pendiente'],
  ['F260002', '12/02/2026', 'Ana', '', 'Boda', 500, 105, 0, 605, 'Pendiente'],
  ['F260003', 'ayer', 'Ana', '', 'x', 1, 0, 0, 1, ''],
  ['F260004', '01/03/2026', 'Club', '', '', '', '', '', 121, ''],
];

test('facturas de Holded: cabecera bajo un título, cuotas a tipos, estado y duplicados', () => {
  const c = columnas(HOLDED, 'facturas');
  assert.equal(c.fila, 1);
  const ya = [{ serie: 'F', anio: 2026, numero: 260004 }];
  const p = previa('facturas', HOLDED, ya);
  assert.deepEqual([p.nuevos, p.duplicados, p.errores], [2, 2, 1]);
  const [a, b] = p.items;
  assert.deepEqual([a.datos.serie, a.datos.numero, a.datos.anio, a.datos.fecha, a.datos.base, a.datos.ivaPct, a.datos.irpfPct, a.datos.cobrada, a.datos.cliente.nif], ['F', 260001, 2026, '2026-01-10', 1000, 21, 15, true, 'B12345678']);
  assert.equal(b.datos.cobrada, false);
  assert.deepEqual([p.items[2].estado, p.items[3].error, p.items[4].estado], ['duplicado', 'Fecha no válida', 'duplicado']);
  assert.equal(p.columnas.cliente, 'Contacto');
  assert.equal(numeroFactura(a.datos), 'F260001');
});

test('si faltan columnas lo dice', () => {
  const p = previa('facturas', [['Fecha', 'Total'], ['01/01/2026', 1]]);
  assert.match(p.error, /numero, cliente/);
});

test('clientes por nombre o NIF, con CP y población', () => {
  const filas = [['Nombre', 'CIF', 'Email', 'Código postal', 'Población'], ['Sala Apolo SL', 'b-12345678', 'HOLA@APOLO.ES', '08004', 'Barcelona'], ['sala x', '', '', '', ''], ['Nueva', 'C1', '', '', '']];
  const p = previa('clientes', filas, [{ nombre: 'Sala X' }, { nombre: 'Otra', nif: 'B12345678' }]);
  assert.deepEqual(p.items.map((x) => x.estado), ['duplicado', 'duplicado', 'nuevo']);
  assert.deepEqual(p.items[0].datos, { nombre: 'Sala Apolo SL', nif: 'B-12345678', direccion: '', ciudad: '08004 Barcelona', email: 'hola@apolo.es' });
});

test('gastos por fecha, importe y concepto; productos por nombre', () => {
  const g = previa('gastos', [['Fecha', 'Proveedor', 'Concepto', 'Base imponible', '% IVA', 'Estado'], ['2026-02-01', 'Sonido SL', 'Altavoces', 200, '21%', 'Pagado'], ['2026-02-02', 'Gasolinera', '', 50, 0.21, 'Pendiente']],
    [{ fecha: '2026-02-01', concepto: 'altavoces', proveedor: 'Sonido SL', base: 200, ivaPct: 21 }]);
  assert.deepEqual(g.items.map((x) => x.estado), ['duplicado', 'nuevo']);
  assert.deepEqual(g.items[1].datos, { fecha: '2026-02-02', concepto: 'Gasolinera', base: 50, ivaPct: 21, proveedor: 'Gasolinera', pendiente: true });
  const p = previa('productos', [['Producto', 'Precio', 'IVA'], ['Hora de DJ', '120,50', 21], ['hora de dj', 1, 21], ['Sin precio', '', 21]], []);
  assert.deepEqual(p.items.map((x) => x.estado), ['nuevo', 'duplicado', 'error']);
  assert.deepEqual(p.items[0].datos, { nombre: 'Hora de DJ', precio: 120.5, ivaPct: 21 });
});

// Auditoría de octubre de 2026 (N07, N08): la importación no pierde retenciones ni cobros parciales ni cambia importes.
import { saldoDe, importes as imp } from '../lib/calculos.js';
test('N07: un gasto importado con retención del 15 % conserva el neto (106 €) y su retención', () => {
  const filas = [['Fecha', 'Concepto', 'Proveedor', 'Base', '% IVA', '% IRPF', 'Retención', 'Total'], ['10/03/2026', 'Asesoría', 'Gestoría SL', 100, 21, 15, 15, 106]];
  const p = previa('gastos', filas, []);
  assert.equal(p.errores, 0, JSON.stringify(p.items));
  const d = p.items[0].datos;
  assert.equal(d.irpfPct, 15);
  assert.equal(imp(d).total, 106);
  assert.equal(imp(d).irpf, 15);
});
test('N07: sin columna de retención pero con cuota, se deduce el porcentaje; un total que no cuadra se rechaza, no se cambia', () => {
  const p = previa('gastos', [['Fecha', 'Concepto', 'Base', 'IVA', 'Retención', 'Total'], ['10/03/2026', 'Asesoría', 100, 21, 15, 106], ['10/03/2026', 'Otra', 100, 21, 15, 121]], []);
  assert.equal(p.items[0].datos.irpfPct, 15);
  assert.equal(p.items[1].estado, 'error');
  assert.match(p.items[1].error, /no cuadra/);
});
test('N08: una factura de 121 € con 71 € pendientes entra con 50 € cobrados y saldo 71 €', () => {
  const p = previa('facturas', [['Número', 'Fecha', 'Cliente', 'Base', '% IVA', 'Total', 'Pendiente'], ['F1', '10/03/2026', 'Cli', 100, 21, 121, 71], ['F2', '10/03/2026', 'Cli', 100, 21, 121, 0], ['F3', '10/03/2026', 'Cli', 100, 21, 121, 121], ['F4', '10/03/2026', 'Cli', 100, 21, 121, 130]], []);
  const [a, b, c, d] = p.items;
  assert.equal(saldoDe(a.datos), 71);
  assert.deepEqual(a.datos.pagos, [{ importe: 50, apertura: true }], 'sin fecha ni método inventados');
  assert.equal(a.datos.cobrada, false);
  assert.equal(b.datos.cobrada, true);
  assert.equal(saldoDe(c.datos), 121);
  assert.equal(c.datos.pagos, undefined);
  assert.equal(d.estado, 'error');
  assert.equal(p.pendienteTotal, 192);
  assert.equal(p.pendientePorCliente.Cli, 192);
  assert.equal(p.parciales, 1);
});
test('Importar: fechas imposibles y tipos de IVA no admitidos se rechazan', () => {
  const p = previa('gastos', [['Fecha', 'Concepto', 'Base', '% IVA'], ['31/02/2026', 'x', 100, 21], ['10/03/2026', 'y', 100, 99]], []);
  assert.deepEqual(p.items.map((x) => x.estado), ['error', 'error']);
});

// Auditoría 19-10-2026: números con el año detrás, estados en negativo y archivos sin IVA.
test('auditoría: «001/2026», «F12-26» y «07-2026» (como numera la app) no se confunden con el año', () => {
  assert.deepEqual(['001/2026', '002/2026', 'F12-26', '07-2026', 'FAC 12/2026', '2026/26', '2026-12-001', 'F260012'].map((x) => numeroDe(x, 2026)?.numero),
    [1, 2, 12, 7, 12, 26, 1, 260012]);
  const p = previa('facturas', [['Número', 'Fecha', 'Cliente', 'Base', '% IVA', 'Total'],
    ['001/2026', '15/01/2026', 'Ana SL', 100, 21, 121], ['002/2026', '16/01/2026', 'Ana SL', 200, 21, 242], ['003/2026', '17/01/2026', 'Ana SL', 300, 21, 363]], []);
  assert.deepEqual(p.items.map((x) => [x.estado, x.datos?.numero]), [['nuevo', 1], ['nuevo', 2], ['nuevo', 3]]);
  // Y la misma factura repetida en el archivo, o ya en la app, sigue siendo duplicada.
  const q = previa('facturas', [['Número', 'Fecha', 'Cliente', 'Base', '% IVA'], ['001/2026', '15/01/2026', 'Ana SL', 100, 21], ['001/2026', '15/01/2026', 'Ana SL', 100, 21], ['04/2026', '15/02/2026', 'Ana SL', 100, 21]],
    [{ serie: '', anio: 2026, numero: 4 }]);
  assert.deepEqual(q.items.map((x) => x.estado), ['nuevo', 'duplicado', 'duplicado']);
});

test('auditoría: «Impagada», «No cobrada», «Vencida» o «No pagado» no entran como cobradas; «en parte» pide el pendiente', () => {
  const estados = ['Cobrada', 'Pagado', 'Sí', 'Impagada', 'No cobrada', 'Pendiente de cobro', 'Vencida', 'Unpaid', 'No'];
  const p = previa('facturas', [['Número', 'Fecha', 'Cliente', 'Base', '% IVA', 'Estado'], ...estados.map((e, i) => [`F${i + 1}`, '10/03/2026', 'Cli', 100, 21, e])], []);
  assert.deepEqual(p.items.map((x) => x.datos.cobrada), [true, true, true, false, false, false, false, false, false]);
  const g = previa('gastos', [['Fecha', 'Proveedor', 'Base', '% IVA', 'Estado'], ['10/03/2026', 'Luz', 50, 21, 'No pagado'], ['11/03/2026', 'Agua', 20, 10, 'Pagado']], []);
  assert.deepEqual(g.items.map((x) => Boolean(x.datos.pendiente)), [true, false]);
  const parcial = previa('facturas', [['Número', 'Fecha', 'Cliente', 'Base', '% IVA', 'Estado'], ['F1', '10/03/2026', 'Cli', 100, 21, 'Parcialmente cobrada']], []);
  assert.match(parcial.items[0].error, /Pendiente/);
});

test('auditoría: sin columna de IVA no se supone un 0 %: con base y total se deduce, con solo el total se pide', () => {
  const p = previa('facturas', [['Num', 'Fecha', 'Cliente', 'Total'], ['7', '2026-02-01', 'Pepe', 121]], []);
  assert.match(p.items[0].error, /Falta el IVA/);
  const q = previa('facturas', [['Num', 'Fecha', 'Cliente', 'Base', 'Total'], ['7', '2026-02-01', 'Pepe', 100, 121], ['8', '2026-02-01', 'Pepe', 100, 110], ['9', '2026-02-01', 'Pepe', 100, 106]], []);
  assert.deepEqual(q.items.map((x) => x.datos?.ivaPct ?? x.error), [21, 10, 'Tipo de IVA no admitido (6 %)']);
  const g = previa('gastos', [['Fecha', 'Proveedor', 'Total'], ['2026-02-01', 'Repsol', 60.5]], []);
  assert.match(g.items[0].error, /Falta el IVA/);
});

test('IVA deducible en parte: columna «% IVA deducible» (50, «0,5» o celda de porcentaje); fuera de 0–100, error', () => {
  const p = previa('gastos', [['Fecha', 'Concepto', 'Base', '% IVA', '% IVA deducible'], ['2026-02-01', 'Coche', 1000, 21, 50], ['2026-02-02', 'Luz', 100, 21, 1],
    ['2026-02-03', 'Móvil', 100, 21, '0,5'], ['2026-02-04', 'X', 100, 21, 150], ['2026-02-05', 'Y', 100, 21, '']], []);
  assert.deepEqual(p.items.map((x) => x.datos?.deduciblePct ?? x.error ?? 100), [50, 100, 50, 'El % de IVA deducible tiene que estar entre 0 y 100', 100]);
});

test('gastos (auditoría C1-23): un % deducible de Excel como fracción numérica (0,125) es el 12,5 %, no 125', () => {
  const g = previa('gastos', [['Fecha', 'Concepto', 'Base imponible', '% IVA', '% IVA deducible'], ['2026-02-01', 'Coche', 100, 21, 0.125], ['2026-02-02', 'Furgoneta', 100, 21, '50%']], []);
  assert.deepEqual(g.items.map((x) => [x.estado, x.datos?.deduciblePct]), [['nuevo', 12.5], ['nuevo', 50]]);
});
