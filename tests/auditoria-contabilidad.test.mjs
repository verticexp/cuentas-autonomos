import test from 'node:test';
import assert from 'node:assert/strict';
import { generarAsientos, pygContable } from '../lib/asientos.js';
import { balanceOficial, cuentasAnuales, epigrafe, periodoMedioPago, pygOficial } from '../lib/cuentasAnuales.js';

const asiento = (fecha, pares, extra = {}) => ({
  fecha, concepto: 'Caso de auditoría', ...extra,
  lineas: pares.map(([cuenta, saldo]) => ({ cuenta, debe: saldo > 0 ? saldo : 0, haber: saldo < 0 ? -saldo : 0 })),
});
const saldo = (asientos, cuenta) => asientos.reduce((s, a) => s + a.lineas.filter((l) => l.cuenta === cuenta).reduce((v, l) => v + l.debe - l.haber, 0), 0);
const cuadran = (asientos) => {
  for (const a of asientos) assert.equal(a.lineas.reduce((s, l) => s + Math.round(l.debe * 100) - Math.round(l.haber * 100), 0), 0, a.concepto);
};

test('1. un ejercicio con solo asientos manuales liquida el IVA y regulariza sus resultados', () => {
  const manuales = [asiento('2026-11-01', [['430', 1210], ['705', -1000], ['477', -210]])];
  const A = generarAsientos({ manuales, fiscal: { tipo: 'autonomo', iva: 'general' } }, '2027-01-02');
  cuadran(A);
  assert.equal(saldo(A, '705'), 0);
  assert.equal(saldo(A, '477'), 0);
  assert.equal(saldo(A, '4750'), -210);
  assert.equal(saldo(A, '120'), -1000);
  // La apertura por sí sola no inicia una nueva regularización.
  const apertura = asiento('2026-01-01', [['572', 1000], ['100', -1000]], { apertura: true });
  const soloApertura = generarAsientos({ manuales: [apertura] }, '2027-01-02');
  cuadran(soloApertura);
  assert.equal(soloApertura.length, 1);
});

test('2. el exceso de pagos a cuenta del IS se reconoce en 4709 y deja 4752 a cero', () => {
  const facturas = [{ id: 'venta', fecha: '2026-01-10', base: 1000, ivaPct: 0, irpfPct: 0 }];
  for (const [pago, devolucion, deuda] of [[500, 310, 0], [100, 0, -90], [190, 0, 0]]) {
    const A = generarAsientos({ facturas, fiscal: { tipo: 'sociedad', iva: 'general' }, pagos202: { 2026: { 1: pago } } }, '2027-01-02');
    cuadran(A);
    const impuesto = A.find((a) => a.concepto === 'Impuesto sobre Sociedades 2026');
    assert.equal(impuesto.lineas.find((l) => l.cuenta === '630').debe, 190);
    assert.equal(saldo(A, '4709'), devolucion);
    assert.equal(saldo(A, '4752'), deuda);
    assert.equal(saldo(A, '473'), 0);
  }
});

test('3. participaciones, ingresos 76x y pérdidas financieras se separan de explotación en ambas PyG', () => {
  const venta = [asiento('2026-06-01', [['572', 1100], ['2403', -1000], ['7733', -100]])];
  cuadran(venta);
  const p = pygContable(venta, { desde: '2026-01-01', hasta: '2026-12-31' });
  assert.equal(p.explotacion, 0);
  assert.equal(p.financiero, 100);
  const casos = [
    ...['760', '761', '762', '763', '764', '765', '766', '767', '768', '769', '7733', '7734', '775', '796', '797', '798', '799'].map((c) => [c, -100, 0, 100]),
    ...['666', '667', '668', '669', '6733', '675', '696', '697', '698', '699'].map((c) => [c, 100, 0, -100]),
    ...['770', '771', '772', '778'].map((c) => [c, -100, 100, 0]),
    ...['670', '671', '672', '678'].map((c) => [c, 100, -100, 0]),
  ];
  for (const [c, importe, explotacion, financiero] of casos) {
    const A = [asiento('2026-06-01', [[c, importe], ['572', -importe]])];
    cuadran(A);
    const simple = pygContable(A, { desde: '2026-01-01', hasta: '2026-12-31' });
    const oficial = pygOficial(A, '2026-01-01', '2026-12-31');
    assert.deepEqual([simple.explotacion, simple.financiero, oficial.A, oficial.B], [explotacion, financiero, explotacion, financiero], c);
  }
});

test('4. las correctoras minoran su activo y no generan acreedores; 499 sigue siendo provisión', () => {
  const casos = [
    ['430', '490', 'B.II.1'], ['433', '4933', 'B.II.1'],
    ['206', '280', 'A.I'], ['211', '281', 'A.II'], ['220', '282', 'A.III'],
    ['206', '290', 'A.I'], ['211', '291', 'A.II'], ['220', '292', 'A.III'],
    ['2403', '2933', 'A.IV'], ['2414', '2944', 'A.IV'], ['2423', '2953', 'A.IV'],
    ['2405', '2935', 'A.V'], ['2415', '2945', 'A.V'], ['2425', '2955', 'A.V'], ['250', '296', 'A.V'], ['251', '297', 'A.V'], ['252', '298', 'A.V'],
    ['300', '390', 'B.I'], ['310', '391', 'B.I'],
    ['5303', '5933', 'B.III'], ['5314', '5944', 'B.III'], ['5323', '5953', 'B.III'],
    ['540', '596', 'B.IV'], ['541', '597', 'B.IV'], ['542', '598', 'B.IV'],
  ];
  for (const [activo, correctora, id] of casos) {
    const A = [asiento('2026-01-01', [[activo, 1000], [correctora, -100], ['100', -900]])];
    cuadran(A);
    const b = balanceOficial(A, '2026-12-31');
    assert.equal(epigrafe(correctora, -100), id, correctora);
    assert.equal(b.v[id], 900, correctora);
    assert.equal(b.v['PC.IV.2'], 0, correctora);
    assert.equal(b.activo, 900, correctora);
    assert.equal(b.pasivo, 900, correctora);
  }
  assert.equal(epigrafe('499', -100), 'PC.I');
  assert.equal(epigrafe('430', -100), 'PC.IV.2');
});

test('5. las deudas 510–514 de grupo y asociadas van a C.III, distinguiendo otras vinculadas', () => {
  for (const base of ['510', '511', '512', '513', '514']) {
    for (const sufijo of ['', '3', '4', '30001', '40001']) {
      const cuenta = `${base}${sufijo}`;
      const A = [asiento('2026-01-01', [['572', 100], [cuenta, -100]])];
      cuadran(A);
      const b = balanceOficial(A, '2026-12-31');
      assert.equal(b.v['PC.III'], 100, cuenta);
      assert.equal(b.v['PC.IV.2'], 0, cuenta);
      assert.equal(b.activo, b.pasivo, cuenta);
    }
  }
  for (const [c, id] of [['5105', 'PC.II.1'], ['5125', 'PC.II.2'], ['5115', 'PC.II.3'], ['5135', 'PC.II.3'], ['5145', 'PC.II.3']]) {
    assert.equal(epigrafe(c, -100), id, c);
  }
});

test('6. la memoria calcula el PMP de pymes con deuda comercial anterior y compras netas más servicios', () => {
  const gastos = [{ id: 'compra', fecha: '2026-06-01', pagado: '2026-06-01', concepto: 'Compras', categoria: '600', base: 1000, ivaPct: 0 }];
  const apertura = asiento('2026-01-01', [['572', 10000], ['400', -9000], ['100', -1000]], { apertura: true });
  const A = generarAsientos({ gastos, manuales: [apertura], fiscal: { tipo: 'sociedad', iva: 'general' } }, '2027-01-02');
  cuadran(A);
  const cuentas = cuentasAnuales({ asientos: A, gastos, empresa: {}, anio: 2026 });
  // 9.000 € pendientes tanto al inicio como al cierre / 1.000 € de compras × 365 = 3.285 días.
  assert.match(cuentas.memoria[14], /3285 días/);
  assert.deepEqual(periodoMedioPago(gastos, 2026), { dias: 0, pagos: 1 }); // se conserva el informe anterior
  const conServicios = [...A, asiento('2026-12-01', [['623', 200], ['572', -200]]), asiento('2026-12-02', [['572', 200], ['608', -200]])];
  cuadran(conServicios);
  assert.match(cuentasAnuales({ asientos: conServicios, gastos, empresa: {}, anio: 2026 }).memoria[14], /3285 días/);
});
