// Territorio fiscal (lib/territorios.js): dónde presenta sus impuestos la empresa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { conTicketBai, datosTerritorio, esForal, OPCIONES_TERRITORIO, territorioDe } from '../lib/territorios.js';
import { limpiarFiscal, usaIgic } from '../lib/empresa.js';

test('el cuestionario guarda el territorio (sin dato o «comun», territorio común) y Canarias sigue siendo IGIC', () => {
  assert.deepEqual(OPCIONES_TERRITORIO.map(([k]) => k), ['comun', 'canarias', 'navarra', 'alava', 'bizkaia', 'gipuzkoa']);
  for (const t of ['navarra', 'alava', 'bizkaia', 'gipuzkoa', 'canarias']) assert.equal(limpiarFiscal({ territorio: t }).territorio, t);
  assert.equal(limpiarFiscal({ territorio: 'comun' }).territorio, undefined);
  assert.equal(limpiarFiscal({ territorio: 'marte' }).territorio, undefined);
  assert.equal(usaIgic(limpiarFiscal({ territorio: 'canarias' })), true);
  assert.equal(usaIgic(limpiarFiscal({ territorio: 'navarra' })), false);
});

test('foral: Navarra y el País Vasco; TicketBAI solo en el País Vasco', () => {
  assert.deepEqual(['comun', 'canarias', 'navarra', 'alava', 'bizkaia', 'gipuzkoa'].map((t) => esForal({ territorio: t })), [false, false, true, true, true, true]);
  assert.deepEqual(['navarra', 'alava', 'bizkaia', 'gipuzkoa'].map((t) => conTicketBai({ territorio: t })), [false, true, true, true]);
  assert.equal(territorioDe({}), 'comun');
  assert.equal(datosTerritorio({ territorio: 'bizkaia' }).hacienda, 'Hacienda Foral de Bizkaia');
  for (const [k] of OPCIONES_TERRITORIO) assert.match(datosTerritorio({ territorio: k }).sede, /^https:\/\//);
});

test('plazos forales de 2026 como en los calendarios oficiales (con el día hábil siguiente)', async () => {
  const { plazoForal } = await import('../lib/territorios.js');
  const p = (t, c) => [1, 2, 3, 4].map((q) => plazoForal(t, c, q, 2026));
  // IVA: Bizkaia y Álava (303) y Gipuzkoa (300) hasta el 25 (el 4T va en el 390, en enero); Navarra (F-69), el 2T hasta el 5 de agosto.
  for (const t of ['bizkaia', 'alava', 'gipuzkoa']) assert.deepEqual(p(t, 'iva'), ['2026-04-27', '2026-07-27', '2026-10-26', '2027-02-01']);
  assert.deepEqual(p('navarra', 'iva'), ['2026-04-20', '2026-08-05', '2026-10-20', '2027-02-01']);
  // Pago fraccionado del IRPF: Gipuzkoa y Álava hasta el 10 del mes siguiente; Bizkaia hasta el 25; Navarra como el F-69.
  assert.deepEqual(p('gipuzkoa', 'irpf'), ['2026-05-11', '2026-08-10', '2026-11-10', '2027-02-10']);
  assert.deepEqual(p('alava', 'irpf'), ['2026-05-11', '2026-08-10', '2026-11-10', '2027-02-10']);
  assert.deepEqual(p('bizkaia', 'irpf'), ['2026-04-27', '2026-07-27', '2026-10-26', '2027-01-25']);
  assert.deepEqual(p('navarra', 'irpf'), p('navarra', 'iva'));
  // Retenciones: 110/115 hasta el 25 (4T: Bizkaia el 25 de enero, Gipuzkoa y Álava todo enero); Navarra (715/759) hasta el 20.
  assert.deepEqual(p('gipuzkoa', 'ret'), ['2026-04-27', '2026-07-27', '2026-10-26', '2027-02-01']);
  assert.deepEqual(p('navarra', 'ret'), ['2026-04-20', '2026-07-20', '2026-10-20', '2027-01-20']);
  assert.equal(plazoForal('comun', 'iva', 1, 2026), null);
});

test('pago fraccionado foral: Navarra por tramos, País Vasco al 5 % menos retenciones y los años de inicio', async () => {
  const { pagoFraccionadoForal, pctNavarra } = await import('../lib/territorios.js');
  assert.deepEqual([6499, 6500, 12000, 12000.01, 24000, 36000, 36000.01].map(pctNavarra), [0, 6, 6, 12, 12, 18, 24]);
  // Navarra: 18 % de 30.000 = 5.400, menos 1.200 de retenciones = 4.200 al año: 1.050 cada trimestre.
  assert.deepEqual(pagoFraccionadoForal('navarra', { rendPenultimo: 30000, retPenultimo: 1200 }).pagos, [1050, 1050, 1050, 1050]);
  // Bizkaia y Gipuzkoa: 5 % de 30.000 = 1.500 menos un cuarto de 1.200 = 1.200 cada trimestre; Álava, igual pero de oficio.
  for (const t of ['bizkaia', 'gipuzkoa']) assert.deepEqual(pagoFraccionadoForal(t, { rendPenultimo: 30000, retPenultimo: 1200 }).pagos, [1200, 1200, 1200, 1200]);
  assert.equal(pagoFraccionadoForal('alava', { rendPenultimo: 30000 }).deOficio, true);
  // Bizkaia sin rendimiento positivo: 0,5 % de las ventas del penúltimo año.
  assert.deepEqual(pagoFraccionadoForal('bizkaia', { rendPenultimo: -500, ingresosPenultimo: 40000 }).pagos, [200, 200, 200, 200]);
  // Años de inicio, con lo de cada trimestre (5.000 de ingresos, 1.000 de gastos y 300 de retenciones).
  const T = [{ ingresos: 5000, gastos: 1000, retenciones: 300 }, { ingresos: 5000, gastos: 1000, retenciones: 300 }];
  assert.deepEqual(pagoFraccionadoForal('bizkaia', { anio: 2026, anioInicio: 2025, trimestres: T }).pagos, [500, 500]);
  assert.deepEqual(pagoFraccionadoForal('alava', { anio: 2026, anioInicio: 2026, trimestres: T }).pagos, [0, 0]);
  assert.equal(pagoFraccionadoForal('alava', { anio: 2026, anioInicio: 2025, trimestres: T }).deOficio, true);
  // Navarra, modalidad 2: 4.000 en el 1T son 16.000 al año (12 %): 480 − 300 = 180; en el 2T, 12 % de 8.000 − 600 − 180 = 180.
  assert.deepEqual(pagoFraccionadoForal('navarra', { anio: 2026, anioInicio: 2026, trimestres: T }).pagos, [180, 180]);
  assert.equal(pagoFraccionadoForal('navarra', {}).metodo, 'sin-datos');
});

test('tipo foral del Impuesto sobre Sociedades según la cifra de negocios', async () => {
  const { tipoISForal } = await import('../lib/territorios.js');
  assert.deepEqual([900000, 1e6, 1000001, 19999999, 20e6].map((c) => tipoISForal('navarra', c)), [19, 19, 23, 23, 28]);
  assert.deepEqual([2e6, 10e6, 10000001].map((c) => tipoISForal('bizkaia', c)), [20, 20, 24]);
  assert.equal(tipoISForal('comun', 1), null);
});
