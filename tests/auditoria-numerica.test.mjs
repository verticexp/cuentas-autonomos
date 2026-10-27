import test from 'node:test';
import assert from 'node:assert/strict';
import { modelo115, modelo180, modelo190, modelo390, modelo347, retencionesProfesionales, borradorSociedades } from '../lib/modelos.js';
import { generarAsientos, mayor, pygContable } from '../lib/asientos.js';
import { panelResumen } from '../lib/panel.js';
import { importes, resumenAnual } from '../lib/calculos.js';
import { proveedores } from '../lib/proveedores.js';
import { indiceDe } from '../lib/fichas.js';
import { prevision } from '../lib/tesoreria.js';
import { informe } from '../lib/contabilidad.js';
import { modelo111 } from '../lib/nominas.js';
import { datosPaquete } from '../lib/paquete.js';

const gasto = (id, base, extra = {}) => ({ id, fecha: '2026-03-01', actividad: 'x', concepto: 'Alquiler', proveedor: 'Arrendador', proveedorNif: 'B12345674', base, ivaPct: 21, alquiler: true, ...extra });
const fiscal = { tipo: 'sociedad', iva: 'general' };
const bien = gasto('ordenador', 3650, { fecha: '2026-01-01', alquiler: false, inversion: { tipo: 'informatica' } });

test('N01: 115 y 180 suman las retenciones redondeadas de cada renta', () => {
  const gastos = [1, 2, 3].map((i) => gasto(String(i), 0.03));
  // Cada pago retiene 0,01 €. La suma es 0,03 €, no 0,02 € sobre la base agregada.
  assert.equal(modelo115(gastos, 2026, 1).retenciones, 0.03);
  assert.equal(modelo180(gastos, 2026).retenciones, 0.03);
});

test('N02: retenciones de alquiler y profesionales solo al pagar y en el periodo del pago', () => {
  const rentas = [gasto('pendiente', 1000, { pendiente: true }), gasto('abril', 1000, { pagado: '2026-04-10' })];
  assert.equal(modelo115(rentas, 2026, 1).retenciones, 0);
  assert.equal(modelo115(rentas, 2026, 2).retenciones, 190);
  const profesionales = rentas.map((g) => ({ ...g, alquiler: false, irpfPct: 15 }));
  assert.equal(retencionesProfesionales(profesionales, 2026, 1).retenciones, 0);
  assert.equal(retencionesProfesionales(profesionales, 2026, 2).retenciones, 150);
  const diciembre = [gasto('diciembre', 1000, { fecha: '2025-12-10', pagado: '2026-01-10', alquiler: false, irpfPct: 15 })];
  assert.equal(modelo190([], [], 2025, diciembre).retenciones, 0);
  assert.equal(modelo190([], [], 2026, diciembre).retenciones, 150);
});

test('N03: el IS descuenta retenciones soportadas además de pagos a cuenta', () => {
  const f = [{ fecha: '2026-03-01', base: 1000, ivaPct: 21, irpfPct: 15 }];
  // Cuota 190 − retenciones 150 − pagos 20 = 20 €.
  const r = borradorSociedades(f, [], 2026, { pagos202: { 2026: { 1: 20 } } });
  assert.equal(r.resultado, 20);
});

test('N04: amortización hasta enero, sin anticipar el resto del año ni esperar al cierre trimestral', () => {
  // 3.650 × 25 % × 31 / 365 = 77,50 €.
  const datos = { facturas: [], gastos: [bien], fiscal };
  const P = panelResumen({ ...datos, actividades: [{ id: 'x' }], hoy: '2026-01-31' });
  assert.equal(P.gastado, 77.5);
  assert.equal(P.meses[0].gas, 77.5);
  assert.equal(P.meses[1].gas, 0);
  const A = generarAsientos(datos, '2026-01-31');
  assert.equal(pygContable(A, { desde: '2026-01-01', hasta: '2026-01-31' }).antes, -77.5);
});

test('N05: el panel mensual incluye el IVA no deducible igual que el total anual', () => {
  const P = panelResumen({ facturas: [], gastos: [gasto('g', 100, { alquiler: false })], fiscal: { tipo: 'autonomo', iva: 'exento' }, hoy: '2026-12-31' });
  assert.equal(P.gastado, 121);
  assert.equal(P.meses[2].gas, 121);
});

test('N06: liquidar retenciones no paga las de facturas pendientes', () => {
  const A = generarAsientos({ gastos: [gasto('pendiente', 1000, { pendiente: true })], fiscal, pagos130: { 2026: { 1: 0 } } }, '2026-04-30');
  assert.equal(mayor(A, '572', 2026).final, 0);
});

test('N07: el IS incluye las existencias finales no consumidas', () => {
  const productos = [{ id: 'p', nombre: 'Cable', coste: 10 }];
  const gastos = [gasto('compra', 100, { alquiler: false, stock: [{ producto: 'p', cantidad: 10, coste: 10 }] })];
  const f = [{ fecha: '2026-03-01', base: 200, ivaPct: 21, irpfPct: 0 }];
  // No se ha vendido ningún cable: los 100 € permanecen como existencias.
  const r = borradorSociedades(f, gastos, 2026, { productos });
  assert.equal(r.base, 200);
  assert.equal(r.cuota, 38);
});

test('N08: las pérdidas dejan la casilla 07 del 130 con signo, sin un pago negativo', () => {
  const q = resumenAnual([{ fecha: '2026-03-01', base: 100, ivaPct: 21, irpfPct: 15 }], [gasto('g', 1100, { alquiler: false, ivaPct: 0 })], 2026).trimestres[0];
  // Casilla 04 = 0 cuando hay pérdidas; casilla 07 = 0 − 15 de retenciones.
  assert.equal(q.c07, -15);
  assert.equal(q.m130, 0);
});

test('N09: el 390 incluye la base deducible de compras intracomunitarias', () => {
  const r = modelo390([], [gasto('ue', 100, { alquiler: false, ivaPct: 0, proveedorNif: 'DE123456789' })], 2026);
  assert.equal((r.c['597'] || 0) + (r.c['56'] || 0), 100);
  assert.equal(r.deducible, 21);
});

test('N10: una venta a empresa UE con IVA español no desaparece del 347', () => {
  const r = modelo347([{ fecha: '2026-03-01', base: 3000, ivaPct: 21, cliente: { nombre: 'Cliente UE', nif: 'FR12345678901' } }], [], 2026);
  assert.equal(r.ventas.length, 1);
  assert.equal(r.ventas[0].total, 3630);
});

test('N11: el IVA negativo anterior reduce lo que se aparta y prevé pagar', () => {
  const datos = { facturas: [{ fecha: '2026-05-01', base: 1000, ivaPct: 21, cobrada: true, cliente: { nombre: 'X' } }], gastos: [gasto('g', 1000, { alquiler: false })], fiscal };
  const P = panelResumen({ ...datos, hoy: '2026-07-05' });
  // 1T: −210; 2T: +210. No queda IVA a ingresar.
  assert.equal(P.aPagar, 0);
  assert.equal(prevision({ ...datos, hoy: '2026-07-05' }).hacienda, 0);
});

test('N12: el cuadre bancario no mezcla efectivo de caja con saldo del banco', () => {
  const manuales = [{ id: 'apertura', fecha: '2026-01-01', apertura: true, concepto: 'Apertura', lineas: [{ cuenta: '572', debe: 1000, haber: 0 }, { cuenta: '570', debe: 100, haber: 0 }, { cuenta: '100', debe: 0, haber: 1100 }] }];
  // Saldo procedente del banco (saldoTotal): el cuadre se oculta si no hay banco ni extractos.
  const d = informe({ manuales, fiscal, saldo: { importe: 1000, fecha: '2026-01-01', banco: true } }, 2026, '', '2026-01-01');
  assert.equal(d.banco.diferencia, 0);
});

test('N13: una nómina pendiente devenga el coste pero no un pago ni retención satisfecha', () => {
  const n = { id: 'n', empleado: 'e', mes: '2026-01', bruto: 2000, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65, pagada: false };
  const A = generarAsientos({ nominas: [n], fiscal }, '2026-01-31');
  assert.equal(mayor(A, '572', 2026).final, 0);
  assert.equal(pygContable(A, { desde: '2026-01-01', hasta: '2026-01-31' }).antes, -2633);
  assert.equal(modelo111([n], 2026, 1).retenciones, 0);
  assert.equal(modelo111([{ ...n, pagada: true, pagado: '2026-04-05' }], 2026, 1).retenciones, 0);
  assert.equal(modelo111([{ ...n, pagada: true, pagado: '2026-04-05' }], 2026, 2).retenciones, 240);
});

test('N14: facturas de proveedor, deudas e índices usan el neto, también con alquiler', () => {
  const profesional = gasto('prof', 1000, { alquiler: false, irpfPct: 15, pendiente: true });
  const alquiler = gasto('renta', 1000, { pendiente: true });
  assert.equal(importes(alquiler).total, 1020);
  for (const [g, esperado] of [[profesional, 1060], [alquiler, 1020]]) {
    assert.equal(proveedores([g])[0].debe, esperado);
    assert.equal(indiceDe('gastos', g).ficha.tp, esperado);
  }
});

test('N15: el paquete de gestoría conserva el neto y la compensación del IVA', () => {
  const facturas = [{ fecha: '2026-05-01', base: 1000, ivaPct: 21, cliente: { nombre: 'X' } }];
  const gastos = [gasto('renta', 1000)];
  const d = datosPaquete({ fiscal, actividades: [{ id: 'x', nombre: 'Servicios' }] }, { facturas, gastos }, 2026, 2);
  assert.equal(d.modelos.find((m) => m.id === '303').resultado, 0);
  const q1 = datosPaquete({ fiscal, actividades: [{ id: 'x', nombre: 'Servicios' }] }, { facturas, gastos }, 2026, 1);
  assert.equal(q1.gastos[0].total, 1020);
  assert.equal(q1.totales.gastos.irpf, 190);
});

test('N16: la previsión incluye salarios futuros del equipo activo sin duplicar nóminas generadas', () => {
  const e = { id: 'e', nombre: 'Ana', alta: '2026-01-01', bruto: 2000, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 };
  const n = { ...e, id: 'n', empleado: 'e', mes: '2026-10', pagada: false };
  const p = prevision({ empleados: [e], nominas: [n], fiscal, hoy: '2026-10-01', meses: 1 });
  // Octubre y noviembre: 2 netos de 1.630; en noviembre, seguros de octubre de 763.
  assert.equal(p.sale, 4023);
  assert.equal(p.movimientos.filter((m) => m.concepto.startsWith('Nómina')).length, 2);
});

test('N17: los gastos habituales previstos incluyen la retención que se ingresará después', () => {
  const gastos = ['07', '08', '09'].map((m) => gasto(m, 100, { fecha: `2026-${m}-05`, alquiler: false, irpfPct: 15 }));
  const p = prevision({ gastos, fiscal: { tipo: 'sociedad', iva: 'exento' }, pagos130: { 2026: { 3: 0 } }, hoy: '2026-10-01', meses: 3 });
  // Cuatro transferencias previstas de 106 € y 45 € retenidos en octubre-diciembre, a ingresar en enero.
  assert.equal(p.sale, 424);
  assert.equal(p.hacienda, 45);
});

test('N18: el IS incorpora los ingresos y gastos de los asientos manuales', () => {
  const facturas = [{ id: 'f', numero: 1, anio: 2025, fecha: '2025-03-01', base: 1000, ivaPct: 21, cliente: { nombre: 'X' } }];
  const manuales = [{ id: 'intereses', fecha: '2025-03-01', concepto: 'Intereses bancarios', lineas: [{ cuenta: '662', debe: 100, haber: 0 }, { cuenta: '572', debe: 0, haber: 100 }] }];
  const r = borradorSociedades(facturas, [], 2025, { manuales });
  assert.deepEqual([r.base, r.cuota], [900, 189]);
  const A = generarAsientos({ facturas, manuales, fiscal }, '2026-01-31');
  assert.equal(A.find((a) => a.concepto === 'Impuesto sobre Sociedades 2025').lineas.find((l) => l.cuenta === '630').debe, 189);
});

test('N19: el 130 solo arrastra negativos de declaraciones presentadas y no los consume en una previsión', () => {
  const f = (fecha, base) => ({ fecha, base, ivaPct: 21, irpfPct: 0 });
  const sinPrimero = resumenAnual([f('2026-05-01', 2000)], [], 2026, {}, [], { minoracion: 100 }).trimestres;
  assert.equal(sinPrimero[1].negPrev, 0, 'Un 1T no presentado no genera 100 € de crédito');
  assert.equal(sinPrimero[1].m130, 280); // 2000 × 95 % × 20 % − 100.
  const presentado = resumenAnual([f('2026-02-01', 300), f('2026-05-01', 2000)], [], 2026, { 1: 0 }, [], { minoracion: 100 }).trimestres;
  assert.deepEqual([presentado[1].negPrev, presentado[2].negPrev], [43, 43], 'Una liquidación todavía pendiente no consume los 43 € declarados');
});

test('N20: el libro de amortizaciones descargado usa el mismo corte que los resultados', () => {
  const d = informe({ gastos: [bien], fiscal }, 2026, '', '2026-01-31');
  assert.deepEqual([d.libro[0].anio, d.libro[0].acumulada, d.libro[0].pendiente], [77.5, 77.5, 3572.5]);
});
