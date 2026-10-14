import test from 'node:test';
import assert from 'node:assert/strict';
import { baseLinea, importes } from '../lib/calculos.js';
import { limpiarCierre } from '../lib/caja.js';
import { centimos, baseLineaIndependiente, importesIndependientes } from './apoyo/oraculo-numeros.mjs';

test('oráculo decimal: 2.000 facturas con cantidades fraccionarias, descuentos, varios IVA y rectificativas', () => {
  let seed = 23891;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
  for (let i = 0; i < 2000; i++) {
    const lineas = Array.from({ length: 1 + rnd(6) }, () => ({ cantidad: (1 + rnd(20000)) / 1000, precio: (i % 2 ? -1 : 1) * (1 + rnd(100000)) / 100, dto: rnd(10001) / 100, ivaPct: [0, 4, 10, 21][rnd(4)] }));
    const base = lineas.reduce((s, l) => s + baseLineaIndependiente(l), 0) / 100;
    const f = { base, lineas, irpfPct: [0, 7, 15][rnd(3)] };
    const actual = Object.fromEntries(Object.entries(importes(f)).map(([k, v]) => [k, centimos(v)]));
    assert.deepEqual(actual, importesIndependientes(f), `Factura ${i}`);
    for (const l of lineas) assert.equal(centimos(baseLinea(l)), baseLineaIndependiente(l));
  }
});

test('oráculo decimal: cierres de caja con céntimos y varios tipos conservan el dinero cobrado', () => {
  for (const total of [0.01, 0.03, 1, 10, 100, 100.01, 999.99]) {
    const f = limpiarCierre({ fecha: '2026-10-14', porIva: [{ pct: 21, total }, { pct: 10, total: 1.03 }], efectivo: total, otros: 0 });
    assert.ok(!f.error, f.error);
    assert.equal(importesIndependientes(f).total, centimos(total) + 103);
    assert.equal(centimos(importes(f).total), centimos(total) + 103);
  }
});
