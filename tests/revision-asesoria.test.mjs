// Informe de la asesoría fiscal (20/10/2026): casos especiales de los modelos 303, 130 y 111, con sus mismos ejemplos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, fechaIrpf, limiteTrimestre, liquidaciones303, prorrataAnio, r2, resumenAnual } from '../lib/calculos.js';
import { costeAfecto } from '../lib/ivaDeducible.js';
import { amortizacionesAnio } from '../lib/amortizaciones.js';
import { fichero303 } from '../lib/ficheroAeat.js';
import { modelo390, retencionesProfesionales } from '../lib/modelos.js';
import { avisosFiscales } from '../lib/revisionFiscal.js';
import { tipoFactura } from '../lib/verifactu.js';

const fac = (id, fecha, base, extra = {}) => ({ id, fecha, numero: Number(id.replace(/\D/g, '')) || 1, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente: { nombre: 'Cliente', nif: '12345678Z' }, base, ivaPct: 21, irpfPct: 0, ...extra });
const gas = (id, fecha, base, extra = {}) => ({ id, fecha, actividad: 'a', concepto: id, proveedor: 'Proveedor', proveedorNif: 'B12345678', base, ivaPct: 21, ...extra });
const yo = { nif: '12345678Z', nombre: 'Prueba Kontix' };

test('1. Rectificativas: el ejemplo del 1T del informe (303 y 130)', () => {
  const F = [fac('f1', '2026-01-15', 5000, { irpfPct: 15 }), fac('r1', '2026-02-10', -1000, { irpfPct: 15, serie: 'R', rectifica: { id: 'f0', numero: '01-2026', fecha: '2026-01-15', motivo: 'devolucion' } })];
  const G = [gas('g1', '2026-02-01', 2000)];
  const c = casillas303(F, G, 2026, 1);
  assert.deepEqual([c['07'], c['09'], c['14'], c['15'], c['27'], c['29'], c['46']], [5000, 1050, -1000, -210, 840, 420, 420]);
  const q = resumenAnual(F, G, 2026).trimestres[0];
  assert.deepEqual([q.ingAcum, q.retAcum, q.rendAcum, q.c07, q.m130], [4000, 600, 1900, -220, 0]);
});

test('1. Rectificativa al alza por un error al facturar: va al trimestre de la original (art. 89.Cinco LIVA)', () => {
  const original = fac('f1', '2026-05-10', 2000, { ivaPct: 10 });
  const rect = (motivo) => fac('r1', '2026-11-05', 0, { serie: 'R', ivaPct: 21, rectifica: { id: 'f1', numero: '05-2026', fecha: '2026-05-10', motivo },
    lineas: [{ concepto: 'Anula al 10 %', cantidad: 1, precio: -2000, dto: 0, ivaPct: 10 }, { concepto: 'Al 21 %', cantidad: 1, precio: 2000, dto: 0, ivaPct: 21 }] });
  // Error al facturar (R4): los 220 € de más van al 2T; el 4T no los lleva.
  const F = [original, rect('errorFactura')];
  const t2 = casillas303(F, [], 2026, 2), t4 = casillas303(F, [], 2026, 4);
  assert.deepEqual([t2['04'], t2['06'], t2['07'], t2['09'], t2['46']], [0, 0, 2000, 420, 420]);
  assert.equal(t4['46'], 0);
  assert.equal(tipoFactura(F[1]), 'R4');
  const avisos = avisosFiscales({ facturas: F, gastos: [], anio: 2026, hoy: '2026-11-06' });
  assert.ok(avisos.some((a) => a.id === 'alza-r1' && /autoliquidación rectificativa/.test(a.texto) && /2T 2026/.test(a.texto)));
  // Un cambio de precio (art. 80, R1) sí va en el trimestre de la rectificativa, en las 14 y 15.
  const D = [original, rect('devolucion')];
  assert.equal(casillas303(D, [], 2026, 2)['46'], 200);
  assert.deepEqual([casillas303(D, [], 2026, 4)['14'], casillas303(D, [], 2026, 4)['15']], [0, 220]);
  // Una rectificativa de 2027 de esa factura de 2026 cuenta en 2026 aunque la liquidación corte a 31 de diciembre.
  const tarde = [original, { ...rect('errorFactura'), fecha: '2027-01-20', anio: 2027 }];
  assert.equal(liquidaciones303(tarde, [], 2026)[1].bruto, 420);
  assert.equal(liquidaciones303(tarde, [], 2027)[0].bruto, 0);
});

test('1. Rectificativa por error de una factura del año anterior: en el IRPF cuenta en ese año', () => {
  const r = fac('r1', '2026-02-10', -900, { serie: 'R', rectifica: { id: 'f9', numero: '20-2025', fecha: '2025-12-20', motivo: 'errorFactura' } });
  const d = fac('r2', '2026-02-10', -500, { serie: 'R', rectifica: { id: 'f8', numero: '19-2025', fecha: '2025-12-15', motivo: 'devolucion' } });
  assert.equal(fechaIrpf(r), '2025-12-20');
  assert.equal(fechaIrpf(d), '2026-02-10');
  const F = [fac('f9', '2025-12-20', 1000), r, d];
  assert.equal(resumenAnual(F, [], 2026).trimestres[0].ingresos, -500);
  assert.equal(resumenAnual(F, [], 2025).trimestres[3].ingresos, 100);
  const avisos = avisosFiscales({ facturas: F, gastos: [], anio: 2026, hoy: '2026-03-01', c303: false });
  assert.ok(avisos.some((a) => a.id === 'irpf-r1' && /renta de 2025/.test(a.texto)));
});

test('1. Impagados (R3): aviso del modelo 952 durante el mes siguiente', () => {
  const r = fac('r1', '2026-10-01', -1000, { serie: 'R', rectifica: { id: 'f1', numero: '03-2026', fecha: '2026-03-15', motivo: 'incobrable' } });
  assert.equal(tipoFactura(r), 'R3');
  const dentro = avisosFiscales({ facturas: [r], gastos: [], anio: 2026, hoy: '2026-10-20' });
  assert.ok(dentro.some((a) => a.id === '952-r1' && /01-11-2026/.test(a.texto)));
  assert.ok(!avisosFiscales({ facturas: [r], gastos: [], anio: 2026, hoy: '2026-11-02' }).some((a) => a.id === '952-r1'));
});

test('2. IVA deducible en parte: 303 en proporción y afectación al IRPF aparte', () => {
  const gasolina = gas('g1', '2026-02-01', 100, { deduciblePct: 50 });
  const c = casillas303([], [gasolina], 2026, 1);
  assert.deepEqual([c['28'], c['29']], [50, 10.5]);
  // Sin afectación indicada, como hasta ahora (entero más el IVA no deducible) y con aviso; turismo: nada en el IRPF.
  assert.equal(costeAfecto(gasolina), 110.5);
  assert.equal(costeAfecto({ ...gasolina, afectoPct: 0 }), 0);
  assert.equal(costeAfecto({ ...gasolina, afectoPct: 50 }), 50);
  // Suministros de la vivienda con despacho al 20 %: 30 % × 20 % = 6 € por cada 100 € de base.
  const luz = gas('g2', '2026-02-01', 100, { deduciblePct: 20, afectoPct: 6 });
  assert.equal(costeAfecto(luz), 6);
  const F = [fac('f1', '2026-01-10', 1000)];
  assert.equal(resumenAnual(F, [{ ...gasolina, afectoPct: 0 }, luz], 2026).trimestres[0].gastos, 6);
  // Sin 303 (el IVA es coste): la parte afecta de base + IVA.
  assert.equal(costeAfecto({ ...luz }, { ivaCoste: true }), 7.26);
  const avisos = avisosFiscales({ facturas: F, gastos: [gasolina, luz], anio: 2026, hoy: '2026-03-01' });
  assert.ok(avisos.some((a) => a.id === 'afecto' && /Un gasto/.test(a.texto)));
  // Una sociedad no usa la afectación del IRPF.
  assert.equal(resumenAnual(F, [{ ...gasolina, afectoPct: 0 }], 2026, {}, undefined, { regimen: 'sociedad' }).trimestres[0].gastos, 110.5);
});

test('2. Un turismo de uso mixto no se amortiza en el IRPF', () => {
  const coche = gas('g1', '2026-01-01', 20000, { deduciblePct: 50, afectoPct: 0, inversion: { tipo: 'transporte' } });
  assert.equal(amortizacionesAnio([coche], 2026, { irpf: true }).length, 0);
  assert.ok(amortizacionesAnio([coche], 2026).reduce((s, x) => s + x.cuota, 0) > 0);
  assert.equal(resumenAnual([fac('f1', '2026-01-10', 30000)], [coche], 2026).trimestres[3].amortizacion, 0);
});

test('2. Prorrata: 70 % de 1.000 € de IVA soportado son 700 €, y el 4T regulariza con la definitiva', () => {
  const exenta = (id, fecha, base) => fac(id, fecha, base, { ivaPct: 0, operacion: 'exenta' });
  const F = [fac('a1', '2025-03-01', 7000), exenta('a2', '2025-03-01', 3000), fac('f1', '2026-01-10', 8000), exenta('f2', '2026-01-10', 2000)];
  assert.equal(prorrataAnio(F, 2025), 70);
  assert.equal(prorrataAnio(F, 2026), 80);
  const G = [gas('g1', '2026-02-01', 4761.9), gas('g2', '2026-11-01', 4761.9)];
  const t1 = casillas303(F, G, 2026, 1);
  assert.deepEqual([t1['29'], t1.prorrata.provisional], [700, 70]);
  // 4T: 2.000 € de IVA del año al 80 % son 1.600; se dedujeron 1.400: la casilla 44 suma 200.
  const t4 = casillas303(F, G, 2026, 4);
  assert.deepEqual([t4['29'], t4['44'], t4['45'], t4.prorrata.definitiva], [700, 200, 900, 80]);
  // Lo que no se deduce es gasto en el IRPF: 300 + 300 − 200 = 400 € en el año.
  const r = resumenAnual(F, G, 2026);
  assert.equal(r.trimestres[0].gastos, r2(4761.9 + 300));
  assert.equal(r2(r.trimestres[3].gastos), r2(4761.9 + 300 - 200));
  // El provisional guardado manda durante el año.
  assert.equal(casillas303(F, G, 2026, 1, { prorrata: { 2026: 75 } })['29'], 750);
  // Una factura sin IVA sin motivo no activa la prorrata (podría ser otra cosa): sale como aviso.
  const sinMotivo = [fac('f1', '2026-01-10', 8000), fac('f2', '2026-01-10', 2000, { ivaPct: 0 })];
  assert.equal(prorrataAnio(sinMotivo, 2026), null);
  assert.equal(casillas303(sinMotivo, G, 2026, 1)['29'], 1000);
  assert.ok(avisosFiscales({ facturas: sinMotivo, gastos: [], anio: 2026, hoy: '2026-03-01' }).some((a) => a.id === 'exentas'));
  // El fichero de la Sede lleva la regularización en la 44.
  assert.doesNotThrow(() => fichero303(yo, 2026, 4, t4, liquidaciones303(F, G, 2026)[3]));
});
test('2. Abonos de proveedores: casillas 40 y 41, y el fichero de la Sede se genera', () => {
  const G = [gas('g1', '2026-02-01', -500), gas('g2', '2026-02-10', 300)];
  const c = casillas303([], G, 2026, 1);
  assert.deepEqual([c['28'], c['29'], c['40'], c['41'], c['45'], c['46']], [300, 63, -500, -105, -42, 42]);
  const f = fichero303(yo, 2026, 1, c, liquidaciones303([], G, 2026)[0]);
  assert.ok(f.contenido.includes('<T30301000>'));
  assert.equal(modelo390([], G, 2026).cuotaRectDed, -105);
});

test('3. Trimestre negativo: compensación, devolución en el 4T y caducidad de cuatro años', () => {
  const F = [fac('f3', '2026-08-01', 1000), fac('f4', '2026-11-01', 2380.95), fac('n1', '2027-02-01', 1000)];
  const G = [gas('g3', '2026-08-02', 6714.29)];
  const L = liquidaciones303(F, G, 2026);
  assert.equal(L[2].bruto, -1200);
  assert.deepEqual([L[3].bruto, L[3].compensado, L[3].pendiente], [500, 500, 700]);
  // Sin pedir la devolución, el saldo sigue en 2027.
  assert.equal(liquidaciones303(F, G, 2027)[0].anterior, 700);
  // Con la devolución pedida en el 4T: se aplican los 1.200 y se devuelven 700; en 2027 no queda nada que compensar.
  const iva = { pres303: { 2026: { 4: 'devolucion' } } };
  const D = liquidaciones303(F, G, 2026, undefined, iva);
  assert.deepEqual([D[3].compensado, D[3].ingresar, D[3].devolucion, D[3].pendiente], [1200, 0, 700, 0]);
  assert.equal(liquidaciones303(F, G, 2027, undefined, iva)[0].anterior, 0);
  const fich = fichero303(yo, 2026, 4, casillas303(F, G, 2026, 4), D[3]);
  assert.equal(fich.tipo, 'D');
  assert.equal(fich.resultado, -700);
  // Caducidad: el saldo del 3T 2026 se compensa hasta el plazo de ese 303 más cuatro años.
  assert.equal(L[3].caduca, '2030-10-20');
  const viejo = liquidaciones303([...F, fac('x', '2030-02-01', 10)], G, 2030);
  assert.ok(avisosFiscales({ facturas: [], gastos: [], anio: 2030, hoy: '2030-03-01', liquidaciones: viejo }).some((a) => a.id === 'caduca' && /20-10-2030/.test(a.texto)));
});

test('3. 130: un trimestre vencido sin marcar como presentado sale en los avisos', () => {
  const F = [fac('f1', '2026-02-01', 10000), fac('f2', '2026-08-01', 4000)];
  const r130 = resumenAnual(F, [], 2026, {});
  const avisos = avisosFiscales({ facturas: F, gastos: [], anio: 2026, hoy: '2026-10-21', c303: false, r130, pagos130: {} });
  assert.ok(avisos.some((a) => a.id === '130-1'));
  assert.ok(!avisosFiscales({ facturas: F, gastos: [], anio: 2026, hoy: '2026-10-21', c303: false, r130: resumenAnual(F, [], 2026, { 1: 1900 }), pagos130: { 1: 1900 } }).some((a) => a.id === '130-1'));
});

test('4. 111: un abono de un profesional con retención puede dejarlo en negativo y se avisa', () => {
  const G = [gas('p1', '2026-02-01', -1000, { irpfPct: 15 }), gas('p2', '2026-02-10', 400, { irpfPct: 15 })];
  const a111 = (t) => retencionesProfesionales(G, 2026, t).retenciones;
  assert.equal(a111(1), -90);
  assert.ok(avisosFiscales({ facturas: [], gastos: G, anio: 2026, hoy: '2026-04-01', a111 }).some((a) => a.id === '111-1'));
});

test('5. Plazos del 4T de 2026', () => {
  assert.equal(limiteTrimestre(4, 2026), '2027-02-01'); // 303, 130 y 349: el 30 de enero es sábado
  assert.equal(limiteTrimestre(4, 2026, 20), '2027-01-20'); // 111 y 115
});
