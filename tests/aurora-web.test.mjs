import test from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

test('Aurora web: alta independiente, contraseña privada, índices, enlaces aleatorios y rechazo de duplicados', async () => {
  const srv = await arrancar();
  try {
    process.env.KV_REST_API_URL = srv.url; process.env.KV_REST_API_TOKEN = 'local';
    const { redis } = await import('../lib/redis.js');
    const { crearAurora, EMAIL_AURORA } = await import('../lib/aurora.js');
    const { comprobar } = await import('../lib/auth.js');
    const { claves } = await import('../lib/fichas.js');
    await redis.hset('empresas', { real: { id: 'real', nombre: 'No tocar' } });
    const [a, b] = await Promise.all([crearAurora(), crearAurora()]);
    const ok = [a,b].find((x) => x.id), repetida = [a,b].find((x) => x.error);
    assert.equal(repetida.status, 409);
    assert.equal(ok.resumen.facturas, 214); assert.equal(ok.resumen.gastos, 370); assert.equal(ok.resumen.nominas, 96);
    assert.equal(await redis.hget('emails', EMAIL_AURORA), ok.id);
    const u = await redis.hget('usuarios', ok.id);
    assert.equal(u.admin, false); assert.equal(u.empresa, ok.id);
    assert.ok(await comprobar(ok.password, u.pass));
    assert.equal(await comprobar('Aurora-Simulada-2026!', u.pass), false);
    const e = await redis.hget('empresas', ok.id);
    assert.equal(e.verifactu, null); assert.equal(e.emisor.recordatorios, 0);
    assert.ok(Object.values(await redis.hgetall(`recurrentes:${ok.id}`)).every((r) => !r.activa && !r.enviar));
    const p = Object.values(await redis.hgetall(`presupuestos:${ok.id}`));
    assert.ok(p.every((x) => !x.token.startsWith('simulada-')));
    assert.equal((await redis.hget('presupuesto-enlaces', p[0].token)).empresa, ok.id);
    for (const col of ['facturas','gastos','presupuestos']) assert.equal(await redis.hlen(claves(col,ok.id).ixf), await redis.hlen(`${col}:${ok.id}`));
    assert.deepEqual(await redis.hget('empresas','real'), { id:'real', nombre:'No tocar' });
    const before = await redis.hget('usuarios',ok.id);
    assert.equal((await crearAurora()).status,409);
    assert.deepEqual(await redis.hget('usuarios',ok.id),before);
  } finally { await srv.cerrar(); }
});
