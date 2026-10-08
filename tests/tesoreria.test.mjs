import test from 'node:test';
import assert from 'node:assert/strict';
import { gastosHabituales, prevision } from '../lib/tesoreria.js';

const fiscal = { tipo: 'autonomo', iva: 'general' };
const fac = (id, fecha, base, extra = {}) => ({ id, numero: Number(id), anio: Number(fecha.slice(0, 4)), fecha, base, ivaPct: 21, irpfPct: 15, cliente: { nombre: `C${id}` }, concepto: 'Sesión', ...extra });
const gas = (id, fecha, base, extra = {}) => ({ id, fecha, base, ivaPct: 21, concepto: 'Gestoría', ...extra });

test('gastos habituales: los que están en cada uno de los 3 meses anteriores, con la media', () => {
  const G = [gas('1', '2026-07-05', 100), gas('2', '2026-08-05', 100), gas('3', '2026-09-05', 130),
    gas('4', '2026-08-10', 50, { concepto: 'Cables' }), gas('5', '2026-09-10', 50, { concepto: 'Cables' }),
    gas('6', '2026-07-30', 300, { concepto: 'Cuota de autónomos 2026-07', ivaPct: 0 }), gas('7', '2026-08-31', 300, { concepto: 'Cuota de autónomos 2026-08', ivaPct: 0 }), gas('8', '2026-09-30', 300, { concepto: 'Cuota de autónomos 2026-09', ivaPct: 0 })];
  const h = gastosHabituales(G, '2026-10-05');
  assert.deepEqual(h.map((x) => [x.concepto, x.dia, x.importe]), [['Gestoría', 5, 133.1], ['Cuota de autónomos', 30, 300]]);
});

test('previsión: cobros a su vencimiento, pagos, Hacienda y saldo', () => {
  const F = [
    fac('1', '2026-09-20', 1000), // vence el 20-10: total 1210 − 150 = 1060
    fac('2', '2026-08-01', 500), // vencida: se cuenta hoy
    fac('3', '2026-09-25', 200, { cobrada: true }),
    fac('4', '2026-07-10', 2000, { cobrada: true }),
  ];
  const G = [gas('p', '2026-09-30', 100, { proveedor: 'Imprenta', pendiente: true })];
  const R = [{ id: 'r', activa: true, dia: 15, ultima: '2026-10', plantilla: { cliente: { nombre: 'Fijo' }, concepto: 'Cuota', base: 100, ivaPct: 21, irpfPct: 0 } }];
  const p = prevision({ facturas: F, gastos: G, recurrentes: R, fiscal, plazo: 30, saldo: { importe: 1000 }, hoy: '2026-10-05', meses: 1 });
  assert.equal(p.hasta, '2026-11-30');
  const t = p.movimientos.map((m) => [m.fecha, m.tipo, m.concepto, m.importe]);
  assert.deepEqual(t.slice(0, 2), [['2026-10-05', 'cobro', 'C2', 530], ['2026-10-05', 'pago', 'Imprenta', -121]]);
  assert.ok(t.some((x) => x[0] === '2026-10-20' && x[2] === 'C1' && x[3] === 1060));
  assert.ok(!t.some((x) => x[2] === 'Fijo'), 'la recurrente de noviembre vence en diciembre: fuera del horizonte');
  const iva = p.movimientos.find((m) => m.concepto === 'IVA (303) del 3T');
  assert.equal(iva.importe, -756); // IVA del 3T: 21 % de 3.700 − 21 del gasto
  assert.equal(iva.fecha, '2026-10-20');
  const m130 = p.movimientos.find((m) => m.concepto === 'IRPF (130) del 3T');
  assert.ok(m130 && m130.importe < 0);
  assert.equal(p.final, p.movimientos.at(-1).saldo);
  assert.equal(p.meses.length, 2);
  assert.equal(p.meses[1].saldo, p.final);
});

test('Hacienda: un trimestre marcado como presentado no se vuelve a contar; el 130 previsto cuenta para el siguiente', () => {
  const F = [fac('1', '2026-08-01', 10000, { irpfPct: 0, cobrada: true }), fac('2', '2026-10-01', 10000, { irpfPct: 0, cobrada: true })];
  const con = prevision({ facturas: F, fiscal, hoy: '2026-10-05', meses: 4 });
  const q3 = con.movimientos.find((m) => m.concepto === 'IRPF (130) del 3T').importe;
  const q4 = con.movimientos.find((m) => m.concepto === 'IRPF (130) del 4T').importe;
  assert.equal(q3, -1900); // 20 % de (10000 − 5 %)
  assert.equal(q4, -1900); // el acumulado (3800) menos lo del 3T
  assert.ok(con.movimientos.find((m) => m.concepto === 'IVA (303) del 4T').estimado);
  const pres = prevision({ facturas: F, fiscal, pagos130: { 2026: { 3: 1900 } }, hoy: '2026-10-05', meses: 4 });
  assert.ok(!pres.movimientos.some((m) => m.concepto.includes('3T')));
  assert.equal(pres.movimientos.find((m) => m.concepto === 'IRPF (130) del 4T').importe, -1900);
  const soc = prevision({ facturas: F, fiscal: { tipo: 'sociedad', iva: 'general' }, hoy: '2026-10-05', meses: 4 });
  assert.ok(!soc.movimientos.some((m) => m.concepto.includes('130')));
});

test('recurrentes: el mes que aún no se ha creado entra a su vencimiento; el saldo mínimo', () => {
  const R = [{ id: 'r', activa: true, dia: 1, ultima: '2026-10', plantilla: { cliente: { nombre: 'Fijo' }, concepto: 'Cuota', base: 100, ivaPct: 21, irpfPct: 0 } }, { id: 'x', activa: false, dia: 1, plantilla: { base: 999, ivaPct: 0 } }];
  const G = [gas('p', '2026-10-10', 1000, { proveedor: 'Grande', pendiente: true, ivaPct: 0 })];
  const p = prevision({ recurrentes: R, gastos: G, fiscal: { tipo: 'sociedad', iva: 'exento' }, plazo: 0, saldo: { importe: 500 }, hoy: '2026-10-05', meses: 2 });
  assert.deepEqual(p.movimientos.map((m) => [m.fecha, m.importe, m.saldo]), [['2026-10-10', -1000, -500], ['2026-11-01', 121, -379], ['2026-12-01', 121, -258]]);
  assert.deepEqual(p.minimo, { saldo: -500, fecha: '2026-10-10' });
});

test('Hacienda: el 115 del 4T se paga el 20 de enero; el 303 y el 130, el 30', () => {
  const G = [gas('a', '2026-11-05', 1000, { alquiler: true, concepto: 'Alquiler local' })];
  const F = [fac('1', '2026-11-10', 3000)];
  const p = prevision({ facturas: F, gastos: G, fiscal, hoy: '2026-12-15', meses: 2, actividades: [] });
  const h = Object.fromEntries(p.movimientos.filter((m) => m.tipo === 'hacienda').map((m) => [m.concepto.split(' ')[0], m.fecha]));
  assert.equal(h.Alquiler, '2027-01-20');
  assert.equal(h.IVA, '2027-01-30');
});

test('Hacienda: el 202 de una sociedad, el 20 de octubre y de diciembre', () => {
  const p = prevision({ facturas: [], gastos: [], fiscal: { tipo: 'sociedad', iva: 'general' }, cuotaIS: { 2025: 1000 }, hoy: '2026-10-08', meses: 3, actividades: [] });
  const h = p.movimientos.filter((m) => m.concepto.includes('202'));
  assert.deepEqual(h.map((m) => [m.fecha, m.importe]), [['2026-10-20', -180], ['2026-12-20', -180]]);
});
