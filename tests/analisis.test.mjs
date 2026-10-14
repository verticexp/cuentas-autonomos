import test from 'node:test';
import assert from 'node:assert/strict';
import { analisis, cifras, equilibrio } from '../lib/analisis.js';
import { asientoApertura, balanceContable, generarAsientos, pygContable } from '../lib/asientos.js';
import { periodo } from '../lib/contabilidad.js';
import { r2 } from '../lib/calculos.js';

const portatil = { id: 'b1', fecha: '2025-07-01', actividad: 'dj', concepto: 'Portátil', base: 1000, ivaPct: 21, inversion: { tipo: 'informatica' } };
const facturas = [
  { id: 'f1', numero: 1, anio: 2025, fecha: '2025-02-01', actividad: 'dj', base: 5000, ivaPct: 21, irpfPct: 15, cobrada: true, cliente: { nombre: 'X' } },
  { id: 'f2', numero: 2, anio: 2025, fecha: '2025-11-01', actividad: 'dj', base: 1000, ivaPct: 21, irpfPct: 0, cobrada: false, cliente: { nombre: 'Y' } },
  { id: 'r1', numero: 1, anio: 2025, serie: 'R', fecha: '2025-11-05', actividad: 'dj', base: -100, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'Y' } },
];
const gastos = [
  portatil,
  { id: 'a', fecha: '2025-03-01', concepto: 'Alquiler del local', base: 600, ivaPct: 21, alquiler: true },
  { id: 'b', fecha: '2025-03-01', concepto: 'Material', base: 400, ivaPct: 21, pendiente: true },
  { id: 'c', fecha: '2025-04-01', concepto: 'Intereses del préstamo', base: 50, ivaPct: 0 },
  { id: 'n', fecha: '2025-01-31', concepto: 'Nómina', base: 1316.5, ivaPct: 0, nomina: 'n1' },
];
const nominas = [{ id: 'n1', mes: '2025-01', empleadoNombre: 'Ana', bruto: 1000, irpfPct: 10, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 }];
const manuales = [asientoApertura({ fecha: '2025-01-01', banco: 3000, capital: 3000 }, false)];
const HOY = '2026-03-15';
const asientos = generarAsientos({ facturas, gastos, nominas, manuales, fiscal: { tipo: 'autonomo', iva: 'general' }, pagos130: { 2025: { 1: 500 } } }, HOY);
const per = periodo(2025);
const pyg = pygContable(asientos, per);
const bal = balanceContable(asientos, per.hasta);

test('margen bruto y EBITDA salen de la cuenta de resultados', () => {
  const c = cifras(pyg);
  assert.equal(c.ventas, 5900);
  assert.equal(c.aprovisionamientos, 400);
  assert.equal(c.margenBruto, 5500);
  assert.equal(c.margenBrutoPct, r2((5500 / 5900) * 100));
  // EBITDA = resultado de explotación + amortización = ventas − compras − personal − otros gastos
  assert.equal(c.amortizacion, 131.07);
  assert.equal(c.ebit, 3452.43);
  assert.equal(c.ebitda, 3583.5);
  assert.equal(c.ebitda, r2(5900 - 400 - 1316.5 - 600));
  assert.equal(c.ebitdaPct, r2((3583.5 / 5900) * 100));
  assert.equal(c.resultado, 3402.43);
});

test('punto de equilibrio: costes fijos entre el margen de contribución', () => {
  const c = cifras(pyg);
  // fijos = personal + alquiler + amortización + intereses = margen bruto − resultado antes de impuestos
  assert.equal(c.costesFijos, 2097.57);
  const e = equilibrio(c, 12);
  assert.equal(e.estado, 'superado');
  assert.equal(e.ventasEquilibrio, r2(2097.57 / (5500 / 5900)));
  assert.equal(e.mensual, r2(e.ventasEquilibrio / 12));
  assert.equal(e.margenSeguridad, r2(5900 - e.ventasEquilibrio));
  assert.equal(e.faltan, 0);
  // En el punto de equilibrio el resultado es 0: margen bruto de esas ventas = costes fijos
  assert.ok(Math.abs((e.ventasEquilibrio * 5500) / 5900 - 2097.57) < 0.01);
});

test('punto de equilibrio: por debajo, sin costes fijos y sin margen', () => {
  const base = { ventas: 1000, margenBruto: 500, costesFijos: 800 };
  const bajo = equilibrio(base, 6);
  assert.equal(bajo.estado, 'por-debajo');
  assert.equal(bajo.ventasEquilibrio, 1600);
  assert.equal(bajo.faltan, 600);
  assert.equal(bajo.margenSeguridad, -600);
  assert.equal(equilibrio({ ventas: 1000, margenBruto: 500, costesFijos: 0 }, 6).estado, 'sin-fijos');
  const malo = equilibrio({ ventas: 1000, margenBruto: -50, costesFijos: 300 }, 6);
  assert.equal(malo.estado, 'imposible');
  assert.equal(malo.ventasEquilibrio, null);
  // Sin ventas pero con gastos: no hay margen con el que calcular.
  assert.equal(equilibrio({ ventas: 0, margenBruto: 0, costesFijos: 300 }, 6).estado, 'imposible');
});

test('ratios del balance y plazos de cobro y pago', () => {
  const a = analisis({ pyg, bal, per, hoy: HOY, facturas, gastos });
  assert.equal(a.dias, 365);
  assert.equal(a.parcial, false);
  assert.equal(a.equilibrio.meses, 12);
  const r = (id) => a.ratios.find((x) => x.id === id);
  const ac = bal.activo.find((m) => m.id === 'ac').importe, pcorto = bal.pasivo.find((m) => m.id === 'pc').importe;
  assert.equal(r('liquidez').valor, r2(ac / pcorto));
  assert.equal(a.fondoManiobra, r2(ac - pcorto));
  assert.equal(a.activo, bal.total);
  assert.equal(a.activo, r2(a.patrimonioNeto + a.exigible));
  // Lo pendiente frente a la facturación neta: 5.300 + 1.210 − 121 de abono = 6.389 €.
  assert.equal(a.clientes, 1210);
  assert.equal(r('cobro').valor, r2((1210 / 6389) * 365));
  assert.equal(r('margenNeto').valor, r2((3402.43 / 5900) * 100));
  assert.equal(r('margenNeto').estado, 'bien');
  assert.ok(a.ratios.every((x) => x.valor === null || Number.isFinite(x.valor)));
});

test('sin datos nada da NaN ni divide por cero', () => {
  const vacio = pygContable([], per);
  const b = balanceContable([], per.hasta);
  const a = analisis({ pyg: vacio, bal: b, per, hoy: HOY });
  assert.equal(a.ventas, 0);
  assert.equal(a.ebitda, 0);
  assert.equal(a.margenBrutoPct, null);
  assert.equal(a.equilibrio.estado, 'sin-fijos');
  assert.ok(a.ratios.every((x) => x.valor === null || Number.isFinite(x.valor)));
});

test('un periodo sin acabar cuenta solo los días transcurridos', () => {
  const p26 = periodo(2026);
  const a = analisis({ pyg: pygContable(asientos, p26), bal: balanceContable(asientos, HOY), per: p26, hoy: HOY, facturas, gastos });
  assert.equal(a.parcial, true);
  assert.equal(a.dias, 74); // 1 ene – 15 mar
  assert.equal(a.equilibrio.meses, r2(74 / 30.4375));
});

test('compara con el periodo anterior', () => {
  const a = analisis({ pyg, anterior: pygContable(asientos, periodo(2024)), bal, per, hoy: HOY });
  assert.equal(a.anterior.ventas, 0);
  assert.equal(analisis({ pyg, bal, per, hoy: HOY }).anterior, null);
});
