import test from 'node:test';
import assert from 'node:assert/strict';
import { calculoNomina, gastoDeNomina, modelo111 } from '../lib/nominas.js';

test('nómina: neto, coste y gasto', () => {
  const n = { id: 'a', empleado: 'e1', empleadoNombre: 'Ana', mes: '2026-02', bruto: 2000, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 };
  const c = calculoNomina(n);
  assert.equal(c.irpf, 240); assert.equal(c.ssTrabajador, 130); assert.equal(c.neto, 1630);
  assert.equal(c.ssEmpresa, 633); assert.equal(c.coste, 2633);
  const g = gastoDeNomina(n, 'x');
  assert.equal(g.fecha, '2026-02-28'); assert.equal(g.base, 2633); assert.equal(g.ivaPct, 0);
  const m = modelo111([n, { ...n, id: 'b', mes: '2026-03' }, { ...n, id: 'c', mes: '2026-04' }], 2026, 1);
  assert.deepEqual([m.perceptores, m.percepciones, m.retenciones], [1, 4000, 480]);
});
