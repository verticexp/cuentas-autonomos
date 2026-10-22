// Stripe Connect (lib/stripe.js, lib/stripeConnect.js): cada empresa cobra en su propia cuenta de Stripe.
import test from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { cobroFacturasListo, crearPago, leerPago, stripeV2 } from '../lib/stripe.js';

// lib/stripeConnect.js importa lib/auth.js (next/headers): se carga cuando el cargador de las pruebas ya está activo.
const { estadoDe, enlaceAlta } = await import('../lib/stripeConnect.js');

const llamadas = [];
const fetchAnterior = globalThis.fetch;
const conFetch = async (respuesta, fn) => {
  globalThis.fetch = async (url, op) => { llamadas.push({ url: String(url), op }); return new Response(JSON.stringify(respuesta), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try { return await fn(); } finally { globalThis.fetch = fetchAnterior; }
};

test('el cobro con tarjeta solo se ofrece con la cuenta de Stripe de la empresa lista para cobrar', () => {
  const antes = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  try {
    assert.equal(cobroFacturasListo(), false);
    assert.equal(cobroFacturasListo({ stripeConnect: { cuenta: 'acct_1', estado: 'pendiente' } }), false);
    assert.equal(cobroFacturasListo({ stripeConnect: { cuenta: 'nada', estado: 'activa' } }), false);
    assert.equal(cobroFacturasListo({ stripeConnect: { cuenta: 'acct_1', estado: 'activa' } }), true);
    delete process.env.STRIPE_SECRET_KEY;
    assert.equal(cobroFacturasListo({ stripeConnect: { cuenta: 'acct_1', estado: 'activa' } }), false);
  } finally { if (antes === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = antes; }
});

test('estado de la cuenta por su capacidad card_payments (Accounts v2), no por charges_enabled', () => {
  const con = (status) => ({ configuration: { merchant: { capabilities: { card_payments: { status } } } } });
  assert.deepEqual(['active', 'pending', 'restricted', undefined].map((s) => estadoDe(con(s))), ['activa', 'revision', 'pendiente', 'pendiente']);
  assert.equal(estadoDe({ charges_enabled: true }), 'pendiente');
});

test('API v2 en JSON con su versión; el pago y su lectura van a la cuenta de la empresa (Stripe-Account)', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  llamadas.length = 0;
  await conFetch({ url: 'https://connect.stripe.com/x' }, () => enlaceAlta('acct_9', 'https://www.fisquo.com'));
  const [l] = llamadas;
  assert.ok(l.url.endsWith('/v2/core/account_links'));
  assert.match(l.op.headers['Stripe-Version'], /^\d{4}-\d{2}-\d{2}\./);
  assert.equal(l.op.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(l.op.body).use_case.account_onboarding.configurations, ['merchant']);
  assert.equal(JSON.parse(l.op.body).use_case.account_onboarding.return_url, 'https://www.fisquo.com/api/stripe/connect?vuelta=1');
  llamadas.length = 0;
  await conFetch({ id: 'cs_1', url: 'https://checkout.stripe.com/x' }, () => crearPago({ importe: 12.1, concepto: 'Factura 1', volver: 'https://x/pagar/t', datos: { token: 't' }, cuenta: 'acct_9' }));
  await conFetch({ id: 'cs_1' }, () => leerPago('cs_1', 'acct_9'));
  assert.equal(llamadas[0].op.headers['Stripe-Account'], 'acct_9');
  assert.equal(llamadas[1].op.headers['Stripe-Account'], 'acct_9');
  // Nunca payment_method_types (métodos dinámicos según el panel de Stripe de la empresa).
  assert.ok(!String(llamadas[0].op.body).includes('payment_method_types'));
  llamadas.length = 0;
  const r = await conFetch({ id: 'acct_9' }, () => stripeV2('core/accounts/acct_9'));
  assert.equal(r.id, 'acct_9');
  assert.equal(llamadas[0].op.method, 'GET');
  delete process.env.STRIPE_SECRET_KEY;
});

test('conexión directa con el banco: el administrador siempre; las empresas, cuando Enable Banking está sin restricciones', async () => {
  const { bancoDirectoPermitido } = await import('../lib/enableBanking.js');
  const antes = process.env.BANCO_DIRECTO;
  try {
    delete process.env.BANCO_DIRECTO;
    assert.deepEqual([bancoDirectoPermitido({ admin: true }), bancoDirectoPermitido({ empresa: 'e1' })], [true, false]);
    process.env.BANCO_DIRECTO = 'todos';
    assert.deepEqual([bancoDirectoPermitido({ admin: true }), bancoDirectoPermitido({ empresa: 'e1' }), bancoDirectoPermitido({})], [true, true, false]);
  } finally { if (antes === undefined) delete process.env.BANCO_DIRECTO; else process.env.BANCO_DIRECTO = antes; }
});
