import test from 'node:test';
import assert from 'node:assert/strict';
import { deEnableBanking, esNorma43, fechaBanco, leerNorma43, leerTablaBanco, opciones, saldoDeEnableBanking, saldoTotal, sugerencias } from '../lib/banco.js';
import { norma43 } from './e2e/n43.mjs';

test('banco: Norma 43 con cargos, abonos, conceptos complementarios y saldo final', () => {
  const txt = norma43({ inicial: 1000, movimientos: [
    { fecha: '2026-09-02', importe: 1210, ref1: 'TRANSF', ref2: 'FRA 07-2026', texto: 'HOTEL MIRADOR DEL PORT SA' },
    { fecha: '2026-09-03', importe: -60.5, ref1: 'TARJETA', ref2: 'FERRETERIA SOL' },
    { fecha: '2026-09-03', importe: -60.5, ref1: 'TARJETA', ref2: 'FERRETERIA SOL' },
  ] });
  assert.ok(esNorma43(txt));
  assert.ok(!esNorma43('Fecha;Concepto;Importe\n'));
  const r = leerNorma43(txt);
  assert.deepEqual(r.cuentas, [{ id: 'n43-210004180200051332', nombre: 'SONORA EVENTOS', numero: '210004180200051332', saldo: 2089, fechaSaldo: '2026-09-03' }]);
  assert.deepEqual(r.movimientos.map((m) => [m.fecha, m.importe]), [['2026-09-02', 1210], ['2026-09-03', -60.5], ['2026-09-03', -60.5]]);
  assert.equal(r.movimientos[0].contraparte, 'HOTEL MIRADOR DEL PORT SA');
  assert.match(r.movimientos[0].concepto, /HOTEL MIRADOR.*FRA 07-2026/);
  // Dos movimientos idénticos el mismo día son dos movimientos (ids distintos), y el id no cambia al volver a leerlo.
  assert.notEqual(r.movimientos[1].id, r.movimientos[2].id);
  assert.deepEqual(leerNorma43(txt).movimientos.map((m) => m.id), r.movimientos.map((m) => m.id));
  assert.ok(leerNorma43('hola').error);
});

test('banco: CSV de banca online con importe único o con cargo y abono', () => {
  const a = leerTablaBanco([
    ['Movimientos de la cuenta'], [],
    ['F. Operación', 'F. Valor', 'Concepto', 'Importe (EUR)', 'Saldo (EUR)'],
    ['05/10/2026', '05/10/2026', 'Transferencia de Ana López', '1.062,50', '3.000,00'],
    ['01/10/2026', '01/10/2026', 'Recibo Movistar', '-48,40', '1.937,50'],
    ['', '', '', '', ''],
    ['basura', '', '', 'x', ''],
  ]);
  assert.deepEqual(a.movimientos.map((m) => [m.fecha, m.importe, m.concepto]), [['2026-10-05', 1062.5, 'Transferencia de Ana López'], ['2026-10-01', -48.4, 'Recibo Movistar']]);
  assert.deepEqual([a.cuentas[0].saldo, a.cuentas[0].fechaSaldo, a.errores], [3000, '2026-10-05', 1]);
  const b = leerTablaBanco([['Fecha', 'Descripción', 'Cargo', 'Abono', 'Beneficiario/Ordenante'], ['2026-09-01', 'Pago', '120,00', '', 'Gestoría Ruiz'], ['2026-09-02', 'Cobro', '', '500', 'Bea']]);
  assert.deepEqual(b.movimientos.map((m) => [m.importe, m.contraparte]), [[-120, 'Gestoría Ruiz'], [500, 'Bea']]);
  assert.equal(b.cuentas[0].saldo, null);
  assert.ok(leerTablaBanco([['a', 'b'], ['1', '2']]).error);
  assert.deepEqual([fechaBanco('3-9-26'), fechaBanco('31/02/2026'), fechaBanco(46300)], ['2026-09-03', null, '2026-10-05']);
});

const F = [
  { id: '2026-7', numero: 7, anio: 2026, fecha: '2026-09-01', cliente: { nombre: 'Hotel Mirador del Port S.A.' }, base: 1000, ivaPct: 21, irpfPct: 0, cobrada: false },
  { id: '2026-8', numero: 8, anio: 2026, fecha: '2026-09-05', cliente: { nombre: 'Celebra Bodas S.L.' }, base: 1000, ivaPct: 21, irpfPct: 0, cobrada: false },
  { id: '2026-9', numero: 9, anio: 2026, fecha: '2026-09-06', cliente: { nombre: 'Ana López' }, base: 500, ivaPct: 21, irpfPct: 15, cobrada: true },
];
const G = [
  { id: 'g1', fecha: '2026-09-01', concepto: 'Cables', proveedor: 'Ferretería Sol', base: 50, ivaPct: 21, pendiente: true },
  { id: 'g2', fecha: '2026-06-01', concepto: 'Antiguo', base: 50, ivaPct: 21 },
  { id: 'g3', fecha: '2026-09-10', concepto: 'Gestoría', base: 100, ivaPct: 21 },
];
const M = [
  { id: 'a', fecha: '2026-09-20', importe: 1210, concepto: 'TRANSF FRA 08-2026', estado: 'pendiente' },
  { id: 'b', fecha: '2026-09-21', importe: 1210, concepto: 'TRANSFERENCIA', estado: 'pendiente' },
  { id: 'c', fecha: '2026-09-15', importe: -60.5, concepto: 'TARJETA FERRETERIA SOL', estado: 'pendiente' },
  { id: 'd', fecha: '2026-09-11', importe: -121, concepto: 'Recibo', estado: 'pendiente' },
  { id: 'e', fecha: '2026-09-12', importe: 425, concepto: 'Ana', estado: 'pendiente' },
  { id: 'f', fecha: '2026-09-12', importe: 99, concepto: 'Nada', estado: 'pendiente' },
  { id: 'z', fecha: '2026-09-12', importe: 1210, concepto: '07-2026', estado: 'ignorado' },
];

test('banco: sugerencias seguras por número de factura o nombre, y cada factura para un solo movimiento', () => {
  const s = sugerencias(M, F, G);
  assert.deepEqual(s.a, { tipo: 'factura', id: '2026-8', puntos: 90, segura: true });
  // «b» tiene el mismo importe pero sin pistas: se queda con la otra factura y no es segura.
  assert.deepEqual([s.b.id, s.b.segura], ['2026-7', false]);
  assert.deepEqual([s.c.tipo, s.c.id, s.c.segura], ['gasto', 'g1', true]);
  assert.deepEqual([s.d.id, s.d.segura], ['g3', false]);
  // Factura ya cobrada, importe sin pareja o movimiento ignorado: sin sugerencia.
  assert.equal(s.e, undefined);
  assert.equal(s.f, undefined);
  assert.equal(s.z, undefined);
  // Un gasto ya emparejado con otro movimiento no se vuelve a sugerir.
  const s2 = sugerencias([...M, { id: 'y', fecha: '2026-09-02', importe: -60.5, concepto: 'x', estado: 'emparejado', enlace: { tipo: 'gasto', id: 'g1' } }], F, G);
  assert.equal(s2.c, undefined);
});

test('banco: opciones para elegir a mano, las de importe más parecido primero', () => {
  assert.deepEqual(opciones(M[0], F, G).map((o) => o.id), ['2026-7', '2026-8']);
  assert.deepEqual(opciones(M[3], F, G).map((o) => o.id), ['g3', 'g1']); // g2 es de hace más de 60 días
});

test('banco: saldo total y datos de Enable Banking', () => {
  assert.deepEqual(saldoTotal([{ saldo: 100.1, fechaSaldo: '2026-10-01' }, { saldo: 50, fechaSaldo: '2026-10-05' }, { saldo: null }]), { importe: 150.1, fecha: '2026-10-05', banco: true, cuentas: 2 });
  assert.equal(saldoTotal([{ nombre: 'x' }]), null);
  assert.equal(saldoDeEnableBanking([{ balance_type: 'OTHR', balance_amount: { amount: '1' } }, { balance_type: 'CLBD', balance_amount: { amount: '2.5' } }]), 2.5);
  assert.equal(saldoDeEnableBanking([]), null);
  const t = deEnableBanking('eb-1', { entry_reference: 'R1', transaction_amount: { amount: '60.50', currency: 'EUR' }, credit_debit_indicator: 'DBIT', booking_date: '2026-09-15', remittance_information: ['COMPRA', 'FERRETERIA SOL'], creditor: { name: 'Ferretería Sol' } });
  assert.deepEqual([t.importe, t.fecha, t.concepto, t.contraparte, t.cuenta], [-60.5, '2026-09-15', 'COMPRA FERRETERIA SOL', 'Ferretería Sol', 'eb-1']);
  assert.equal(deEnableBanking('eb-1', { entry_reference: 'R1', transaction_amount: { amount: '1' }, booking_date: '2026-09-15' }).id, t.id);
  assert.equal(deEnableBanking('eb-1', { transaction_amount: { amount: '0' }, booking_date: '2026-09-15' }), null);
});
