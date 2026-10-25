// Arreglos urgentes de la auditoría de 1.000 empresas del 19-10-2026: el 15 % del Impuesto sobre Sociedades de las
// entidades de nueva creación, todos los modelos en «Toca presentar» y la amortización en los años bisiestos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { borradorSociedades, modelo202, nuevaCreacion } from '../lib/modelos.js';
import { limpiarFiscal } from '../lib/empresa.js';
import { generarAsientos } from '../lib/asientos.js';
import { modelosAPresentar } from '../lib/presentar.js';
import { textoResumenModelos } from '../lib/formato.js';
import { acumulada, cuotaEntre, libroBienes, amortizacionesAnio } from '../lib/amortizaciones.js';

const fac = (id, fecha, base) => ({ id, fecha, numero: 1, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente: { nombre: 'Cliente', nif: '12345678Z' }, base, ivaPct: 21, irpfPct: 0 });
const gas = (id, fecha, base, extra = {}) => ({ id, fecha, concepto: 'Gasto', proveedor: 'Proveedor', base, ivaPct: 21, ...extra });

// Constituida en marzo de 2025: 2025 con pérdidas, 2026 y siguientes con 100.000 € de beneficio.
const facturas = [fac('f1', '2025-06-01', 10000), fac('f2', '2026-06-01', 100000), fac('f3', '2027-06-01', 100000), fac('f4', '2028-06-01', 100000)];
const gastos = [gas('g1', '2025-05-01', 15000)];

// ── 1. Impuesto sobre Sociedades: 15 % de nueva creación (art. 29.1 LIS) ──

test('IS: el primer año con beneficio y el siguiente tributan al 15 %; después, los tipos de micro', () => {
  const op = { constitucion: '2025-03-01' };
  assert.equal(borradorSociedades(facturas, gastos, 2025, op).cuota, 0);
  // 2026 compensa los 5.000 € de pérdidas de 2025 (art. 26 LIS): base 95.000 € al 15 %.
  const b26 = borradorSociedades(facturas, gastos, 2026, op);
  assert.deepEqual(b26.nuevaCreacion, { aplica: true, primero: 2026 });
  assert.deepEqual(b26.tramos.map((x) => [x.base, x.pct]), [[95000, 15]]);
  assert.equal(b26.cuota, 14250);
  const b27 = borradorSociedades(facturas, gastos, 2027, op);
  assert.deepEqual([b27.nuevaCreacion, b27.cuota], [{ aplica: true, primero: 2026 }, 15000]);
  // 2028: ya no; micro (17 % los primeros 50.000 € y 20 % el resto).
  const b28 = borradorSociedades(facturas, gastos, 2028, op);
  assert.equal(b28.nuevaCreacion.aplica, false);
  assert.equal(b28.cuota, 8500 + 10000);
});

test('IS: sin fecha de constitución, o constituida después del año, se queda en el 19/21 % de micro', () => {
  // Con la pérdida de 2025 (5.000 €) compensada: 50.000 × 19 % + 45.000 × 21 %.
  assert.equal(borradorSociedades(facturas, gastos, 2026).cuota, 9500 + 9450);
  assert.equal(borradorSociedades(facturas, gastos, 2026).nuevaCreacion, null);
  assert.equal(borradorSociedades(facturas, gastos, 2026, { constitucion: '2027-01-10' }).cuota, 9500 + 9450);
});

test('IS: el 15 % solo sustituye al tipo del tramo cuando es menor', () => {
  // Una empresa grande (más de 10 M el año anterior) baja del 25 % al 15 %; ningún tramo sube.
  const grandes = [fac('a', '2025-06-01', 12e6), fac('b', '2026-06-01', 1e6)];
  const caros = [gas('c', '2025-06-01', 12e6)]; // 2025 a cero: sin pérdidas que compensar en 2026
  const b = borradorSociedades(grandes, caros, 2026, { constitucion: '2025-01-15' });
  assert.equal(b.tamano, 'general');
  assert.deepEqual(b.tramos.map((x) => x.pct), [15]);
  assert.equal(b.cuota, 150000);
});

test('IS: un año entre la constitución y el actual sin datos ni cuota apuntada no se sabe; con la cuota, sí', () => {
  const solo26 = [fac('x', '2026-03-01', 80000)];
  const sin = borradorSociedades(solo26, [], 2026, { constitucion: '2023-05-01' });
  assert.deepEqual(sin.nuevaCreacion, { aplica: false, falta: 2024 });
  assert.equal(sin.cuota, 9500 + 6300);
  // Con la cuota del IS de 2024 y 2025 a cero (sin beneficio), 2026 es el primero con beneficio.
  assert.equal(borradorSociedades(solo26, [], 2026, { constitucion: '2023-05-01', cuotaIS: { 2024: 0, 2025: 0 } }).cuota, 12000);
  // Con cuota positiva en 2025, 2026 es «el siguiente» (15 %) y 2027 ya no.
  const con = { constitucion: '2023-05-01', cuotaIS: { 2024: 0, 2025: 300 } };
  assert.deepEqual(borradorSociedades(solo26, [], 2026, con).nuevaCreacion, { aplica: true, primero: 2025 });
  assert.equal(nuevaCreacion(2027, { ...con }).aplica, false);
});

test('IS: el año de constitución sin datos cuenta como sin beneficio', () => {
  assert.deepEqual(nuevaCreacion(2026, { constitucion: '2025-12-01', base: 1000 }), { aplica: true, primero: 2026 });
  assert.deepEqual(nuevaCreacion(2026, { constitucion: '2025-12-01', base: 0 }), { aplica: false, primero: null });
  assert.equal(nuevaCreacion(2026, { constitucion: 'mañana' }), null);
});

test('Ajustes: la fecha de constitución se guarda en la situación fiscal, solo en sociedades y si es una fecha real', () => {
  assert.equal(limpiarFiscal({ tipo: 'sociedad', constitucion: '2025-03-01' }).constitucion, '2025-03-01');
  assert.equal(limpiarFiscal({ tipo: 'autonomo', constitucion: '2025-03-01' }).constitucion, undefined);
  for (const mala of ['2025-02-30', '2025-13-01', '01/03/2025', '', '1850-01-01']) assert.equal(limpiarFiscal({ tipo: 'sociedad', constitucion: mala }).constitucion, undefined, mala);
});

test('Contabilidad: el gasto por Impuesto sobre Sociedades del cierre usa el 15 % de nueva creación', () => {
  const fiscal = { tipo: 'sociedad', iva: 'general', constitucion: '2025-03-01' };
  const A = generarAsientos({ facturas, gastos, fiscal, cuotaIS: {} }, '2027-03-01');
  const is26 = A.find((a) => a.concepto === 'Impuesto sobre Sociedades 2026');
  assert.equal(is26.lineas.find((l) => l.cuenta === '630').debe, 14250); // 95.000 € al 15 %, tras compensar la pérdida de 2025
  const sinFecha = generarAsientos({ facturas, gastos, fiscal: { tipo: 'sociedad', iva: 'general' }, cuotaIS: {} }, '2027-03-01');
  assert.equal(sinFecha.find((a) => a.concepto === 'Impuesto sobre Sociedades 2026').lineas.find((l) => l.cuenta === '630').debe, 9500 + 9450);
});

// ── 2. Impuestos: «Toca presentar» con todos los modelos que vencen a la vez ──

test('Toca presentar: el 3T lleva 303, 111, 115, 349 y el 202 de octubre, no solo el 303', () => {
  const l = modelosAPresentar(3, {
    m303: { importe: 1200 }, m111: 450, m115: 190, m349: { total: 3000, operadores: [{}, {}] },
    pagos202: modelo202({ 2025: 1000 }, 2026), pagados202: {},
  });
  assert.deepEqual(l.map((m) => m.num), ['303', '111', '115', '349', '202']);
  assert.equal(l.find((m) => m.num === '202').importe, 180);
  assert.match(l.find((m) => m.num === '349').texto, /^2 empresas · 3\.000,00/);
  assert.ok(l.every((m) => m.href === `#m${m.num}` && !m.dia));
});

test('Toca presentar: sin retenciones ni operaciones no salen (no hay declaración negativa); el 303 y el 130 a cero, sí', () => {
  const l = modelosAPresentar(2, { m303: { importe: 0, compensar: 50 }, m130: { importe: 0 }, m111: 0, m115: 0, m349: { total: 0, operadores: [] }, pagos202: modelo202({ 2025: 1000 }, 2026) });
  assert.deepEqual(l.map((m) => [m.num, m.texto]), [['303', 'A compensar 50,00 €'], ['130', 'Sin importe a ingresar']]);
});

test('Toca presentar: el 202 sale en abril (1T) y octubre (3T), si no está pagado; sin cuota, se avisa salvo que la sociedad no existiera', () => {
  const p = modelo202({ 2024: 500, 2025: 1000 }, 2026);
  assert.equal(modelosAPresentar(1, { pagos202: p })[0].importe, 90);
  assert.deepEqual(modelosAPresentar(3, { pagos202: p, pagados202: { 2: 180 } }), []);
  assert.deepEqual(modelosAPresentar(4, { pagos202: p }), []);
  assert.equal(modelosAPresentar(3, { pagos202: modelo202({}, 2026) })[0].texto, 'Falta la cuota de 2025');
  assert.deepEqual(modelosAPresentar(3, { pagos202: modelo202({}, 2026), constitucion: '2026-02-01' }), []);
});

test('Toca presentar: el 111 con nóminas pagadas sin retención se presenta como negativo (art. 108.1 RIRPF)', () => {
  const l = modelosAPresentar(1, { m111: 0, negativa111: true });
  assert.deepEqual(l.map((m) => [m.num, m.importe, m.texto]), [['111', 0, 'Negativo: sin importe, pero se presenta']]);
  assert.deepEqual(modelosAPresentar(1, { m111: 0 }), []);
  assert.deepEqual(modelosAPresentar(1, { m111: null, negativa111: true }), []); // ya marcado como presentado
});

test('Toca presentar: en el 4T el 111 y el 115 vencen el 20 de enero y lo dicen; el resumen para compartir los lleva todos', () => {
  const l = modelosAPresentar(4, { m303: { importe: 100 }, m111: 30, m115: 19 });
  assert.deepEqual(l.map((m) => m.dia), [undefined, 20, 20]);
  const texto = textoResumenModelos({ t: 4, anio: 2026, plazo: '1 de febrero de 2027', m303: { importe: 100 }, m130: null, otros: [{ ...l[1], plazo: '20 de enero de 2027' }, l[2]] });
  assert.match(texto, /303 \(IVA\): a ingresar 100,00/);
  assert.match(texto, /111 · Retenciones: a ingresar 30,00 € \(hasta el 20 de enero de 2027\)/);
  assert.match(texto, /115 · Alquiler: a ingresar 19,00/);
});

// ── 3. Amortización: el año bisiesto no pasa del coeficiente máximo ──

const ordenador = { id: 'o', fecha: '2026-01-01', concepto: 'Ordenador', base: 3650, ivaPct: 21, inversion: { tipo: 'informatica' } };

test('Amortización: 3.650 € al 26 % amortizan 949 € también en 2028 (bisiesto), no 951,60 €', () => {
  assert.deepEqual([2026, 2027, 2028].map((y) => cuotaEntre(ordenador, `${y}-01-01`, `${y}-12-31`)), [949, 949, 949]);
  assert.equal(cuotaEntre(ordenador, '2029-01-01', '2029-12-31'), 803);
  assert.equal(acumulada(ordenador, '2029-12-31'), 3650);
  assert.equal(libroBienes([ordenador], 2029)[0].fin, '2029-11-05');
  // Por trimestres de 2028: suman lo mismo que el año.
  const q = amortizacionesAnio([ordenador], 2028).reduce((s, x) => s + x.cuota, 0);
  assert.equal(Math.round(q * 100) / 100, 949);
});

test('Amortización: un año bisiesto parcial reparte por sus 366 días y la vida entera suma el valor', () => {
  const g = { ...ordenador, fecha: '2028-07-01', base: 1000 };
  // 184 de los 366 días de 2028.
  assert.equal(cuotaEntre(g, '2028-01-01', '2028-12-31'), Math.round(1000 * 0.26 * 184 / 366 * 100) / 100);
  assert.equal(cuotaEntre(g, '2029-01-01', '2029-12-31'), 260);
  const total = [2028, 2029, 2030, 2031, 2032].reduce((s, y) => s + cuotaEntre(g, `${y}-01-01`, `${y}-12-31`), 0);
  assert.equal(Math.round(total * 100) / 100, 1000);
  // El 29 de febrero cuenta como un día más de 2028.
  const feb = { ...ordenador, fecha: '2028-02-29', base: 3660 };
  assert.equal(cuotaEntre(feb, '2028-02-29', '2028-02-29'), Math.round(3660 * 0.26 / 366 * 100) / 100);
});

test('Amortización: lo traído de otro programa tampoco pasa del coeficiente en un bisiesto', () => {
  const migrado = { ...ordenador, fecha: '2020-01-01', base: 10000, inversion: { tipo: 'informatica', acumulada: 2000, desde: '2028-01-01' } };
  assert.equal(cuotaEntre(migrado, '2028-01-01', '2028-12-31'), 2600);
  assert.equal(libroBienes([migrado], 2028)[0].fin, '2031-01-29'); // 8.000 € al 2.600 €/año: 3 años y 29 días de 2031
});
