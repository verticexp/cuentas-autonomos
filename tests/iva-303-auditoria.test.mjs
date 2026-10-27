import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, fechaDevengo, fechaIva, resumenAnual } from '../lib/calculos.js';
import { modelo347, modelo349 } from '../lib/modelos.js';
import { nuevoGasto, gastoEditado } from '../lib/gastoCuerpo.js';
import { fichero303 } from '../lib/ficheroAeat.js';

// Auditoría del 23-10-2026 (F1-01, F1-03, F1-04 y F1-31). Esperados calculados a mano:
// · Instrucciones del 303 de 2026 (AEAT): «En cualquier caso, las bases figurarán sin prorratear».
// · Prorrata especial (art. 106 LIVA): lo usado solo en operaciones con derecho a deducir, entero; solo en exentas, nada;
//   lo común, con el porcentaje de la general.
// · Importaciones (casillas 32 a 35): el IVA liquidado por la Aduana (DUA).
// · Devengo (art. 75 LIVA): en la fecha de la operación, no en la de la factura.
const fac = (id, fecha, base, ivaPct, extra = {}) => ({ id, fecha, actividad: 'a', cliente: { nombre: 'Cliente', nif: 'B12345674' }, base, ivaPct, irpfPct: 0, ...extra });
const gas = (id, fecha, base, ivaPct = 21, extra = {}) => ({ id, fecha, actividad: 'a', concepto: id, proveedor: 'Proveedor', base, ivaPct, ...extra });
// 6.000 € con IVA y 4.000 € exentos en el 1T: prorrata del 60 %.
const facturas = [fac('f1', '2026-02-01', 6000, 21), fac('f2', '2026-02-02', 4000, 0, { operacion: 'exenta' })];
const gastos = [gas('grav', '2026-02-10', 1000, 21, { usoProrrata: 'gravadas' }), gas('exen', '2026-02-11', 1000, 21, { usoProrrata: 'exentas' }), gas('comun', '2026-02-12', 1000)];

test('prorrata general: las bases sin prorratear y solo las cuotas al 60 %', () => {
  const c = casillas303(facturas, gastos, 2026, 1);
  assert.equal(c.prorrata.provisional, 60);
  assert.deepEqual([c['28'], c['29']], [3000, 378]);
  assert.equal(c.prorrata.perdido, 252);
  assert.equal(c['46'], 1260 - 378);
});

test('prorrata especial: 210 € enteros, 0 € de lo exento y el 60 % de lo común (126 €)', () => {
  const iva = { prorrata: { especial: { 2026: true } } };
  const c = casillas303(facturas, gastos, 2026, 1, iva);
  assert.equal(c.prorrata.especial, true);
  assert.deepEqual([c['28'], c['29']], [2000, 336]);
  assert.equal(c.prorrata.perdido, 294);
  assert.equal(c['46'], 1260 - 336);
});

test('regularización del 4T (casilla 44): con la definitiva del 30 %, general −189 € y especial −63 €', () => {
  // Otros 10.000 € exentos en el 4T: 6.000 de 20.000 dan derecho a deducir, el 30 %.
  const F = [...facturas, fac('f3', '2026-11-02', 10000, 0, { operacion: 'exenta' })];
  const general = casillas303(F, gastos, 2026, 4);
  assert.equal(general.prorrata.definitiva, 30);
  assert.equal(general['44'], -189); // 630 × 30 % − 378 ya deducidos
  const especial = casillas303(F, gastos, 2026, 4, { prorrata: { especial: { 2026: true } } });
  assert.equal(especial['44'], -63); // 210 + 210 × 30 % − 336 ya deducidos
});

test('opción y revocación de la prorrata especial en el 303 del 4T', () => {
  const opta = casillas303(facturas, gastos, 2025, 4, { prorrata: { especial: { 2026: true } } });
  assert.equal(opta.opcionEspecial, 'opcion');
  const revoca = casillas303(facturas, gastos, 2026, 4, { prorrata: { especial: { 2026: true } } });
  assert.equal(revoca.opcionEspecial, 'revocacion');
  assert.equal(casillas303(facturas, gastos, 2026, 3, { prorrata: { especial: { 2026: true } } }).opcionEspecial, undefined);
  // Cabecera: foral, devolución mensual, régimen, conjunta, caja, destinatario de caja, opción (1) y revocación (2).
  assert.ok(fichero303({ nif: '12345678Z', nombre: 'Prueba' }, 2025, 4, opta, null).contenido.includes('20254T22322212'));
  assert.ok(fichero303({ nif: '12345678Z', nombre: 'Prueba' }, 2026, 4, revoca, null).contenido.includes('20264T22322221'));
});

test('importaciones: el IVA del DUA va en las 32-33 y, si es un bien de inversión, en las 34-35', () => {
  const G = [gas('dua', '2026-05-03', 1000, 21, { importacion: true, proveedor: 'Shenzhen Ltd' }), gas('maq', '2026-05-04', 5000, 21, { importacion: true, inversion: { tipo: 'maquinaria' } }), gas('local', '2026-05-05', 100, 21)];
  const c = casillas303([], G, 2026, 2);
  assert.deepEqual([c['28'], c['29'], c['32'], c['33'], c['34'], c['35']], [100, 21, 1000, 210, 5000, 1050]);
  assert.equal(c['45'], 1281);
  // Las importaciones no van al 347 (van en el DUA) ni al 349.
  assert.deepEqual(modelo347([], [gas('dua2', '2026-05-03', 9000, 21, { importacion: true })], 2026).compras, []);
  assert.deepEqual(modelo349([], 2026, 2, G).operadores, []);
});

test('importación guardada desde el formulario solo con IVA (el DUA lo trae)', () => {
  const u = { actividades: [{ id: 'a', nombre: 'Tienda' }], fiscal: { tipo: 'autonomo', iva: 'general' } };
  const cuerpo = { fecha: '2026-05-03', actividad: 'a', concepto: 'DUA', proveedor: 'Aduana', base: '1000', ivaPct: 21, importacion: true, usoProrrata: 'gravadas' };
  const { gasto } = nuevoGasto(u, cuerpo);
  assert.equal(gasto.importacion, true);
  assert.equal(gasto.usoProrrata, 'gravadas');
  assert.equal(nuevoGasto(u, { ...cuerpo, ivaPct: 0 }).gasto.importacion, undefined);
  assert.equal(nuevoGasto(u, { ...cuerpo, usoProrrata: 'otra' }).gasto.usoProrrata, undefined);
  const editado = gastoEditado(u, { ...cuerpo, importacion: false, usoProrrata: '' }, gasto).gasto;
  assert.equal(editado.importacion, undefined);
  assert.equal(editado.usoProrrata, undefined);
});

test('devengo en la fecha de la operación: un servicio de marzo facturado en abril va al 1T (IVA y 130)', () => {
  const f = fac('marzo', '2026-04-05', 1000, 21, { evento: { fecha: '2026-03-20', lugar: '' } });
  assert.equal(fechaDevengo(f), '2026-03-20');
  assert.equal(fechaIva(f), '2026-03-20');
  assert.equal(casillas303([f], [], 2026, 1)['07'], 1000);
  assert.equal(casillas303([f], [], 2026, 2)['07'], 0);
  const r = resumenAnual([f], [], 2026, {}, ['a']);
  assert.deepEqual(r.trimestres.map((q) => q.ingresos), [1000, 0, 0, 0]);
  // Una señal facturada antes del evento se queda en la fecha de la factura (art. 75.Dos).
  const senal = fac('senal', '2026-03-10', 300, 21, { evento: { fecha: '2026-07-15', lugar: 'Madrid' } });
  assert.equal(fechaDevengo(senal), '2026-03-10');
  assert.equal(casillas303([senal], [], 2026, 1)['07'], 300);
  // Del año anterior: cuenta en el 4T de ese año, no en el 1T del siguiente.
  const dic = fac('dic', '2027-01-08', 500, 21, { evento: { fecha: '2026-12-28' } });
  assert.equal(casillas303([dic], [], 2026, 4)['07'], 500);
  assert.equal(casillas303([dic], [], 2027, 1)['07'], 0);
});
