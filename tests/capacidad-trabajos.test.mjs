// Informe de capacidad (14/10/2026), E03 y E04: la operación responde tras guardarse sin esperar a Drive, y los
// trabajos de cada mañana se planifican por empresa, sobreviven a un corte y se retoman sin duplicar.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, T, TT, F, lento;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, T, TT, F] = await Promise.all([import('../lib/redis.js'), import('../lib/trabajos.js'), import('../lib/trabajosTareas.js'), import('../lib/facturas.js')]);
  // Un «Drive» que tarda 25 s en contestar.
  lento = http.createServer((req, res) => { setTimeout(() => { res.end('{"ok":true}'); }, 25000).unref(); });
  await new Promise((ok) => lento.listen(0, '127.0.0.1', ok));
});
after(async () => { lento.closeAllConnections?.(); lento.close(); await srv.cerrar(); });

let n = 0;
const empresa = (extra = {}) => ({ id: `u${++n}`, empresa: `trab${n}`, emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', plazo: 30 },
  actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }], ...extra });
const datos = { fecha: '2026-10-14', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'x', base: 10, ivaPct: 21, irpfPct: 0 };
const vaciarCola = async () => { await R.redis.del(T.COLA); };

test('E03: con Drive parado 25 s, emitir responde tras guardar y la subida queda pendiente en la cola', async () => {
  await vaciarCola();
  const u = empresa({ drive: { url: `http://127.0.0.1:${lento.address().port}/`, token: 't' } });
  await R.redis.hset('empresas', { [u.empresa]: { id: u.empresa, drive: u.drive } });
  const t0 = Date.now();
  const r = await F.crearFactura(u, datos);
  assert.ok(Date.now() - t0 < 3000, `tardó ${Date.now() - t0} ms`);
  assert.ok(await R.leerUno(u, 'facturas', r.factura.id));
  const t = await R.redis.hget(`trabajos:${u.empresa}`, `drive-factura:${r.factura.id}`);
  assert.equal(t?.tipo, 'drive-factura');
  assert.ok(await R.redis.zscore(T.COLA, `${u.empresa}|drive-factura:${r.factura.id}`) !== null);
  lento.closeAllConnections(); // el intento en segundo plano falla (sin red) y queda para reintentar
});

test('E03: un fallo se reintenta con espera creciente; uno definitivo va a la bandeja y se puede reintentar', async () => {
  await vaciarCola();
  const u = empresa();
  let llamadas = 0;
  const tareas = { red: async () => { llamadas++; throw new Error('sin red'); }, mala: async () => { throw new T.Definitivo('rechazado'); } };
  await T.encolar(u, { id: 'a', tipo: 'red' });
  await T.encolar(u, { id: 'b', tipo: 'mala' });
  await T.procesar({ tareas, hasta: Date.now() + 3000 });
  assert.equal(llamadas, 1, 'no se reintenta en caliente');
  const a = await R.redis.hget(`trabajos:${u.empresa}`, 'a');
  assert.equal(a.intentos, 1);
  assert.ok(Number(await R.redis.zscore(T.COLA, `${u.empresa}|a`)) > Date.now() + 30000);
  const fallidos = await T.fallidos(u);
  assert.deepEqual(fallidos.map((t) => t.id), ['b']);
  assert.ok(await T.reintentar(u, 'b'));
  assert.equal((await R.redis.hget(`trabajos:${u.empresa}`, 'b')).estado, 'pendiente');
});

test('E04: 1.000 empresas, corte a mitad y reanudación: todas atendidas una sola vez', async () => {
  await vaciarCola();
  const dia = '2026-10-15';
  const ids = Array.from({ length: 1000 }, (_, i) => `masiva${String(i).padStart(4, '0')}`);
  await R.redis.hset('empresas', Object.fromEntries(ids.map((id) => [id, { id, emisor: {} }])));
  assert.ok(await TT.planificarDia(dia, 'http://local', ['recurrentes']) >= ids.length);
  const hechas = new Map();
  const tareas = { 'dia-recurrentes': async ({ empresa }) => { if (empresa.startsWith('masiva')) hechas.set(empresa, (hechas.get(empresa) || 0) + 1); } };
  // Primera tanda cortada a medio segundo de trabajo, con tareas de 20 ms (como una función que se queda sin tiempo).
  const lentas = { 'dia-recurrentes': async (d) => { await new Promise((ok) => setTimeout(ok, 20)); await tareas['dia-recurrentes'](d); } };
  await T.procesar({ tareas: lentas, hasta: Date.now() + 2500, concurrencia: 8 });
  const tras = hechas.size;
  assert.ok(tras > 0 && tras < ids.length, `primera tanda: ${tras}`);
  // Las siguientes tandas retoman lo que falta.
  for (let i = 0; i < 40 && hechas.size < ids.length; i++) await T.procesar({ tareas, hasta: Date.now() + 10000, concurrencia: 16 });
  assert.equal(hechas.size, ids.length);
  assert.ok([...hechas.values()].every((x) => x === 1), 'ninguna repetida');
  // Hechas: salen de la cola y otro procesado no las repite.
  await T.procesar({ tareas, hasta: Date.now() + 3000 });
  assert.ok([...hechas.values()].every((x) => x === 1));
  assert.equal(await R.redis.hget('trabajos:masiva0000', `dia-recurrentes:${dia}`), null);
});

test('E04: un trabajo reencolado mientras se procesa no se pierde', async () => {
  await vaciarCola();
  const u = empresa();
  let veces = 0;
  const tareas = { x: async () => { veces++; if (veces === 1) await T.encolar(u, { id: 'j', tipo: 'x' }); } };
  await T.encolar(u, { id: 'j', tipo: 'x' });
  await T.procesar({ tareas, hasta: Date.now() + 3000 });
  await T.procesar({ tareas, hasta: Date.now() + 3000 });
  assert.equal(veces, 2);
  assert.equal(await R.redis.hget(`trabajos:${u.empresa}`, 'j'), null);
});
