// Cobro a mano de una factura: entera de un toque, con otra fecha o por una parte, y deshacerlo con seguridad.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, F, R, C, S, cobroManual, deshacerCobroManual, deshacerDe, pagadoDe, pendienteDe;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [F, R, C, S] = await Promise.all([import('../lib/facturas.js'), import('../lib/redis.js'), import('../lib/cobroManual.js'), import('../lib/tercerosServidor.js')]);
  ({ cobroManual, deshacerCobroManual, deshacerDe } = C);
  ({ pagadoDe, pendienteDe } = await import('../lib/calculos.js'));
});
after(() => srv.cerrar());

const HOY = '2026-10-15';
// 121 € con IVA.
const fac = (extra = {}) => ({ id: 'f1', numero: 1, anio: 2026, fecha: '2026-10-01', cliente: { nombre: 'Ana', nif: '12345678Z' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, cobrada: false, ...extra });

test('cobrar sin más: entera y con la fecha de hoy', () => {
  const r = cobroManual(fac(), {}, HOY);
  assert.equal(r.completa, true);
  assert.deepEqual([r.nueva.cobrada, r.nueva.cobro], [true, { fecha: HOY, metodo: 'manual' }]);
  assert.equal(pendienteDe(r.nueva), 0);
});

test('cobrar con otra fecha o por una parte; el resto lo deja pendiente y se puede cobrar después', () => {
  assert.equal(cobroManual(fac(), { fecha: '2026-10-10' }, HOY).nueva.cobro.fecha, '2026-10-10');
  const p = cobroManual(fac(), { fecha: '2026-10-10', importe: '50,50' }, HOY);
  assert.equal(p.completa, false);
  assert.equal(p.nueva.cobrada, false);
  assert.deepEqual(p.nueva.pagos, [{ fecha: '2026-10-10', importe: 50.5, metodo: 'manual' }]);
  assert.equal(pendienteDe(p.nueva), 70.5);
  const resto = cobroManual(p.nueva, {}, HOY);
  assert.equal(resto.completa, true, 'sin importe: lo que falta');
  assert.equal(pagadoDe(resto.nueva), 121);
  assert.equal(cobroManual(p.nueva, { importe: 70.5 }, HOY).completa, true, 'el importe exacto de lo que falta cierra la factura');
});

test('cobrar: rechaza lo que no tiene sentido', () => {
  for (const [opc, texto] of [[{ importe: '0' }, /mayor que 0/], [{ importe: 'mucho' }, /mayor que 0/], [{ importe: '121,01' }, /Solo faltan 121,00/], [{ fecha: '2026-10-16' }, /futura/],
    [{ fecha: '2026-09-30' }, /anterior a la factura/], [{ fecha: '2026-02-30' }, /no es válida/]]) {
    assert.match(cobroManual(fac(), opc, HOY).error, texto, JSON.stringify(opc));
  }
  assert.match(cobroManual(fac({ cobrada: true }), {}, HOY).error, /ya está cobrada/);
  assert.match(cobroManual(fac({ caja: { efectivo: 1 } }), {}, HOY).error, /cierre de caja/);
  const abono = fac({ base: -100 });
  assert.equal(cobroManual(abono, {}, HOY).completa, true, 'un abono se marca entero');
  assert.match(cobroManual(abono, { importe: 10 }, HOY).error, /abono/);
});

test('deshacer: quita la marca de cobrada a mano o el último cobro parcial a mano, pero no el de Stripe, banco o remesa', () => {
  const cobrada = cobroManual(fac(), {}, HOY).nueva;
  assert.equal(deshacerDe(cobrada), 'cobrada');
  const d = deshacerCobroManual(cobrada).nueva;
  assert.deepEqual([d.cobrada, d.cobro], [false, undefined]);
  const dos = cobroManual(cobroManual(fac(), { importe: 20 }, HOY).nueva, { importe: 30 }, HOY).nueva;
  assert.equal(deshacerDe(dos), 'parcial');
  assert.deepEqual(deshacerCobroManual(dos).nueva.pagos.map((p) => p.importe), [20], 'solo el último');
  assert.equal(deshacerCobroManual(deshacerCobroManual(dos).nueva).nueva.pagos, undefined);
  assert.match(deshacerCobroManual(fac()).error, /No hay cobros/);
  for (const metodo of ['stripe', 'banco', 'sepa']) {
    const f = fac({ cobrada: true, cobro: { fecha: HOY, metodo } });
    assert.equal(deshacerDe(f), null);
    assert.match(deshacerCobroManual(f).error, /Se cobró/);
  }
  assert.equal(deshacerDe(fac({ cobrada: true })), 'cobrada', 'las de antes, sin método, se pueden deshacer');
  const conStripe = fac({ pagos: [{ fecha: HOY, importe: 10, metodo: 'stripe' }] });
  assert.equal(deshacerDe(conStripe), null, 'un pago de Stripe parcial no se quita');
});

test('servidor: cobrar y deshacer sobre la factura guardada, y deshacer respeta el riesgo máximo del cliente', async () => {
  const u = { id: 'u1', empresa: 'cobro1', emisor: { nombre: 'E', nif: 'B12345674', plazo: 30 }, actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] };
  const datos = (n) => ({ fecha: '2026-10-01', actividad: 'servicios', cliente: { nombre: 'Cliente Uno', nif: '12345678Z', direccion: 'C/ Sol', ciudad: 'Madrid' }, concepto: 'S', base: 100, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false });
  const a = (await F.crearFactura(u, datos(1), { idem: 'f1' })).factura;
  const r = await C.cobrarFactura(u, a.id, { importe: '20' }, HOY);
  assert.equal(r.factura.pagos.length, 1);
  assert.deepEqual(C.estadoCobro(r.factura), { id: a.id, cobrada: false, pagado: 20, pendiente: 101 });
  const entera = await C.cobrarFactura(u, a.id, {}, HOY);
  assert.deepEqual([entera.factura.cobrada, C.estadoCobro(entera.factura).pendiente], [true, 0]);
  assert.match((await C.cobrarFactura(u, a.id, {}, HOY)).error, /ya está cobrada/);
  // Con límite de 150: otra factura de 121 está pendiente; deshacer la primera (121 + 121 > 150) no se deja.
  await S.guardarFichaCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z', riesgoMax: '150' }, { id: 'CLIENTE UNO', puedeRiesgo: true });
  assert.ok((await F.crearFactura(u, datos(2), { idem: 'f2' })).factura);
  const no = await C.deshacerCobro(u, a.id);
  assert.equal(no.status, 409);
  assert.match(no.error, /riesgo máximo/);
  assert.equal((await R.leerUno(u, 'facturas', a.id)).cobrada, true, 'sigue cobrada');
  await S.guardarFichaCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z' }, { id: 'CLIENTE UNO', puedeRiesgo: true });
  const si = await C.deshacerCobro(u, a.id);
  assert.equal(si.factura.cobrada, false);
  assert.equal((await C.cobrarFactura(u, 'no-existe', {}, HOY)).status, 404);
});
