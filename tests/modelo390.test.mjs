// 390 con las casillas del diseño de registro de 2025 (DR390e2025 v1.02 e instrucciones del 390 de 2025, AEAT).
// Esperados calculados a mano; el 390 tiene que cuadrar con la suma de los cuatro 303 (27, 45 y 46).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303 } from '../lib/calculos.js';
import { modelo390 } from '../lib/modelos.js';

const fac = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'a', cliente: { nombre: 'Cliente', nif: 'B12345674' }, base, ivaPct, irpfPct: 0, ...x });
const gas = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'a', concepto: id, proveedor: 'Proveedor', base, ivaPct, ...x });
const facturas = [
  fac('a', '2025-02-01', 10000, 21),
  fac('b', '2025-05-01', 2000, 10),
  // Bienes usados: venta de 1.000 € que costó 600: margen 400, con el IVA dentro (330,58 + 69,42).
  fac('rebu', '2025-05-10', 1000, 21, { margen: 'rebu', lineas: [{ concepto: 'Mueble antiguo', cantidad: 1, precio: 1000, dto: 0, ivaPct: 21, coste: 600 }] }),
  fac('exp', '2025-06-01', 300, 0, { operacion: 'exportacion', cliente: { nombre: 'Acme Inc', nif: 'US123456', pais: 'US' } }),
  // Impago de una factura del 1T (art. 80.Cuatro LIVA): modificación aparte, en las 31 y 32.
  fac('r', '2025-09-01', -100, 21, { rectifica: { id: 'a', fecha: '2025-02-01', motivo: 'incobrable' } }),
];
const gastos = [
  gas('local', '2025-02-10', 1000, 21),
  gas('mercaderia-ue', '2025-03-10', 1000, 0, { proveedorNif: 'FR12345678901', categoria: '600', ivaAuto: 21 }),
  gas('software-ue', '2025-04-10', 500, 0, { proveedorNif: 'IE6388047V', categoria: '629', ivaAuto: 21 }),
  gas('dua', '2025-07-10', 800, 10, { importacion: true }),
];

test('390: devengado por régimen y tipo, modificaciones por impago y totales que cuadran con los 303', () => {
  const { c } = modelo390(facturas, gastos, 2025);
  const q = [1, 2, 3, 4].map((t) => casillas303(facturas, gastos, 2025, t));
  const suma = (k) => Math.round(q.reduce((s, x) => s + x[k], 0) * 100) / 100;
  assert.deepEqual([c['05'], c['06'], c['03'], c['04']], [10000, 2100, 2000, 200]);
  assert.deepEqual([c['11'], c['12']], [330.58, 69.42]); // REBU al 21 %, fuera del régimen ordinario
  assert.deepEqual([c['25'], c['26'], c['551'], c['552']], [1000, 210, 500, 105]);
  assert.deepEqual([c['29'] || 0, c['30'] || 0, c['31'], c['32']], [0, 0, -100, -21]);
  assert.equal(c['47'], suma('27'));
  assert.equal(c['64'], suma('45'));
  assert.equal(c['65'], Math.round(q.reduce((s, x) => s + x['46'], 0) * 100) / 100);
});

test('390: deducciones por bloque y tipo (interiores, importaciones, bienes y servicios de la UE)', () => {
  const { c } = modelo390(facturas, gastos, 2025);
  assert.deepEqual([c['605'], c['606'], c['48'], c['49']], [1000, 210, 1000, 210]);
  assert.deepEqual([c['619'], c['620'], c['52'], c['53']], [800, 80, 800, 80]);
  assert.deepEqual([c['629'], c['630'], c['56'], c['57']], [1000, 210, 1000, 210]);
  assert.deepEqual([c['637'], c['638'], c['597'], c['598']], [500, 105, 500, 105]);
});

test('390: volumen de operaciones (art. 121 LIVA) por régimen y operación', () => {
  const { c } = modelo390(facturas, gastos, 2025);
  // 10.000 + 2.000 − 100 en régimen general; en REBU, la venta sin el IVA del margen (1.000 − 69,42); 300 de exportación.
  assert.deepEqual([c['99'], c['227'], c['104'], c['108']], [11900, 930.58, 300, 13130.58]);
});

test('390: resultado de las liquidaciones (95) y prorrata (115-118)', () => {
  const F = [fac('g', '2025-02-01', 6000, 21), fac('e', '2025-02-02', 4000, 0, { operacion: 'exenta' })];
  const G = [gas('comun', '2025-02-10', 1000, 21)];
  const { c } = modelo390(F, G, 2025);
  assert.deepEqual([c['115'], c['116'], c['117'], c['118']], [10000, 6000, 'G', 60]);
  assert.deepEqual([c['605'], c['606']], [1000, 126]); // la base sin prorratear y la cuota al 60 %
  assert.equal(c['105'], 4000);
  assert.equal(c['95'], 1260 - 126);
});

test('390: saldo a compensar del último periodo (97) y cuotas a compensar del año (662)', () => {
  const G = [gas('maquina', '2025-03-10', 10000, 21), gas('otra', '2025-11-10', 1000, 21)];
  const { c } = modelo390([fac('v', '2025-06-01', 1000, 21)], G, 2025);
  // 1T −2.100 (a compensar), 2T 210 compensados, 4T −210: 97 = 210 y 662 = 2.100 − 210 = 1.890.
  assert.deepEqual([c['95'], c['97'], c['98'], c['662']], [0, 210, 0, 1890]);
});
