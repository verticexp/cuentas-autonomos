import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { arrancar, crearBase } from './apoyo/upstash-mem.mjs';
import { claves } from '../lib/fichas.js';

// scripts/indicesDemo.mjs escribe los índices de la demo de golpe: tienen que ser los mismos que dejaría reconstruir
// (lib/indices.js), o la app los reharía documento a documento (decenas de miles de operaciones en Upstash).
test('demo: los índices escritos de golpe son los de reconstruir y la app no los rehace', async () => {
  const base = crearBase();
  const s = await arrancar({ base });
  const antes = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  try {
    await promisify(execFile)(process.execPath, ['scripts/demo.mjs'], {
      cwd: new URL('..', import.meta.url), maxBuffer: 1e8,
      env: { ...process.env, KV_REST_API_URL: s.url, KV_REST_API_TOKEN: 'local', DEMO_EMAIL: 'indices@ejemplo.test', DEMO_PASSWORD: 'Solo-Pruebas-2026' },
    });
    process.env.KV_REST_API_URL = s.url; process.env.KV_REST_API_TOKEN = 'local';
    const { reconstruir, asegurar } = await import('../lib/indices.js');
    const emp = base.run(['hget', 'cuentas:emails', 'indices@ejemplo.test']);
    const leer = (k) => {
      const t = base.run(['type', `cuentas:${k}`]);
      if (t === 'zset') return base.run(['zrange', `cuentas:${k}`, '0', '-1']);
      if (t === 'string') return base.run(['get', `cuentas:${k}`]);
      if (t !== 'hash') return null;
      const h = base.run(['hgetall', `cuentas:${k}`]), m = [];
      for (let i = 0; i < h.length; i += 2) if (h[i] !== 'rev') m.push([h[i], h[i + 1]]);
      return m.sort();
    };
    for (const col of ['facturas', 'gastos', 'presupuestos']) {
      const u = { id: emp, empresa: emp }, k = claves(col, emp);
      const escritos = Object.fromEntries(Object.values(k).map((x) => [x, leer(x)]));
      await asegurar(u, col);
      assert.deepEqual(Object.fromEntries(Object.values(k).map((x) => [x, leer(x)])), escritos, `asegurar no debe tocar ${col}`);
      for (const x of Object.values(k)) base.run(['del', `cuentas:${x}`]);
      await reconstruir(u, col);
      assert.deepEqual(Object.fromEntries(Object.values(k).map((x) => [x, leer(x)])), escritos, `índice de ${col}`);
    }
  } finally {
    for (const [k, v] of [['KV_REST_API_URL', antes.url], ['KV_REST_API_TOKEN', antes.token]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await s.cerrar();
  }
});
