import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { arrancar } from './apoyo/upstash-mem.mjs';

test('alta ficticia: el email se normaliza como en login y conserva otra empresa', async () => {
  const s = await arrancar();
  try {
    s.base.run(['hset', 'cuentas:empresas', 'otra', JSON.stringify({ id: 'otra', nombre: 'No tocar' })]);
    await promisify(execFile)(process.execPath, ['scripts/demo.mjs'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, KV_REST_API_URL: s.url, KV_REST_API_TOKEN: 'local', DEMO_EMAIL: '  Aurora@Ejemplo.test  ', DEMO_PASSWORD: 'Solo-Pruebas-2026', DEMO_EMPRESA: 'Aurora simulada' },
    });
    const id = s.base.run(['hget', 'cuentas:emails', 'aurora@ejemplo.test']);
    assert.ok(id, 'El login busca el email normalizado');
    assert.equal(s.base.run(['hlen', 'cuentas:usuarios']), 1);
    assert.equal(JSON.parse(s.base.run(['hget', 'cuentas:empresas', id])).nombre, 'Aurora simulada');
    assert.equal(JSON.parse(s.base.run(['hget', 'cuentas:empresas', 'otra'])).nombre, 'No tocar');
    assert.ok(s.base.run(['hlen', `cuentas:facturas:${id}`]) > 150);
  } finally { await s.cerrar(); }
});
