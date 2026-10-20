// Correos automáticos de la cuenta (lib/avisosCorreo.js): qué cambio de la suscripción manda cada correo, que un aviso
// repetido de Stripe no duplica el email y que la bienvenida es solo para quien administra su empresa.
import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, A;
const enviados = [];
const fetchReal = globalThis.fetch;
const variables = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'RESEND_API_KEY', 'RESEND_URL'];
const entorno = Object.fromEntries(variables.map((k) => [k, process.env[k]]));

before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  process.env.RESEND_URL = 'https://email.test/enviar';
  globalThis.fetch = async (url, opciones) => {
    if (String(url) === process.env.RESEND_URL) {
      enviados.push(JSON.parse(opciones.body));
      return Response.json({ id: `email-${enviados.length}` });
    }
    return fetchReal(url, opciones);
  };
  R = await import('../lib/redis.js');
  A = await import('../lib/avisosCorreo.js');
});
beforeEach(async () => {
  srv.base.run(['flushdb']);
  enviados.length = 0;
  process.env.RESEND_API_KEY = 'pruebas';
  await R.redis.hset('empresas', { e1: { id: 'e1', nombre: 'Estudio', plan: { tipo: 'aut', nombre: 'Pro', hasta: '2099-01-01' } } });
  await R.redis.hset('usuarios', {
    a1: { id: 'a1', nombre: 'Ana López', email: 'ana@ejemplo.es', empresa: 'e1', empresas: { e1: { rol: 'admin' } } },
    a2: { id: 'a2', nombre: 'Bea', email: 'bea@ejemplo.es', empresa: 'e1', empresas: { e1: { rol: 'admin' } } },
    t1: { id: 't1', nombre: 'Carlos', email: 'carlos@ejemplo.es', empresa: 'e1', empresas: { e1: { rol: 'empleado' } } },
  });
});
after(async () => {
  globalThis.fetch = fetchReal;
  for (const k of variables) {
    if (entorno[k] === undefined) delete process.env[k];
    else process.env[k] = entorno[k];
  }
  await srv?.cerrar();
});

test('qué correo manda cada cambio de estado de la suscripción', () => {
  const c = (a, b) => A.correoDeSuscripcion(a && { estado: a }, { estado: b });
  assert.equal(c(undefined, 'active'), 'plan-activado');
  assert.equal(c('incomplete', 'active'), 'plan-activado');
  assert.equal(c('canceled', 'active'), 'plan-activado');
  assert.equal(c('past_due', 'active'), null, 'recuperar un pago no vuelve a dar la bienvenida al plan');
  assert.equal(c('active', 'active'), null);
  assert.equal(c('active', 'past_due'), 'pago-fallido');
  assert.equal(c('past_due', 'unpaid'), null);
  assert.equal(c('active', 'canceled'), 'suscripcion-cancelada');
  assert.equal(c('past_due', 'canceled'), 'suscripcion-cancelada');
  assert.equal(c('incomplete', 'incomplete_expired'), null);
});

test('suscripción: a cada administrador, una sola vez aunque Stripe repita el aviso', async () => {
  const antes = { estado: 'incomplete' }, ahora = { estado: 'active', nombre: 'Pro', periodo: 'mes', suscripcion: 'sub_1' };
  assert.equal((await A.avisarSuscripcion('e1', antes, ahora, 'https://netto.test')).enviados, 2);
  assert.equal((await A.avisarSuscripcion('e1', antes, ahora, 'https://netto.test')).enviados, 0);
  assert.deepEqual(enviados.map((x) => x.to[0]).sort(), ['ana@ejemplo.es', 'bea@ejemplo.es']);
  assert.equal(enviados[0].subject, 'Ya tienes el plan Pro de Fisquo');
  assert.deepEqual(enviados[0].tags, [{ name: 'correo', value: 'plan-activado' }]);
  assert.match(enviados[0].html, /https:\/\/netto\.test\/ajustes\/plan/);
  assert.match(enviados[0].text, /pago mensual/);
});

test('suscripción: una empresa dada de baja no recibe nada', async () => {
  const e = await R.redis.hget('empresas', 'e1');
  await R.redis.hset('empresas', { e1: { ...e, baja: { fecha: '2026-10-20' } } });
  assert.equal((await A.avisarSuscripcion('e1', { estado: 'active' }, { estado: 'canceled', suscripcion: 's' })).enviados, 0);
  assert.equal(enviados.length, 0);
});

test('si el email falla, la marca se quita y el siguiente aviso lo vuelve a intentar', async () => {
  const f = globalThis.fetch;
  globalThis.fetch = async () => new Response('caído', { status: 500 });
  const ahora = { estado: 'past_due', nombre: 'Pro', suscripcion: 'sub_2' };
  assert.equal((await A.avisarSuscripcion('e1', { estado: 'active' }, ahora)).enviados, 0);
  globalThis.fetch = f;
  assert.equal((await A.avisarSuscripcion('e1', { estado: 'active' }, ahora)).enviados, 2);
  assert.equal(enviados[0].subject, 'No hemos podido cobrar tu plan de Fisquo');
});

test('bienvenida: solo a quien administra su empresa, y una vez', async () => {
  assert.equal((await A.bienvenida('t1', 'https://netto.test')).enviados, 0);
  assert.equal((await A.bienvenida('a1', 'https://netto.test')).enviados, 1);
  assert.equal((await A.bienvenida('a1', 'https://netto.test')).enviados, 0);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].subject, 'Bienvenida a Fisquo: tus primeros pasos');
  assert.equal(enviados[0].reply_to, 'corporate@nettohq.com');
  assert.match(enviados[0].text, /Hola, Ana:/);
});

test('premio por recomendar: abono en euros con IVA', async () => {
  assert.equal((await A.avisarPremio('e1', { tipo: 'nada' })).enviados, 0);
  assert.equal((await A.avisarPremio('e1', { tipo: 'abono', centimos: 1089 })).enviados, 2);
  assert.match(enviados[0].text, /10,89 €/);
});
