// Se ejecutan antes de cada despliegue: si alguna falla, no se publica.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { apartar, importes, siguienteNumero, resumenAnual, leerImporte, numeroFactura, proximoPlazo, vencimiento, vencida } from '../lib/calculos.js';

const { facturas, gastos } = JSON.parse(readFileSync(new URL('../data/inicial.json', import.meta.url)));

test('importes de una factura DJ', () => {
  assert.deepEqual(importes({ base: 480, ivaPct: 21, irpfPct: 15 }), { base: 480, iva: 100.8, irpf: 72, total: 508.8 });
  assert.equal(importes({ base: -2557.5, ivaPct: 21, irpfPct: 0 }).total, -3094.58);
});

test('130: acumulado, 5 % de difícil justificación y arrastre de lo no presentado', () => {
  const r = resumenAnual(facturas, gastos, 2026);
  const [q1, , q3] = r.trimestres;
  assert.equal(q1.ingresos, 2160);
  assert.equal(q1.m303, 405.21);
  assert.equal(q1.difJust, 96.48);
  assert.equal(q1.m130, 42.62);
  assert.equal(q3.rendAcum, 11970.27);
  assert.equal(q3.retAcum, 1647.93);
  assert.equal(q3.m130, 746.12);
  assert.equal(resumenAnual(facturas, gastos, 2026, { 1: 42.62 }).trimestres[2].m130, 703.5);
  assert.ok(resumenAnual(facturas, gastos, 2026, { 3: 746.12 }).trimestres[2].presentado);
});

test('apartar para Hacienda', () => {
  assert.deepEqual(apartar({ base: 1000, ivaPct: 21, irpfPct: 15 }), { iva: 210, irpf: 40, total: 250 });
  assert.deepEqual(apartar({ base: 1000, ivaPct: 21, irpfPct: 0 }), { iva: 210, irpf: 190, total: 400 });
});

test('series, plazos y vencimientos', () => {
  assert.equal(numeroFactura({ numero: 1, anio: 2026, serie: 'R' }), 'R01-2026');
  assert.equal(numeroFactura({ numero: 1, anio: 2026, serie: 'V' }), 'V2026-001');
  assert.equal(numeroFactura({ numero: 4, anio: 2026 }), '04-2026');
  assert.equal(siguienteNumero([{ numero: 1, anio: 2026, serie: 'V' }, { numero: 25, anio: 2026 }], 2026, 'V'), 2);
  assert.equal(siguienteNumero([{ numero: 1, anio: 2026, serie: 'V' }, { numero: 25, anio: 2026 }], 2026), 26);
  assert.equal(leerImporte('-100,50'), -100.5);
  assert.deepEqual(proximoPlazo('2026-09-26'), { t: 3, anio: 2026, fecha: '2026-10-20', dias: 24 });
  assert.equal(proximoPlazo('2026-01-15').anio, 2025);
  const f = { fecha: '2026-07-01', base: 100, ivaPct: 21, irpfPct: 15, cobrada: false };
  assert.equal(vencimiento(f, 60), '2026-08-30');
  assert.ok(vencida(f, 60, '2026-09-26'));
  assert.ok(!vencida({ ...f, cobrada: true }, 60, '2026-09-26'));
});
