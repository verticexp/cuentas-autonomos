import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_UE, tiposPais, tipoValidoOss, esVentaOss, ventasUeB2c, umbralOss, modelo369, plazo369 } from '../lib/oss.js';

test('OSS: catálogo de los 26 países, congelado también en sus tipos', () => {
  assert.equal(Object.keys(TIPOS_UE).length, 26);
  assert.ok(Object.isFrozen(TIPOS_UE));
  for (const tipo of Object.values(TIPOS_UE)) {
    assert.ok(Object.isFrozen(tipo));
    assert.ok(Object.isFrozen(tipo.reducidos));
  }
  assert.deepEqual(TIPOS_UE.AT, { general: 20, reducidos: [10, 13] });
  assert.deepEqual(TIPOS_UE.RO, { general: 21, reducidos: [11] });
  assert.deepEqual(TIPOS_UE.SK, { general: 23, reducidos: [5, 19] });
  assert.deepEqual(tiposPais('FR'), [20, 2.1, 5.5, 10, 0]);
  assert.deepEqual(tiposPais('FI'), [25.5, 10, 14, 0]);
  assert.deepEqual(tiposPais('IE'), [23, 4.8, 9, 13.5, 0]);
  assert.deepEqual(tiposPais('DK'), [25, 0]);
  assert.deepEqual(tiposPais('GR'), [24, 6, 13, 0]);
  assert.deepEqual(tiposPais('ES'), []);
  assert.deepEqual(tiposPais('EL'), []);
  assert.deepEqual(tiposPais('toString'), []);
});

test('OSS: el tipo debe ser numérico y admitido en ese país, incluido el cero', () => {
  assert.equal(tipoValidoOss('FR', 20), true);
  assert.equal(tipoValidoOss('FR', 5.5), true);
  assert.equal(tipoValidoOss('FI', 25.5), true);
  assert.equal(tipoValidoOss('DK', 0), true);
  assert.equal(tipoValidoOss('FR', 21), false);
  assert.equal(tipoValidoOss('ES', 0), false);
  assert.equal(tipoValidoOss('FR', '20'), false);
  assert.equal(tipoValidoOss('FR', null), false);
  assert.equal(tipoValidoOss('FR', NaN), false);
});

test('OSS: solo las facturas marcadas con un país válido son ventas OSS', () => {
  assert.equal(esVentaOss({ oss: { pais: 'FR' } }), true);
  assert.equal(esVentaOss({ oss: { pais: 'GR' } }), true);
  for (const pais of ['ES', 'GB', 'EL', 'fr', '', 'constructor', ['FR']]) {
    assert.equal(esVentaOss({ oss: { pais } }), false);
  }
  assert.equal(esVentaOss({}), false);
  assert.equal(esVentaOss({ oss: {} }), false);
  assert.equal(esVentaOss({ oss: null }), false);
  assert.equal(esVentaOss(null), false);
});

const F = [
  { fecha: '2026-01-10', base: 100, ivaPct: 20, oss: { pais: 'FR' } },
  { fecha: '2026-02-10', base: 1200, oss: { pais: 'FR' }, lineas: [
    { cantidad: 1, precio: 200, ivaPct: 20 },
    { cantidad: 2, precio: 500, ivaPct: 5.5 },
  ] },
  { fecha: '2026-03-10', base: -50, ivaPct: 20, serie: 'R', oss: { pais: 'FR' } },
  { fecha: '2026-01-20', base: 300, ivaPct: 19, oss: { pais: 'DE' } },
  { fecha: '2026-03-20', base: 100, ivaPct: 19, oss: { pais: 'DE' } },
  { fecha: '2026-04-01', base: 900, ivaPct: 20, oss: { pais: 'FR' } },
  { fecha: '2025-01-01', anio: 2026, base: 800, ivaPct: 20, oss: { pais: 'FR' } },
  { fecha: '2026-01-01', base: 700, ivaPct: 21 },
  { fecha: '2026-01-01', base: 600, ivaPct: 21, oss: { pais: 'ES' } },
];

test('369: agrupa países y tipos, resta rectificativas y filtra por fecha y trimestre', () => {
  assert.deepEqual(modelo369(F, 2026, 1), {
    paises: [
      { pais: 'DE', tipos: [{ pct: 19, base: 400, cuota: 76 }], base: 400, cuota: 76 },
      { pais: 'FR', tipos: [{ pct: 20, base: 250, cuota: 50 }, { pct: 5.5, base: 1000, cuota: 55 }], base: 1250, cuota: 105 },
    ],
    base: 1650, cuota: 181,
  });
  assert.deepEqual(modelo369(F, 2026, 2), {
    paises: [{ pais: 'FR', tipos: [{ pct: 20, base: 900, cuota: 180 }], base: 900, cuota: 180 }],
    base: 900, cuota: 180,
  });
});

test('369: respeta el redondeo de cada factura, las líneas negativas y el tipo cero', () => {
  const facturas = [
    { fecha: '2026-01-01', base: 0.03, ivaPct: 20, oss: { pais: 'FR' } },
    { fecha: '2026-01-02', base: 0.03, ivaPct: 20, oss: { pais: 'FR' } },
    { fecha: '2026-01-03', base: -0.03, serie: 'R', oss: { pais: 'FR' }, lineas: [{ cantidad: 1, precio: -0.03, ivaPct: 20 }] },
    { fecha: '2026-01-04', base: 0.1, ivaPct: 0, oss: { pais: 'FR' } },
    { fecha: '2026-01-05', base: 0.2, ivaPct: 0, oss: { pais: 'FR' } },
  ];
  assert.deepEqual(modelo369(facturas, 2026, 1), {
    paises: [{ pais: 'FR', tipos: [{ pct: 20, base: 0.03, cuota: 0.01 }, { pct: 0, base: 0.3, cuota: 0 }], base: 0.33, cuota: 0.01 }],
    base: 0.33, cuota: 0.01,
  });
  assert.equal(modelo369(facturas.slice(0, 2), 2026, 1).cuota, 0.02);
});

test('369: sin ventas OSS del periodo, todos los totales son cero', () => {
  const vacio = { paises: [], base: 0, cuota: 0 };
  assert.deepEqual(modelo369([], 2026, 1), vacio);
  assert.deepEqual(modelo369(F, 2026, 3), vacio);
  assert.deepEqual(modelo369([{ fecha: '2026-01-01', base: 100, ivaPct: 21 }], 2026, 1), vacio);
});

test('OSS: ventas anuales por fecha, sin IVA y con rectificativas', () => {
  assert.equal(ventasUeB2c(F, 2026), 2550);
  assert.equal(ventasUeB2c(F, 2025), 800);
  assert.equal(ventasUeB2c(F, 2024), 0);
  assert.deepEqual(umbralOss(F, 2026), { anio: 2550, anterior: 800, superado: false, limite: 10000 });
});

test('OSS: el umbral se supera solo por encima de 10.000 €, en el año o en el anterior', () => {
  const factura = (fecha, base, pais = 'FR') => ({ fecha, base, ivaPct: 20, oss: { pais } });
  const justo = [factura('2026-01-01', 6000), factura('2026-12-31', 4000, 'DE'), factura('2025-01-01', 10000)];
  assert.deepEqual(umbralOss(justo, 2026), { anio: 10000, anterior: 10000, superado: false, limite: 10000 });
  assert.deepEqual(umbralOss([...justo, factura('2026-12-31', 0.01)], 2026), { anio: 10000.01, anterior: 10000, superado: true, limite: 10000 });
  assert.deepEqual(umbralOss([factura('2026-01-01', 100), factura('2025-12-31', 10000.01)], 2026), { anio: 100, anterior: 10000.01, superado: true, limite: 10000 });
  assert.deepEqual(umbralOss([factura('2024-12-31', 20000)], 2026), { anio: 0, anterior: 0, superado: false, limite: 10000 });
  assert.deepEqual(umbralOss([], 2026), { anio: 0, anterior: 0, superado: false, limite: 10000 });
});

test('369: plazos de los cuatro trimestres sin desplazar fines de semana', () => {
  assert.equal(plazo369(2026, 1), '2026-04-30');
  assert.equal(plazo369(2026, 2), '2026-07-31');
  assert.equal(plazo369(2026, 3), '2026-10-31'); // Sábado.
  assert.equal(plazo369(2026, 4), '2027-01-31'); // Domingo y año siguiente.
});
