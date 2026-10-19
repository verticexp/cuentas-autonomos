import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase } from './apoyo/upstash-mem.mjs';

// Redis en memoria (cliente real de Upstash) y Stripe simulado, sin red.
const servidor = { base: crearBase() };
const abonos = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (u.startsWith('https://stripe.test')) {
    abonos.push({ ruta: u.replace('https://stripe.test/v1/', ''), cuerpo: Object.fromEntries(new URLSearchParams(opciones.body)) });
    return Response.json({ id: 'cbtxn_1' });
  }
  if (!u.startsWith('https://recomendaciones.test')) throw new Error('Petición inesperada: ' + u);
  const comandos = JSON.parse(opciones.body);
  const ejecutar = (c) => { try { return { result: servidor.base.run(c) }; } catch (e) { return { error: e.message }; } };
  return Response.json(/\/(pipeline|multi-exec)/.test(u) ? comandos.map(ejecutar) : ejecutar(comandos));
};
const entorno = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, stripe: process.env.STRIPE_URL, clave: process.env.STRIPE_SECRET_KEY };
process.env.KV_REST_API_URL = 'https://recomendaciones.test';
process.env.KV_REST_API_TOKEN = 'solo-pruebas';
process.env.STRIPE_URL = 'https://stripe.test';
process.env.STRIPE_SECRET_KEY = 'sk_test_pruebas';
const { redis } = await import('../lib/redis.js');
const R = await import('../lib/recomendaciones.js');
const { descuentoDe, planTrasSuscripcion } = await import('../lib/suscripcion.js');
const { mensualDe, resumenAdmin } = await import('../lib/admin.js');

after(() => {
  globalThis.fetch = fetchOriginal;
  for (const [k, v] of [['KV_REST_API_URL', entorno.url], ['KV_REST_API_TOKEN', entorno.token], ['STRIPE_URL', entorno.stripe], ['STRIPE_SECRET_KEY', entorno.clave]]) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
beforeEach(() => { servidor.base = crearBase(); abonos.length = 0; });

const HOY = new Date('2026-10-19T12:00:00Z');
const guardar = (e) => redis.hset('empresas', { [e.id]: e });
const leerE = (id) => redis.hget('empresas', id);

test('código: único, estable y sin caracteres que se confundan', async () => {
  await guardar({ id: 'a', nombre: 'Ana' });
  const c = await R.codigoDe('a');
  assert.match(c, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(await R.codigoDe('a'), c);
  assert.equal((await R.empresaPorCodigo(c.toLowerCase())).id, 'a');
  assert.equal(await R.empresaPorCodigo('NOEXISTE'), null);
  await guardar({ ...(await leerE('a')), baja: { fecha: '2026-10-01' } });
  assert.equal(await R.empresaPorCodigo(c), null, 'una empresa de baja no recomienda');
});

test('premio: abono de un mes con IVA si paga, 30 días más si está en prueba, nada si es Fundador o llegó al tope', () => {
  assert.deepEqual(R.premioPara({ plan: { tipo: 'aut', nombre: 'Pro', pagado: true, cliente: 'cus_1' } }, HOY), { tipo: 'abono', centimos: 1452 });
  assert.deepEqual(R.premioPara({ plan: { tipo: 'aut', nombre: 'Pro', hasta: '2026-10-25' } }, HOY), { tipo: 'dias', hasta: '2026-11-24' });
  assert.deepEqual(R.premioPara({ plan: { tipo: 'aut', nombre: 'Pro', hasta: '2026-09-01' } }, HOY), { tipo: 'dias', hasta: '2026-11-17' });
  assert.equal(R.premioPara({}, HOY).motivo, 'fundador');
  assert.equal(R.premioPara({ plan: { tipo: 'aut', nombre: 'Pro', hasta: '2026-10-25' }, recomienda: { meses: 12 } }, HOY).motivo, 'maximo');
});

test('primer pago de la recomendada: abona un mes en Stripe a quien recomendó, una sola vez', async () => {
  await guardar({ id: 'a', nombre: 'Ana', plan: { tipo: 'aut', nombre: 'Pro', pagado: true, cliente: 'cus_ana', estado: 'active' }, recomienda: { codigo: 'ABCDEFGH', meses: 0 } });
  await guardar({ id: 'b', nombre: 'Bea', plan: { tipo: 'aut', nombre: 'Esencial', pagado: true, recomendacion: { codigo: 'ABCDEFGH', empresa: 'a' } } });
  assert.equal((await R.premiarRecomendacion('b', HOY)).tipo, 'abono');
  assert.equal(await R.premiarRecomendacion('b', HOY), null, 'no se premia dos veces');
  assert.equal(abonos.length, 1);
  assert.equal(abonos[0].ruta, 'customers/cus_ana/balance_transactions');
  assert.equal(abonos[0].cuerpo.amount, '-1452');
  assert.equal((await leerE('a')).recomienda.meses, 1);
  assert.equal((await leerE('b')).plan.recomendacion.premiada, '2026-10-19');
});

test('si quien recomendó aún está en prueba, se le alargan 30 días sin tocar Stripe', async () => {
  await guardar({ id: 'a', nombre: 'Ana', plan: { tipo: 'pym', nombre: 'Pro', hasta: '2026-11-01' } });
  await guardar({ id: 'b', nombre: 'Bea', plan: { tipo: 'aut', nombre: 'Pro', pagado: true, recomendacion: { codigo: 'ABCDEFGH', empresa: 'a' } } });
  await R.premiarRecomendacion('b', HOY);
  assert.equal((await leerE('a')).plan.hasta, '2026-12-01');
  assert.equal(abonos.length, 0);
});

test('cupones de Stripe: se guardan en el plan y se descuentan de los ingresos', () => {
  assert.deepEqual(descuentoDe({ discount: { coupon: { percent_off: 50, name: 'LANZA50' }, end: Date.parse('2027-01-01T00:00:00Z') / 1000 } }), { pct: 50, hasta: '2027-01-01', codigo: 'LANZA50' });
  assert.deepEqual(descuentoDe({ discounts: [{ coupon: { amount_off: 300, id: 'c1' }, promotion_code: { code: 'AMIGO3' } }] }), { cent: 300, hasta: null, codigo: 'AMIGO3' });
  assert.equal(descuentoDe({ discounts: ['di_1'] }), null);
  const plan = planTrasSuscripcion({ tipo: 'aut', nombre: 'Pro', descuento: { pct: 10 } }, { id: 's', status: 'active', customer: 'c', metadata: {} });
  assert.equal(plan.descuento, undefined, 'un cupón que ya no está se quita');
  assert.equal(mensualDe({ tipo: 'aut', nombre: 'Pro', periodo: 'mes', descuento: { pct: 50, hasta: '2027-01-01' } }, HOY), 600);
  assert.equal(mensualDe({ tipo: 'aut', nombre: 'Pro', periodo: 'mes', descuento: { pct: 50, hasta: '2026-01-01' } }, HOY), 1200);
  assert.equal(mensualDe({ tipo: 'aut', nombre: 'Pro', periodo: 'mes', descuento: { cent: 300 } }, HOY), 900);
});

test('panel: origen de cada empresa y conversión por canal', () => {
  const r = resumenAdmin({
    hoy: HOY,
    empresas: [
      { id: 'f', nombre: 'Fundadora', creada: '2026-01-01' },
      { id: 'g', nombre: 'Gestoría', creada: '2026-06-01', plan: { tipo: 'aut', nombre: 'Pro', pagado: true, estado: 'active', gestoria: 'ASESORIA' } },
      { id: 'r', nombre: 'Recomendada', creada: '2026-10-01', plan: { tipo: 'aut', nombre: 'Pro', hasta: '2026-11-29', recomendacion: { codigo: 'X', empresa: 'f' } } },
      { id: 'w', nombre: 'Web', creada: '2026-07-01', plan: { tipo: 'aut', nombre: 'Pro', hasta: '2026-08-01' } },
    ],
  });
  const o = Object.fromEntries(r.origenes.map((x) => [x.origen, x]));
  assert.deepEqual([o.web.total, o.web.conversion], [1, 0]);
  assert.deepEqual([o.gestoria.pagan, o.gestoria.conversion], [1, 100]);
  assert.deepEqual([o.recomendacion.prueba, o.recomendacion.conversion], [1, null]);
  assert.equal(r.filas.find((f) => f.id === 'r').recomendadaPor, 'Fundadora');
  assert.equal(r.recomendaciones.registradas, 1);
});
