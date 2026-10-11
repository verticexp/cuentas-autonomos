import test from 'node:test';
import assert from 'node:assert/strict';
import { acumulada, amortizacionesAnio, coeficiente, cuotaEntre, libroBienes } from '../lib/amortizaciones.js';
import { balance, categoriaDe, pareceBien, periodo, pyg } from '../lib/contabilidad.js';
import { casillas303, resumenAnual } from '../lib/calculos.js';
import { borradorSociedades } from '../lib/modelos.js';

const portatil = { id: 'b1', fecha: '2026-07-01', actividad: 'dj', concepto: 'Portátil', base: 1000, ivaPct: 21, inversion: { tipo: 'informatica' } };

test('amortización lineal por días con el coeficiente de la tabla', () => {
  assert.equal(coeficiente(portatil), 26);
  assert.equal(coeficiente(portatil, 'sociedad'), 25);
  assert.equal(coeficiente({ inversion: { tipo: 'informatica', coef: 20 } }), 20);
  assert.equal(coeficiente({ inversion: { tipo: 'informatica', coef: 40 } }), 26); // nunca más que el máximo
  // 184 días de 2026: 1000 × 26 % × 184 / 365
  assert.equal(cuotaEntre(portatil, '2026-01-01', '2026-12-31'), 131.07);
  assert.equal(cuotaEntre(portatil, '2027-01-01', '2027-12-31'), 260);
  // Al final no pasa de lo que costó.
  assert.equal(acumulada(portatil, '2031-12-31'), 1000);
  assert.equal(cuotaEntre(portatil, '2026-01-01', '2026-06-30'), 0);
  // Los de 300 € o menos, enteros el día de la compra.
  assert.equal(cuotaEntre({ ...portatil, base: 250 }, '2026-07-01', '2026-09-30'), 250);
  const q = amortizacionesAnio([portatil], 2026);
  assert.deepEqual(q.map((x) => x.t), [3, 4]);
  const [l] = libroBienes([portatil], 2027);
  assert.equal(l.acumulada, 391.07);
  assert.equal(l.pendiente, 608.93);
});

test('el bien de inversión: IVA entero en el 303 (30 y 31) y en el 130 solo la amortización', () => {
  const facturas = [{ fecha: '2026-07-10', actividad: 'dj', base: 3000, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'X' } }];
  const gastos = [portatil, { id: 'g', fecha: '2026-07-02', actividad: 'dj', concepto: 'Gestoría', base: 100, ivaPct: 21 }];
  const c = casillas303(facturas, gastos, 2026, 3);
  assert.equal(c['28'], 100); assert.equal(c['30'], 1000); assert.equal(c['31'], 210); assert.equal(c['45'], 231);
  const q3 = resumenAnual(facturas, gastos, 2026, {}, ['dj']).trimestres[2];
  assert.equal(q3.amortizacion, 65.53); // 92 días
  assert.equal(q3.gastos, 165.53);
  assert.equal(q3.ivaDed, 231);
  const is = borradorSociedades(facturas, gastos, 2026);
  assert.equal(is.amortizacion, 126.03); // tabla de sociedades: 25 %
  assert.equal(is.gastos, 226.03);
});

test('categorías: a mano, nóminas y por el concepto', () => {
  assert.equal(categoriaDe({ concepto: 'Alquiler del almacén' }), '621');
  assert.equal(categoriaDe({ concepto: 'Gestoría' }), '623');
  assert.equal(categoriaDe({ concepto: 'Combustible furgoneta' }), '628');
  assert.equal(categoriaDe({ concepto: 'Nóminas y Seguridad Social' }), '640');
  assert.equal(categoriaDe({ concepto: 'Nómina Ana', nomina: 'n1' }), '640');
  assert.equal(categoriaDe({ concepto: 'Cosa rara' }), '629');
  assert.equal(categoriaDe({ concepto: 'Gestoría', categoria: '627' }), '627');
  assert.ok(pareceBien({ concepto: 'Equipo de sonido nuevo (altavoces)', base: 3000 }));
  assert.ok(!pareceBien({ concepto: 'Cables', base: 3000 }));
});

test('cuenta de pérdidas y ganancias y balance', () => {
  const facturas = [
    { fecha: '2026-02-01', actividad: 'dj', base: 5000, ivaPct: 21, irpfPct: 0, cobrada: true, cliente: { nombre: 'X' } },
    { fecha: '2026-11-01', actividad: 'dj', base: 1000, ivaPct: 21, irpfPct: 0, cobrada: false, cliente: { nombre: 'Y' } },
  ];
  const gastos = [
    portatil,
    { id: 'a', fecha: '2026-03-01', concepto: 'Alquiler del local', base: 600, ivaPct: 21 },
    { id: 'b', fecha: '2026-03-01', concepto: 'Material', base: 400, ivaPct: 21, pendiente: true },
    { id: 'c', fecha: '2026-04-01', concepto: 'Intereses del préstamo', base: 50, ivaPct: 0 },
  ];
  const p = pyg(facturas, gastos, periodo(2026), { nombres: { dj: 'DJ' } });
  const v = (id) => p.partidas.find((x) => x.id === id).importe;
  assert.equal(v('cifra'), 6000);
  assert.equal(v('aprovisionamientos'), -400);
  assert.equal(v('explotacion'), -600);
  assert.equal(v('amortizacion'), -131.07);
  assert.equal(p.explotacion, 4868.93);
  assert.equal(p.financiero, -50);
  assert.equal(p.resultado, 4818.93);
  assert.equal(pyg(facturas, gastos, periodo(2026, 1)).antes, 4000);

  const b = balance({ facturas, gastos, resultado: p.resultado, saldo: { importe: 2000, fecha: '2026-12-01' } }, '2026-12-31');
  assert.equal(b.activo[0].importe, 868.93);
  assert.equal(b.activo[1].importe, 3210); // 1210 de clientes + 2000 en el banco
  assert.equal(b.pasivo[1].detalle[0].importe, 484); // proveedor sin pagar, con IVA
  assert.equal(b.total, r(b.pasivo[0].importe + b.pasivo[1].importe));
});
const r = (n) => Math.round(n * 100) / 100;
