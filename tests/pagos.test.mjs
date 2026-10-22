import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { agendaPagos, aPagar, estadoPago, PLAZO_PAGO, textoVence, venceGasto, venceValido } from '../lib/pagos.js';
import { prevision } from '../lib/tesoreria.js';
import { limpiarTicket } from '../lib/ticket.js';
import { propuestaDeEfactura, propuestaDeTicket } from '../lib/bandeja.js';
import { panelResumen } from '../lib/panel.js';

// Pagos a proveedores: el vencimiento de cada gasto sin pagar y la agenda de lo que hay que pagar (lib/pagos.js).
const HOY = '2026-10-22';
const g = (id, fecha, extra = {}) => ({ id, fecha, actividad: 'servicios', concepto: 'Material', proveedor: `Proveedor ${id}`, base: 100, ivaPct: 21, pendiente: true, ...extra });
const corta = (f) => f.split('-').reverse().join('/');

test('vencimiento: el guardado; los de antes, a los 30 días (plazo legal)', () => {
  assert.equal(PLAZO_PAGO, 30);
  assert.equal(venceGasto(g('a', '2026-10-01', { vence: '2026-11-15' })), '2026-11-15');
  assert.equal(venceGasto(g('a', '2026-10-01')), '2026-10-31');
  assert.equal(venceGasto(g('a', '2026-10-01', { vence: 'mañana' })), '2026-10-31', 'una fecha rota no cuenta');
  assert.equal(venceValido('2026-11-15', '2026-10-01'), '2026-11-15');
  assert.equal(venceValido('2026-09-15', '2026-10-01'), undefined, 'no antes de la factura');
  assert.equal(venceValido('2029-01-01', '2026-10-01'), undefined, 'ni a más de dos años');
});

test('estado y texto: pagado, vencido, vence pronto o pendiente', () => {
  assert.equal(estadoPago(g('a', '2026-09-01', { pendiente: false }), HOY), 'pagado');
  assert.equal(estadoPago(g('a', '2026-09-01', { vence: '2026-10-20' }), HOY), 'vencido');
  assert.equal(estadoPago(g('a', '2026-10-01', { vence: '2026-10-29' }), HOY), 'pronto');
  assert.equal(estadoPago(g('a', '2026-10-01', { vence: '2026-11-20' }), HOY), 'pendiente');
  assert.equal(textoVence(g('a', '2026-09-01', { vence: '2026-10-17' }), HOY, corta), 'Vencido hace 5 días');
  assert.equal(textoVence(g('a', '2026-09-01', { vence: '2026-10-21' }), HOY, corta), 'Venció ayer');
  assert.equal(textoVence(g('a', '2026-10-01', { vence: HOY }), HOY, corta), 'Vence hoy');
  assert.equal(textoVence(g('a', '2026-10-01', { vence: '2026-10-23' }), HOY, corta), 'Vence mañana');
  assert.equal(textoVence(g('a', '2026-10-01', { vence: '2026-11-20' }), HOY, corta), 'Vence el 20/11/2026');
});

test('agenda: por urgencia, ordenada por vencimiento, con el total que se paga (sin la retención)', () => {
  const gastos = [
    g('lejos', '2026-10-20', { vence: '2026-12-31' }),
    g('mes', '2026-10-01', { vence: '2026-11-10' }),
    g('ya', '2026-09-01', { vence: '2026-10-01' }),
    g('semana', '2026-10-10', { vence: '2026-10-25', irpfPct: 15 }),
    g('antes', '2026-08-01', { vence: '2026-09-01' }),
    g('pagado', '2026-10-01', { pendiente: false }),
    { ...g('nomina', '2026-10-01'), nomina: true },
  ];
  const a = agendaPagos(gastos, HOY);
  assert.equal(a.n, 5); assert.equal(a.vencidos, 2);
  assert.deepEqual(a.grupos.map((x) => [x.id, x.gastos.map((y) => y.id)]), [['vencido', ['antes', 'ya']], ['semana', ['semana']], ['mes', ['mes']], ['despues', ['lejos']]]);
  assert.equal(aPagar(gastos[3]), 106, 'base 100 + IVA 21 − retención 15');
  assert.equal(a.grupos[1].total, 106); assert.equal(a.totalVencido, 242); assert.equal(a.total, 242 + 106 + 121 + 121);
  assert.deepEqual(agendaPagos([], HOY), { total: 0, n: 0, vencidos: 0, totalVencido: 0, grupos: [] });
});

test('tesorería: cada pago en su vencimiento; los vencidos, hoy', () => {
  const fiscal = { tipo: 'sociedad', iva: 'exento' };
  const G = [g('futuro', '2026-10-10', { vence: '2026-11-09', ivaPct: 0 }), g('antiguo', '2026-10-01', { ivaPct: 0 }), g('vencido', '2026-08-01', { vence: '2026-09-01', ivaPct: 0 })];
  const p = prevision({ gastos: G, fiscal, hoy: HOY, meses: 1 });
  const pagos = Object.fromEntries(p.movimientos.filter((m) => m.tipo === 'pago').map((m) => [m.concepto, m.fecha]));
  assert.deepEqual(pagos, { 'Proveedor futuro': '2026-11-09', 'Proveedor antiguo': '2026-10-31', 'Proveedor vencido': HOY });
});

test('lectura: el vencimiento impreso; si aún no ha llegado, la factura se propone sin pagar', () => {
  const t = limpiarTicket({ proveedor: 'Imprenta', fecha: '2026-10-05', vencimiento: '2026-11-04', base: 100, ivaPct: 21, total: 121, desglose: [{ ivaPct: 21, base: 100, cuota: 21 }], irpf: null, irpfPct: 0 }, HOY);
  assert.equal(t.vence, '2026-11-04');
  assert.equal(limpiarTicket({ fecha: '2026-10-05', vencimiento: '2026-09-01', base: 10, ivaPct: 21, total: 12.1 }, HOY).vence, undefined, 'anterior a la factura: no');
  assert.deepEqual([propuestaDeTicket(t, HOY).vence, propuestaDeTicket(t, HOY).pendiente], ['2026-11-04', true]);
  assert.equal(propuestaDeTicket({ ...t, vence: '2026-10-10' }, HOY).pendiente, undefined, 'ya vencida: puede estar pagada (domiciliación)');
  const e = propuestaDeEfactura({ formato: 'ubl', numero: '1', fecha: '2026-10-05', vencimiento: '2026-12-05', proveedor: { nombre: 'X', nif: 'B1' }, base: 10, ivaPct: 21, desglose: [] }, HOY);
  assert.deepEqual([e.vence, e.pendiente], ['2026-12-05', true]);
});

test('resumen: lo que queda por pagar y los vencidos, sin los documentos', async () => {
  const gastos = [g('a', '2026-09-01', { vence: '2026-10-01', proveedor: 'Endesa' }), g('b', '2026-09-05', { vence: '2026-10-05', proveedor: 'Endesa' }), g('c', '2026-10-20', { vence: '2026-11-20' }), g('d', '2026-10-01', { pendiente: false })];
  const P = panelResumen({ facturas: [], gastos, anio: 2026, hoy: HOY, fiscal: { tipo: 'autonomo', iva: 'general' } });
  assert.equal(P.porPagar, 363); assert.equal(P.sinPagar.length, 3); assert.equal(P.pagosVencidos.length, 2);
  // lib/panelCache.js conecta Redis al importarse: después de configurarlo (before).
  const { reducido } = await import('../lib/panelCache.js');
  const r = reducido(P);
  assert.deepEqual(r.pagosVencidos, { length: 2, proveedores: 1, nombres: ['Endesa'] });
  assert.deepEqual(r.sinPagar, { length: 3 });
});

// Al guardar: el plazo de la ficha del proveedor, si lo tiene; si no, el legal; y nunca se pisa el que trae la factura.
let srv;
before(async () => { srv = await arrancar(); process.env.KV_REST_API_URL = srv.url; process.env.KV_REST_API_TOKEN = 'pruebas'; });
after(() => srv?.cerrar());
test('al guardar un gasto sin pagar: el plazo de la ficha del proveedor o el legal', async () => {
  const R = await import('../lib/redis.js');
  const { conVencimiento } = await import('../lib/pagosServidor.js');
  const { nuevoGasto } = await import('../lib/gastoCuerpo.js');
  const u = { id: 'u-pag', empresa: 'e-pag', actividades: [{ id: 'servicios', nombre: 'Servicios' }], fiscal: { tipo: 'autonomo' } };
  await R.guardar(u, 'fichasProv', { id: 'B12345678', nombre: 'Imprenta', nif: 'B12345678', plazo: 60 });
  const cuerpo = { fecha: '2026-10-05', concepto: 'Folletos', proveedor: 'Imprenta', proveedorNif: 'B12345678', base: '100', ivaPct: 21, pendiente: true };
  assert.equal((await conVencimiento(u, nuevoGasto(u, cuerpo))).gasto.vence, '2026-12-04', '60 días de su ficha');
  assert.equal((await conVencimiento(u, nuevoGasto(u, { ...cuerpo, proveedor: 'Otro', proveedorNif: '' }))).gasto.vence, '2026-11-04', 'sin ficha, 30 días');
  assert.equal((await conVencimiento(u, nuevoGasto(u, { ...cuerpo, vence: '2026-10-20' }))).gasto.vence, '2026-10-20', 'el de la factura manda');
  assert.equal((await conVencimiento(u, nuevoGasto(u, { ...cuerpo, pendiente: false }))).gasto.vence, undefined, 'pagado: sin vencimiento inventado');
  assert.ok((await conVencimiento(u, nuevoGasto(u, { ...cuerpo, base: '' }))).error, 'un error pasa tal cual');
});

test('aviso del día: el pago que vence hoy, uno o varios', async () => {
  const { avisosDelDia } = await import('../lib/avisos.js');
  const uno = avisosDelDia({ pagos: [g('a', '2026-09-22', { vence: HOY, proveedor: 'Endesa', numero: 'E-1' }), g('b', '2026-10-01', { vence: '2026-10-30' })] }, HOY);
  assert.deepEqual(uno.filter((a) => a.tipo === 'pago-hoy').map((a) => [a.titulo, a.url]), [['Hoy vence el pago a Endesa', '/gastos/a']]);
  const dos = avisosDelDia({ pagos: [g('a', '2026-09-22', { vence: HOY }), g('c', '2026-09-22', { vence: HOY }), g('d', '2026-09-22', { vence: HOY, pendiente: false })] }, HOY);
  assert.deepEqual(dos.filter((a) => a.tipo === 'pago-hoy').map((a) => a.titulo), ['Hoy vencen 2 pagos']);
  assert.equal(avisosDelDia({}, HOY).some((a) => a.tipo === 'pago-hoy'), false);
});
