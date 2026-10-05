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
    [{ fecha: '2026-02-01', concepto: 'altavoces', base: 200, ivaPct: 21 }]);
  assert.deepEqual(g.items.map((x) => x.estado), ['duplicado', 'nuevo']);
  assert.deepEqual(g.items[1].datos, { fecha: '2026-02-02', concepto: 'Gasolinera', base: 50, ivaPct: 21, proveedor: 'Gasolinera', pendiente: true });
  const p = previa('productos', [['Producto', 'Precio', 'IVA'], ['Hora de DJ', '120,50', 21], ['hora de dj', 1, 21], ['Sin precio', '', 21]], []);
  assert.deepEqual(p.items.map((x) => x.estado), ['nuevo', 'duplicado', 'error']);
  assert.deepEqual(p.items[0].datos, { nombre: 'Hora de DJ', precio: 120.5, ivaPct: 21 });
});
