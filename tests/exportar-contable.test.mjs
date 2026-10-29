import test from 'node:test';
import assert from 'node:assert/strict';
import { diarioA3, diarioContaplus, diarioContasol, subcuenta } from '../lib/exportarContable.js';
import { leerZip, zip } from '../lib/zip.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { generarAsientos } from '../lib/asientos.js';
import { exportarDiario } from '../lib/contabilidad.js';
import { librosRegistro } from '../lib/librosRegistro.js';
import { validarA3, validarContaplus } from './apoyo/enlaceContable.mjs';
import { arrancar, crearBase } from './apoyo/upstash-mem.mjs';

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

// ---- Registro de IVA en A3 y ContaPlus: el validador independiente (tests/apoyo/enlaceContable.mjs, escrito desde los
// manuales) comprueba cada fichero, el diario que genera el programa al importarlo es el mismo que el de Fisquo (saldo de
// cada subcuenta igual que el diario sin IVA) y su libro del IVA suma, trimestre a trimestre, lo mismo que los libros
// registro de Fisquo (lib/librosRegistro.js).
const COLS = { periodo: 1, tipo: 5, base: 21, cuota: 23, recargo: 25, baseG: 26, cuotaG: 28, deducible: 29 };
const aCent = (x) => BigInt(Math.round(Number(String(x || '0').replace(',', '.')) * 100));
function libroFisquo(datos, anio, hoy) {
  const L = librosRegistro(datos, anio, hoy);
  const suma = (filas, k) => filas.reduce((s, f) => s + aCent(f[COLS[k]]), 0n);
  return Object.fromEntries([1, 2, 3, 4].map((q) => {
    const ing = L.hojas[0].filas.filter((f) => f[COLS.periodo] === `${q}T` && f[COLS.tipo] !== 'SF' && f[COLS.base] !== '');
    const gas = L.hojas[1].filas.filter((f) => f[COLS.periodo] === `${q}T` && f[COLS.tipo] !== 'SF');
    return [q, { expedidas: { base: suma(ing, 'base'), cuota: suma(ing, 'cuota'), recargo: suma(ing, 'recargo') }, recibidas: { base: suma(gas, 'baseG'), cuota: suma(gas, 'cuotaG'), deducible: suma(gas, 'deducible') } }];
  }));
}
const sinCeros = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
// ContaPlus sale en un .zip con XDiario.txt y XSubCta.txt; sus subcuentas de IVA y de clientes y proveedores se suman en
// su cuenta (los tres primeros dígitos) para compararlas con el diario de Fisquo.
const diarioCp = (x) => (typeof x === 'string' ? x : leerZip(Buffer.from(x))['XDiario.txt'].toString('latin1'));
const subctaCp = (x) => leerZip(Buffer.from(x))['XSubCta.txt'].toString('latin1').slice(0, -2).split('\r\n');
const porCuenta = (o) => { const m = {}; for (const [c, v] of Object.entries(o)) m[c.slice(0, 3)] = (m[c.slice(0, 3)] || 0n) + v; return sinCeros(m); };
// sinCajaContaplus: con criterio de caja, ContaPlus deja ese IVA fuera de sus libros (Auxiliar '*').
function comprobarIva(datos, anio, hoy, { sinCajaContaplus = false } = {}) {
  const asientos = generarAsientos(datos, hoy);
  const iva = { facturas: datos.facturas || [], gastos: datos.gastos || [], fiscal: datos.fiscal || {}, productos: datos.productos || [] };
  const fisquo = libroFisquo(datos, anio, hoy);
  const salida = {};
  for (const [formato, validar] of [['a3', validarA3], ['contaplus', validarContaplus]]) {
    const con = exportarDiario(asientos, { anio, formato, fecha: hoy, iva });
    const v = validar(con, { anio }), sin = validar(exportarDiario(asientos, { anio, formato, fecha: hoy }), { anio });
    assert.deepEqual(v.errores, [], `${formato}: errores del validador`);
    if (formato === 'a3') assert.deepEqual(sinCeros(v.saldos), sinCeros(sin.saldos), 'a3: el diario importado es el de Fisquo');
    else assert.deepEqual(porCuenta(v.saldos), porCuenta(sin.saldos), 'contaplus: el diario importado es el de Fisquo');
    for (const q of [1, 2, 3, 4]) {
      if (formato === 'contaplus' && sinCajaContaplus) continue;
      assert.deepEqual(v.libro[q].expedidas, fisquo[q].expedidas, `${formato} ${q}T: IVA repercutido`);
      if (formato === 'a3') assert.deepEqual({ ...v.libro[q].recibidas, baseDeducible: undefined }, { ...fisquo[q].recibidas, baseDeducible: undefined }, `a3 ${q}T: IVA soportado`);
      else assert.equal(v.libro[q].recibidas.deducible, fisquo[q].recibidas.deducible, `contaplus ${q}T: IVA deducible`);
    }
    salida[formato] = { v, filas: lineas(formato === 'a3' ? con : diarioCp(con)), ...(formato === 'contaplus' ? { subcuentas: subctaCp(con) } : {}) };
  }
  // El IVA deducible de ContaPlus (apuntes de la 472) es el de las líneas deducibles de A3, también en la base.
  if (!sinCajaContaplus) for (const q of [1, 2, 3, 4]) assert.equal(salida.contaplus.v.libro[q].recibidas.baseDeducible, salida.a3.v.libro[q].recibidas.baseDeducible);
  return salida;
}
const tipoA3 = (f) => campo(f, 15, 1);
// Los registros de una factura en A3: su cabecera, sus líneas de IVA, el registro 4 y el asiento de ajuste, si los lleva.
function facturaA3(filas, numero) {
  const i = filas.findIndex((f) => '12'.includes(tipoA3(f)) && campo(f, 59, 10).trim() === numero);
  let j = i + 1;
  while (j < filas.length && (tipoA3(filas[j]) === '9' || tipoA3(filas[j]) === '4' || (tipoA3(filas[j]) === '0' && campo(filas[j], 59, 10).trim() === numero))) j++;
  return filas.slice(i, j);
}

const cli = { nombre: 'Congresos del Sur S.L.', nif: 'B00000005', direccion: 'C/ Mayor, 3', ciudad: '28013 Madrid' };
const prov = (n, nif = 'B00000301') => ({ proveedor: n, proveedorNif: nif });
const fac = (id, numero, fecha, extra) => ({ id, numero, anio: 2026, serie: '', fecha, actividad: 'dj', concepto: 'Servicio', cliente: cli, base: 1000, ivaPct: 21, irpfPct: 0, cobrada: true, ...extra });
const gas = (id, fecha, extra) => ({ id, fecha, actividad: 'dj', concepto: 'Compra', base: 100, ivaPct: 21, ...prov('Suministros S.L.'), ...extra });
const PRODUCTO = 'abcdef123456';
const general = {
  fiscal: { tipo: 'sociedad', iva: 'general' },
  productos: [{ id: PRODUCTO, nombre: 'Altavoz' }],
  facturas: [
    // Varios tipos, retención y una línea de mercaderías del catálogo (700) con servicios (705).
    fac('f1', 1, '2026-02-10', { base: 1500, irpfPct: 15, lineas: [{ concepto: 'Altavoz', cantidad: 2, precio: 300, ivaPct: 21, producto: PRODUCTO }, { concepto: 'Montaje', cantidad: 1, precio: 400, ivaPct: 21 }, { concepto: 'Catering', cantidad: 1, precio: 500, ivaPct: 10 }] }),
    fac('f2', 2, '2026-02-11', { recargo: true }),
    fac('f3', 3, '2026-05-02', { cliente: { nombre: 'Lyon Events', nif: 'FR12345678901' }, ivaPct: 0, operacion: 'intracomunitaria' }),
    fac('f4', 4, '2026-05-03', { cliente: { nombre: 'Berlin GmbH', nif: 'DE123456789' }, ivaPct: 0 }),
    fac('f5', 5, '2026-05-04', { cliente: { nombre: 'NY Inc', nif: 'US998877' }, ivaPct: 0, operacion: 'exportacion' }),
    fac('f6', 6, '2026-08-05', { cliente: { nombre: 'Marie Dupont' }, ivaPct: 20, oss: { pais: 'FR' } }),
    fac('f7', 1, '2026-08-06', { serie: 'R', base: -200, rectifica: { id: 'f1', numero: '01-2026', fecha: '2026-02-10' } }),
    fac('f8', 7, '2026-08-07', { ivaPct: 0, operacion: 'exenta' }),
    // Venta del ordenador: la baja del bien no sale del registro de IVA y va en un asiento de ajuste.
    fac('f9', 8, '2026-11-20', { base: 3000, bien: 'g7' }),
  ],
  gastos: [
    gas('g1', '2026-01-15', { concepto: 'Coche', base: 1000, deduciblePct: 50 }),
    gas('g2', '2026-02-15', { base: 150, porTipo: [{ base: 100, ivaPct: 21 }, { base: 50, ivaPct: 10 }] }),
    gas('g3', '2026-04-15', { concepto: 'Software', base: 200, ivaPct: 0, ...prov('Ireland Ltd', 'IE6388047V') }),
    gas('g4', '2026-04-16', { concepto: 'Obra', base: 300, ivaPct: 0, origen: 'isp' }),
    gas('g5', '2026-07-15', { concepto: 'Fruta', base: 400, ivaPct: 0, compensacion: 12, ...prov('Pagès Joan', '00000007T') }),
    gas('g6', '2026-07-16', { concepto: 'Alquiler', base: 1000, alquiler: true }),
    gas('g7', '2026-01-20', { concepto: 'Servidor', base: 4000, inversion: { tipo: 'informatica' } }),
    gas('g8', '2026-10-15', { concepto: 'Abogado', base: 500, irpfPct: 15 }),
  ],
};

test('A3 y ContaPlus: registro de IVA de facturas y gastos de todos los tipos, igual que el libro de Fisquo', () => {
  const { a3, contaplus } = comprobarIva(general, 2026, '2027-03-01');
  const A = a3.filas;
  // Factura con dos tipos y mercaderías: cabecera 1 con NIF, nombre y código postal, y una línea por tipo y cuenta.
  const f1 = facturaA3(A, '01-2026');
  assert.deepEqual(f1.map(tipoA3), ['1', '9', '9', '9']);
  assert.equal(campo(f1[0], 16, 12).trim(), '43000000');
  assert.equal(campo(f1[0], 58, 1), '1');
  assert.equal(campo(f1[0], 100, 14), '+0000001535.00');
  assert.equal(campo(f1[0], 176, 14).trim(), 'B00000005');
  assert.equal(campo(f1[0], 230, 5), '28013');
  assert.deepEqual(f1.slice(1, 4).map((f) => [campo(f, 16, 8), campo(f, 100, 2), campo(f, 102, 14), campo(f, 116, 5), campo(f, 121, 14), campo(f, 154, 5), campo(f, 159, 14), campo(f, 173, 2), campo(f, 192, 8), campo(f, 216, 8)]), [
    ['70000000', '01', '+0000000600.00', '21.00', '+0000000126.00', '15.00', '+0000000090.00', '  ', '47700000', '47300000'],
    ['70500000', '01', '+0000000400.00', '21.00', '+0000000084.00', '15.00', '+0000000060.00', '  ', '47700000', '47300000'],
    ['70500000', '01', '+0000000500.00', '10.00', '+0000000050.00', '15.00', '+0000000075.00', '  ', '47700000', '47300000'],
  ]);
  assert.deepEqual(f1.slice(1, 4).map((f) => campo(f, 69, 1)), ['M', 'M', 'U']);
  // Recargo de equivalencia en la misma cuenta que el IVA, como en el asiento.
  const [, f2] = facturaA3(A, '02-2026');
  assert.deepEqual([campo(f2, 135, 5), campo(f2, 140, 14), campo(f2, 204, 8), campo(f2, 173, 2)], ['05.20', '+0000000052.00', '47700000', '01']);
  // Al 0 %: entrega intracomunitaria (03, 349 de bienes), servicios a la UE (03, 349 de servicios), exportación (06) y exenta (02).
  assert.deepEqual(['03-2026', '04-2026', '05-2026', '07-2026'].map((n) => { const f = facturaA3(A, n)[1]; return [campo(f, 100, 2), campo(f, 173, 2), campo(f, 121, 14), campo(f, 192, 12).trim()]; }),
    [['03', '02', '+0000000000.00', ''], ['03', '11', '+0000000000.00', ''], ['06', '  ', '+0000000000.00', ''], ['02', '01', '+0000000000.00', '']]);
  assert.equal(campo(facturaA3(A, '03-2026')[0], 176, 14).trim(), 'FR12345678901');
  // Ventanilla única: la base no sujeta en España (07) y el IVA de Francia, línea no sujeta a la 4750.
  const f6 = facturaA3(A, '06-2026');
  assert.deepEqual(f6.slice(1).map((f) => [campo(f, 16, 8), campo(f, 100, 2), campo(f, 102, 14), campo(f, 175, 1)]), [['70500000', '07', '+0000001000.00', 'S'], ['47500000', '07', '+0000000200.00', 'N']]);
  // Rectificativa: registro 2 con el abono en positivo y, detrás, el 4 con la factura que rectifica.
  const f7 = facturaA3(A, 'R01-2026');
  assert.deepEqual(f7.map(tipoA3), ['2', '9', '4']);
  assert.deepEqual([campo(f7[0], 100, 14), campo(f7[0], 237, 8), campo(f7[1], 102, 14), campo(f7[1], 121, 14)], ['+0000000242.00', '20260210', '+0000000200.00', '+0000000042.00']);
  assert.deepEqual([campo(f7[2], 59, 8), campo(f7[2], 67, 10).trim()], ['20260210', '01-2026']);
  // Venta de un bien con pérdida: el registro va a la 671, como el asiento, y la baja del bien (su valor y su amortización),
  // en un asiento de ajuste sin IVA con el mismo documento.
  const f9 = facturaA3(A, '08-2026');
  assert.deepEqual(f9.slice(0, 2).map(tipoA3), ['1', '9']);
  assert.equal(campo(f9[1], 16, 8), '67100000');
  const ajuste = A.slice(A.indexOf(f9[1]) + 1).filter((f, k, l) => k <= l.findIndex((x) => campo(x, 69, 1) === 'U'));
  assert.ok(ajuste.length >= 2 && ajuste.every((f) => tipoA3(f) === '0' && campo(f, 59, 10).trim() === '08-2026'));
  assert.equal(a3.v.resumen.asientos, contaplus.v.resumen.asientos + 1);

  // Gastos (recibidas): una cabecera por gasto, con la cuenta y el NIF del proveedor.
  const recibidas = A.filter((f) => tipoA3(f) === '1' && campo(f, 58, 1) !== '1');
  assert.equal(recibidas.length, 8);
  const gasto = (concepto) => { const i = A.findIndex((f) => tipoA3(f) === '1' && campo(f, 70, 30).trim().startsWith(concepto)); return A.slice(i, A.findIndex((f, k) => k > i && campo(f, 69, 1) === 'U') + 1); };
  // IVA deducible al 50 %: la parte deducible (01, a la 472) y la no deducible (07, a la cuenta del gasto).
  const g1 = gasto('Coche');
  assert.deepEqual(g1.slice(1).map((f) => [campo(f, 100, 2), campo(f, 102, 14), campo(f, 121, 14), campo(f, 192, 8)]), [['01', '+0000000500.00', '+0000000105.00', '47200000'], ['07', '+0000000500.00', '+0000000105.00', campo(g1[1], 16, 8)]]);
  // Adquisición intracomunitaria e inversión del sujeto pasivo: el IVA a la 472 y autorrepercutido a la 477 (IVA 2).
  for (const [concepto, subtipo] of [['Software', '03'], ['Obra', '04']]) {
    const [cab, l] = gasto(concepto);
    assert.deepEqual([campo(l, 100, 2), campo(l, 116, 5), campo(l, 192, 8), campo(l, 228, 8)], [subtipo, '21.00', '47200000', '47700000']);
    assert.equal(campo(cab, 100, 14), concepto === 'Software' ? '+0000000200.00' : '+0000000300.00');
  }
  assert.equal(campo(gasto('Software')[1], 173, 2), '11');
  // Compensación del REAGP (02), alquiler con retención al 115 (03), profesional al 110 (05) y bien de inversión (tipo 3).
  assert.deepEqual([campo(gasto('Fruta')[1], 100, 2), campo(gasto('Fruta')[1], 116, 5)], ['02', '12.00']);
  assert.deepEqual([campo(gasto('Alquiler')[1], 173, 2), campo(gasto('Alquiler')[1], 154, 5), campo(gasto('Alquiler')[1], 216, 8)], ['03', '19.00', '47510000']);
  assert.equal(campo(gasto('Abogado')[1], 173, 2), '05');
  assert.equal(campo(gasto('Servidor')[0], 58, 1), '3');

  // ContaPlus: un apunte de IVA por subcuenta (tipo y porcentaje), con Contra (la subcuenta del cliente o proveedor),
  // Factura, BaseEuro e IVA, sin Auxiliar '*'; al 0 %, a 0,00 €.
  const C = contaplus.filas, iva = C.filter((f) => /^47[27]/.test(campo(f, 15, 12)) && campo(f, 211, 1) !== '*');
  const de = (contra, factura) => iva.filter((f) => campo(f, 27, 8) === contra && campo(f, 96, 8).trim() === factura && campo(f, 212, 1) === ' ').map((f) => [campo(f, 15, 8), campo(f, 239, 16).trim(), campo(f, 255, 16).trim(), campo(f, 271, 16).trim(), campo(f, 120, 5).trim(), campo(f, 125, 5).trim()]);
  assert.deepEqual(de('43000001', '1'), [['47700121', '0.00', '210.00', '1000.00', '21.00', '0.00'], ['47700110', '0.00', '50.00', '500.00', '10.00', '0.00']]);
  assert.deepEqual(de('43000001', '2'), [['47790021', '0.00', '262.00', '1000.00', '21.00', '5.20']]);
  // Al 0 %: entrega de bienes a la UE (X), servicios a la UE (Y), exportación (E) y exenta (G al 0 %), cada una con su cliente.
  assert.deepEqual([de('43000002', '3'), de('43000003', '4'), de('43000004', '5'), de('43000001', '7')].map((x) => x.map((y) => [y[0], y[2], y[3]])),
    [[['47700200', '0.00', '1000.00']], [['47700300', '0.00', '1000.00']], [['47700400', '0.00', '1000.00']], [['47700100', '0.00', '1000.00']]]);
  // Sin NIF (ventanilla única a un particular): la 430 general.
  assert.ok(C.some((f) => campo(f, 15, 8) === '43000000' && campo(f, 55, 25).includes('06-2026')));
  // Rectificativa: el IVA al debe con la base en negativo.
  assert.deepEqual(iva.filter((f) => campo(f, 212, 1) === 'R').map((f) => [campo(f, 15, 8), campo(f, 239, 16).trim(), campo(f, 271, 16).trim()]), [['47700121', '42.00', '-200.00']]);
  // Servicios de la UE (Z y V) e inversión del sujeto pasivo (P): el IVA soportado (472) y el autorrepercutido (477).
  const conBase = (sub, base) => iva.filter((f) => campo(f, 15, 8) === sub && campo(f, 271, 16).trim() === base).map((f) => [campo(f, 239, 16).trim(), campo(f, 255, 16).trim()]);
  assert.deepEqual([conBase('47200321', '200.00'), conBase('47700821', '200.00'), conBase('47200521', '300.00'), conBase('47700621', '300.00')], [[['42.00', '0.00']], [['0.00', '42.00']], [['63.00', '0.00']], [['0.00', '63.00']]]);
  // Compensación del REAGP (A) al 12 %.
  assert.equal(iva.filter((f) => campo(f, 15, 8) === '47200412').length, 1);
  // Los apuntes de IVA de la liquidación (303) siguen fuera de las declaraciones, y la reparten entre las subcuentas.
  const liquidacion = C.filter((f) => campo(f, 55, 25).startsWith('Liquidacion del IVA'));
  assert.ok(liquidacion.length && liquidacion.every((f) => campo(f, 211, 1) === '*'));
  assert.ok(liquidacion.some((f) => campo(f, 15, 8) === '47700121'));
  // XSubCta: cada subcuenta con su tipo y porcentaje de IVA, o con el NIF, la clave y el país del cliente o proveedor.
  const S = Object.fromEntries(contaplus.subcuentas.map((f) => [f.slice(0, 12).trim(), f]));
  const ficha = (c) => [campo(S[c], 13, 40).trim(), campo(S[c], 53, 15).trim(), campo(S[c], 161, 1), campo(S[c], 208, 5).trim(), campo(S[c], 213, 5).trim(), campo(S[c], 383, 1), campo(S[c], 384, 2), campo(S[c], 148, 5).trim()];
  assert.deepEqual(ficha('47700121'), ['IVA repercutido 21 %', '', 'G', '21.00', '0.00', ' ', '  ', '']);
  assert.deepEqual(ficha('47790021'), ['IVA repercutido con recargo 21 %', '', 'G', '21.00', '5.20', ' ', '  ', '']);
  assert.deepEqual(['47700200', '47700300', '47700400', '47200321', '47700821', '47200521', '47700621', '47200412'].map((c) => campo(S[c], 161, 1)), ['X', 'Y', 'E', 'Z', 'V', 'P', 'P', 'A']);
  assert.deepEqual(ficha('43000001'), ['Congresos del Sur S.L.', 'B00000005', ' ', '0.00', '0.00', '1', 'ES', '28013']);
  assert.deepEqual(ficha('43000002').slice(0, 2).concat(ficha('43000002').slice(5, 7)), ['Lyon Events', 'FR12345678901', '2', 'FR']);
  assert.equal(campo(S['43000004'], 383, 1), '6');
  assert.ok(contaplus.subcuentas.every((f) => f.length === 385));
  // Base de cada tipo en el libro del IVA de ContaPlus: la entrega a la UE va al 349 y no al régimen general.
  assert.deepEqual(contaplus.v.libro[2].tipos, { X: 100000n, Y: 100000n, E: 100000n, Z: 20000n, V: 20000n, P: 60000n });
});

test('A3 y ContaPlus: criterio de caja, IGIC y recargo de equivalencia soportado', () => {
  // Criterio de caja: el IVA espera en la 4779 y la 4729; el gasto, marcado como de caja en A3.
  const caja = { fiscal: { tipo: 'autonomo', iva: 'general', recc: { desde: '2026-01-01' } },
    facturas: [fac('c1', 1, '2026-02-10', { cobrada: false, pagos: [{ fecha: '2026-05-10', importe: 600 }] }), fac('c2', 2, '2026-03-10', { cobrada: false })],
    gastos: [gas('cg1', '2026-02-20', { pagado: '2026-07-01' }), gas('cg2', '2026-03-20', { pendiente: true })] };
  const { a3, contaplus } = comprobarIva(caja, 2026, '2026-12-31', { sinCajaContaplus: true });
  // En ContaPlus, el criterio de caja va con campos que el diario clásico no tiene: su IVA queda fuera de los libros.
  assert.equal(contaplus.v.resumen.apuntesIva, 0);
  assert.ok(contaplus.filas.some((f) => campo(f, 15, 4) === '4779' && campo(f, 211, 1) === '*'));
  const c1 = facturaA3(a3.filas, '01-2026');
  assert.equal(campo(c1[1], 192, 8), '47790000');
  const cg = a3.filas.filter((f) => tipoA3(f) === '9' && campo(f, 192, 4) === '4729');
  assert.equal(cg.length, 2);
  assert.ok(cg.every((f) => campo(f, 177, 1) === 'S'));
  assert.ok(a3.filas.filter((f) => tipoA3(f) === '9' && campo(f, 192, 4) === '4779').every((f) => campo(f, 177, 1) === ' '));
  // IGIC (Canarias): los mismos registros con sus tipos (7 %, 3 %).
  const igic = { fiscal: { tipo: 'autonomo', iva: 'general', territorio: 'canarias' },
    facturas: [fac('i1', 1, '2026-04-10', { ivaPct: 7, irpfPct: 15 }), fac('i2', 2, '2026-04-11', { lineas: [{ concepto: 'A', cantidad: 1, precio: 100, ivaPct: 7 }, { concepto: 'B', cantidad: 1, precio: 50, ivaPct: 3 }], base: 150 })],
    gastos: [gas('ig1', '2026-04-12', { ivaPct: 7, impuesto: 'igic' })] };
  const r = comprobarIva(igic, 2026, '2026-12-31');
  assert.deepEqual(facturaA3(r.a3.filas, '02-2026').slice(1).map((f) => [campo(f, 116, 5), campo(f, 121, 14)]), [['07.00', '+0000000007.00'], ['03.00', '+0000000001.50']]);
  // Comerciante en recargo de equivalencia (sin 303): el IVA y el recargo de sus compras son coste (07, a la cuenta del gasto).
  const re = { fiscal: { tipo: 'autonomo', iva: 'recargo' }, facturas: [fac('r1', 1, '2026-06-10')], gastos: [gas('rg1', '2026-06-12', { base: 200, recargo: true })] };
  const x = comprobarIva(re, 2026, '2026-12-31');
  const rg = x.a3.filas.find((f) => tipoA3(f) === '9' && campo(f, 100, 2) === '07');
  assert.deepEqual([campo(rg, 121, 14), campo(rg, 135, 5), campo(rg, 140, 14), campo(rg, 192, 8), campo(rg, 204, 8)], ['+0000000042.00', '05.20', '+0000000010.40', campo(rg, 16, 8), campo(rg, 16, 8)]);
  assert.ok(!x.contaplus.filas.some((f) => campo(f, 15, 3) === '472' && campo(f, 211, 1) !== '*'));
});

test('A3 y ContaPlus: la demo completa pasa el validador y su IVA es el de los libros de Fisquo', async () => {
  const base = crearBase(), s = await arrancar({ base });
  const antes = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  try {
    await promisify(execFile)(process.execPath, ['scripts/demo.mjs'], { cwd: new URL('..', import.meta.url), maxBuffer: 1e8,
      env: { ...process.env, KV_REST_API_URL: s.url, KV_REST_API_TOKEN: 'local', DEMO_EMAIL: 'exportar@ejemplo.test', DEMO_PASSWORD: 'Solo-Pruebas-2026' } });
    process.env.KV_REST_API_URL = s.url; process.env.KV_REST_API_TOKEN = 'local';
    const { diarioConCierreDe } = await import('../lib/contabilidad.js');
    const { leer } = await import('../lib/redis.js');
    const { fiscalDe } = await import('../lib/empresa.js');
    const id = base.run(['hget', 'cuentas:emails', 'exportar@ejemplo.test']);
    const usuario = JSON.parse(base.run(['hget', 'cuentas:usuarios', id]));
    const u = { ...usuario, ...JSON.parse(base.run(['hget', 'cuentas:empresas', usuario.empresa])), id: usuario.id, empresa: usuario.empresa, rol: usuario.rol || 'admin' };
    const [facturas, gastos, nominas] = await Promise.all(['facturas', 'gastos', 'nominas'].map((t) => leer(u, t)));
    const hoy = new Date().toISOString().slice(0, 10), anioHoy = Number(hoy.slice(0, 4));
    let facturasA3 = 0;
    for (const anio of [anioHoy - 1, anioHoy]) {
      const exportar = async (formato) => { const r = await diarioConCierreDe(u, { anio, formato, codigo: 1, fecha: hoy }); assert.ok(!r.error, r.error); return r.contenido; };
      const a3 = validarA3(await exportar('a3'), { anio }), cp = validarContaplus(await exportar('contaplus'), { anio });
      // Con el cierre, cada subcuenta de ContaPlus (clientes, proveedores e IVA por tipo) acaba el año a cero.
      if (anio < anioHoy) assert.deepEqual(sinCeros(cp.saldos), {}, `ContaPlus ${anio}: subcuentas con saldo tras el cierre`);
      assert.deepEqual(a3.errores, []); assert.deepEqual(cp.errores, []);
      facturasA3 += a3.resumen.facturas;
      // El diario de ContaSol no lleva IVA (sus apuntes son los de Fisquo): las tres exportaciones dan los mismos saldos.
      const contasolSaldos = {};
      for (const f of contasol(await exportar('contasol'))) contasolSaldos[f[4]] = (contasolSaldos[f[4]] || 0n) + cents(f[8]) - cents(f[9]);
      assert.deepEqual(sinCeros(a3.saldos), sinCeros(contasolSaldos));
      assert.deepEqual(porCuenta(cp.saldos), porCuenta(contasolSaldos));
      const fisquo = libroFisquo({ facturas, gastos, nominas, fiscal: fiscalDe(u) }, anio, hoy);
      for (const q of [1, 2, 3, 4]) {
        assert.deepEqual(a3.libro[q].expedidas, fisquo[q].expedidas, `A3 ${anio} ${q}T`);
        assert.deepEqual({ ...a3.libro[q].recibidas, baseDeducible: undefined }, { ...fisquo[q].recibidas, baseDeducible: undefined }, `A3 ${anio} ${q}T`);
        assert.deepEqual(cp.libro[q].expedidas, fisquo[q].expedidas, `ContaPlus ${anio} ${q}T`);
        assert.equal(cp.libro[q].recibidas.deducible, fisquo[q].recibidas.deducible, `ContaPlus ${anio} ${q}T`);
      }
    }
    assert.ok(facturasA3 > 300, 'la demo lleva cientos de facturas y gastos con IVA');
  } finally {
    process.env.KV_REST_API_URL = antes.url; process.env.KV_REST_API_TOKEN = antes.token;
    if (antes.url === undefined) delete process.env.KV_REST_API_URL;
    if (antes.token === undefined) delete process.env.KV_REST_API_TOKEN;
    await s.cerrar();
  }
});

test('el validador independiente detecta los errores de formato, de cuadre y de registro de IVA', () => {
  const datos = { fiscal: { tipo: 'sociedad', iva: 'general' }, facturas: [fac('v1', 1, '2026-03-02'), fac('v2', 1, '2026-03-05', { serie: 'R', base: -100, rectifica: { id: 'v1', numero: '01-2026', fecha: '2026-03-02' } })], gastos: [] };
  const iva = { facturas: datos.facturas, gastos: [], fiscal: datos.fiscal };
  const asientos = generarAsientos(datos, '2026-12-31');
  const a3 = lineas(exportarDiario(asientos, { anio, formato: 'a3', fecha: '2026-12-31', iva }));
  const zipCp = exportarDiario(asientos, { anio, formato: 'contaplus', fecha: '2026-12-31', iva });
  const cp = lineas(diarioCp(zipCp)), sc = subctaCp(zipCp);
  const con = (filas, i, desde, texto) => filas.map((f, k) => (k === i ? f.slice(0, desde - 1) + texto + f.slice(desde - 1 + texto.length) : f)).join('\r\n') + '\r\n';
  assert.deepEqual(validarA3(a3.join('\r\n') + '\r\n', { anio }).errores, []);
  const i9 = a3.findIndex((f) => tipoA3(f) === '9'), i4 = a3.findIndex((f) => tipoA3(f) === '4');
  for (const [cambio, error] of [
    [con(a3, i9, 121, '+0000000999.00'), /cuota .* lejos|no es la suma/],
    [con(a3, i9, 100, '99'), /subtipo «99»/],
    [con(a3, i9, 192, '            '), /cuota sin cuenta de IVA/],
    [a3.filter((_, k) => k !== i4).join('\r\n') + '\r\n', /sin su registro 4/],
    [con(a3, i9, 69, 'M'), /no termina en U|empieza/],
  ]) assert.match(validarA3(cambio, { anio }).errores.join('\n'), error);
  assert.deepEqual(validarContaplus(cp.join('\r\n') + '\r\n', { anio }).errores, []);
  const iIva = cp.findIndex((f) => campo(f, 15, 3) === '477' && campo(f, 211, 1) === ' ');
  for (const [cambio, error] of [
    [con(cp, iIva, 27, ' '.repeat(12)), /Contra/],
    [con(cp, iIva, 96, '       0'), /sin número de factura/],
    [con(cp, iIva, 120, '10.00'), /lejos de base/],
    [con(cp, iIva, 255, '          999.00'), /descuadrado/],
  ]) assert.match(validarContaplus(cambio, { anio }).errores.join('\n'), error);
  // Con XSubCta: que falte una subcuenta o que su porcentaje no sea el del apunte.
  assert.deepEqual(validarContaplus(zipCp, { anio }).errores, []);
  const conSubcuentas = (s) => zip([{ nombre: 'XDiario.txt', datos: diarioCp(zipCp) }, { nombre: 'XSubCta.txt', datos: s.join('\r\n') + '\r\n' }]);
  const i21 = sc.findIndex((f) => f.startsWith('47700121'));
  assert.match(validarContaplus(conSubcuentas(sc.filter((_, k) => k !== i21)), { anio }).errores.join('\n'), /falta la subcuenta 47700121/);
  assert.match(validarContaplus(conSubcuentas(sc.map((f, k) => (k === i21 ? f.slice(0, 207) + '10.00' + f.slice(212) : f))), { anio }).errores.join('\n'), /en la subcuenta 47700121 de 10\/0 %/);
});
