import test from 'node:test';
import assert from 'node:assert/strict';
import { emailReal } from '../lib/emailReal.js';
const no = async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }); };
test('email: MX, A y AAAA', async () => {
  assert.deepEqual(await emailReal('hola@correo.es', { resolver: { resolveMx: async () => [{ exchange: 'mx.correo.es' }] } }), { ok: true });
  for (const metodo of ['resolve4', 'resolve6']) assert.equal((await emailReal('hola@correo.es', { resolver: { resolveMx: no, [metodo]: async () => ['direccion'] } })).ok, true);
});
test('email: inexistente, formato, temporal y MX nulo', async () => {
  assert.equal((await emailReal('hola@correo.es', { resolver: { resolveMx: no, resolve4: no } })).ok, false);
  for (const e of ['incorrecto', 'hola@mailinator.com', 'hola@sub.yopmail.com']) assert.equal((await emailReal(e)).ok, false);
  assert.equal((await emailReal('hola@correo.es', { resolver: { resolveMx: async () => [{ exchange: '.' }] } })).ok, false);
});
test('email: timeout y SERVFAIL no bloquean', async () => {
  for (const code of ['ETIMEOUT', 'ESERVFAIL']) assert.equal((await emailReal('hola@correo.es', { resolver: { resolveMx: async () => { throw Object.assign(new Error(), { code }); } } })).ok, true);
  assert.equal((await emailReal('hola@correo.es', { resolver: { resolveMx: () => new Promise(() => {}) } })).ok, true);
});
