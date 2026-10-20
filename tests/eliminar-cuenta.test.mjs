// Eliminar la propia cuenta (lib/baja.js eliminarCuenta; Apple 5.1.1(v)): sola en su empresa, la da de baja; con otro
// administrador, solo se va ella; única administradora con más gente, no puede. Contra un Upstash simulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, B, P;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, B, P] = await Promise.all([import('../lib/redis.js'), import('../lib/baja.js'), import('../lib/planes.js')]);
});
after(() => srv.cerrar());

const usuario = (id, empresas) => ({ id, email: `${id}@x.es`, nombre: id, empresa: Object.keys(empresas)[0], empresas });
async function alta(...lista) {
  for (const u of lista) {
    await R.redis.hset('usuarios', { [u.id]: u });
    await R.redis.hset('emails', { [u.email]: u.id });
  }
}

test('sola en su empresa: la empresa queda de baja y la cuenta desaparece', async () => {
  await R.redis.hset('empresas', { e1: { id: 'e1', nombre: 'Autónoma' } });
  const u = usuario('sola', { e1: { rol: 'admin' } });
  await alta(u);
  const r = await B.eliminarCuenta(u);
  assert.deepEqual(r, { empresas: ['e1'] });
  assert.equal(await R.redis.hget('usuarios', 'sola'), null);
  assert.equal(await R.redis.hget('emails', 'sola@x.es'), null);
  assert.ok((await R.redis.hget('empresas', 'e1')).baja?.borrarEl, 'la empresa queda dada de baja, con su plazo de conservación');
});

test('con otro administrador: solo se va ella y la empresa sigue', async () => {
  await R.redis.hset('empresas', { e2: { id: 'e2', nombre: 'Pyme' } });
  const a = usuario('a2', { e2: { rol: 'admin' } });
  const b = usuario('b2', { e2: { rol: 'admin' } });
  await alta(a, b);
  assert.deepEqual(await B.eliminarCuenta(a), { empresas: [] });
  assert.equal(await R.redis.hget('usuarios', 'a2'), null);
  assert.ok(await R.redis.hget('usuarios', 'b2'));
  assert.equal((await R.redis.hget('empresas', 'e2')).baja, undefined);
});

test('miembro sin ser administrador: se va sin tocar la empresa', async () => {
  await R.redis.hset('empresas', { e3: { id: 'e3', nombre: 'Taller' } });
  const jefa = usuario('jefa3', { e3: { rol: 'admin' } });
  const m = usuario('m3', { e3: { rol: 'miembro', permisos: [] } });
  await alta(jefa, m);
  assert.deepEqual(await B.eliminarCuenta(m), { empresas: [] });
  assert.equal(await R.redis.hget('usuarios', 'm3'), null);
  assert.equal((await R.redis.hget('empresas', 'e3')).baja, undefined);
});

test('única administradora con más gente: no se elimina nada y se explica qué hacer', async () => {
  await R.redis.hset('empresas', { e4: { id: 'e4', nombre: 'Estudio' } });
  const a = usuario('a4', { e4: { rol: 'admin' } });
  const m = usuario('m4', { e4: { rol: 'miembro', permisos: [] } });
  await alta(a, m);
  const r = await B.eliminarCuenta(a);
  assert.match(r.error, /único administrador de «Estudio»/);
  assert.ok(await R.redis.hget('usuarios', 'a4'), 'la cuenta sigue');
  assert.equal((await R.redis.hget('empresas', 'e4')).baja, undefined);
});

test('la cuenta del administrador de Fisquo no se elimina desde aquí', async () => {
  const r = await B.eliminarCuenta({ ...usuario('netto', { e5: { rol: 'admin' } }), admin: true });
  assert.ok(r.error);
});

test('darse de baja se puede también en solo lectura', () => {
  assert.equal(P.escrituraLibre('/api/baja'), true);
  assert.equal(P.escrituraLibre('/api/baja/cuenta'), true);
  assert.equal(P.escrituraLibre('/api/bajada'), false);
});
