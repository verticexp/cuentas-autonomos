// Auditoría del 19/10/2026: remesa de pagos de un alquiler, saldo de un extracto de un solo día y deshacer un cobro
// del banco cuando el resto se cobró a mano después.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { prepararPagos } from '../lib/remesas.js';
import { leerTablaBanco } from '../lib/banco.js';

test('remesa: el alquiler de 1.000 € + 21 % IVA − 19 % se paga por 1.020 €, sin restar la retención dos veces', () => {
  const r = prepararPagos({
    emisor: { nombre: 'Empresa', nif: 'B12345678', iban: 'ES9121000418450200051332' }, fecha: '2026-10-20', id: 'REM-1', ahora: '2026-10-19T10:00:00Z',
    gastos: [{ id: 'g1', fecha: '2026-10-01', proveedor: 'Casero SL', proveedorNif: 'b87654321', concepto: 'Alquiler del local', base: 1000, ivaPct: 21, alquiler: true, pendiente: true }],
    ids: ['g1'], cuentasProv: [{ id: 'B87654321', nombre: 'Casero SL', iban: 'DE89370400440532013000' }],
  });
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.total, 1020);
});

test('extracto de un solo día de nuevo a antiguo: el saldo es el del movimiento más reciente (150), no el del más antiguo', () => {
  const desc = leerTablaBanco([['Fecha', 'Concepto', 'Importe', 'Saldo'], ['2026-10-01', 'Ingreso B', '30', '150'], ['2026-10-01', 'Ingreso A', '20', '120']]);
  assert.equal(desc.cuentas[0].saldo, 150);
  const asc = leerTablaBanco([['Fecha', 'Concepto', 'Importe', 'Saldo'], ['2026-10-01', 'Ingreso A', '20', '120'], ['2026-10-01', 'Ingreso B', '30', '150']]);
  assert.equal(asc.cuentas[0].saldo, 150);
});

let srv, F, R, B, C, Cal;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [F, R, B, C, Cal] = await Promise.all([import('../lib/facturas.js'), import('../lib/redis.js'), import('../lib/bancoServidor.js'),
    import('../lib/cobroManual.js'), import('../lib/calculos.js')]);
});
after(() => srv.cerrar());

test('deshacer 20 € del banco no borra los 101 € cobrados a mano después: quedan 101 € cobrados y 20 € pendientes', async () => {
  const u = { id: 'u1', empresa: 'audit1', rol: 'admin', emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', plazo: 30 },
    actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] };
  const f = (await F.crearFactura(u, { fecha: '2026-03-10', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z', direccion: 'C/ Sol 2', ciudad: 'Madrid' },
    concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false })).factura;
  await R.guardar(u, 'banco', { id: 'mov-20', fecha: '2026-03-20', importe: 20, concepto: 'Transferencia', cuenta: 'c1', estado: 'pendiente' });
  assert.equal((await B.emparejar(u, 'mov-20', 'factura', f.id)).ok, true);
  assert.equal((await C.cobrarFactura(u, f.id, { fecha: '2026-03-25' }, '2026-03-25')).ok ?? true, true);
  let x = await R.leerUno(u, 'facturas', f.id);
  assert.equal(x.cobrada, true);
  assert.equal((await B.deshacer(u, 'mov-20')).ok, true);
  x = await R.leerUno(u, 'facturas', f.id);
  assert.equal(Cal.pagadoDe(x), 101);
  assert.equal(Cal.saldoDe(x), 20);
  assert.notEqual(x.cobrada, true);
  assert.deepEqual(x.pagos.map((p) => [p.importe, p.metodo, p.fecha]), [[101, 'manual', '2026-03-25']]);
});
