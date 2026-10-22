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
