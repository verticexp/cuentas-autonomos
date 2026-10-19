// Revisión de escalabilidad del 14/10/2026 tras los PR #73–#74 (S01–S06): reproducciones deterministas contra el Redis
// simulado. Cada prueba pausa la operación exacta que el informe señala y mete la otra en medio.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { Redis } from '@upstash/redis';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, I, T, C, A;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, I, T, C, A] = await Promise.all([import('../lib/redis.js'), import('../lib/indices.js'), import('../lib/trabajos.js'), import('../lib/copias.js'), import('../lib/actualizarFactura.js')]);
});
after(() => srv.cerrar());

let n = 0;
const empresa = () => ({ id: `u${++n}`, empresa: `rev${n}`, emisor: { plazo: 30 } });
const crudo = (u, col, d) => srv.base.run(['hset', `cuentas:${col}:${u.empresa}`, d.id, JSON.stringify(d)]);
const factura = (id, extra = {}) => ({ id, numero: 1, anio: 2026, fecha: '2026-03-10', actividad: 'a', cliente: { nombre: 'Cliente' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, cobrada: false, ...extra });
const recorrer = async (u, op = {}) => {
  const ids = []; let cursor; let vueltas = 0;
  do { const p = await I.pagina(u, 'facturas', { ...op, cursor }); ids.push(...p.ids); cursor = p.siguiente; assert.ok(++vueltas < 1000); } while (cursor);
  return ids;
};

test('S01: un cobro durante la reconstrucción del índice no deja la factura como pendiente', async () => {
  const u = empresa();
  crudo(u, 'facturas', factura('F-1'));
  let leida = false, hecho = null;
  srv.ganchos.antes = async (cuerpo) => {
    if (hecho) return;
    if (cuerpo.includes('"hgetall"') && cuerpo.includes(`cuentas:facturas:${u.empresa}"`)) { leida = true; return; }
    if (!leida) return;
    // Justo después de que la reconstrucción haya leído los documentos: otro proceso cobra la factura.
    hecho = A.actualizarFactura(u, 'F-1', (f) => ({ nueva: { ...f, cobrada: true } }));
    await new Promise((ok) => setTimeout(ok, 150));
  };
  try { await I.asegurar(u, 'facturas'); await hecho; } finally { srv.ganchos.antes = null; }
  assert.equal((await R.leerUno(u, 'facturas', 'F-1')).cobrada, true);
  await I.asegurar(u, 'facturas');
  assert.deepEqual(await I.fichasMarcadas(u, 'facturas', 'p'), [], 'la ficha no puede seguir pendiente');
  // Ediciones que no cambian la cantidad de documentos tampoco se pierden: cambio de fecha durante otra reconstrucción.
  await R.redis.del(`ixv:facturas:${u.empresa}`);
  leida = false; hecho = null;
  srv.ganchos.antes = async (cuerpo) => {
    if (hecho) return;
    if (cuerpo.includes('"hgetall"') && cuerpo.includes(`cuentas:facturas:${u.empresa}"`)) { leida = true; return; }
    if (!leida) return;
    hecho = A.actualizarFactura(u, 'F-1', (f) => ({ nueva: { ...f, fecha: '2026-05-01' } }));
    await new Promise((ok) => setTimeout(ok, 150));
  };
  try { await I.asegurar(u, 'facturas'); await hecho; } finally { srv.ganchos.antes = null; }
  await I.asegurar(u, 'facturas');
  assert.deepEqual((await I.leerRango(u, 'facturas', '2026-05-01', '2026-05-31')).map((f) => f.id), ['F-1']);
  assert.deepEqual(await I.leerRango(u, 'facturas', '2026-03-01', '2026-03-31'), []);
});

for (const conError of [false, true]) {
  test(`S02: una versión nueva encolada justo antes de cerrar la anterior (${conError ? 'con error' : 'con éxito'}) se conserva y se ejecuta`, async () => {
    await R.redis.del(T.COLA);
    const u = empresa();
    const hechas = [];
    let fin = false, inyectado = false;
    const tareas = { sync: async ({ n: v }) => { hechas.push(v); if (v === 1) { fin = true; if (conError) throw new Error('fallo'); } } };
    srv.ganchos.antes = async (cuerpo) => {
      if (!fin || inyectado) return;
      if (!cuerpo.includes('cola-trabajos') || !(cuerpo.includes('"zrem"') || cuerpo.includes('"eval"') || cuerpo.includes('"zadd"'))) return;
      inyectado = true;
      await T.encolar(u, { id: 'j', tipo: 'sync', datos: { n: 2 } });
    };
    await T.encolar(u, { id: 'j', tipo: 'sync', datos: { n: 1 } });
    try { await T.procesar({ tareas, hasta: Date.now() + 3000 }); } finally { srv.ganchos.antes = null; }
    assert.ok(inyectado);
    const t = await R.redis.hget(`trabajos:${u.empresa}`, 'j');
    assert.equal(t?.datos?.n, 2, 'la versión 2 sigue guardada');
    assert.equal(t.intentos, 0, 'sin heredar el error de la anterior');
    assert.ok((await R.redis.zscore(T.COLA, `${u.empresa}|j`)) !== null, 'y programada');
    await T.procesar({ tareas, hasta: Date.now() + 3000 });
    assert.deepEqual(hechas, [1, 2]);
  });
}

test('S03: trabajos ocupados al principio de la cola no impiden procesar los libres ni declaran vacía la cola', async () => {
  await R.redis.del(T.COLA);
  const u = empresa();
  for (let i = 1; i <= 5; i++) await T.encolar(u, { id: `t${i}`, tipo: 'x' }, { cuando: Date.now() - 10000 + i });
  for (let i = 1; i <= 4; i++) await R.redis.set(`trabajo-uso:${u.empresa}|t${i}`, 'otro', { px: 60000 });
  const hechos = [];
  const r = await T.procesar({ tareas: { x: async (d, o) => { hechos.push(1); } }, hasta: Date.now() + 3000, concurrencia: 1 });
  assert.equal(r.hechos, 1, 'el quinto, libre, se procesa');
  assert.equal(r.quedan, true, 'los ocupados siguen pendientes');
});

for (const tam of [100, 500, 1000]) {
  test(`S04: ${tam} facturas con el mismo orden se recorren todas, sin saltos ni repetidas`, async () => {
    const u = empresa();
    const letras = (i) => String.fromCharCode(65 + Math.floor(i / 26) % 26) + String.fromCharCode(65 + (i % 26)) + Math.floor(i / 676);
    const fs = Array.from({ length: tam }, (_, i) => factura(`${letras(i)}2026-1`, { serie: letras(i) }));
    for (let i = 0; i < fs.length; i += 250) await R.redis.hset(R.clave(u, 'facturas'), Object.fromEntries(fs.slice(i, i + 250).map((f) => [f.id, f])));
    const todos = await recorrer(u);
    assert.equal(todos.length, tam);
    assert.equal(new Set(todos).size, tam);
    const filtrados = await recorrer(u, { filtro: (f) => f.c === 'Cliente', limite: 7 });
    assert.equal(new Set(filtrados).size, tam);
  });
}

test('S05: restaurar una copia vuelve a programar los trabajos pendientes, con sus reintentos, y no los fallidos', async () => {
  await R.redis.del(T.COLA);
  const u = empresa();
  const r = new Redis({ url: srv.url, token: 'pruebas', automaticDeserialization: false });
  await R.redis.hset('empresas', { [u.empresa]: { id: u.empresa } });
  await T.encolar(u, { id: 'p', tipo: 'x' });
  await R.redis.hset(`trabajos:${u.empresa}`, { p: { ...(await R.redis.hget(`trabajos:${u.empresa}`, 'p')), intentos: 2 } });
  await R.redis.hset(`trabajos:${u.empresa}`, { e: { id: 'e', tipo: 'x', estado: 'error', intentos: 6, v: 'z' } });
  const copia = await C.hacerCopia(r);
  srv.base.run(['flushall']);
  await C.restaurar(r, copia, { escribir: true });
  assert.equal((await R.redis.hget(`trabajos:${u.empresa}`, 'p')).intentos, 2, 'conserva sus reintentos');
  assert.ok((await R.redis.zscore(T.COLA, `${u.empresa}|p`)) !== null, 'vuelve a estar programado');
  assert.equal(await R.redis.zscore(T.COLA, `${u.empresa}|e`), null, 'el fallido no se programa');
  const hechos = [];
  await T.procesar({ tareas: { x: async ({ empresa }) => { if (empresa === u.empresa) hechos.push(1); } }, hasta: Date.now() + 3000 });
  assert.equal(hechos.length, 1, 'el pendiente se ejecuta una vez');
  assert.equal((await R.redis.hget(`trabajos:${u.empresa}`, 'e')).estado, 'error', 'el fallido sigue en su bandeja');
});

test('S06: buscar un concepto al principio, en medio o al final de una factura larga la encuentra', async () => {
  const u = empresa();
  const largo = (c) => `${c}${'x'.repeat(199 - c.length)}`;
  crudo(u, 'facturas', factura('LARGA', { lineas: [{ concepto: largo('Primero'), cantidad: 1, precio: 1, ivaPct: 21 }, { concepto: largo('Medio'), cantidad: 1, precio: 1, ivaPct: 21 }, { concepto: 'ReferenciaespecialXYZ', cantidad: 1, precio: 1, ivaPct: 21 }] }));
  crudo(u, 'facturas', factura('OTRA', { numero: 2 }));
  for (const q of ['primero', 'medio', 'referenciaespecialxyz']) {
    assert.deepEqual(await recorrer(u, { buscar: q }), ['LARGA'], q);
  }
  // Aislamiento por empresa.
  assert.deepEqual(await recorrer(empresa(), { buscar: 'referenciaespecialxyz' }), []);
});

test('S04: con altas y bajas entre páginas, el cursor no repite ni salta lo que ya existía', async () => {
  const u = empresa();
  const fs = Array.from({ length: 300 }, (_, i) => factura(`Z${String(i).padStart(3, '0')}`, { serie: `Z${i}` }));
  await R.redis.hset(R.clave(u, 'facturas'), Object.fromEntries(fs.map((f) => [f.id, f])));
  const vistos = [];
  let p = await I.pagina(u, 'facturas');
  vistos.push(...p.ids);
  // Entre páginas: una baja de algo ya visto, una de algo por ver y dos altas (una antes y otra después del cursor).
  await R.borrar(u, 'facturas', vistos[0]);
  await R.borrar(u, 'facturas', 'Z000');
  await R.guardar(u, 'facturas', factura('Z999', { serie: 'Z999' }));
  await R.guardar(u, 'facturas', factura('A000', { serie: 'A0' }));
  while (p.siguiente) { p = await I.pagina(u, 'facturas', { cursor: p.siguiente }); vistos.push(...p.ids); }
  assert.equal(new Set(vistos).size, vistos.length, 'sin repetidas');
  const debian = fs.map((f) => f.id).filter((id) => id !== 'Z000');
  assert.deepEqual(debian.filter((id) => !vistos.includes(id)), [], 'ninguna de las que seguían existiendo se salta');
});

test('Cola: tres instancias a la vez, con fallos y una instancia caída a mitad, hacen cada trabajo y no pierden ninguno', async () => {
  await R.redis.del(T.COLA);
  const u = empresa();
  const N = 300;
  for (let i = 0; i < N; i += 50) {
    const tx = R.redis.multi();
    for (let j = i; j < i + 50; j++) T.opsEncolar(tx, u.empresa, { id: `c${j}`, tipo: 'c', datos: { j } }, { cuando: Date.now() - 1000 });
    await tx.exec();
  }
  // Una instancia que se cayó con c0 a medias: su arrendamiento caduca enseguida y otra lo retoma.
  await R.redis.set(`trabajo-uso:${u.empresa}|c0`, 'caida', { px: 300 });
  const veces = new Map();
  let fallos = 0;
  const tareas = { c: async ({ j }) => {
    veces.set(j, (veces.get(j) || 0) + 1);
    if (j % 37 === 0 && veces.get(j) === 1) { fallos++; throw new Error('fallo pasajero'); } // primer intento falla
  } };
  const instancia = () => T.procesar({ tareas, hasta: Date.now() + 15000, concurrencia: 4 }); // margen holgado: con la máquina cargada 2 s útiles no bastan
  for (let ronda = 0; ronda < 5; ronda++) {
    await Promise.all([instancia(), instancia(), instancia()]);
    // Los que fallaron quedan programados más adelante con su intento apuntado; se adelantan para la prueba.
    const pendientes = Object.values((await R.redis.hgetall(`trabajos:${u.empresa}`)) || {}).filter((t) => t.estado === 'pendiente');
    if (!pendientes.length) break;
    assert.ok(pendientes.every((t) => t.intentos === 1 || (t.id === 'c0' && ronda === 0)), 'cada fallo, con su intento apuntado');
    for (const t of pendientes) await R.redis.zadd(T.COLA, { score: Date.now() - 1, member: `${u.empresa}|${t.id}` });
    await new Promise((ok) => setTimeout(ok, 350)); // caduca el arrendamiento de la instancia caída
  }
  assert.equal(veces.size, N, 'todos se han hecho');
  for (const [j, v] of veces) assert.equal(v, j % 37 === 0 ? 2 : 1, `trabajo ${j}: ${v} veces`);
  assert.ok(fallos > 0);
  assert.equal(Object.keys((await R.redis.hgetall(`trabajos:${u.empresa}`)) || {}).length, 0, 'no queda nada pendiente');
});
