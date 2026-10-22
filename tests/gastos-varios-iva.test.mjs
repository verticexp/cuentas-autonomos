import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, importes, ivaGasto, tipoIvaTexto } from '../lib/calculos.js';
import { baseConIva, conIva, costeAfecto, cuotaFactura, ivaNoDeducible, origenGasto } from '../lib/ivaDeducible.js';
import { validarGasto } from '../lib/validacion.js';
import { librosRegistro } from '../lib/librosRegistro.js';

// Gastos con varios tipos de IVA en la misma factura (porTipo): un restaurante con comida al 10 % y bebida al 21 %, un
// súper al 4, 10 y 21 %, o una factura con una parte exenta. La base del gasto es la suma; ivaPct, el tipo de más base.
const restaurante = { id: 'g1', fecha: '2026-10-05', actividad: 'servicios', concepto: 'Comida con cliente', proveedor: 'Casa Pepe', proveedorNif: 'B12345678', numero: 'T-77',
  base: 60, ivaPct: 10, porTipo: [{ ivaPct: 10, base: 45 }, { ivaPct: 21, base: 15 }] };

test('importes y cuota: la suma de la de cada tipo, redondeada por tipo', () => {
  assert.deepEqual(importes(restaurante), { base: 60, iva: 7.65, irpf: 0, total: 67.65 });
  assert.equal(cuotaFactura(restaurante), 7.65);
  const raro = { base: 0.3, ivaPct: 21, porTipo: [{ ivaPct: 21, base: 0.15 }, { ivaPct: 10, base: 0.15 }] };
  assert.equal(importes(raro).iva, cuotaFactura(raro), 'calculos e ivaDeducible redondean igual');
  assert.equal(tipoIvaTexto(restaurante), '10 y 21');
  assert.equal(tipoIvaTexto({ ivaPct: 21 }), 21);
});

test('lo que lleva IVA y su base: la parte exenta no es base de cuotas soportadas', () => {
  const conExenta = { base: 150, ivaPct: 0, porTipo: [{ ivaPct: 0, base: 100 }, { ivaPct: 21, base: 50 }] };
  assert.equal(conIva(conExenta), true, 'aunque el tipo de más base sea el 0 %');
  assert.equal(baseConIva(conExenta), 50);
  assert.equal(origenGasto({ ...conExenta, proveedorNif: 'IE6388047V' }), '', 'con varios tipos nunca hay autoliquidación');
  assert.equal(conIva({ base: 10, ivaPct: 0 }), false);
  assert.equal(baseConIva({ base: 10, ivaPct: 21 }), 10);
});

test('IVA deducible en parte y coste en el IRPF con varios tipos', () => {
  const mitad = { ...restaurante, deduciblePct: 50 };
  assert.deepEqual(ivaGasto(mitad), { soportado: 7.65, auto: 0, deducible: 3.83, noDeducible: 3.82 });
  assert.equal(ivaNoDeducible(mitad), 3.82);
  assert.equal(costeAfecto(mitad), 63.82);
  assert.equal(costeAfecto({ ...restaurante, afectoPct: 0 }), 0);
  assert.equal(ivaNoDeducible(restaurante, { ivaCoste: true }), 7.65, 'sin 303, todo el IVA de la factura es coste');
});

test('303: las cuotas de cada tipo van juntas a la 29 y la base, sin la parte exenta, a la 28', () => {
  const exenta = { id: 'g2', fecha: '2026-10-07', actividad: 'servicios', concepto: 'Curso y material', proveedor: 'Academia', proveedorNif: 'B87654321', base: 150, ivaPct: 0,
    porTipo: [{ ivaPct: 0, base: 100 }, { ivaPct: 21, base: 50 }] };
  const solo = { id: 'g3', fecha: '2026-10-08', actividad: 'servicios', concepto: 'Material', proveedor: 'Ferretería', base: 100, ivaPct: 21 };
  const c = casillas303([], [restaurante, exenta, solo], 2026, 4);
  assert.equal(c['28'], 60 + 50 + 100);
  assert.equal(c['29'], 7.65 + 10.5 + 21);
  // Un abono con varios tipos rectifica deducciones (40 y 41).
  const abono = { ...restaurante, id: 'g4', base: -60, porTipo: [{ ivaPct: 10, base: -45 }, { ivaPct: 21, base: -15 }] };
  const r = casillas303([], [abono], 2026, 4);
  assert.equal(r['40'], -60); assert.equal(r['41'], -7.65);
});

test('libro de facturas recibidas: una línea por tipo, mismo número de recepción, retención en la primera', () => {
  const COL = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const num = (v) => Number(String(v).replace(',', '.'));
  const g = { ...restaurante, deduciblePct: 50, irpfPct: 15 };
  const l = librosRegistro({ gastos: [g], fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'servicios', iae: '843' }] }, 2026, '2026-12-31');
  const filas = l.hojas[1].filas;
  assert.equal(filas.length, 2);
  const [a, b] = filas;
  assert.equal(a[COL('N')], b[COL('N')], 'misma factura, mismo número de recepción');
  assert.deepEqual([a, b].map((f) => num(f[COL('AB')])), [10, 21]);
  assert.deepEqual([a, b].map((f) => num(f[COL('AA')])), [45, 15]);
  assert.deepEqual([a, b].map((f) => num(f[COL('AC')])), [4.5, 3.15]);
  // La cuota deducible suma lo mismo que en el 303.
  assert.equal(Math.round((num(a[COL('AD')]) + num(b[COL('AD')])) * 100) / 100, ivaGasto(g).deducible);
  assert.equal(num(a[COL('AL')]), 9); assert.equal(b[COL('AL')], '', 'la retención, solo en la primera línea');
  assert.equal(l.totales.ivaSoportado, ivaGasto(g).deducible);
  assert.equal(l.totales.gastos, Math.round((60 + ivaGasto(g).noDeducible) * 100) / 100);
  // Un gasto de un solo tipo sigue en una línea, como siempre.
  const uno = librosRegistro({ gastos: [{ ...restaurante, porTipo: undefined }], fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'servicios' }] }, 2026, '2026-12-31');
  assert.equal(uno.hojas[1].filas.length, 1);
});

test('validación: entre 2 y 6 tipos distintos, que sumen la base, del mismo signo y sin lo que solo admite un tipo', () => {
  const b = { fecha: '2026-10-05', concepto: 'Comida', base: '60', ivaPct: 10, porTipo: [{ ivaPct: 10, base: '45' }, { ivaPct: 21, base: '15' }] };
  assert.equal(validarGasto(b).ok, true);
  assert.match(validarGasto({ ...b, porTipo: [{ ivaPct: 10, base: '60' }] }).errores.porTipo, /entre 2 y 6/);
  assert.match(validarGasto({ ...b, porTipo: [{ ivaPct: 10, base: '45' }, { ivaPct: 10, base: '15' }] }).errores.porTipo, /una sola vez/);
  assert.match(validarGasto({ ...b, base: '61' }).errores.porTipo, /suma/);
  assert.match(validarGasto({ ...b, porTipo: [{ ivaPct: 10, base: '75' }, { ivaPct: 21, base: '-15' }] }).errores.porTipo, /mismo signo/);
  assert.match(validarGasto({ ...b, porTipo: [{ ivaPct: 10, base: '45' }, { ivaPct: 18, base: '15' }] }).errores.porTipo, /tipo permitido/);
  for (const extra of [{ inversion: { tipo: 'otros' } }, { origen: 'ue' }, { compensacion: 12 }, { isp: true }]) assert.ok(validarGasto({ ...b, ...extra }).errores.porTipo, JSON.stringify(extra));
  assert.equal(validarGasto({ ...b, ivaPct: 7, porTipo: [{ ivaPct: 7, base: '45' }, { ivaPct: 3, base: '15' }] }, { igic: true }).ok, true, 'con IGIC, sus tipos');
});

test('al guardar: el tipo de más base primero y como ivaPct del gasto, y sin autoliquidar aunque el NIF sea europeo', async () => {
  const { nuevoGasto, gastoEditado } = await import('../lib/gastoCuerpo.js');
  const u = { id: 'u1', empresa: 'e1', actividades: [{ id: 'servicios', nombre: 'Servicios' }], fiscal: { tipo: 'autonomo' } };
  const { gasto } = nuevoGasto(u, { fecha: '2026-10-05', concepto: 'Súper', proveedor: 'Tienda', proveedorNif: 'IE6388047V', base: '30,5', ivaPct: 21,
    porTipo: [{ ivaPct: 21, base: '5,5' }, { ivaPct: 4, base: '25' }] });
  assert.deepEqual(gasto.porTipo, [{ ivaPct: 4, base: 25 }, { ivaPct: 21, base: 5.5 }]);
  assert.equal(gasto.ivaPct, 4); assert.equal(gasto.base, 30.5); assert.equal(gasto.origen, undefined);
  const { gasto: editado } = gastoEditado(u, { fecha: '2026-10-05', concepto: 'Súper', base: '30,5', ivaPct: 21 }, gasto);
  assert.equal(editado.porTipo, undefined, 'al volver a un solo tipo se quita el desglose');
  assert.equal(editado.ivaPct, 21);
});
