// IVA deducible en parte (arts. 95 y 96 de la Ley del IVA): un coche al 50 %, un bien usado a medias, una compra a la UE.
// Lo no deducible es coste (norma 12.ª del PGC): gasto en IRPF y Sociedades, más valor del bien y cargo en la cuenta de gasto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, resumenAnual } from '../lib/calculos.js';
import { deduciblePctDe, partirIva, pctDeducible } from '../lib/ivaDeducible.js';
import { valorBien } from '../lib/amortizaciones.js';
import { generarAsientos } from '../lib/asientos.js';
import { librosRegistro } from '../lib/librosRegistro.js';
import { borradorSociedades, modelo390 } from '../lib/modelos.js';
import { validarGasto } from '../lib/validacion.js';

const fiscal = { tipo: 'autonomo', iva: 'general' };
const fac = { id: 'f1', fecha: '2026-02-10', numero: 1, anio: 2026, actividad: 'a', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'Servicio', base: 3000, ivaPct: 21, irpfPct: 0, cobrada: true };
const coche = { id: 'g1', fecha: '2026-02-15', actividad: 'a', concepto: 'Gasolina', base: 1000, ivaPct: 21, deduciblePct: 50 };
const bien = { id: 'g2', fecha: '2026-01-01', actividad: 'a', concepto: 'Servidor', base: 4000, ivaPct: 21, deduciblePct: 50, inversion: { tipo: 'informatica' } };
const ue = { id: 'g3', fecha: '2026-03-01', actividad: 'a', concepto: 'Software', base: 100, ivaPct: 0, origen: 'ue', proveedor: 'Soft Ltd', proveedorNif: 'IE6388047V', deduciblePct: 50 };

test('el % deducible: 0–100 o, sin él, todo; lo que se guarda solo si es menor de 100', () => {
  assert.deepEqual([pctDeducible({}), pctDeducible({ deduciblePct: 50 }), pctDeducible({ deduciblePct: 0 }), pctDeducible({ deduciblePct: 150 }), pctDeducible({ deduciblePct: '' })], [100, 50, 0, 100, 100]);
  assert.deepEqual([deduciblePctDe('50'), deduciblePctDe('33,5'), deduciblePctDe(100), deduciblePctDe(''), deduciblePctDe(120)], [50, 33.5, undefined, undefined, undefined]);
  // La cuota se parte sin perder céntimos: 33,33 € al 50 % → 16,67 + 16,66.
  assert.deepEqual(partirIva({ deduciblePct: 50 }, 33.33), { deducible: 16.67, noDeducible: 16.66 });
  assert.equal(validarGasto({ fecha: '2026-02-15', base: '100', ivaPct: 21, concepto: 'x', deduciblePct: 150 }).errores.deduciblePct, 'El IVA deducible debe ser un porcentaje entre 0 y 100');
  assert.equal(validarGasto({ fecha: '2026-02-15', base: '100', ivaPct: 21, concepto: 'x', deduciblePct: '50' }).ok, true);
});

test('303: el coche al 50 % deduce 105 € (base 500), el bien 420 € (base 2.000) y la compra a la UE se devenga entera y se deduce la mitad', () => {
  const c = casillas303([fac], [coche, bien, ue], 2026, 1);
  assert.deepEqual([c['28'], c['29'], c['30'], c['31']], [500, 105, 2000, 420]);
  assert.deepEqual([c['10'], c['11'], c['36'], c['37']], [100, 21, 50, 10.5]);
  assert.equal(c['27'], 630 + 21);
  assert.equal(c['45'], 105 + 420 + 10.5);
  assert.equal(c['46'], 651 - 535.5);
  // El 390 suma lo mismo.
  const m = modelo390([fac], [coche, bien, ue], 2026);
  assert.equal(m.deducible, 535.5);
  assert.equal(m.resultado, 115.5);
});

test('IRPF: el IVA no deducible es gasto (1.105 € del coche) y el bien se amortiza por 4.420 €', () => {
  assert.equal(valorBien(bien), 4420);
  assert.equal(valorBien(bien, { ivaCoste: true }), 4840);
  assert.equal(valorBien({ ...bien, deduciblePct: undefined }), 4000);
  const sinBien = resumenAnual([fac], [coche, ue], 2026, {}, ['a']).trimestres[0];
  // Coche 1.000 + 105 no deducibles; software 100 + 10,50 del IVA autoliquidado que no se deduce.
  assert.equal(r(sinBien.gastos), 1215.5);
  assert.equal(sinBien.m303, casillas303([fac], [coche, ue], 2026, 1)['46']);
  assert.equal(r(sinBien.ivaDed), r(105 + 10.5 - 21));
});

test('Sociedades: el IVA no deducible también es gasto', () => {
  const b = borradorSociedades([fac], [coche], 2026);
  assert.equal(b.gastos, 1105);
});

test('contabilidad: 1.105 € a la cuenta de gasto y solo 105 € a la 472; el proveedor, 1.210 €; la UE, 472 por 10,50 y 477 por 21', () => {
  const A = generarAsientos({ facturas: [], gastos: [{ ...coche, pendiente: true }, { ...ue, pendiente: true }], fiscal }, '2026-12-31');
  const asiento = (id) => A.find((a) => a.origen?.tipo === 'gasto' && a.origen.id === id);
  const l = (a, cta) => a.lineas.filter((x) => x.cuenta === cta).reduce((s, x) => s + x.debe - x.haber, 0);
  const a1 = asiento('g1');
  assert.equal(r(l(a1, '472')), 105);
  assert.equal(r(a1.lineas.filter((x) => /^6/.test(x.cuenta)).reduce((s, x) => s + x.debe, 0)), 1105);
  assert.equal(r(a1.lineas.reduce((s, x) => s + x.haber, 0)), 1210);
  const a3 = asiento('g3');
  assert.deepEqual([r(l(a3, '472')), r(l(a3, '477'))], [10.5, -21]);
  for (const a of A) assert.equal(r(a.lineas.reduce((s, x) => s + x.debe - x.haber, 0)), 0, a.concepto);
});

test('libros registro: cuota soportada 210, cuota deducible 105 y gasto deducible 1.105', () => {
  const l = librosRegistro({ facturas: [fac], gastos: [coche], fiscal, actividades: [{ id: 'a', nombre: 'Servicios' }], empresa: { nombre: 'Prueba', nif: '12345678Z' } }, 2026, '2026-12-31');
  const texto = JSON.stringify(l.hojas.find((a) => a.hoja === 'RECIBIDAS_GASTOS').filas);
  assert.match(texto, /"210[.,]00"/);
  assert.match(texto, /"105[.,]00"/);
  assert.match(texto, /"1105[.,]00"/);
  assert.equal(l.totales.ivaSoportado, 105);
  assert.equal(l.totales.gastos, 1105);
});

const r = (n) => Math.round(n * 100) / 100;

test('libros registro (auditoría C1-12): el gasto deducible del IRPF es el del 130, solo la parte afecta a la actividad', () => {
  // Base 100 €, IVA 21 % deducible al 50 % y nada afecto en el IRPF: el 130 cuenta 0 € de gasto, el libro también.
  const g = { id: 'mixto', fecha: '2026-03-10', actividad: 'a', concepto: 'Teléfono', proveedor: 'Tel', proveedorNif: 'B12345674', base: 100, ivaPct: 21, deduciblePct: 50, afectoPct: 0 };
  const datos = { facturas: [fac], gastos: [g], fiscal, actividades: [{ id: 'a', nombre: 'Servicios' }], empresa: { nombre: 'Prueba', nif: '12345678Z' } };
  assert.equal(librosRegistro(datos, 2026, '2026-12-31').totales.gastos, 0);
  assert.equal(resumenAnual([fac], [g], 2026).trimestres[0].gastos, 0);
  // Afecto al 50 % con el IVA deducible al 50 %: la mitad de la base; el IVA no deducido es el de la parte privada (costeAfecto).
  const g50 = { ...g, afectoPct: 50 };
  assert.equal(librosRegistro({ ...datos, gastos: [g50] }, 2026, '2026-12-31').totales.gastos, 50);
  assert.equal(resumenAnual([fac], [g50], 2026).trimestres[0].gastos, 50);
});
