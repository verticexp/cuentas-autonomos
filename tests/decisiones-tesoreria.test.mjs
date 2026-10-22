// Decisiones de la auditoría aplicadas (22-10-2026): tesorería que pregunta «¿Ya lo has presentado?», 111 y 115 con su
// propia marca, el periodo de cada extracto para el aviso del día 3 y el domicilio de un cliente empresa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prevision, pagadosSinExtracto, VENCIDOS_DIAS } from '../lib/tesoreria.js';
import { leerNorma43, mesCubierto, periodoExtracto } from '../lib/banco.js';
import { avisosDelDia } from '../lib/avisos.js';
import { validarFactura } from '../lib/validacion.js';

const fiscal = { tipo: 'autonomo', iva: 'general', trabajadores: true };
const fac = (id, fecha, base) => ({ id, numero: Number(id), anio: Number(fecha.slice(0, 4)), fecha, base, ivaPct: 21, irpfPct: 15, cliente: { nombre: `C${id}` }, concepto: 'Sesión', cobrada: true });
const gestoria = { id: 'g', fecha: '2026-08-10', base: 200, ivaPct: 21, irpfPct: 15, concepto: 'Gestoría', proveedor: 'Gestoría', proveedorNif: 'B12345674', pagado: '2026-08-10' };
const hacienda = (p) => p.movimientos.filter((m) => m.tipo === 'hacienda');

test('un plazo que pasó sin marcar se cuenta hoy y pregunta si ya se presentó', () => {
  const p = prevision({ facturas: [fac('1', '2026-08-01', 10000)], gastos: [gestoria], fiscal, hoy: '2026-10-22', meses: 1, actividades: [] });
  const iva = hacienda(p).find((m) => m.concepto === 'IVA (303) del 3T');
  assert.deepEqual([iva.fecha, iva.vencido, iva.pregunta], ['2026-10-22', true, { modelo: '303', anio: 2026, t: 3 }]);
  assert.match(iva.detalle, /Venció el 20\/10: ¿ya lo has presentado\?/);
  assert.ok(hacienda(p).some((m) => m.concepto === 'Retenciones (111) del 3T' && m.pregunta?.modelo === '111'));
  // Marcado, desaparece; y más allá de VENCIDOS_DIAS ya no se pregunta.
  const marcado = prevision({ facturas: [fac('1', '2026-08-01', 10000)], gastos: [gestoria], fiscal, pres303: { 2026: { 3: true } }, pagos130: { 2026: { 3: 1500 } }, pres111: { 2026: { 3: true } }, hoy: '2026-10-22', meses: 1, actividades: [] });
  assert.ok(!hacienda(marcado).some((m) => m.concepto.includes('3T')));
  const tarde = new Date(Date.parse('2026-10-20T12:00:00Z') + (VENCIDOS_DIAS + 1) * 864e5).toISOString().slice(0, 10);
  assert.ok(!hacienda(prevision({ facturas: [fac('1', '2026-08-01', 10000)], fiscal, hoy: tarde, meses: 1, actividades: [] })).some((m) => m.concepto.includes('3T')));
});

test('111 y 115 con su marca: sin ella, como el trimestre; con ella, por su cuenta', () => {
  const datos = { facturas: [fac('1', '2026-08-01', 10000)], gastos: [gestoria], fiscal, hoy: '2026-10-05', meses: 1, actividades: [] };
  const ret = (p) => hacienda(p).find((m) => m.concepto === 'Retenciones (111) del 3T');
  const trimestre = { pres303: { 2026: { 3: true } }, pagos130: { 2026: { 3: 1500 } } };
  assert.ok(!ret(prevision({ ...datos, ...trimestre })), 'sin marca, presentado con el trimestre');
  assert.ok(ret(prevision({ ...datos, ...trimestre, pres111: { 2026: { 3: false } } })), 'marcado pendiente, se cuenta');
  assert.ok(!ret(prevision({ ...datos, pres111: { 2026: { 3: true } } })), 'marcado presentado, no se cuenta aunque falte el 303');
  assert.ok(hacienda(prevision({ ...datos, pres111: { 2026: { 3: true } } })).some((m) => m.concepto === 'IVA (303) del 3T'));
});

test('el 111 marcado como pagado después del saldo se resta hasta que llega el extracto', () => {
  const r = pagadosSinExtracto({ gastos: [gestoria], fiscal, pagadosHacienda: { '2026-3-111': { fecha: '2026-10-15' } }, saldo: { fecha: '2026-10-10' }, actividades: [] });
  assert.deepEqual(r, [{ modelo: '111', anio: 2026, t: 3, fecha: '2026-10-15', importe: 30 }]);
});

test('periodo de un extracto: Norma 43 por su cabecera; CSV, del día 1 al día antes de subirlo', () => {
  const n43 = ['11' + '2100' + '0001' + '0123456789' + '261001' + '261031' + '2' + '00000000100000' + '978' + '3' + 'MI CUENTA'.padEnd(26) + '   ', '33' + ' '.repeat(57) + '2' + '00000000100000'].join('\n');
  const r = leerNorma43(n43);
  assert.deepEqual([r.cuentas[0].desde, r.cuentas[0].hasta], ['2026-10-01', '2026-10-31']);
  assert.deepEqual(periodoExtracto({ desde: '2026-10-01', hasta: '2026-10-31' }, '2026-11-02'), { desde: '2026-10-01', hasta: '2026-10-31', subido: '2026-11-02' });
  assert.deepEqual(periodoExtracto({ movimientos: [{ fecha: '2026-10-03' }, { fecha: '2026-10-27' }] }, '2026-11-02'), { desde: '2026-10-01', hasta: '2026-11-01', subido: '2026-11-02' });
  // Un extracto viejo subido tarde no cubre hasta hoy.
  assert.deepEqual(periodoExtracto({ movimientos: [{ fecha: '2026-03-15' }, { fecha: '2026-03-28' }] }, '2026-11-02'), { desde: '2026-03-15', hasta: '2026-03-28', subido: '2026-11-02' });
  assert.equal(periodoExtracto({ movimientos: [] }, '2026-11-02'), null);
  assert.ok(mesCubierto([{ desde: '2026-10-01', hasta: '2026-10-15' }, { desde: '2026-10-16', hasta: '2026-11-01' }], '2026-10'));
  assert.ok(!mesCubierto([{ desde: '2026-10-01', hasta: '2026-10-15' }, { desde: '2026-10-17', hasta: '2026-11-01' }], '2026-10'));
});

test('aviso «Sube el extracto»: no si el mes ya está subido aunque el último movimiento sea del 20', () => {
  const pide = (banco) => avisosDelDia({ banco }, '2026-11-03').some((a) => a.tipo === 'extracto-2026-10');
  assert.ok(!pide({ conectado: false, ultimo: '2026-10-20', extractos: [[{ desde: '2026-10-01', hasta: '2026-11-01' }]] }));
  assert.ok(pide({ conectado: false, ultimo: '2026-10-20', extractos: [[{ desde: '2026-09-01', hasta: '2026-10-20' }]] }));
  // Con dos cuentas, hacen falta las dos.
  assert.ok(pide({ conectado: false, ultimo: '2026-10-30', extractos: [[{ desde: '2026-10-01', hasta: '2026-11-01' }], [{ desde: '2026-09-01', hasta: '2026-09-30' }]] }));
  // Sin periodos guardados (extractos de antes), como siempre: por el último movimiento.
  assert.ok(pide({ conectado: false, ultimo: '2026-10-20' }) && !pide({ conectado: false, ultimo: '2026-10-28' }));
});

test('factura a una empresa: lleva su domicilio (art. 6.1.e del Reglamento de facturación)', () => {
  const v = (cliente, o) => validarFactura({ fecha: '2026-10-22', cliente, base: '100', ivaPct: 21 }, o);
  assert.match(v({ nombre: 'ACME SL', nif: 'B12345674' }).errores['cliente.direccion'], /domicilio/);
  assert.ok(v({ nombre: 'ACME SL', nif: 'B12345674', direccion: 'C/ Mayor, 1' }).ok);
  assert.ok(v({ nombre: 'Ana', nif: '12345678Z' }).ok, 'a un particular, no se exige');
  assert.ok(v({ nombre: 'Client Ltd', nif: 'GB123456789', pais: 'GB' }).ok, 'ni a una de fuera');
  assert.ok(v({ nombre: 'ACME SL', nif: 'B12345674' }, { rectificativa: true }).ok, 'ni a una rectificativa');
});
