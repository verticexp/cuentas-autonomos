import test from 'node:test';
import assert from 'node:assert/strict';
import { diarioA3, diarioContaplus, diarioContasol, subcuenta } from '../lib/exportarContable.js';
import { leerZip } from '../lib/zip.js';

const anio = 2026;
const exportadores = [diarioA3, diarioContaplus, diarioContasol];
const asiento = (fecha = '2026-03-02', concepto = 'Factura de actuación', importe = 121) => ({ fecha, concepto, lineas: [{ cuenta: '4300001', debe: importe, haber: 0 }, { cuenta: '705', debe: 0, haber: importe }] });
const lineas = (s) => s ? s.slice(0, -2).split('\r\n') : [];
const campo = (s, desde, longitud) => s.slice(desde - 1, desde - 1 + longitud);
const cents = (s) => BigInt(s.trim().replace(/[+.,]/g, ''));

// Lector independiente del APU.ods: filas de celdas { tipo, valor, texto } leídas del content.xml.
const desxml = (t) => t.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
function leerOds(buf) {
  const z = leerZip(Buffer.from(buf));
  assert.deepEqual(Object.keys(z), ['mimetype', 'META-INF/manifest.xml', 'content.xml']);
  assert.equal(z.mimetype.toString(), 'application/vnd.oasis.opendocument.spreadsheet');
  const xml = z['content.xml'].toString('utf8');
  return [...xml.matchAll(/<table:table-row>(.*?)<\/table:table-row>/g)].map(([, fila]) =>
    [...fila.matchAll(/<table:table-cell office:value-type="(\w+)"(?: office:(?:date-)?value="([^"]*)")?>(?:<text:p>(.*?)<\/text:p>)?<\/table:table-cell>|<table:table-cell\/>/g)]
      .map(([, tipo = '', valor = '', texto = '']) => ({ tipo, valor, texto: desxml(texto) })));
}
// Columnas de la tabla «Apuntes» de ContaSol, A-Q.
const contasol = (salida) => leerOds(salida).map((f) => f.map((c) => (c.tipo === 'string' ? c.texto : c.valor)));

test('subcuentas: inserta ceros tras el prefijo y conserva el sufijo', () => {
  for (const [cuenta, digitos, esperado] of [
    ['430', 8, '43000000'], ['4751', 8, '47510000'], ['4300001', 8, '43000001'],
    ['4751001', 8, '47510001'], ['4709', 8, '47090000'], ['4750002', 8, '47500002'],
    ['43000001', 8, '43000001'], ['4300001', 12, '430000000001'], [572, 8, '57200000'],
  ]) assert.equal(subcuenta(cuenta, digitos), esperado);
  assert.equal(subcuenta('430'), '43000000');
  assert.throws(() => subcuenta('430000001', 8), /430000001.*8.*dígitos/);
  for (const c of ['43', '430.1', 'abc', '430\n', '4300000000000']) assert.throws(() => subcuenta(c, 8), /Cuenta no válida/);
  for (const n of [2, 13, 8.5, '8', NaN]) assert.throws(() => subcuenta('430', n), /Longitud/);
});

test('A3: 254 posiciones ASCII + CRLF y disposición del registro 0', () => {
  const a = { fecha: '2026-03-02', concepto: 'Actuación', lineas: [{ cuenta: '4300001', debe: 121, haber: 0 }, { cuenta: '705', debe: 0, haber: 100 }, { cuenta: '477', debe: 0, haber: 21 }] };
  const salida = diarioA3([a], { anio, empresa: 42 });
  const filas = lineas(salida);
  assert.equal(filas.length, 3);
  assert.equal(Buffer.byteLength(salida), 3 * 256);
  assert.match(salida, /^[\x20-\x7e\r\n]+$/);
  for (const f of filas) {
    assert.equal(f.length, 254);
    assert.equal(campo(f, 1, 15), '400042202603020');
    assert.equal(campo(f, 59, 10), '1         ');
    assert.equal(campo(f, 70, 30), 'Actuacion'.padEnd(30));
    assert.equal(campo(f, 114, 139), ' '.repeat(139));
    assert.equal(campo(f, 253, 2), 'EN');
  }
  assert.deepEqual(filas.map((f) => campo(f, 16, 12)), ['43000001    ', '70500000    ', '47700000    ']);
  assert.deepEqual(filas.map((f) => campo(f, 58, 1)), ['D', 'H', 'H']);
  assert.deepEqual(filas.map((f) => campo(f, 69, 1)), ['I', 'M', 'U']);
  assert.deepEqual(filas.map((f) => campo(f, 100, 14)), ['+0000000121.00', '+0000000100.00', '+0000000021.00']);
  assert.equal(campo(diarioA3([a], { anio }), 2, 5), '00001');
});

test('ContaPlus: 287 posiciones ASCII + CRLF, importes en euros y auxiliares', () => {
  const salida = diarioContaplus([asiento()], { anio });
  const filas = lineas(salida);
  assert.equal(Buffer.byteLength(salida), 2 * 289);
  assert.match(salida, /^[\x20-\x7e\r\n]+$/);
  for (const f of filas) {
    assert.equal(f.length, 287);
    assert.equal(campo(f, 1, 6), '     1');
    assert.equal(campo(f, 7, 8), '20260302');
    assert.equal(campo(f, 27, 12), ' '.repeat(12));
    assert.equal(campo(f, 39, 16).trim(), '0.00');
    assert.equal(campo(f, 80, 16).trim(), '0.00');
    assert.equal(campo(f, 130, 10).trim(), '1');
    assert.equal(campo(f, 211, 1), '*');
    assert.equal(campo(f, 238, 1), '2');
    assert.equal(campo(f, 271, 16).trim(), '0.00');
    assert.equal(campo(f, 287, 1), 'F');
  }
  assert.equal(campo(filas[0], 15, 12), '43000001    ');
  assert.equal(campo(filas[0], 239, 16).trim(), '121.00');
  assert.equal(campo(filas[0], 255, 16).trim(), '0.00');
  assert.equal(campo(filas[1], 239, 16).trim(), '0.00');
  assert.equal(campo(filas[1], 255, 16).trim(), '121.00');
});

test('ancho fijo: normaliza acentos, ñ y controles antes de recortar', () => {
  const a = asiento('2026-03-02', 'Áéíóú Ññ\r\n\t🙂' + 'X'.repeat(100));
  for (const [fn, posicion, longitud] of [[diarioA3, 70, 30], [diarioContaplus, 55, 25]]) {
    const filas = lineas(fn([a], { anio }));
    assert.equal(filas.length, 2);
    for (const f of filas) {
      assert.equal(campo(f, posicion, longitud), ('Aeiou Nn    ' + 'X'.repeat(100)).slice(0, longitud));
      assert.match(f, /^[\x20-\x7e]+$/);
    }
  }
});

test('filtra el año y regularización, ordena y numera sin huecos sin mutar entradas', () => {
  const entrada = [asiento('2026-12-20', 'Ultimo'), { ...asiento('2026-03-02'), origen: { tipo: 'regularizacion' } }, asiento('2025-01-01'), asiento('2026-01-02', 'Primero'), asiento('2027-01-01')];
  const copia = structuredClone(entrada);
  const a3 = lineas(diarioA3(entrada, { anio }));
  assert.deepEqual(a3.map((f) => campo(f, 59, 10).trim()), ['1', '1', '2', '2']);
  assert.deepEqual(a3.map((f) => campo(f, 7, 8)), ['20260102', '20260102', '20261220', '20261220']);
  const cp = lineas(diarioContaplus(entrada, { anio }));
  assert.deepEqual(cp.map((f) => campo(f, 1, 6).trim()), ['1', '1', '2', '2']);
  const apu = contasol(diarioContasol(entrada, { anio }));
  assert.deepEqual(apu.map((f) => f[2]), ['1', '1', '2', '2']);
  assert.deepEqual(apu.map((f) => f[3]), ['1', '2', '1', '2']);
  assert.deepEqual(apu.map((f) => f[1]), ['2026-01-02', '2026-01-02', '2026-12-20', '2026-12-20']);
  assert.deepEqual(entrada, copia);
});

test('cuadre independiente de los tres ficheros con decimales y rectificativas', () => {
  const entrada = [asiento('2026-01-01', 'Redondeo', 1.005), asiento('2026-01-02', 'Rectificativa', -1.005), { fecha: '2026-02-01', concepto: 'Suma', lineas: [{ cuenta: '430', debe: 0.1 + 0.2, haber: 0 }, { cuenta: '705', debe: 0, haber: 0.1 }, { cuenta: '477', debe: 0, haber: 0.2 }] }];
  const a3 = lineas(diarioA3(entrada, { anio }));
  let debe = 0n, haber = 0n;
  for (const f of a3) {
    const importe = cents(campo(f, 100, 14));
    if (campo(f, 58, 1) === 'D') debe += importe;
    else haber += importe;
  }
  assert.equal(debe, 232n); assert.equal(haber, debe);
  for (const [d, h] of [
    lineas(diarioContaplus(entrada, { anio })).reduce(([d, h], f) => [d + cents(campo(f, 239, 16)), h + cents(campo(f, 255, 16))], [0n, 0n]),
    contasol(diarioContasol(entrada, { anio })).reduce(([d, h], f) => [d + cents(f[8]), h + cents(f[9])], [0n, 0n]),
  ]) { assert.equal(d, debe); assert.equal(h, haber); }
});

test('ContaSol: APU.ods sin cabecera con las columnas A-Q del manual de DELSOL', () => {
  const salida = diarioContasol([asiento('2026-03-02', 'Actuación', 1234.56)], { anio });
  const filas = leerOds(salida);
  assert.equal(filas.length, 2);
  for (const f of filas) assert.equal(f.length, 17);
  assert.deepEqual(filas[0].map((c) => c.tipo), ['float', 'date', 'float', 'float', 'float', 'float', 'string', 'string', 'float', 'float', 'string', 'float', '', 'float', 'float', 'float', '']);
  assert.equal(filas[0][1].texto, '02/03/2026');
  assert.deepEqual(contasol(salida), [
    ['1', '2026-03-02', '1', '1', '43000001', '0', 'Actuación', '1', '1234.56', '0.00', 'E', '0', '', '0', '0', '0', ''],
    ['1', '2026-03-02', '1', '2', '70500000', '0', 'Actuación', '1', '0.00', '1234.56', 'E', '0', '', '0', '0', '0', ''],
  ]);
});

test('ContaSol: textos válidos en XML, Latin-1 y recortados a 60 (si no, descarta el registro)', () => {
  const concepto = 'Actuación <b> & "Niño"\r\n\t🙂 Ωmega ' + 'X'.repeat(100);
  const [fila] = contasol(diarioContasol([asiento('2026-03-02', concepto)], { anio }));
  // \r\n\t, el emoji y la Ω (sin equivalente en Latin-1) pasan a espacios.
  assert.equal(fila[6], ('Actuación <b> & "Niño"' + ' '.repeat(6) + 'mega ' + 'X'.repeat(100)).slice(0, 60));
  assert.equal(fila[6].length, 60);
  assert.match(fila[6], /^[\x20-\x7e\xa0-\xff]+$/);
  for (const concepto of ['=1+1', '@SUM(1)']) assert.equal(contasol(diarioContasol([asiento('2026-01-01', concepto)], { anio }))[0][6], concepto);
});

test('dígitos de subcuenta: los de la empresa de destino, en los tres formatos', () => {
  const a = [asiento('2026-01-01', 'Venta', 121)];
  assert.equal(campo(diarioA3(a, { anio, digitos: 10 }), 16, 12), '4300000001  ');
  assert.equal(campo(diarioContaplus(a, { anio }), 15, 12), '43000001    ');
  assert.equal(campo(diarioContaplus(a, { anio, digitos: 10 }), 15, 12), '4300000001  ');
  assert.equal(contasol(diarioContasol(a, { anio, digitos: 10 }))[0][4], '4300000001');
  for (const fn of exportadores) for (const digitos of [5, 13, 8.5, '8']) assert.throws(() => fn(a, { anio, digitos }), /Dígitos de subcuenta/);
  assert.throws(() => diarioContasol(a, { anio, digitos: 11 }), /Dígitos de subcuenta no válidos \(6-10\)/);
});

test('rechaza datos descuadrados, importes no finitos y fechas inválidas', () => {
  for (const fn of exportadores) {
    const a = asiento(); a.lineas[1].haber = 120.99;
    assert.throws(() => fn([a], { anio }), /asiento 1 no cuadra/);
    // Dos asientos que se compensan globalmente tampoco son importables.
    const b = asiento(); b.lineas[0].debe = 120.99;
    assert.throws(() => fn([a, b], { anio }), /no cuadra/);
    for (const v of [NaN, Infinity, 'abc']) assert.throws(() => fn([asiento('2026-01-01', '', v)], { anio }), /Importe/);
    assert.throws(() => fn([asiento('2026-02-30')], { anio }), /Fecha/);
    const doble = asiento(); doble.lineas[0].haber = 1;
    assert.throws(() => fn([doble], { anio }), /mismo apunte/);
    for (const y of [1999, 2101, 2026.5, NaN]) assert.throws(() => fn([], { anio: y }), /Año/);
    assert.throws(() => fn([{ ...asiento(), lineas: [{ cuenta: '4300001', debe: 1, haber: 0 }, { cuenta: '705', debe: 0, haber: 1 }] }], { anio, digitos: 6 }), /supera los 6 dígitos/);
  }
});

test('límites del formato: errores claros, nunca recorta números', () => {
  for (const empresa of [0, 100000, 'abc', '1\n']) assert.throws(() => diarioA3([], { anio, empresa }), /empresa A3/);
  assert.throws(() => diarioA3([asiento('2026-01-01', '', 10000000000)], { anio }), /14 posiciones/);
  assert.equal(campo(diarioA3([asiento('2026-01-01', '', 9999999999.99)], { anio }), 100, 14), '+9999999999.99');
  assert.equal(diarioA3([], { anio }), '');
  assert.equal(diarioContaplus([], { anio }), '');
  assert.equal(leerOds(diarioContasol([], { anio })).length, 0);
  assert.equal(campo(diarioA3([asiento()], { anio, digitos: 12 }), 16, 12), '430000000001');
});
