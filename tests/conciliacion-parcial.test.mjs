// Informe del 14/10/2026 (R01): emparejar un movimiento del banco con una factura apunta lo que de verdad ha entrado,
// no da por cobrado el total. Deshacer quita solo ese pago. Igual con los gastos: un cargo que no casa no los paga.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, F, R, B, C, Cal, G;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [F, R, B, C, Cal, G] = await Promise.all([import('../lib/facturas.js'), import('../lib/redis.js'), import('../lib/bancoServidor.js'),
    import('../lib/cobros.js'), import('../lib/calculos.js'), import('../lib/asientos.js')]);
});
after(() => srv.cerrar());

let n = 0;
const empresa = () => {
  const id = `conc${++n}`;
  return { id: `u${n}`, empresa: id, rol: 'admin', emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', plazo: 30 },
    actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] };
};
const datos = { fecha: '2026-03-10', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z', direccion: 'C/ Sol 2', ciudad: 'Madrid' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false };
const movimiento = async (u, importe, id = `mov-${Math.random().toString(36).slice(2)}`) => {
  await R.guardar(u, 'banco', { id, fecha: '2026-03-20', importe, concepto: 'Transferencia', cuenta: 'c1', estado: 'pendiente' });
  return id;
};
const leerF = (u, id) => R.leerUno(u, 'facturas', id);
const bancoContable = (f) => G.generarAsientos({ facturas: [f] }, '2026-12-31').filter((a) => a.concepto.startsWith('Cobro'))
  .reduce((s, a) => s + a.lineas.filter((l) => l.cuenta === '572').reduce((x, l) => x + l.debe, 0), 0);

test('R01: 1 € del banco sobre una factura de 121 € → cobrado 1 €, pendiente 120 €, banco 1 €', async () => {
  const u = empresa();
  const f = (await F.crearFactura(u, datos)).factura;
  const mov = await movimiento(u, 1);
  const r = await B.emparejar(u, mov, 'factura', f.id);
  assert.equal(r.ok, true, r.error);
  const x = await leerF(u, f.id);
  assert.equal(Cal.pagadoDe(x), 1);
  assert.equal(Cal.saldoDe(x), 120);
  assert.equal(Cal.pendienteDe(x), 120);
  assert.notEqual(x.cobrada, true);
  assert.equal(bancoContable(x), 1);
  const m = await R.leerUno(u, 'banco', mov);
  assert.equal(m.estado, 'emparejado');
  assert.deepEqual(m.enlace, { tipo: 'factura', id: f.id });
});

test('R01: 50 € de Stripe + 71 € del banco → saldo cero; deshacer esos 71 € → saldo 71 € y se conserva Stripe', async () => {
  const u = empresa();
  await R.redis.hset('empresas', { [u.empresa]: { id: u.empresa } });
  const f = (await F.crearFactura(u, datos)).factura;
  const { f: conEnlace } = await C.enlacePago(u, f);
  const s = { id: 'cs_r01', payment_status: 'paid', currency: 'eur', amount_total: 5000, metadata: { token: conEnlace.pago, factura: f.id, empresa: u.empresa } };
  assert.equal((await C.marcarPagada(s)).aplicado, true);
  const mov = await movimiento(u, 71);
  assert.equal((await B.emparejar(u, mov, 'factura', f.id)).ok, true);
  let x = await leerF(u, f.id);
  assert.equal(Cal.saldoDe(x), 0);
  assert.equal(x.cobrada, true);
  assert.equal(bancoContable(x), 121);
  assert.equal((await B.deshacer(u, mov)).ok, true);
  x = await leerF(u, f.id);
  assert.equal(Cal.saldoDe(x), 71);
  assert.equal(Cal.pendienteDe(x), 71);
  assert.notEqual(x.cobrada, true);
  assert.deepEqual(x.pagos.map((p) => [p.metodo, p.importe]), [['stripe', 50]]);
  assert.equal((await R.leerUno(u, 'banco', mov)).estado, 'pendiente');
});

test('R01: un ingreso mayor que lo pendiente no se acepta y no toca nada', async () => {
  const u = empresa();
  const f = (await F.crearFactura(u, datos)).factura;
  const mov = await movimiento(u, 500);
  const r = await B.emparejar(u, mov, 'factura', f.id);
  assert.ok(r.error, 'debe rechazarse');
  const x = await leerF(u, f.id);
  assert.equal(Cal.pagadoDe(x), 0);
  assert.equal((await R.leerUno(u, 'banco', mov)).estado, 'pendiente');
});

test('R01: dos movimientos parciales completan la factura; deshacer uno la deja pendiente de ese importe', async () => {
  const u = empresa();
  const f = (await F.crearFactura(u, datos)).factura;
  const [a, b] = [await movimiento(u, 21), await movimiento(u, 100)];
  assert.equal((await B.emparejar(u, a, 'factura', f.id)).ok, true);
  assert.equal((await B.emparejar(u, b, 'factura', f.id)).ok, true);
  assert.equal((await leerF(u, f.id)).cobrada, true);
  assert.equal((await B.deshacer(u, a)).ok, true);
  const x = await leerF(u, f.id);
  assert.equal(Cal.saldoDe(x), 21);
  assert.deepEqual(x.pagos.map((p) => [p.banco, p.importe]), [[b, 100]]);
  // Repetir el deshacer no quita nada más.
  assert.equal((await B.deshacer(u, a)).ok, true);
  assert.equal(Cal.saldoDe(await leerF(u, f.id)), 21);
});

test('R01: emparejar dos veces el mismo movimiento (o reintentar) no duplica el pago', async () => {
  const u = empresa();
  const f = (await F.crearFactura(u, datos)).factura;
  const mov = await movimiento(u, 10);
  const rs = await Promise.all([B.emparejar(u, mov, 'factura', f.id), B.emparejar(u, mov, 'factura', f.id)]);
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal(Cal.pagadoDe(await leerF(u, f.id)), 10);
});

test('R01: un emparejamiento antiguo (cobrada con cobro.banco y sin pagos) se sigue deshaciendo', async () => {
  const u = empresa();
  const f = (await F.crearFactura(u, datos)).factura;
  const mov = await movimiento(u, 121);
  await R.guardar(u, 'facturas', { ...(await leerF(u, f.id)), cobrada: true, cobro: { fecha: '2026-03-20', banco: mov } });
  await R.guardar(u, 'banco', { ...(await R.leerUno(u, 'banco', mov)), estado: 'emparejado', enlace: { tipo: 'factura', id: f.id } });
  assert.equal((await B.deshacer(u, mov)).ok, true);
  const x = await leerF(u, f.id);
  assert.notEqual(x.cobrada, true);
  assert.equal(Cal.saldoDe(x), 121);
});

test('R01: un cargo de 1 € no paga un gasto de 121 €; el importe exacto sí', async () => {
  const u = empresa();
  const g = { id: 'g1', fecha: '2026-03-01', actividad: 'servicios', concepto: 'Material', base: 100, ivaPct: 21, pendiente: true };
  await R.guardar(u, 'gastos', g);
  const poco = await movimiento(u, -1);
  assert.ok((await B.emparejar(u, poco, 'gasto', 'g1')).error);
  let x = await R.leerUno(u, 'gastos', 'g1');
  assert.equal(x.pendiente, true);
  assert.equal(x.banco, undefined);
  const justo = await movimiento(u, -121);
  assert.equal((await B.emparejar(u, justo, 'gasto', 'g1')).ok, true);
  x = await R.leerUno(u, 'gastos', 'g1');
  assert.equal(x.pendiente, undefined);
  assert.equal(x.banco, justo);
});

test('R01: un gasto con retención se paga con lo que de verdad sale del banco (total menos IRPF)', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', { id: 'g2', fecha: '2026-03-01', actividad: 'servicios', concepto: 'Gestoría', base: 100, ivaPct: 21, irpfPct: 15, pendiente: true });
  const mov = await movimiento(u, -106);
  assert.equal((await B.emparejar(u, mov, 'gasto', 'g2')).ok, true);
});

// Auditoría 10-2026: cada cobro externo se liquida por separado, aunque la factura tenga pagos del banco.
test('Liquidación: 50 € del banco + 100 € de Stripe; la liquidación de Stripe (100 €) solo se enlaza → cobrado 150, saldo 100', async () => {
  const u = empresa();
  await R.redis.hset('empresas', { [u.empresa]: { id: u.empresa } });
  const BL = await import('../lib/banco.js');
  const f = (await F.crearFactura(u, { ...datos, base: 250, ivaPct: 0 })).factura;
  const banco = await movimiento(u, 50);
  assert.equal((await B.emparejar(u, banco, 'factura', f.id)).ok, true);
  const { f: conEnlace } = await C.enlacePago(u, await leerF(u, f.id));
  const s = { id: 'cs_liq', payment_status: 'paid', currency: 'eur', amount_total: 10000, metadata: { token: conEnlace.pago, factura: f.id, empresa: u.empresa } };
  assert.equal((await C.marcarPagada(s)).aplicado, true);
  const antes = await leerF(u, f.id);
  assert.equal(Cal.pagadoDe(antes), 150);
  assert.equal(BL.cobradoSinBanco(antes), 100);

  const liq = await movimiento(u, 100, 'mov-liquidacion');
  const movs = await R.leer(u, 'banco');
  const { facturas } = await B.candidatosConciliacion(u, movs);
  assert.ok(facturas.some((x) => x.id === f.id), 'la factura sigue siendo candidata a liquidación');
  const sug = BL.sugerencias(movs, facturas, [])[liq];
  assert.deepEqual([sug.id, sug.yaCobrada, sug.importe], [f.id, true, 100]);

  assert.equal((await B.emparejar(u, liq, 'factura', f.id)).ok, true);
  let x = await leerF(u, f.id);
  assert.equal(Cal.pagadoDe(x), 150);
  assert.equal(Cal.saldoDe(x), 100);
  assert.notEqual(x.cobrada, true);
  assert.equal(bancoContable(x), bancoContable(antes));
  assert.deepEqual(x.pagos.map((p) => [p.metodo, p.importe, p.banco || p.liquidado]), [['banco', 50, banco], ['stripe', 100, liq]]);
  const m = await R.leerUno(u, 'banco', liq);
  assert.equal(m.estado, 'emparejado');
  assert.deepEqual(m.enlace, { tipo: 'factura', id: f.id, yaCobrada: true });
  // Ya liquidado, no se vuelve a ofrecer como cobro externo.
  assert.equal(BL.cobradoSinBanco(x), 0);

  // El resto (100 €) sí es un cobro nuevo y completa la factura.
  const resto = await movimiento(u, 100);
  assert.equal((await B.emparejar(u, resto, 'factura', f.id)).ok, true);
  x = await leerF(u, f.id);
  assert.equal(Cal.pagadoDe(x), 250);
  assert.equal(x.cobrada, true);

  // Deshacer la liquidación solo quita la marca: los cobros se quedan.
  assert.equal((await B.deshacer(u, liq)).ok, true);
  x = await leerF(u, f.id);
  assert.equal(Cal.pagadoDe(x), 250);
  assert.deepEqual(x.pagos.map((p) => [p.metodo, p.importe, p.liquidado]), [['banco', 50, undefined], ['stripe', 100, undefined], ['banco', 100, undefined]]);
  assert.equal((await R.leerUno(u, 'banco', liq)).estado, 'pendiente');
  assert.equal(BL.cobradoSinBanco(x), 100);
});

test('Liquidación: dos cobros externos se liquidan uno a uno o juntos; un enlace antiguo sin marca lo sigue cubriendo todo', async () => {
  const u = empresa();
  const BL = await import('../lib/banco.js');
  const f = (await F.crearFactura(u, { ...datos, base: 300, ivaPct: 0 })).factura;
  await R.guardar(u, 'facturas', { ...(await leerF(u, f.id)), pagos: [{ fecha: '2026-03-12', importe: 100, metodo: 'stripe', ref: 'cs_a' }, { fecha: '2026-03-13', importe: 40, metodo: 'sepa', ref: 'REM-1' }] });
  const juntos = await movimiento(u, 140);
  assert.equal((await B.emparejar(u, juntos, 'factura', f.id)).ok, true);
  assert.deepEqual((await leerF(u, f.id)).pagos.map((p) => p.liquidado), [juntos, juntos]);
  assert.equal((await B.deshacer(u, juntos)).ok, true);
  const sepa = await movimiento(u, 40);
  assert.equal((await B.emparejar(u, sepa, 'factura', f.id)).ok, true);
  assert.deepEqual((await leerF(u, f.id)).pagos.map((p) => p.liquidado), [undefined, sepa]);
  assert.equal(Cal.pagadoDe(await leerF(u, f.id)), 140);

  // Un enlace de antes de este cambio (yaCobrada, sin marca en la factura) liquidaba todo lo externo.
  const v = (await F.crearFactura(u, { ...datos, base: 100, ivaPct: 0 })).factura;
  await R.guardar(u, 'facturas', { ...(await leerF(u, v.id)), pagos: [{ fecha: '2026-03-12', importe: 100, metodo: 'stripe', ref: 'cs_v' }], cobrada: true, cobro: { fecha: '2026-03-12', metodo: 'stripe', importe: 100 } });
  const viejo = await movimiento(u, 100, 'mov-viejo');
  await R.guardar(u, 'banco', { ...(await R.leerUno(u, 'banco', viejo)), estado: 'emparejado', enlace: { tipo: 'factura', id: v.id, yaCobrada: true } });
  const otro = await movimiento(u, 100);
  assert.equal(BL.sugerencias(await R.leer(u, 'banco'), [await leerF(u, v.id)], [])[otro], undefined);
  assert.match((await B.emparejar(u, otro, 'factura', v.id)).error, /enlazada/);
  assert.equal((await B.deshacer(u, viejo)).ok, true);
  assert.equal((await leerF(u, v.id)).pagos[0].liquidado, undefined);
});
