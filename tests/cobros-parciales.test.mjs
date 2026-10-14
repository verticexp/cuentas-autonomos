// Auditoría de octubre de 2026 (P01–P03): una copia antigua de la factura no pisa los cobros, la remesa SEPA solo domicilia
// el saldo y el resumen, la tesorería y el diario cuentan cada pago parcial con su fecha. Contra un Upstash simulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, F, R, C, A, Rem, Cal, P, T, G;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [F, R, C, A, Rem, Cal, P, T, G] = await Promise.all([import('../lib/facturas.js'), import('../lib/redis.js'), import('../lib/cobros.js'),
    import('../lib/actualizarFactura.js'), import('../lib/remesas.js'), import('../lib/calculos.js'), import('../lib/panel.js'), import('../lib/tesoreria.js'), import('../lib/asientos.js')]);
});
after(() => srv.cerrar());

let n = 0;
const empresa = () => {
  const id = `c${++n}`;
  return { id: `u${n}`, empresa: id, emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', iban: 'ES9121000418450200051332', plazo: 30 },
    actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] };
};
const datos = { fecha: '2026-03-10', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z', direccion: 'C/ Sol 2', ciudad: 'Madrid' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false };
const sesion = (u, f, token, extra = {}) => ({ id: `cs_${Math.random()}`, payment_status: 'paid', currency: 'eur', amount_total: 5000, metadata: { token, factura: f.id, empresa: u.empresa, importe: '5000' }, ...extra });
const leerF = (u, id) => R.leerUno(u, 'facturas', id);

test('P01: generar el enlace con una copia antigua no borra el cobro de 50 €', async () => {
  const u = empresa();
  const vieja = (await F.crearFactura(u, datos)).factura;
  const { f: conEnlace } = await C.enlacePago(u, vieja);
  assert.equal((await C.marcarPagada(sesion(u, vieja, conEnlace.pago))).aplicado, true);
  // Otro proceso aún tiene la factura de antes del cobro y de antes del enlace:
  const r = await C.enlacePago(u, vieja);
  const x = await leerF(u, vieja.id);
  assert.equal(x.pagos.length, 1);
  assert.equal(Cal.pagadoDe(x), 50);
  assert.equal(x.pago, conEnlace.pago, 'se conserva el enlace ya creado');
  assert.equal(r.ruta, `/pagar/${conEnlace.pago}`);
});

test('P01: cobro, enlace, envío y apertura a la vez conservan todo', async () => {
  const u = empresa();
  const vieja = (await F.crearFactura(u, datos)).factura;
  const envio = { fecha: '2026-03-11T10:00:00Z', para: 'a@b.es', token: 'tk' };
  const token = 'abcd'.repeat(8);
  await R.redis.hset('factura-pagos', { [token]: { empresa: u.empresa, id: vieja.id } });
  await A.actualizarFactura(u, vieja.id, (f) => ({ nueva: { ...f, pago: token } }));
  await Promise.all([
    C.marcarPagada(sesion(u, vieja, token)),
    C.enlacePago(u, vieja),
    A.actualizarFactura(u, vieja.id, (f) => ({ nueva: { ...f, envios: [...(f.envios || []), envio] } })),
    A.actualizarFactura(u, vieja.id, (f) => ({ nueva: { ...f, nota: 'editada' } })),
  ]);
  const x = await leerF(u, vieja.id);
  assert.equal(x.pagos?.length, 1, 'el pago sigue');
  assert.equal(x.envios?.length, 1, 'el envío sigue');
  assert.equal(x.nota, 'editada');
  assert.equal(x.pago, token);
});

test('P02: la remesa SEPA domicilia solo el saldo (121 € − 50 € = 71 €) y al marcarla suma el pago', async () => {
  const f = { id: 'f1', numero: 1, anio: 2026, fecha: '2026-03-10', cliente: { nombre: 'Cliente', nif: '12345678Z' }, base: 100, ivaPct: 21, irpfPct: 0,
    pagos: [{ fecha: '2026-03-15T09:00:00Z', importe: 50, metodo: 'stripe', ref: 'cs_1' }] };
  const dom = { id: 'CLIENTE', nombre: 'Cliente', iban: 'DE89370400440532013000', mandato: { referencia: 'M-1', fecha: '2026-01-01' }, usado: false };
  const r = Rem.prepararCobros({ facturas: [f], ids: ['f1'], domiciliaciones: [dom], emisor: { nombre: 'E', nif: 'B12345674', iban: 'ES9121000418450200051332' }, fecha: '2026-04-20', id: 'REM-1', ahora: '2026-04-01T10:00:00Z' });
  assert.equal(r.error, undefined);
  assert.equal(r.total, 71);
  assert.equal(r.operaciones[0].importe, 71);
  const m = Rem.aplicarCobroRemesa(f, { fecha: '2026-04-20', importe: 71, remesa: 'REM-1' });
  assert.equal(m.nueva.cobrada, true);
  assert.equal(m.nueva.pagos.length, 2, 'no se pierde el pago anterior');
  assert.equal(Cal.saldoDe(m.nueva), 0);
  assert.equal(Cal.pagadoDe(m.nueva), 121);
  // Si el saldo cambió desde que se preparó el recibo, no se marca.
  assert.ok(Rem.aplicarCobroRemesa(f, { fecha: '2026-04-20', importe: 121, remesa: 'REM-1' }).error);
  assert.ok(Rem.aplicarCobroRemesa({ ...f, cobrada: true }, { fecha: '2026-04-20', importe: 71, remesa: 'REM-1' }).error);
});

test('P02: una factura marcada cobrada a mano tras un pago parcial deja saldo cero', () => {
  const f = { id: 'f2', numero: 2, anio: 2026, fecha: '2026-03-10', base: 100, ivaPct: 21, irpfPct: 0, pagos: [{ fecha: '2026-03-15', importe: 50 }], cobrada: true, cobro: { fecha: '2026-04-02', metodo: 'manual' } };
  assert.equal(Cal.saldoDe(f), 0);
  assert.deepEqual(Cal.pagosDe(f).map((p) => [p.fecha, p.importe]), [['2026-03-15', 50], ['2026-04-02', 71]]);
});

const parcial = { id: 'f3', numero: 3, anio: 2026, fecha: '2026-03-10', vence: '2026-04-09', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, actividad: 'servicios',
  pagos: [{ fecha: '2026-03-15T09:00:00Z', importe: 50, metodo: 'stripe', ref: 'cs_1' }] };

test('P03: resumen y previsión de tesorería cuentan el saldo (71 €), no el total', () => {
  const panel = P.panelResumen({ facturas: [parcial], gastos: [], hoy: '2026-03-20', actividades: [{ id: 'servicios', nombre: 'Servicios' }] });
  assert.equal(panel.porCobrar, 71);
  const prev = T.prevision({ facturas: [parcial], hoy: '2026-03-20', meses: 2, actividades: ['servicios'] });
  assert.equal(prev.entra, 71);
  assert.equal(prev.movimientos.find((m) => m.tipo === 'cobro').importe, 71);
});

test('P03: un asiento por cada pago con su fecha: 50 € en marzo y 71 € en abril, sin duplicar', () => {
  const f = { ...parcial, pagos: [...parcial.pagos, { fecha: '2026-04-05T09:00:00Z', importe: 71, metodo: 'sepa', ref: 'REM-1' }], cobrada: true };
  const cobros = (hoy, fx) => G.generarAsientos({ facturas: [fx] }, hoy).filter((a) => a.concepto.startsWith('Cobro'));
  // Tras el primero (factura aún pendiente): ya hay un asiento de 50 € en la cuenta 572.
  const marzo = cobros('2026-03-31', parcial);
  assert.equal(marzo.length, 1);
  assert.equal(marzo[0].fecha, '2026-03-15');
  assert.deepEqual(marzo[0].lineas.find((l) => l.cuenta === '572'), { cuenta: '572', debe: 50, haber: 0 });
  // Completa: dos asientos que suman el total y ninguno repite lo ya cobrado.
  const todos = cobros('2026-12-31', f);
  assert.deepEqual(todos.map((a) => [a.fecha, a.lineas.find((l) => l.cuenta === '572').debe]), [['2026-03-15', 50], ['2026-04-05', 71]]);
  // Una factura antigua marcada cobrada sin pagos sigue dando un solo cobro del total.
  const vieja = cobros('2026-12-31', { ...parcial, pagos: undefined, cobrada: true, cobro: { fecha: '2026-05-01', metodo: 'manual' } });
  assert.deepEqual(vieja.map((a) => [a.fecha, a.lineas.find((l) => l.cuenta === '572').debe]), [['2026-05-01', 121]]);
});
