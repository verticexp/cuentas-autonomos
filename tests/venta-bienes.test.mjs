// Venta de un bien de inversión de la actividad (factura con accesoria 'inversion' y el bien elegido): se da de baja ese
// día. Autónomo: no es rendimiento de la actividad sino ganancia o pérdida patrimonial en la base del ahorro (arts. 28.2,
// 33, 37.1.n, 46.b y 66 LIRPF). Sociedad: beneficio o pérdida del inmovilizado (771 y 671). Esperados calculados a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumenAnual } from '../lib/calculos.js';
import { borradorRenta, borradorSociedades } from '../lib/modelos.js';
import { bajasBienes } from '../lib/amortizaciones.js';
import { generarAsientos } from '../lib/asientos.js';

const cliente = { nombre: 'Cliente SL', nif: 'B12345674' };
const maquina = { id: 'maquina', fecha: '2025-01-01', actividad: 'a', concepto: 'Máquina', proveedor: 'P', proveedorNif: 'B11111119', base: 10000, ivaPct: 21, inversion: { tipo: 'maquinaria' } };
const servicio = { id: 's', fecha: '2026-02-01', actividad: 'a', cliente, base: 20000, ivaPct: 21, irpfPct: 0 };
const venta = { id: 'venta', fecha: '2026-07-01', actividad: 'a', cliente, base: 9000, ivaPct: 21, irpfPct: 0, accesoria: 'inversion', bien: 'maquina' };
// Amortización (maquinaria, 12 %: 1.200 € al año): 2025 entero, 1.200; 2026 hasta la venta (1-1 a 1-7, 182 días):
// 1.200 × 182 / 365 = 598,36. Acumulada 1.798,36; queda 10.000 − 1.798,36 = 8.201,64. Precio 9.000: ganancia 798,36.

test('venta de un bien: deja de amortizarse el día de la venta y no es ingreso de la actividad del autónomo', () => {
  assert.deepEqual([...bajasBienes([servicio, venta])], [['maquina', { fecha: '2026-07-01', precio: 9000 }]]);
  const T = resumenAnual([servicio, venta], [maquina], 2026, {}, ['a']).trimestres;
  // 1T: 90 días → 295,89; 2T: 91 → 299,18; 3T: el 1 de julio → 3,29; 4T: nada.
  assert.deepEqual(T.map((q) => q.amortizacion), [295.89, 299.18, 3.29, 0]);
  assert.deepEqual(T.map((q) => q.ingresos), [20000, 0, 0, 0]);
});

test('venta de un bien: ganancia patrimonial en la base del ahorro de la renta (19 % hasta 6.000 €)', () => {
  const r = borradorRenta([servicio, venta], [maquina], 2026);
  assert.deepEqual(r.ganancias, [{ id: 'maquina', concepto: 'Máquina', fecha: '2026-07-01', transmision: 9000, adquisicion: 8201.64, ganancia: 798.36 }]);
  // La base general pasa del mínimo (5.550): 798,36 × 9,5 % = 75,84 estatal y otro tanto autonómica.
  assert.deepEqual([r.baseAhorro, r.cuotaAhorro, r.ingresos, r.sinBien], [798.36, 151.68, 20000, 0]);
  // Sin más rentas, el mínimo que no cabe en la base general (negativa) cubre la ganancia: cuota del ahorro 0.
  assert.equal(borradorRenta([venta], [maquina], 2026).cuotaAhorro, 0);
  // Rebaja de 1.000 € del precio (rectificativa): 8.000 − 8.201,64 = −201,64, que no resta aquí (art. 49 LIRPF).
  const rect = { id: 'r', fecha: '2026-07-15', actividad: 'a', cliente, base: -1000, ivaPct: 21, irpfPct: 0, rectifica: { id: 'venta', fecha: '2026-07-01', motivo: 'descuento' } };
  const r2 = borradorRenta([servicio, venta, rect], [maquina], 2026);
  assert.deepEqual([r2.ganancias[0].ganancia, r2.baseAhorro, r2.cuotaAhorro, r2.ingresos], [-201.64, 0, 0, 20000]);
  // Una venta sin decir qué bien: aviso.
  assert.equal(borradorRenta([servicio, { ...venta, bien: undefined }], [maquina], 2026).sinBien, 1);
});

test('venta de un bien en una sociedad: beneficio del inmovilizado en el IS y en la contabilidad (771)', () => {
  // 20.000 + 9.000 − 598,36 de amortización − 8.201,64 sin amortizar = 20.200.
  const is = borradorSociedades([servicio, venta], [maquina], 2026);
  assert.deepEqual([is.ingresos, is.amortizacion, is.vendidos, is.resultadoContable], [29000, 598.36, 8201.64, 20200]);
  const A = generarAsientos({ facturas: [servicio, venta], gastos: [maquina], fiscal: { tipo: 'sociedad', iva: 'general' } }, '2027-03-01');
  const lineas = A.find((a) => a.origen?.id === 'venta').lineas.map((l) => [l.cuenta, l.debe, l.haber]);
  assert.deepEqual(lineas.sort(), [['213', 0, 10000], ['281', 1798.36, 0], ['430', 10890, 0], ['477', 0, 1890], ['771', 0, 798.36]].sort());
  const saldo = (c) => Math.round(A.filter((a) => a.fecha <= '2026-12-31' && a.origen?.tipo !== 'regularizacion').flatMap((a) => a.lineas).filter((l) => l.cuenta === c).reduce((s, l) => s + l.debe - l.haber, 0) * 100) / 100 || 0;
  assert.deepEqual([saldo('213'), saldo('281')], [0, 0]);
  const pyg = Math.round(A.filter((a) => a.fecha.startsWith('2026-') && a.origen?.tipo !== 'regularizacion').flatMap((a) => a.lineas).filter((l) => /^[67]/.test(l.cuenta) && l.cuenta !== '630').reduce((s, l) => s + l.haber - l.debe, 0) * 100) / 100;
  assert.equal(pyg, 20200);
});
