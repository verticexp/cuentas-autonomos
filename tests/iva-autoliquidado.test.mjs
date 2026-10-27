import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, importes, ivaGasto, liquidaciones303 } from '../lib/calculos.js';
import { costeAfecto, ivaNoDeducible, tipoAutoliquidado } from '../lib/ivaDeducible.js';
import { librosRegistro } from '../lib/librosRegistro.js';
import { validarGasto } from '../lib/validacion.js';
import { nuevoGasto, gastoEditado } from '../lib/gastoCuerpo.js';

// F1-02: esperados independientes (1.000 € × 4 % = 40 €; al 50 %, se deducen 20 €).
// Tipos españoles: arts. 90 y 91 LIVA, https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740#a91
const libros = { id: 'libros', fecha: '2026-02-10', actividad: 'libreria', concepto: 'Compra de libros',
  proveedor: 'Librairie', proveedorNif: 'FR12345678901', base: 1000, ivaPct: 0, ivaAuto: 4 };
const u = { actividades: [{ id: 'libreria', nombre: 'Librería' }], fiscal: { tipo: 'autonomo', iva: 'general' } };
const col = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const num = (v) => Number(String(v).replace(',', '.'));

test('tipoAutoliquidado devuelve 4, 10 o 21 y usa 21 por defecto', () => {
  for (const ivaAuto of [4, 10, 21, '4', '10', '21']) assert.equal(tipoAutoliquidado({ ivaAuto }), Number(ivaAuto));
  for (const ivaAuto of [undefined, null, '', 5, 0, -4, NaN, Infinity, 'otro']) assert.equal(tipoAutoliquidado({ ivaAuto }), 21);
  assert.equal(tipoAutoliquidado(), 21);
  assert.equal(tipoAutoliquidado({}), 21);
});

test('303: libros de Francia al 4 %, devengado y deducible de 40 € sin cambiar el pago', () => {
  const c = casillas303([], [libros], 2026, 1);
  assert.deepEqual([c['10'], c['11'], c['36'], c['37'], c['46']], [1000, 40, 1000, 40, 0]);
  assert.deepEqual(ivaGasto(libros), { soportado: 40, auto: 40, deducible: 40, noDeducible: 0 });
  assert.equal(importes(libros).total, 1000);
  const l = liquidaciones303([], [libros], 2026)[0];
  assert.deepEqual([l.bruto, l.ingresar, l.pendiente], [0, 0, 0]);
});

test('303: prorrata del 50 % deduce 20 € del IVA de los libros', () => {
  const iva = { prorrata: { 2026: 50 } };
  const c = casillas303([], [libros], 2026, 1, iva);
  // Las bases van sin prorratear (instrucciones del 303 de 2026); solo la cuota lleva el porcentaje.
  assert.deepEqual([c['10'], c['11'], c['36'], c['37'], c['46']], [1000, 40, 1000, 20, 20]);
  assert.equal(c.prorrata.perdido, 20);
  const l = liquidaciones303([], [libros], 2026, '2026-03-31', iva)[0];
  assert.deepEqual([l.bruto, l.ingresar, l.perdidoProrrata], [20, 20, 20]);
});

test('IVA deducible al 50 %: también se aplica sobre 40 €, antes de una posible prorrata', () => {
  const g = { ...libros, deduciblePct: 50 };
  assert.deepEqual(ivaGasto(g), { soportado: 40, auto: 40, deducible: 20, noDeducible: 20 });
  const c = casillas303([], [g], 2026, 1);
  assert.deepEqual([c['36'], c['37'], c['46']], [500, 20, 20]);
  assert.equal(casillas303([], [g], 2026, 1, { prorrata: { 2026: 50 } })['37'], 10);
});

test('sin ivaAuto se conserva el 21 % y los mismos resultados que con el 21 explícito', () => {
  for (const origen of ['ue', 'fuera']) {
    const g = { ...libros, origen, ivaAuto: undefined, deduciblePct: 50 };
    const explicito = { ...g, ivaAuto: 21 };
    assert.deepEqual(ivaGasto(g), { soportado: 210, auto: 210, deducible: 105, noDeducible: 105 });
    assert.equal(ivaNoDeducible(g), 105);
    assert.equal(costeAfecto(g), 1105);
    assert.deepEqual(casillas303([], [g], 2026, 1), casillas303([], [explicito], 2026, 1));
    assert.deepEqual(liquidaciones303([], [g], 2026), liquidaciones303([], [explicito], 2026));
    assert.deepEqual(librosRegistro({ ...u, gastos: [g] }, 2026, '2026-12-31'), librosRegistro({ ...u, gastos: [explicito] }, 2026, '2026-12-31'));
  }
});

test('303: servicio de fuera de la UE al 10 % en 12-13 y 28-29', () => {
  const g = { ...libros, concepto: 'Servicio', origen: 'fuera', proveedorNif: 'US123456789', ivaAuto: 10 };
  const c = casillas303([], [g], 2026, 1);
  assert.deepEqual([c['12'], c['13'], c['28'], c['29'], c['46']], [1000, 100, 1000, 100, 0]);
  assert.deepEqual([c['10'], c['11'], c['36'], c['37']], [0, 0, 0, 0]);
  assert.equal(liquidaciones303([], [g], 2026)[0].bruto, 0);
  const parcial = casillas303([], [{ ...g, deduciblePct: 50 }], 2026, 1);
  assert.deepEqual([parcial['13'], parcial['28'], parcial['29'], parcial['46']], [100, 500, 50, 50]);
});

test('costeAfecto e ivaNoDeducible usan el tipo elegido, también con afectación parcial', () => {
  for (const [ivaAuto, cuota, mitad, costeParcial] of [[4, 40, 20, 770], [10, 100, 50, 800], [21, 210, 105, 855]]) {
    const g = { ...libros, ivaAuto, deduciblePct: 50 };
    assert.equal(ivaNoDeducible(g), mitad);
    assert.equal(costeAfecto(g), 1000 + mitad);
    assert.equal(costeAfecto({ ...g, afectoPct: 75, deduciblePct: 25 }), costeParcial);
    assert.equal(ivaGasto({ ...g, deduciblePct: 0 }).noDeducible, cuota);
    // Sin 303 (exento, recargo, agricultura) el IVA autoliquidado se paga con el 309 y no se deduce: es coste entero.
    assert.equal(ivaNoDeducible(g, { ivaCoste: true }), cuota);
    assert.equal(costeAfecto(g, { ivaCoste: true }), 1000 + cuota);
  }
});

test('ivaAuto no activa autoliquidación en gastos nacionales, con IVA, con varios tipos o con IGIC', () => {
  for (const extra of [{ origen: 'es' }, { ivaPct: 10 }, { impuesto: 'igic' },
    { ivaPct: 10, porTipo: [{ ivaPct: 10, base: 900 }, { ivaPct: 4, base: 100 }] }]) {
    assert.equal(ivaGasto({ ...libros, ...extra }).auto, 0);
  }
});

test('libros registro: tipo elegido, cuota soportada, deducible y total sin IVA del proveedor', () => {
  for (const origen of ['ue', 'fuera']) for (const [ivaAuto, cuota, deducible] of [[4, 40, 20], [10, 100, 50], [21, 210, 105]]) {
    const g = { ...libros, origen, ivaAuto, deduciblePct: 50 };
    const l = librosRegistro({ ...u, gastos: [g] }, 2026, '2026-12-31');
    const filas = l.hojas.find((h) => h.hoja === 'RECIBIDAS_GASTOS').filas;
    assert.equal(filas.length, 1);
    const fila = filas[0];
    assert.deepEqual(['Z', 'AA', 'AB', 'AC', 'AD', 'H'].map((c) => num(fila[col(c)])), [1000, 1000, ivaAuto, cuota, deducible, 1000 + deducible]);
    assert.equal(l.totales.ivaSoportado, deducible);
    assert.equal(l.totales.gastos, 1000 + deducible);
  }
});

test('validarGasto acepta 4, 10 y 21 y rechaza otros valores de ivaAuto', () => {
  for (const ivaAuto of [undefined, 4, 10, 21, '4', '10', '21']) assert.equal(validarGasto({ ...libros, ivaAuto }).ok, true, String(ivaAuto));
  for (const ivaAuto of [5, 0, -4, 100, 'otro', '', null, NaN, Infinity]) {
    const v = validarGasto({ ...libros, ivaAuto });
    assert.equal(v.ok, false, String(ivaAuto));
    assert.match(v.errores.ivaAuto, /IVA autoliquidado.*4, 10 o 21 %/);
  }
});

test('guardar: solo conserva 4 o 10 en gastos autoliquidados, normalizados a número', () => {
  for (const origen of [undefined, 'ue', 'fuera']) for (const ivaAuto of [undefined, 4, '10', 21]) {
    const { gasto, error } = nuevoGasto(u, { ...libros, origen, ivaAuto });
    assert.equal(error, undefined);
    assert.equal(gasto.ivaAuto, [4, '10'].includes(ivaAuto) ? Number(ivaAuto) : undefined);
    if (gasto.ivaAuto === undefined) assert.equal(Object.hasOwn(gasto, 'ivaAuto'), false);
  }
  for (const extra of [{ origen: 'es' }, { ivaPct: 21 }, { impuesto: 'igic' },
    { ivaPct: 10, porTipo: [{ ivaPct: 10, base: 900 }, { ivaPct: 4, base: 100 }] }]) {
    const usuario = extra.impuesto ? { ...u, fiscal: { ...u.fiscal, territorio: 'canarias' } } : u;
    const { gasto, error } = nuevoGasto(usuario, { ...libros, ...extra });
    assert.equal(error, undefined);
    assert.equal(gasto.ivaAuto, undefined);
  }
});

test('editar: conserva o cambia el tipo y lo quita al volver a 21 o dejar de autoliquidar', () => {
  for (const ivaAuto of [4, 10, '10']) {
    const { gasto, error } = gastoEditado(u, { ...libros, ivaAuto }, libros);
    assert.equal(error, undefined);
    assert.equal(gasto.ivaAuto, Number(ivaAuto));
  }
  for (const extra of [{ ivaAuto: 21 }, { ivaAuto: undefined }, { origen: 'es' }, { ivaPct: 4 },
    { proveedor: '', proveedorNif: '' }, { ivaPct: 10, porTipo: [{ ivaPct: 10, base: 900 }, { ivaPct: 4, base: 100 }] }]) {
    const { gasto, error } = gastoEditado(u, { ...libros, ...extra }, libros);
    assert.equal(error, undefined);
    assert.equal(Object.hasOwn(gasto, 'ivaAuto'), false, JSON.stringify(extra));
  }
});

test('abono autoliquidado: rectifica devengado y deducible al mismo tipo, con redondeo al céntimo', () => {
  const g = { ...libros, base: -123.45, deduciblePct: 50 };
  const c = casillas303([], [g], 2026, 1);
  assert.deepEqual([c['14'], c['15'], c['40'], c['41'], c['46']], [-123.45, -4.94, -61.73, -2.47, -2.47]);
  assert.deepEqual(ivaGasto(g), { soportado: -4.94, auto: -4.94, deducible: -2.47, noDeducible: -2.47 });
});
