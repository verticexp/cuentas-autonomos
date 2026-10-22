import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_IGIC, tipoIgicValido, casillas420, liquidaciones420, plazo420, modelo425 } from '../lib/igic.js';

const fac = (fecha, base, ivaPct, extra = {}) => ({ fecha, base, ivaPct, ...extra });
const gas = (fecha, base, ivaPct, extra = {}) => ({ fecha, base, ivaPct, ...extra });

test('tipos IGIC 2026 y validación', () => {
  assert.deepEqual(TIPOS_IGIC, [0, 1, 3, 5, 7, 9.5, 15, 20]);
  assert.equal(Object.isFrozen(TIPOS_IGIC), true);
  for (const p of TIPOS_IGIC) assert.equal(tipoIgicValido(p), true);
  assert.equal(tipoIgicValido(21), false);
});

test('420: seis casillas por tipo, cero, rectificación, deducciones, ISP, importación y compensación agraria', () => {
  const facturas = [fac('2026-02-02', 100, 7), fac('2026-02-03', 100, 7), fac('2026-02-04', 50, 3), fac('2026-02-05', 100, 0), fac('2026-03-01', -20, 7, { rectifica: { id: 'f1' } }), fac('2026-03-02', 200, 0, { operacion: 'exportacion' })];
  const gastos = [gas('2026-02-10', 100, 7), gas('2026-02-11', 4000, 7, { inversion: true }), gas('2026-02-12', 200, 5, { importacion: true }), gas('2026-02-13', 100, 3, { isp: true }), gas('2026-02-14', 100, 0, { compensacion: 12 })];
  const c = casillas420(facturas, gastos, 2026, 1);
  assert.deepEqual([c['01'], c['02'], c['03'], c['04'], c['05'], c['06']], [200, 7, 14, 50, 3, 1.5]);
  assert.deepEqual([c['07'], c['08'], c['09']], [100, 0, 0]);
  assert.deepEqual([c['19'], c['20'], c['21'], c['22'], c['25']], [100, 3, -20, -1.4, 17.1]);
  assert.deepEqual([c['26'], c['27'], c['28'], c['29'], c['30'], c['31'], c['32'], c['33']], [200, 10, 4000, 280, 200, 10, 0, 0]);
  assert.deepEqual([c['34'], c['35'], c['36'], c['40'], c['41']], [0, 0, 12, 312, -294.9]);
  assert.equal(c['46'], 200);
  assert.equal(c['47'], 0);
  for (const k of ['23','24','37','38','39','42','44']) assert.equal(c[k], 0);
});

test('420: inversión del sujeto pasivo deduce solo la parte permitida; operación no sujeta va a 47', () => {
  const c = casillas420([fac('2026-04-01', 300, 0, { operacion: 'isp' })], [gas('2026-04-02', 100, 3, { isp: true, deduciblePct: 50 })], 2026, 2);
  assert.deepEqual([c['19'], c['20'], c['27'], c['41'], c['47']], [100, 3, 1.5, 1.5, 300]);
});

test('liquidaciones: saldo negativo se arrastra y se compensa en el trimestre siguiente; 4T devuelve saldo restante', () => {
  const f = [fac('2026-05-01', 1000, 7)];
  const g = [gas('2026-02-01', 2000, 7)];
  const l = liquidaciones420(f, g, 2026);
  assert.deepEqual(l.map((x) => [x.bruto, x.anterior, x['43'], x['45'], x.pendiente]), [[-140, 0, 0, -140, 140], [70, 140, 140, -70, 70], [0, 70, 70, -70, 70], [0, 70, 70, -70, 70]]);
  const dev = liquidaciones420(f, g, 2026, { devolucion4T: true });
  assert.deepEqual([dev[3].devolucion, dev[3].pendiente, dev[3]['45']], [70, 0, -70]);
});

test('más de seis tipos conserva los restantes en otros e informa el exceso', () => {
  const f = [0, 1, 3, 5, 7, 9.5, 15, 20].map((p) => fac('2026-01-10', 100, p));
  const c = casillas420(f, [], 2026, 1);
  assert.equal(c.demasiadosTipos, true);
  assert.deepEqual(c.otros.map((x) => x.pct), [1, 0]);
  assert.deepEqual(c.otros.map((x) => x.base), [100, 100]);
  assert.equal(c['25'], 60.5);
});

test('plazos 420: días 20 y fin de semana del 31 de enero', () => {
  assert.equal(plazo420(2026, 1), '2026-04-20');
  assert.equal(plazo420(2026, 2), '2026-07-20');
  assert.equal(plazo420(2026, 3), '2026-10-20');
  assert.equal(plazo420(2025, 4), '2026-02-02');
});

test('425 resume devengado por tipo, deducciones y resultado de cada trimestre', () => {
  const m = modelo425([fac('2026-01-10', 100, 7), fac('2026-04-10', 200, 3)], [gas('2026-01-12', 50, 7)], 2026);
  assert.deepEqual(m.devengadoPorTipo, [{ pct: 7, base: 100, cuota: 7 }, { pct: 3, base: 200, cuota: 6 }]);
  assert.equal(m.totalDevengado, 13);
  assert.deepEqual(m.deducciones, { corrientes: 3.5, bienesInversion: 0, importacionesCorrientes: 0, importacionesInversion: 0, rectificaciones: 0, compensaciones: 0, total: 3.5 });
  assert.deepEqual(m.resultadosTrimestrales, [3.5, 6, 0, 0]);
});
