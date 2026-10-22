import test from 'node:test';
import assert from 'node:assert/strict';
import { RET_CAPITAL, TIPOS_RENDIMIENTO, limpiarPago, modelo123, modelo193, plazo123, plazo193 } from '../lib/capitalMobiliario.js';

const formulario = (cambios = {}) => ({ fecha: '2026-02-10', tipo: 'dividendos', perceptor: { nombre: 'Ana', nif: '12345678Z' }, bruto: 1000, ...cambios });
const pago = (cambios = {}) => {
  const p = limpiarPago(formulario(cambios));
  assert.equal(p.error, undefined);
  return p;
};

test('constantes de capital mobiliario', () => {
  assert.equal(RET_CAPITAL, 19);
  assert.deepEqual(TIPOS_RENDIMIENTO, { dividendos: 'Dividendos', intereses: 'Intereses de un préstamo', otros: 'Otros rendimientos del capital' });
});

test('limpiarPago: normaliza el formulario, aplica el 19 % y calcula el líquido', () => {
  assert.deepEqual(pago({ perceptor: { nombre: '  Ana  ', nif: ' es 12.345.678-z ' }, nota: '  Reparto de dividendos  ' }), {
    fecha: '2026-02-10', tipo: 'dividendos', perceptor: { nombre: 'Ana', nif: '12345678Z' },
    bruto: 1000, retencionPct: 19, retencion: 190, liquido: 810, nota: 'Reparto de dividendos',
  });
});

test('limpiarPago: lee importes españoles y redondea a céntimos', () => {
  const p = pago({ bruto: '1.234,56' });
  assert.deepEqual([p.bruto, p.retencion, p.liquido], [1234.56, 234.57, 999.99]);
  const decimal = pago({ bruto: 100.126 });
  assert.deepEqual([decimal.bruto, decimal.retencion, decimal.liquido], [100.13, 19.02, 81.11]);
});

test('limpiarPago: porcentaje por defecto si falta o está vacío', () => {
  for (const retencionPct of [undefined, null, '', '  ']) assert.equal(pago({ retencionPct }).retencionPct, 19);
});

test('limpiarPago: admite porcentajes 0, 100 e intermedios', () => {
  for (const [retencionPct, retencion, liquido] of [[0, 0, 1000], ['0', 0, 1000], [100, 1000, 0], ['7,5', 75, 925], [12.345, 123.45, 876.55]]) {
    const p = pago({ retencionPct });
    assert.deepEqual([p.retencion, p.liquido], [retencion, liquido]);
  }
});

test('limpiarPago: admite NIF vacío, todos los tipos y los límites de nombre, bruto y nota', () => {
  for (const nif of [undefined, null, '', '  ']) assert.equal(pago({ perceptor: { nombre: 'Ana', nif } }).perceptor.nif, '');
  for (const tipo of Object.keys(TIPOS_RENDIMIENTO)) assert.equal(pago({ tipo }).tipo, tipo);
  const p = pago({ perceptor: { nombre: 'A'.repeat(120) }, bruto: 1_000_000_000, nota: `  ${'x'.repeat(301)}  ` });
  assert.equal(p.perceptor.nombre.length, 120);
  assert.equal(p.bruto, 1_000_000_000);
  assert.equal(p.nota, 'x'.repeat(300));
  assert.equal(pago({ fecha: '2024-02-29' }).fecha, '2024-02-29');
});

const errores = [
  ['fecha inexistente', { fecha: '2026-02-29' }, /fecha/i],
  ['fecha sin formato', { fecha: '10/02/2026' }, /fecha/i],
  ['fecha ausente', { fecha: undefined }, /fecha/i],
  ['fecha fuera del rango', { fecha: '2101-01-01' }, /fecha/i],
  ['tipo desconocido', { tipo: 'alquiler' }, /tipo/i],
  ['tipo heredado', { tipo: 'toString' }, /tipo/i],
  ['tipo ausente', { tipo: undefined }, /tipo/i],
  ['perceptor ausente', { perceptor: undefined }, /nombre/i],
  ['nombre vacío', { perceptor: { nombre: '  ' } }, /nombre/i],
  ['nombre demasiado largo', { perceptor: { nombre: 'A'.repeat(121) } }, /nombre/i],
  ['NIF con control incorrecto', { perceptor: { nombre: 'Ana', nif: '12345678A' } }, /NIF/i],
  ['NIF de tipo incorrecto', { perceptor: { nombre: 'Ana', nif: 12345678 } }, /fiscal/i],
  ['bruto cero', { bruto: 0 }, /bruto/i],
  ['bruto negativo', { bruto: -1 }, /bruto/i],
  ['bruto negativo español', { bruto: '-1.234,56' }, /bruto/i],
  ['bruto ausente', { bruto: undefined }, /bruto/i],
  ['bruto no numérico', { bruto: 'abc' }, /bruto/i],
  ['bruto booleano', { bruto: true }, /bruto/i],
  ['bruto NaN', { bruto: NaN }, /bruto/i],
  ['bruto infinito', { bruto: Infinity }, /bruto/i],
  ['bruto excesivo', { bruto: 1_000_000_000.01 }, /bruto/i],
  ['bruto que redondea a cero', { bruto: 0.001 }, /bruto/i],
  ['porcentaje negativo', { retencionPct: -0.01 }, /porcentaje/i],
  ['porcentaje excesivo', { retencionPct: 100.01 }, /porcentaje/i],
  ['porcentaje no numérico', { retencionPct: 'abc' }, /porcentaje/i],
  ['porcentaje NaN', { retencionPct: NaN }, /porcentaje/i],
  ['porcentaje infinito', { retencionPct: Infinity }, /porcentaje/i],
  ['porcentaje booleano', { retencionPct: false }, /porcentaje/i],
];
for (const [caso, cambios, mensaje] of errores) {
  test(`limpiarPago: rechaza ${caso}`, () => {
    const resultado = limpiarPago(formulario(cambios));
    assert.deepEqual(Object.keys(resultado), ['error']);
    assert.match(resultado.error, mensaje);
  });
}

test('limpiarPago: formulario ausente o nulo devuelve error', () => {
  assert.match(limpiarPago().error, /fecha/i);
  assert.match(limpiarPago(null).error, /fecha/i);
});

test('modelo123: filtra por trimestre y año, cuenta por NIF o nombre e incluye exentos', () => {
  const pagos = [
    pago({ fecha: '2026-01-01' }),
    pago({ fecha: '2026-03-31', bruto: 500, tipo: 'intereses', perceptor: { nombre: 'Ana García', nif: 'es12345678z' } }),
    pago({ bruto: 100, perceptor: { nombre: 'Bruno' } }),
    pago({ bruto: 50, perceptor: { nombre: 'bruno' } }),
    pago({ bruto: 100, retencionPct: 0, perceptor: { nombre: 'Clara' } }),
    pago({ bruto: 200, perceptor: { nombre: 'Ana', nif: '87654321X' } }),
    pago({ fecha: '2026-04-01', bruto: 9999 }),
    pago({ fecha: '2025-03-01', bruto: 9999 }),
    pago({ fecha: '2027-03-01', bruto: 9999 }),
  ];
  assert.deepEqual(modelo123(pagos, 2026, 1), { perceptores: 4, base: 1950, retenciones: 351.5 });
  assert.deepEqual(modelo123(pagos, 2026, 2), { perceptores: 1, base: 9999, retenciones: 1899.81 });
  assert.deepEqual(modelo123(pagos, 2026, 3), { perceptores: 0, base: 0, retenciones: 0 });
});

test('modelo193: agrupa por perceptor y tipo, filtra el año y ordena por nombre', () => {
  const pagos = [
    pago({ fecha: '2026-12-31', bruto: 200, perceptor: { nombre: 'Zoe' } }),
    pago({ fecha: '2026-01-01', bruto: 100 }),
    pago({ bruto: 50, perceptor: { nombre: 'Ana García', nif: '12345678Z' } }),
    pago({ bruto: 25, tipo: 'intereses' }),
    pago({ bruto: 100, tipo: 'intereses', perceptor: { nombre: 'Bruno' }, retencionPct: 0 }),
    pago({ bruto: 50, tipo: 'intereses', perceptor: { nombre: 'bruno' } }),
    pago({ fecha: '2025-12-31', bruto: 9999 }),
    pago({ fecha: '2027-01-01', bruto: 9999 }),
  ];
  assert.deepEqual(modelo193(pagos, 2026), {
    perceptores: [
      { nif: '12345678Z', nombre: 'Ana', tipo: 'dividendos', base: 150, retenciones: 28.5 },
      { nif: '12345678Z', nombre: 'Ana', tipo: 'intereses', base: 25, retenciones: 4.75 },
      { nif: '', nombre: 'Bruno', tipo: 'intereses', base: 150, retenciones: 9.5 },
      { nif: '', nombre: 'Zoe', tipo: 'dividendos', base: 200, retenciones: 38 },
    ], base: 525, retenciones: 80.75,
  });
});

test('modelos: suman retenciones ya redondeadas por pago y no las recalculan sobre el total', () => {
  const pagos = [pago({ bruto: 0.03 }), pago({ bruto: 0.03 }), pago({ bruto: 0.03 })];
  assert.deepEqual(modelo123(pagos, 2026, 1), { perceptores: 1, base: 0.09, retenciones: 0.03 });
  const anual = modelo193(pagos, 2026);
  assert.deepEqual([anual.base, anual.retenciones, anual.perceptores[0].base, anual.perceptores[0].retenciones], [0.09, 0.03, 0.09, 0.03]);
});

test('modelos: sin pagos', () => {
  assert.deepEqual(modelo123([], 2026, 1), { perceptores: 0, base: 0, retenciones: 0 });
  assert.deepEqual(modelo193([], 2026), { perceptores: [], base: 0, retenciones: 0 });
});

test('plazo123: los cuatro trimestres y el 4T hasta el 20 de enero siguiente', () => {
  assert.deepEqual([1, 2, 3, 4].map((t) => plazo123(2026, t)), ['2026-04-20', '2026-07-20', '2026-10-20', '2027-01-20']);
});

test('plazo123: desplaza los vencimientos de fin de semana hasta el lunes', () => {
  assert.equal(plazo123(2024, 1), '2024-04-22');
  assert.equal(plazo123(2023, 4), '2024-01-22');
});

test('plazo193: último día de enero siguiente, desplazado a hábil', () => {
  assert.equal(plazo193(2023), '2024-01-31');
  assert.equal(plazo193(2025), '2026-02-02');
  assert.equal(plazo193(2026), '2027-02-01');
});
