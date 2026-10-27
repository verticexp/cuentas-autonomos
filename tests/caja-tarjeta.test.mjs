// Caja, fase 2: la tarjeta de los cierres frente a los ingresos del banco (lib/caja.js, lib/bancoServidor.js) y el
// saldo de caja de los arqueos. El servidor, con el Redis de la app contra Upstash simulado (como conciliacion-servidor).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { comisionValida, propuestasTarjeta, saldoCaja, tarjetaSinLiquidar } from '../lib/caja.js';
import { cobrosExternos } from '../lib/banco.js';
import { cuadreBanco } from '../lib/contabilidad.js';

const cierre = (id, fecha, tarjeta, { caja = {}, ...extra } = {}) => ({ id, fecha, serie: 'Z', numero: 1, anio: 2026, actividad: 'a', cliente: { nombre: 'Ventas del día' }, base: tarjeta, ivaPct: 0, lineas: [{ concepto: 'Ventas', cantidad: 1, precio: tarjeta, ivaPct: 0 }], cobrada: true, simplificada: true, caja: { efectivo: 0, tarjeta, otros: 0, ...caja }, ...extra });
const mov = (id, fecha, importe, concepto = 'LIQUIDACION TPV 0012345') => ({ id, fecha, importe, concepto, cuenta: 'c', estado: 'pendiente' });

test('comisión: entre 0 y el 4 % de la tarjeta', () => {
  assert.equal(comisionValida(100, 98.9), 1.1);
  assert.equal(comisionValida(100, 100), 0);
  assert.equal(comisionValida(100, 95), null);
  assert.equal(comisionValida(100, 100.5), null);
});

test('propuestas: uno o varios días seguidos, la más reciente, y sin concepto de TPV solo al céntimo', () => {
  const cierres = [cierre('z1', '2026-10-23', 200), cierre('z2', '2026-10-24', 300), cierre('z3', '2026-10-26', 150), cierre('z0', '2026-10-10', 80, { caja: { liquidacion: { mov: 'x', fecha: '2026-10-11' } } })];
  // El lunes 27 llega la del fin de semana (viernes y sábado juntos) y el 28 la del lunes.
  const p = propuestasTarjeta([mov('m1', '2026-10-27', 495.5), mov('m2', '2026-10-28', 148.2), mov('m3', '2026-10-28', 80, 'TRANSFERENCIA CLIENTE')], cierres);
  assert.deepEqual(p.map((x) => [x.mov, x.cierres, x.comision]), [['m1', ['z1', 'z2'], 4.5], ['m2', ['z3'], 1.8]]);
  assert.deepEqual(p[0].dias, ['2026-10-23', '2026-10-24']);
  // Sin concepto de TPV: solo si cuadra exacto; un ingreso anterior a los cierres no los liquida.
  assert.deepEqual(propuestasTarjeta([mov('t', '2026-10-25', 300, 'TRANSFERENCIA')], cierres).map((x) => x.cierres), [['z2']]);
  assert.deepEqual(propuestasTarjeta([mov('t', '2026-10-25', 299, 'TRANSFERENCIA')], cierres), []);
  assert.deepEqual(propuestasTarjeta([mov('t', '2026-10-22', 200)], cierres), []);
  // Ya emparejados o cargos, nada.
  assert.deepEqual(propuestasTarjeta([{ ...mov('t', '2026-10-27', 200), estado: 'emparejado' }, mov('c', '2026-10-27', -200)], cierres), []);
  assert.deepEqual(tarjetaSinLiquidar(cierres, '2026-10-28').map((f) => f.id), ['z2', 'z1']);
  assert.deepEqual(tarjetaSinLiquidar([...cierres, cierre('zb', '2026-10-20', 50, { cobro: { liquidado: 'mb' } })], '2026-10-28').map((f) => f.id), ['z2', 'z1']);
});

test('saldo de caja: lo contado, el descuadre de cada día y el acumulado', () => {
  const a = (id, fecha, efectivo, fondo, contado) => ({ id, fecha, caja: { efectivo, tarjeta: 0, otros: 0, arqueo: { fondo, contado } } });
  const s = saldoCaja([a('b', '2026-10-02', 50, 100, 148), a('a', '2026-10-01', 100, 100, 200), { id: 'c', fecha: '2026-10-03', caja: { efectivo: 9 } }]);
  assert.deepEqual(s.dias.map((d) => [d.id, d.descuadre, d.acumulado]), [['a', 0, 0], ['b', -2, -2]]);
  assert.equal(s.ultimo.contado, 148);
  assert.deepEqual([s.faltante, s.sobrante, s.descuadres], [-2, 0, -2]);
});

test('un cierre ya cuadrado no espera más liquidaciones y el cuadre del banco cuenta la tarjeta pendiente', () => {
  assert.ok(cobrosExternos(cierre('z', '2026-10-01', 100)).length);
  assert.deepEqual(cobrosExternos(cierre('z', '2026-10-01', 100, { caja: { liquidacion: { mov: 'm', fecha: '2026-10-02' } } })), []);
  const saldo = { fecha: '2026-10-05', importe: 0 };
  const base = { asientos: [], saldo, movimientos: [mov('m', '2026-10-02', 99)], conectado: true };
  assert.equal(cuadreBanco({ ...base, facturas: [cierre('z', '2026-10-01', 100)] }).cobrosSinBanco, 100);
  assert.equal(cuadreBanco({ ...base, facturas: [cierre('z', '2026-10-01', 100, { caja: { liquidacion: { mov: 'm', fecha: '2026-10-02' } } })] }).cobrosSinBanco, 0);
  // Cuadrado con un ingreso posterior a la fecha del saldo: aún no estaba en el banco.
  assert.equal(cuadreBanco({ ...base, facturas: [cierre('z', '2026-10-01', 100, { caja: { liquidacion: { mov: 'm', fecha: '2026-10-09' } } })] }).cobrosSinBanco, 100);
});

let srv, R, B, C;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, B, C] = await Promise.all([import('../lib/redis.js'), import('../lib/bancoServidor.js'), import('../lib/copias.js')]);
});
after(async () => { if (srv) await srv.cerrar(); });
let n = 0;
const empresa = () => ({ id: `t${++n}`, empresa: `tpv${n}`, rol: 'admin', actividades: [{ id: 'a', nombre: 'Tienda', ivaPct: 21 }] });
async function sembrar(u, { facturas = [], movs = [] }) {
  if (facturas.length) await R.redis.hset(R.clave(u, 'facturas'), Object.fromEntries(facturas.map((x) => [x.id, x])));
  if (movs.length) await R.redis.hset(R.clave(u, 'banco'), Object.fromEntries(movs.map((x) => [x.id, x])));
}

test('servidor: cuadrar marca los cierres, empareja el ingreso y apunta la comisión; deshacer lo devuelve todo', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [cierre('z1', '2026-10-23', 200), cierre('z2', '2026-10-24', 300)], movs: [{ ...mov('m1', '2026-10-27', 495.5), contraparte: 'Comercia Global Payments' }] });
  const r = await B.liquidarTarjeta(u, 'm1', ['z1', 'z2']);
  assert.deepEqual(r, { ok: true, comision: 4.5 });
  const m = await R.leerUno(u, 'banco', 'm1');
  assert.equal(m.estado, 'emparejado');
  assert.deepEqual({ ...m.enlace }, { tipo: 'tpv', id: 'z2', cierres: ['z1', 'z2'], tarjeta: 500, comision: 4.5, gasto: 'tpv-m1' });
  assert.deepEqual((await R.leerUno(u, 'facturas', 'z1')).caja.liquidacion, { mov: 'm1', fecha: '2026-10-27' });
  const g = await R.leerUno(u, 'gastos', 'tpv-m1');
  assert.deepEqual([g.base, g.ivaPct, g.categoria, g.pagado, g.tpv, g.proveedor], [4.5, 0, '626', '2026-10-27', 'm1', 'Comercia Global Payments']);
  // No se cuadra dos veces ni con importes que no casan.
  assert.match((await B.liquidarTarjeta(u, 'm1', ['z1'])).error, /ya está emparejado/);
  await sembrar(u, { movs: [mov('m2', '2026-10-28', 50)], facturas: [cierre('z3', '2026-10-26', 100)] });
  assert.match((await B.liquidarTarjeta(u, 'm2', ['z3'])).error, /no casa/);
  assert.match((await B.liquidarTarjeta(u, 'm2', ['z1'])).error, /ya está cuadrado/);
  // La comisión no se borra suelta.
  const { borrarGasto } = await import('../lib/gastosServidor.js');
  assert.match((await borrarGasto(u, 'tpv-m1')).error, /deshaz ese cuadre/);
  // Deshacer.
  assert.equal((await B.deshacer(u, 'm1')).ok, true);
  assert.equal((await R.leerUno(u, 'banco', 'm1')).estado, 'pendiente');
  assert.equal((await R.leerUno(u, 'facturas', 'z1')).caja.liquidacion, undefined);
  assert.equal(await R.leerUno(u, 'gastos', 'tpv-m1'), null);
});

test('servidor: sin comisión no hay gasto; la copia comprueba los enlaces de la tarjeta', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [cierre('z1', '2026-10-23', 200)], movs: [mov('m1', '2026-10-24', 200, 'TRANSFERENCIA')] });
  assert.deepEqual(await B.liquidarTarjeta(u, 'm1', ['z1']), { ok: true, comision: 0 });
  assert.equal((await R.leerUno(u, 'banco', 'm1')).enlace.gasto, undefined);
  assert.equal(await R.leerUno(u, 'gastos', 'tpv-m1'), null);
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../lib/copias.js', import.meta.url), 'utf8'));
  assert.match(src, /liquidación de tarjeta/);
  assert.equal(typeof C.verificarCopia, 'function');
});
