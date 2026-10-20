import test from 'node:test';
import assert from 'node:assert/strict';
import { secretoCron } from '../lib/secreto.js';

test('el cron exige el secreto y la cabecera exacta', async (t) => {
  const anterior = process.env.CRON_SECRET;
  t.after(() => {
    if (anterior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = anterior;
  });
  const req = (authorization) => ({ headers: new Headers(authorization === undefined ? {} : { authorization }) });
  delete process.env.CRON_SECRET;
  assert.equal(secretoCron(req('Bearer prueba')), false);
  process.env.CRON_SECRET = '';
  assert.equal(secretoCron(req('Bearer ')), false);
  process.env.CRON_SECRET = 'prueba';
  assert.equal(secretoCron(req('Bearer prueba')), true);
  assert.equal(secretoCron(req('Bearer pruebo')), false);
  assert.equal(secretoCron(req('Bearer otra longitud')), false);
  assert.equal(secretoCron(req()), false);
  assert.equal(secretoCron(req('bearer prueba')), false);
});
