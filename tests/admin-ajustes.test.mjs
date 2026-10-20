import test from 'node:test';
import assert from 'node:assert/strict';
import { leerRemitente, avisosRemitente, dkimResend } from '../lib/adminAjustes.js';

test('lee el remitente con y sin nombre', () => {
  assert.deepEqual(leerRemitente('Fisquo <No-Reply@fisquo.com>'), { nombre: 'Fisquo', email: 'no-reply@fisquo.com', dominio: 'fisquo.com' });
  assert.deepEqual(leerRemitente('avisos@fisquo.com'), { nombre: '', email: 'avisos@fisquo.com', dominio: 'fisquo.com' });
});

test('avisa del nombre antiguo, de otro dominio y de que falta', () => {
  assert.deepEqual(avisosRemitente('Fisquo <no-reply@fisquo.com>'), []);
  assert.match(avisosRemitente('Netto <no-reply@nettohq.com>')[0], /antiguo/);
  assert.match(avisosRemitente('Fisquo <hola@gmail.com>')[0], /gmail\.com/);
  assert.match(avisosRemitente('')[0], /Falta RESEND_FROM/);
});

test('DKIM: encontrado, ausente o error de DNS', async () => {
  assert.equal(await dkimResend('fisquo.com', async () => [['p=MIGf', 'MA0']]), true);
  assert.equal(await dkimResend('fisquo.com', async () => [['v=spf1']]), false);
  assert.equal(await dkimResend('fisquo.com', async () => { throw new Error('ENOTFOUND'); }), false);
  assert.equal(await dkimResend(''), false);
});
