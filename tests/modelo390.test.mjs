// Importes del 390: casillas comunes de 2025 y 2026. Estas pruebas no validan las posiciones del fichero.
// Esperados calculados a mano; el 390 tiene que cuadrar con la suma de los cuatro 303 (27, 45 y 46).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, liquidaciones303 } from '../lib/calculos.js';
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

test('390 y prorrata: la venta de un bien de inversión va en la 107, se resta del volumen y no cuenta en la prorrata (arts. 104.Tres y 121)', async () => {
  const { prorrataAnio } = await import('../lib/calculos.js');
  const F = [fac('g', '2025-02-01', 6000, 21), fac('e', '2025-02-02', 4000, 0, { operacion: 'exenta' }), fac('furgo', '2025-06-01', 10000, 21, { accesoria: 'inversion' })];
  const { c } = modelo390(F, [], 2025);
  assert.deepEqual([c['99'], c['105'], c['107'], c['108']], [16000, 4000, 10000, 10000]);
  // Sin la furgoneta: 6.000 de 10.000 dan derecho a deducir, el 60 % (con ella saldría el 80 %).
  assert.equal(prorrataAnio(F, 2025), 60);
  assert.equal(c['118'], 60);
});

// Esperados independientes en céntimos. Hay actividad en los cuatro trimestres;
// el tercero tiene resultado negativo. Las dos facturas de fuera del ejercicio
// y el gasto de 2027 no deben entrar en el anual ni en sus cuatro 303.
for (const anio of [2025, 2026]) {
  test(`390 ${anio}: cuatro trimestres, tipos distintos, rectificación y deducción parcial sin cambiar importes`, () => {
    const F = [
      fac('t1', `${anio}-01-01`, 1000, 21),
      fac('t2', `${anio}-04-01`, 2000, 10),
      fac('t3', `${anio}-07-01`, 300, 4),
      fac('abono', `${anio}-09-30`, -100, 21, { rectifica: { id: 't1', fecha: `${anio}-01-01`, motivo: 'incobrable' } }),
      fac('t4', `${anio}-12-31`, 4000, 21),
      fac('anterior', `${anio - 1}-12-31`, 9000, 21),
      fac('siguiente', `${anio + 1}-01-01`, 8000, 21),
    ];
    const G = [
      gas('t1', `${anio}-03-31`, 200, 21),
      gas('t2', `${anio}-06-30`, 500, 10),
      gas('t3', `${anio}-09-30`, 1000, 21),
      gas('t4', `${anio}-12-31`, 1000, 21, { deduciblePct: 50 }),
      gas('siguiente', `${anio + 1}-01-01`, 7000, 21),
    ];
    // Cuotas devengadas: 210, 200, 12 - 21, 840.
    // Cuotas deducibles: 42, 50, 210, 105 (el 50 % de 210).
    const devengado = [21000, 20000, -900, 84000];
    const deducible = [4200, 5000, 21000, 10500];
    const resultados = [16800, 15000, -21900, 73500];
    const centimos = (x) => Math.round(x * 100);
    const q = [1, 2, 3, 4].map((t) => casillas303(F, G, anio, t));
    assert.deepEqual(q.map((c) => centimos(c['27'])), devengado);
    assert.deepEqual(q.map((c) => centimos(c['45'])), deducible);
    assert.deepEqual(q.map((c) => centimos(c['46'])), resultados);
    const m = modelo390(F, G, anio);
    assert.deepEqual(m.avisos, []);
    assert.deepEqual(m.trimestres.map(centimos), resultados);
    for (const [k390, k303, esperado] of [['47', '27', 124100], ['64', '45', 40700], ['65', '46', 83400]]) {
      assert.equal(centimos(m.c[k390]), esperado, `casilla ${k390}: esperado independiente`);
      assert.equal(centimos(m.c[k390]), q.reduce((s, c) => s + centimos(c[k303]), 0), `casilla ${k390}: suma de los cuatro 303`);
    }
    assert.equal(centimos(m.resultado), 83400);
    assert.equal(centimos(m.devengado), 124100);
    assert.equal(centimos(m.deducible), 40700);
    assert.equal(centimos(m.c['95']), 83400);
    assert.equal(centimos(m.c['95']), liquidaciones303(F, G, anio).reduce((s, l) => s + centimos(l.ingresar), 0));
  });

  test(`390 ${anio}: año sin actividad y saldo a compensar tras los cuatro trimestres`, () => {
    const vacio = modelo390([], [], anio);
    assert.deepEqual(vacio.trimestres, [0, 0, 0, 0]);
    assert.deepEqual([vacio.c['47'], vacio.c['64'], vacio.c['65'], vacio.resultado], [0, 0, 0, 0]);
    const F = [fac('venta', `${anio}-06-30`, 1000, 21)];
    const G = [gas('compra', `${anio}-03-31`, 10000, 21), gas('ultima', `${anio}-12-31`, 1000, 21)];
    const m = modelo390(F, G, anio);
    assert.deepEqual(m.trimestres, [-2100, 210, 0, -210]);
    assert.deepEqual([m.c['47'], m.c['64'], m.c['65'], m.resultado], [210, 2310, -2100, -2100]);
    // 1.890 pendientes de los primeros trimestres y 210 nuevos en el cuarto.
    assert.deepEqual([m.c['95'], m.c['97'], m.c['98'], m.c['662']], [0, 210, 0, 1890]);
  });
}
