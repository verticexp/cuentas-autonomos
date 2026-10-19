// Cifras del Resumen calculadas a mano: si un cambio las mueve, no se publica.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { panelResumen } from '../lib/panel.js';
import { importes, r2, resumenAnual } from '../lib/calculos.js';

const f = (id, fecha, base, irpfPct, cobrada, cliente, ivaPct = 21) => ({ id, numero: 1, anio: Number(fecha.slice(0, 4)), fecha, actividad: 'dj', cliente: { nombre: cliente }, base, ivaPct, irpfPct, cobrada });
const g = (id, fecha, base, ivaPct = 21) => ({ id, fecha, actividad: 'dj', concepto: id, base, ivaPct });
const FACTURAS = [
  f('F1', '2026-01-10', 1000, 15, true, 'Ana'), // IVA 210, IRPF 150, total 1060
  f('F2', '2026-02-15', 500, 0, true, 'Bea'), //   IVA 105, total 605
  f('F3', '2026-05-20', 2000, 15, false, 'Ana'), // IVA 420, IRPF 300, total 2120
  f('F4', '2026-08-01', 800, 15, false, 'Carla'), // IVA 168, IRPF 120, total 848
  f('F5', '2025-12-01', 300, 15, false, 'Dani'), // del año pasado, sin cobrar: total 318
];
const GASTOS = [g('G1', '2026-01-20', 100), g('G2', '2026-07-10', 200), g('G3', '2026-08-15', 50, 0)];
const EMISOR = { plazo: 30, limite: 17094 };

test('trimestres: 303 y 130 con el 5 % de difícil justificación y lo ya pagado', () => {
  const [q1, q2, q3] = resumenAnual(FACTURAS, GASTOS, 2026, { 1: 116, 2: 80 }).trimestres;
  assert.deepEqual([q1.m303, q1.difJust, q1.rendAcum, q1.m130], [294, 70, 1330, 116]);
  assert.deepEqual([q2.m303, q2.rendAcum, q2.retAcum, q2.m130], [420, 3230, 450, 80]);
  assert.deepEqual([q3.m303, q3.difJust, q3.rendAcum, q3.retAcum, q3.m130], [126, 197.5, 3752.5, 570, 0]);
  // Si el 1T no se pagó, su 130 se arrastra al 2T.
  assert.equal(resumenAnual(FACTURAS, GASTOS, 2026, {}).trimestres[1].m130, 196);
});

test('Resumen el 1 de octubre con el 3T sin presentar', () => {
  const P = panelResumen({ facturas: FACTURAS, gastos: GASTOS, pagos130: { 2026: { 1: 116, 2: 80 } }, emisor: EMISOR, hoy: '2026-10-01' });
  assert.deepEqual([P.facturado, P.gastado, P.beneficio], [4300, 350, 3950]);
  assert.deepEqual([P.plazo.t, P.plazo.dias, P.debe.t, P.aPagar], [3, 19, 3, 126]);
  assert.equal(P.apartado, 0); // 4T: aún nada
  assert.deepEqual([P.porCobrar, P.sinCobrar.length], [3286, 3]); // incluye la de 2025
  assert.deepEqual([P.vencidas.length, P.totalVencidas], [3, 3286]);
  assert.equal(P.cambio, null);
  assert.equal(P.ultimoMes, 7); // agosto
  assert.deepEqual(P.meses.map((m) => m.ing), [1000, 500, 0, 0, 2000, 0, 0, 800, 0, 0, 0, 0]);
  assert.deepEqual(P.meses.map((m) => m.gas), [100, 0, 0, 0, 0, 0, 200, 50, 0, 0, 0, 0]);
  assert.deepEqual(P.top[0], ['Ana', 3000]);
});

test('Hacienda: el 130 pendiente no se cuenta dos veces', () => {
  // 5 de julio, 2T sin presentar: a pagar 303 420 + 130 80 = 500; aún no cuentan los documentos de agosto.
  const P = panelResumen({ facturas: FACTURAS, gastos: GASTOS, pagos130: { 2026: { 1: 116 } }, emisor: EMISOR, hoy: '2026-07-05' });
  assert.deepEqual([P.debe.t, P.aPagar, P.apartado], [2, 500, 0]);
  // Con el 2T ya presentado y pagado, solo queda lo del 3T.
  const Q = panelResumen({ facturas: FACTURAS, gastos: GASTOS, pagos130: { 2026: { 1: 116, 2: 80 } }, emisor: EMISOR, hoy: '2026-07-05' });
  assert.deepEqual([Q.debe, Q.aPagar, Q.apartado], [null, 0, 0]);
});

test('IVA a compensar (303 negativo) no suma como pago', () => {
  const P = panelResumen({ facturas: [f('X', '2026-04-10', 100, 15, true, 'A')], gastos: [g('Y', '2026-04-11', 1000)], emisor: EMISOR, hoy: '2026-07-05' });
  assert.equal(P.debe.m303, -189);
  assert.equal(P.aPagar, 0);
});

// Con los datos reales de partida: lo que se enseña en distintos sitios tiene que cuadrar entre sí.
test('cuadre con datos reales', () => {
  const { facturas, gastos } = JSON.parse(readFileSync(new URL('../data/inicial.json', import.meta.url)));
  for (const hoy of ['2026-01-15', '2026-04-10', '2026-07-05', '2026-10-01', '2026-12-31']) {
    const P = panelResumen({ facturas, gastos, emisor: { plazo: 30 }, hoy });
    const delAnio = (l) => l.filter((x) => x.fecha.startsWith('2026-') && x.fecha <= hoy);
    const qs = P.r.trimestres;
    const sum = (l, k) => r2(l.reduce((s, x) => s + x[k], 0));
    assert.equal(P.facturado, sum(delAnio(facturas), 'base'), hoy);
    assert.equal(P.gastado, sum(delAnio(gastos), 'base'), hoy);
    assert.equal(P.beneficio, r2(P.facturado - P.gastado), hoy);
    assert.equal(sum(qs, 'ingresos'), P.facturado, hoy);
    assert.equal(sum(qs, 'gastos'), P.gastado, hoy);
    assert.equal(r2(P.meses.reduce((s, m) => s + m.ing, 0)), P.facturado, hoy);
    assert.equal(r2(P.meses.reduce((s, m) => s + m.gas, 0)), P.gastado, hoy);
    // El 303 de la tabla es el del trimestre entero, como en Impuestos (no se corta en hoy).
    const todoAnio = (l) => l.filter((x) => x.fecha.startsWith('2026-'));
    assert.equal(sum(qs, 'm303'), r2(sum(todoAnio(facturas).map(importes), 'iva') - sum(todoAnio(gastos).filter((x) => x.ivaPct > 0).map(importes), 'iva')), hoy);
    assert.equal(P.porCobrar, r2(facturas.filter((x) => !x.cobrada).reduce((s, x) => s + importes(x).total, 0)), hoy);
    assert.ok(qs.every((q) => q.m130 >= 0) && P.apartado >= 0 && P.aPagar >= 0, hoy);
    for (const [cliente, v] of P.top) assert.equal(v, sum(delAnio(facturas).filter((x) => x.cliente.nombre === cliente), 'base'), hoy);
  }
});

test('Hacienda por trimestre: el 303 y el 130 coinciden con Impuestos, aunque haya facturas con fecha posterior a hoy', async () => {
  const { casillas303, liquidaciones303 } = await import('../lib/calculos.js');
  const facturas = [...FACTURAS, f('F6', '2026-09-25', 1000, 15, false, 'Eva')];
  const P = panelResumen({ facturas, gastos: GASTOS, emisor: EMISOR, hoy: '2026-09-10' });
  const liq = liquidaciones303(facturas, GASTOS, 2026);
  for (const q of P.r.trimestres) {
    assert.equal(q.m303, casillas303(facturas, GASTOS, 2026, q.t)['46']);
    assert.equal(q.ivaIngresar, liq[q.t - 1].ingresar);
  }
  assert.equal(P.r.trimestres[2].ivaIngresar, 336); // 168 + 210 de F6 − 42 de G2
  // Con los datos de Impuestos aparte (lib/datosImpuestos.js), el 303 sale de ellos y no de los del panel.
  const Q = panelResumen({ facturas: FACTURAS, gastos: GASTOS, emisor: EMISOR, hoy: '2026-09-10', impuestos: { 2026: { facturas, gastos: GASTOS } } });
  assert.equal(Q.r.trimestres[2].ivaIngresar, 336);
});
