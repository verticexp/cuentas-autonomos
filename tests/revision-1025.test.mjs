// Regresiones de la revisión del 25-10-2026 (fallos 1, 2, 4, 5 y 12): retención que no baja del mínimo, prorrata de las
// pagas extra en meses incompletos, tipo de los no residentes, trimestres ya presentados y 130 agrícola fuera del REAGP.
import test from 'node:test';
import assert from 'node:assert/strict';
import { limpiarCotizacion, limpiarDatos145, nominaCompleta } from '../lib/nominas.js';
import { emitidasDespues, fechaDevengo, opciones130 } from '../lib/calculos.js';
import { limpiarFiscal, trimestresPresentados } from '../lib/empresa.js';
import { errorNoResidente } from '../lib/noResidentes.js';
import { fechaEnCierre } from '../lib/cierres.js';

const empleado = (extra = {}) => ({
  nombre: 'Ana', nif: '12345678Z', bruto: 3000, horasSemana: 40, irpfPct: 12, alta: '2025-01-01',
  cotizacion: limpiarCotizacion({ grupo: 1, pagas: 2, prorrateadas: true }),
  datos145: limpiarDatos145({ nacimiento: 1990, situacionFamiliar: 3 }, '12345678Z'),
  ...extra,
});

test('fallo 1: la retención de un administrador no baja del 35 % (ni del 19 % en la sociedad pequeña) aunque se pida a mano', () => {
  const asimilado = empleado({ cotizacion: limpiarCotizacion({ grupo: 1, pagas: 2, prorrateadas: true, administrador: 'asimilado' }) });
  const n = nominaCompleta(asimilado, { bruto: 3000, irpfPct: 0, mes: '2026-05' });
  assert.equal(n.irpfPct, 35);
  assert.equal(n.importes.irpf, 1050);
  assert.equal(n.detalle.irpf.bajoMinimo, 0);
  assert.equal(n.detalle.irpf.manual, false);
  const pequena = empleado({ cotizacion: limpiarCotizacion({ grupo: 1, pagas: 2, prorrateadas: true, administrador: 'asimilado', pequena: true }) });
  assert.equal(nominaCompleta(pequena, { bruto: 3000, irpfPct: 10, mes: '2026-05' }).importes.irpf, 570);
  // Pedir más sí se puede (art. 88.5 RIRPF).
  const mas = nominaCompleta(asimilado, { bruto: 3000, irpfPct: 40, mes: '2026-05' });
  assert.deepEqual([mas.irpfPct, mas.detalle.irpf.manual, mas.detalle.irpf.bajoMinimo], [40, true, undefined]);
});

test('fallo 1: un empleado con su 145 tampoco puede bajar del tipo calculado; sin 145, el de su ficha se puede cambiar', () => {
  const e = empleado();
  const calculado = nominaCompleta(e, { bruto: 3000, mes: '2026-05' }).irpfPct;
  assert.ok(calculado > 5);
  assert.equal(nominaCompleta(e, { bruto: 3000, irpfPct: 2, mes: '2026-05' }).irpfPct, calculado);
  assert.equal(nominaCompleta(e, { bruto: 3000, irpfPct: calculado + 5, mes: '2026-05' }).irpfPct, calculado + 5);
  const sin145 = empleado({ datos145: undefined });
  assert.equal(nominaCompleta(sin145, { bruto: 3000, irpfPct: 2, mes: '2026-05' }).irpfPct, 2);
});

test('fallo 2: en un mes incompleto, la prorrata de las pagas extra no prorrateadas va por los días de alta', () => {
  // 3.000 € al mes y dos pagas de 3.000 € fuera del sueldo: prorrata mensual de 500 €. Alta el 16 de abril (15 días).
  const e = empleado({ alta: '2026-04-16', cotizacion: limpiarCotizacion({ grupo: 1, pagas: 2, prorrateadas: false }) });
  const abril = nominaCompleta(e, { bruto: 1500, mes: '2026-04' });
  assert.equal(abril.detalle.base, 1750);
  assert.equal(abril.detalle.prorrata, 250);
  // El mes entero, la prorrata entera.
  const mayo = nominaCompleta(e, { bruto: 3000, mes: '2026-05' });
  assert.equal(mayo.detalle.base, 3500);
  assert.equal(mayo.detalle.prorrata, 500);
});

test('fallo 4: sin convenio, el tipo del no residente depende del país y de la renta', () => {
  assert.match(errorNoResidente({ pais: 'US', clave: 19, pct: 19 }), /24 %/);
  assert.match(errorNoResidente({ pais: 'FR', clave: 19, pct: 24 }), /19 %/);
  assert.equal(errorNoResidente({ pais: 'FR', clave: 19, pct: 19 }), '');
  assert.equal(errorNoResidente({ pais: 'US', clave: 19, pct: 24 }), '');
  // Intereses: 19 % a cualquier residente (art. 25.1.f TRLIRNR).
  assert.equal(errorNoResidente({ pais: 'US', clave: 2, pct: 19 }), '');
  // Un convenio solo puede bajar del tipo sin convenio.
  assert.match(errorNoResidente({ pais: 'FR', clave: 19, pct: 20, motivo: 'convenio' }), /19 %/);
  assert.equal(errorNoResidente({ pais: 'US', clave: 19, pct: 15, motivo: 'convenio' }), '');
});

test('fallo 5: facturas emitidas después del trimestre en el que cuentan por su fecha de operación', () => {
  const facturas = [
    { id: 'a', numero: 1, anio: 2026, serie: '', fecha: '2026-05-05', evento: { fecha: '2026-03-20' }, base: 100, ivaPct: 21 },
    { id: 'b', numero: 2, anio: 2026, serie: '', fecha: '2026-03-25', base: 100, ivaPct: 21 },
    { id: 'c', numero: 3, anio: 2026, serie: '', fecha: '2026-04-10', evento: { fecha: '2026-04-02' }, base: 100, ivaPct: 21 },
  ];
  assert.deepEqual(emitidasDespues(facturas, 2026, 1).map((f) => f.id), ['a']);
  assert.deepEqual(emitidasDespues(facturas, 2026, 2), []);
  // Con el criterio de caja cuentan por su cobro: no se avisan.
  assert.deepEqual(emitidasDespues(facturas, 2026, 1, { desde: '2026-01-01' }), []);
  // Un trimestre cerrado por la gestoría se protege también por la fecha de la operación (lib/facturas.js).
  const cierres = { '2026-1': { fecha: '2026-04-15T10:00:00Z', despacho: 'Gestoría Ferrer' } };
  assert.equal(fechaEnCierre(cierres, facturas[0].fecha), null);
  assert.match(fechaEnCierre(cierres, facturas[0].fecha, fechaDevengo(facturas[0])), /1T 2026 está cerrado/);
});

test('fallo 5: trimestres presentados con el 303 o, sin su marca, con el 130', () => {
  const u = { pres303: { 2026: { 1: true, 2: false } }, pagos130: { 2026: { 2: 150, 3: 0 } } };
  assert.deepEqual(trimestresPresentados(u).sort(), ['2026-1', '2026-3']);
  assert.deepEqual(trimestresPresentados({}), []);
});

test('fallo 12: la actividad agrícola fuera del REAGP también va por el apartado II del 130', () => {
  assert.equal(opciones130({ tipo: 'autonomo', iva: 'general', agricola: true }, {}, 2026).agricola, true);
  assert.equal(opciones130({ tipo: 'autonomo', iva: 'reagp' }, {}, 2026).agricola, true);
  assert.equal(opciones130({ tipo: 'autonomo', iva: 'general' }, {}, 2026).agricola, undefined);
  assert.equal(limpiarFiscal({ tipo: 'autonomo', iva: 'general', agricola: true }).agricola, true);
  assert.equal(limpiarFiscal({ tipo: 'sociedad', iva: 'general', agricola: true }).agricola, undefined);
  assert.equal(limpiarFiscal({ tipo: 'autonomo', iva: 'general', irpf: 'modulos', agricola: true }).agricola, undefined);
});
