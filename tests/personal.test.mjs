import test from 'node:test';
import assert from 'node:assert/strict';
import { asientosPersonal, totalesPersonal } from '../lib/personal.js';
import { generarAsientos, limpiarAsiento, pygContable } from '../lib/asientos.js';
import { r2 } from '../lib/calculos.js';

const base = { fecha: '2026-09-30', sueldos: '5.000,00', irpf: '650', ssTrabajador: '317,50', ssEmpresa: '1.582,50' };
const suma = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));

test('personal: el devengo separa sueldos, IRPF, SS del trabajador, SS de la empresa y líquido', () => {
  const { asientos, error } = asientosPersonal({ ...base, otros: [{ cuenta: '641', importe: '500' }, { cuenta: '649', importe: '100,50' }] });
  assert.equal(error, undefined);
  assert.equal(asientos.length, 1);
  const por = Object.fromEntries(asientos[0].lineas.map((l) => [l.cuenta, l]));
  assert.equal(por['640'].debe, 5000); assert.equal(por['641'].debe, 500); assert.equal(por['649'].debe, 100.5); assert.equal(por['642'].debe, 1582.5);
  assert.equal(por['4751'].haber, 650);
  assert.equal(por['476'].haber, 1900); // 317,50 del trabajador + 1.582,50 de la empresa
  assert.equal(por['465'].haber, 4633); // 5.000 + 600,50 − 650 − 317,50
  assert.equal(suma(asientos[0].lineas, 'debe'), suma(asientos[0].lineas, 'haber'));
  assert.equal(limpiarAsiento(asientos[0]).error, undefined);
});

test('personal: los pagos salen con su fecha y solo si se piden', () => {
  const { asientos } = asientosPersonal({ ...base, pagoLiquido: '2026-10-01', pagoSS: '2026-10-30' });
  assert.deepEqual(asientos.map((a) => a.fecha), ['2026-09-30', '2026-10-01', '2026-10-30']);
  assert.deepEqual(asientos[1].lineas, [{ cuenta: '465', debe: 4032.5, haber: 0 }, { cuenta: '572', debe: 0, haber: 4032.5 }]);
  assert.deepEqual(asientos[2].lineas, [{ cuenta: '476', debe: 1900, haber: 0 }, { cuenta: '572', debe: 0, haber: 1900 }]);
});

test('personal: valida los datos', () => {
  assert.match(asientosPersonal({ ...base, fecha: '' }).error, /Fecha/);
  assert.match(asientosPersonal({ ...base, sueldos: '' }).error, /sueldos/);
  assert.match(asientosPersonal({ ...base, otros: [{ cuenta: '629', importe: '10' }] }).error, /personal/);
  assert.match(asientosPersonal({ ...base, otros: [{ cuenta: '642', importe: '10' }] }).error, /personal/);
  assert.match(asientosPersonal({ ...base, irpf: '5000' }).error, /superan/);
  assert.match(asientosPersonal({ ...base, pagoSS: '30/10/2026' }).error, /pago/);
  assert.equal(totalesPersonal({ ...base }).gasto, 6582.5);
});

test('personal: el asiento llega al diario y al gasto de personal de pérdidas y ganancias', () => {
  const { asientos } = asientosPersonal({ ...base, otros: [{ cuenta: '641', importe: '500' }] });
  const manuales = asientos.map((a, i) => ({ id: `m${i}`, ...limpiarAsiento(a) }));
  const diario = generarAsientos({ manuales }, '2026-12-31');
  assert.ok(diario.some((a) => a.fecha === '2026-09-30' && a.lineas.some((l) => l.cuenta === '640')));
  const pyg = pygContable(diario, { desde: '2026-01-01', hasta: '2026-12-31' });
  assert.equal(pyg.partidas.find((p) => p.id === 'personal').importe, -7082.5);
});
