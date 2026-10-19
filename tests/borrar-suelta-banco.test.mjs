// Borrar (o anular) un documento emparejado con el banco devuelve sus movimientos a «pendiente»: antes quedaban
// apuntando a un documento inexistente y la copia nocturna dejaba de verificar (issue #72, 14-10-2026).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, B, F, G, C, copias;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, B, F, G, C, copias] = await Promise.all(['redis', 'bancoServidor', 'facturas', 'gastosServidor', 'cobroManual', 'copias'].map((m) => import(`../lib/${m}.js`)));
});
after(async () => { if (srv) await srv.cerrar(); });

let n = 0;
const empresa = () => ({ id: `u${++n}`, empresa: `bsb${n}`, rol: 'admin', actividades: [{ id: 'servicios', nombre: 'Servicios', ivaPct: 0 }] });
const factura = (extra = {}) => ({ id: 'f', importada: 'F2026-001', numero: 1, anio: 2026, fecha: '2026-06-15', actividad: 'servicios',
  cliente: { nombre: 'Hotel Mirador' }, concepto: 'Servicio', base: 100, ivaPct: 0, irpfPct: 0, cobrada: false, ...extra });
const gasto = (extra = {}) => ({ id: 'g', numero: 'G2026-001', fecha: '2026-06-15', actividad: 'servicios', proveedor: 'Ferretería Mirador',
  concepto: 'Material', base: 100, ivaPct: 0, pendiente: true, ...extra });
const movimiento = (extra = {}) => ({ id: 'm', fecha: '2026-06-17', importe: 100, concepto: 'F2026-001', cuenta: 'c', estado: 'pendiente', ...extra });
async function sembrar(u, { facturas = [], gastos = [], movs = [] }) {
  for (const [col, lista] of [['facturas', facturas], ['gastos', gastos], ['banco', movs]]) {
    if (lista.length) await R.redis.hset(R.clave(u, col), Object.fromEntries(lista.map((x) => [x.id, x])));
  }
}
const libre = (m) => assert.ok(m.estado === 'pendiente' && !m.enlace && m.autoDescartada, JSON.stringify(m));

test('borrar un gasto pagado por el banco deja el cargo pendiente', async () => {
  const u = empresa();
  await sembrar(u, { gastos: [gasto()], movs: [movimiento({ importe: -100 })] });
  assert.equal((await B.emparejar(u, 'm', 'gasto', 'g')).ok, true);
  await G.borrarGasto(u, 'g');
  assert.equal(await R.leerUno(u, 'gastos', 'g'), null);
  libre(await R.leerUno(u, 'banco', 'm'));
});

test('borrar una factura cobrada por el banco deja el ingreso pendiente', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura()], movs: [movimiento()] });
  assert.equal((await B.emparejar(u, 'm', 'factura', 'f')).ok, true);
  assert.ok((await R.leerUno(u, 'facturas', 'f')).pagos?.some((p) => p.banco === 'm'));
  assert.equal((await F.borrarFactura(u, 'f')).factura.id, 'f');
  libre(await R.leerUno(u, 'banco', 'm'));
});

test('borrar un documento sin banco no toca otros movimientos', async () => {
  const u = empresa();
  const otro = movimiento({ id: 'm2', estado: 'emparejado', enlace: { tipo: 'factura', id: 'otra' } });
  await sembrar(u, { facturas: [factura()], gastos: [gasto()], movs: [otro] });
  await F.borrarFactura(u, 'f');
  await G.borrarGasto(u, 'g');
  assert.deepEqual(await R.leerUno(u, 'banco', 'm2'), otro);
});

test('un cobro a mano enlazado después con el banco no se deshace desde la factura', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura({ cobrada: true, cobro: { fecha: '2026-06-16', metodo: 'manual' } })], movs: [movimiento()] });
  assert.equal((await B.emparejar(u, 'm', 'factura', 'f')).ok, true);
  assert.equal((await R.leerUno(u, 'banco', 'm')).enlace.yaCobrada, true);
  const r = await C.deshacerCobro(u, 'f');
  assert.equal(r.status, 409);
  assert.equal((await R.leerUno(u, 'facturas', 'f')).cobrada, true);
  // Y la copia lo da por bueno: la factura marca en su cobro qué movimiento lo liquida y sigue cobrada.
  const v = copias.verificarCopia(await copias.hacerCopia(R.redis));
  assert.deepEqual(v.incidencias.filter((x) => x.startsWith(u.empresa)), []);
  // Deshecho desde Banco, ya se puede deshacer el cobro.
  assert.equal((await B.deshacer(u, 'm')).ok, true);
  assert.equal((await C.deshacerCobro(u, 'f')).factura.cobrada, false);
});

// Igual que tests/conciliacion-servidor.test.mjs: la ruta real, con la autenticación sustituida.
const modulo = (codigo) => `data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`;
async function rutaFacturas() {
  const api = modulo(`export const usuarioApi = async () => ({ u: globalThis.__bsbApi });
    export const cuerpo = (req) => req.json();
    export const error = (error, status = 400) => Response.json({error}, {status});`);
  const codigo = (await readFile(new URL('../app/api/facturas/route.js', import.meta.url), 'utf8')).replace(/(['"])@\/lib\/([^'"]+)\1/g,
    (_, _c, nombre) => JSON.stringify(nombre === 'api' ? api : new URL(`../lib/${nombre}.js`, import.meta.url).href));
  return import(modulo(codigo));
}

test('desmarcar «cobrada» una factura cobrada por el banco se rechaza', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura()], movs: [movimiento()] });
  assert.equal((await B.emparejar(u, 'm', 'factura', 'f')).ok, true);
  globalThis.__bsbApi = u;
  const { PATCH } = await rutaFacturas();
  const res = await PATCH(new Request('http://localhost/api/facturas', { method: 'PATCH', body: JSON.stringify({ id: 'f', cobrada: false }) }));
  assert.equal(res.status, 409);
  assert.equal((await R.leerUno(u, 'facturas', 'f')).pagos?.[0]?.banco, 'm');
  delete globalThis.__bsbApi;
});

test('un segundo ingreso no se empareja con una factura ya cobrada por el banco (formato antiguo)', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura({ cobrada: true, cobro: { fecha: '2026-06-17', banco: 'm' } })],
    movs: [movimiento({ estado: 'emparejado', enlace: { tipo: 'factura', id: 'f' } }), movimiento({ id: 'm2', fecha: '2026-06-20' })] });
  const r = await B.emparejar(u, 'm2', 'factura', 'f');
  assert.ok(r.error, JSON.stringify(r));
  assert.equal((await R.leerUno(u, 'banco', 'm2')).estado, 'pendiente');
});
