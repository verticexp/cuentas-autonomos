import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionarCuotas, mesesEntre, tarifaPlana, esCuota } from '../lib/cuotas.js';
import { panelResumen } from '../lib/panel.js';
import { casillas303 } from '../lib/calculos.js';
import { modelo349 } from '../lib/modelos.js';

test('cuotas: de enero a septiembre, nueve meses', () => {
  const m = mesesEntre('2026-01', '2026-09');
  assert.equal(m.length, 9);
  assert.equal(new Set(m).size, 9);
  assert.equal(m[0], '2026-01');
});

test('cuotas: la del banco (UUID) y la del formulario del mismo mes se unen en cuota-AAAA-MM', () => {
  const g = [
    { id: 'cuota-2026-09', fecha: '2026-09-30', concepto: 'Cuota de autónomos 2026-09', base: 88, ivaPct: 0 },
    { id: 'b301dfce-1', fecha: '2026-09-30', concepto: 'Cuota de autónomos', categoria: '642', base: 88.56, ivaPct: 0, banco: 'm1', deBanco: true },
    { id: 'cuota-2026-08', fecha: '2026-08-31', concepto: 'Cuota de autónomos 2026-08', base: 88.56, ivaPct: 0 },
    { id: 'otro', fecha: '2026-09-10', concepto: 'Gasolina', base: 40, ivaPct: 21 },
  ];
  const { guardar, borrar } = fusionarCuotas(g);
  assert.deepEqual(borrar, ['b301dfce-1']);
  assert.equal(guardar.length, 1);
  assert.equal(guardar[0].id, 'cuota-2026-09');
  assert.equal(guardar[0].base, 88.56);
  assert.equal(guardar[0].banco, 'm1');
  assert.ok(!esCuota(g[3]));
});

test('cuotas: tarifa plana por defecto de 2026', () => {
  assert.equal(tarifaPlana(2026), 88.56);
  assert.equal(tarifaPlana(2030), 88.56);
});

test('tarifa plana: rendimiento para la Seguridad Social = (beneficio + cuotas) × 0,93', () => {
  const facturas = [{ id: 'f1', fecha: '2026-03-01', base: 10000, ivaPct: 21, irpfPct: 15, actividad: 'dj', cliente: { nombre: 'A' } }];
  const gastos = mesesEntre('2026-01', '2026-09').map((m) => ({ id: `cuota-${m}`, fecha: `${m}-28`, concepto: 'Cuota', base: 88.56, ivaPct: 0, actividad: 'dj' }));
  const P = panelResumen({ facturas, gastos, emisor: { limite: 17094 }, anio: 2026, hoy: '2026-09-30', actividades: [{ id: 'dj' }] });
  assert.equal(P.cuotasSS, 797.04);
  assert.equal(P.beneficio, 9202.96);
  assert.equal(P.rendSS, 9300);
});

test('303 y 349: factura sin IVA a cliente con NIF-IVA alemán va a la 59 y al 349 con clave S', () => {
  const f = { id: 'f', fecha: '2026-08-10', base: 4450, ivaPct: 0, actividad: 'v', cliente: { nombre: 'GmbH', nif: 'DE361000528' } };
  assert.equal(casillas303([f], [], 2026, 3)['59'], 4450);
  const m = modelo349([f], 2026, 3);
  assert.deepEqual(m.operadores.map((o) => [o.nif, o.clave, o.base]), [['DE361000528', 'S', 4450]]);
});
