// IVA que la prorrata no deja deducir: gasto del año, salvo el de los bienes de inversión, que es más valor del bien y se
// amortiza con él (norma de registro y valoración 12.ª del PGC; art. 28.1 LIRPF y 10.3 LIS). Esperados calculados a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, prorrataBienes, resumenAnual } from '../lib/calculos.js';
import { borradorSociedades } from '../lib/modelos.js';
import { generarAsientos } from '../lib/asientos.js';
import { libroBienes } from '../lib/amortizaciones.js';

const cliente = { nombre: 'Cliente SL', nif: 'B12345674' };
const F = [
  { id: 'v', fecha: '2026-02-01', actividad: 'a', cliente, base: 6000, ivaPct: 21, irpfPct: 0 },
  { id: 'e', fecha: '2026-02-02', actividad: 'a', cliente, base: 4000, ivaPct: 0, irpfPct: 0, operacion: 'exenta' },
];
const G = [
  { id: 'comun', fecha: '2026-02-10', actividad: 'a', concepto: 'Asesoría', proveedor: 'P', proveedorNif: 'B11111119', base: 1000, ivaPct: 21, categoria: '623' },
  { id: 'maquina', fecha: '2026-05-10', actividad: 'a', concepto: 'Máquina', proveedor: 'P', proveedorNif: 'B11111119', base: 4000, ivaPct: 21, inversion: { tipo: 'maquinaria' } },
];
// Sin año anterior, la provisional es la del propio año: 6.000 / 10.000 = 60 % (art. 105.Dos LIVA). 1T: 210 × 60 % = 126
// deducidos y 84 perdidos; 2T: la máquina, 840 × 60 % = 504 deducidos y 336 perdidos, que van a su valor (4.336).

test('prorrata: el IVA perdido de un bien de inversión va a su valor y se amortiza', () => {
  assert.deepEqual([...prorrataBienes(F, G)], [['maquina', 336]]);
  // Amortización (maquinaria, 12 %): 2T del 10-5 al 30-6, 52 días: 4.336 × 12 % × 52 / 365 = 74,13.
  const r = resumenAnual(F, G, 2026, {}, ['a']).trimestres;
  assert.deepEqual([r[0].gastos, r[0].prorrata], [1084, 84]);
  assert.deepEqual([r[1].gastos, r[1].amortizacion, r[1].prorrata], [74.13, 74.13, undefined]);
  // Libro de bienes: valor 4.336; año: 236 días → 4.336 × 12 % × 236 / 365 = 336,43.
  const [b] = libroBienes(G, 2026, { regimen: 'sociedad', prorrata: prorrataBienes(F, G) });
  assert.deepEqual([b.valor, b.anio], [4336, 336.43]);
});

test('prorrata en Sociedades: gasto del año en el borrador y en la contabilidad, que cuadra con el 303', () => {
  // 10.000 − (1.000 + 84 + 336,43) = 8.579,57.
  const is = borradorSociedades(F, G, 2026);
  assert.deepEqual([is.prorrata, is.amortizacion, is.gastos, is.resultadoContable], [84, 336.43, 1420.43, 8579.57]);
  const A = generarAsientos({ facturas: F, gastos: G, fiscal: { tipo: 'sociedad', iva: 'general' } }, '2027-03-01');
  const saldo = (cuenta, hasta) => Math.round(A.filter((a) => a.fecha <= hasta && a.origen?.tipo !== 'regularizacion').flatMap((a) => a.lineas).filter((l) => l.cuenta === cuenta).reduce((s, l) => s + l.debe - l.haber, 0) * 100) / 100;
  assert.deepEqual([saldo('634', '2026-12-31'), saldo('213', '2026-12-31'), saldo('472', '2026-12-31')], [84, 4336, 0]);
  // Lo que la contabilidad deja a pagar cada trimestre es la casilla 46 del 303: 1T 1.260 − 126 = 1.134.
  const liq = (t) => A.find((a) => a.concepto === `Liquidación del IVA (303) del ${t}T 2026`).lineas;
  const aPagar = (t) => liq(t).filter((l) => l.cuenta === '4750').reduce((s, l) => s + l.haber, 0) - liq(t).filter((l) => l.cuenta === '4700').reduce((s, l) => s + l.debe, 0);
  assert.equal(aPagar(1), casillas303(F, G, 2026, 1)['46']);
  assert.equal(aPagar(1), 1134);
  assert.equal(casillas303(F, G, 2026, 2)['46'], -504);
  // Resultado antes de impuestos de la contabilidad = el del borrador.
  const pyg = Math.round(A.filter((a) => a.fecha.startsWith('2026-') && a.origen?.tipo !== 'regularizacion').flatMap((a) => a.lineas).filter((l) => /^[67]/.test(l.cuenta) && l.cuenta !== '630').reduce((s, l) => s + l.haber - l.debe, 0) * 100) / 100;
  assert.equal(pyg, 8579.57);
});
