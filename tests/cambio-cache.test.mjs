// Tipo de cambio del BCE (lib/cambio.js) con una caché de Redis que falla: como al compilar en Vercel, donde las pruebas
// ven un cliente de Redis y un fetch simulado. La caché nunca impide consultar el tipo.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.KV_REST_API_URL = 'http://redis-cambio.test';
process.env.KV_REST_API_TOKEN = 'pruebas';
const { cambioBce } = await import('../lib/cambio.js');

test('con Redis respondiendo cualquier cosa, el tipo sale igual del BCE', async () => {
  const original = globalThis.fetch;
  const pedidas = [];
  globalThis.fetch = async (url) => {
    pedidas.push(String(url));
    if (String(url).startsWith('http://redis-cambio.test')) return Response.json({ nada: 'que ver' });
    return Response.json({ dataSets: [{ series: { '0:0:0:0:0': { observations: { 0: [0.8512, 0, 0, null, null] } } } }], structure: { dimensions: { observation: [{ values: [{ id: '2026-10-21' }] }] } } });
  };
  try {
    assert.deepEqual(await cambioBce('GBP', '2026-10-21'), { moneda: 'GBP', cambio: 0.8512, fecha: '2026-10-21', fuente: 'BCE' });
    assert.ok(pedidas.some((u) => u.includes('/D.GBP.EUR.SP00.A')));
    globalThis.fetch = async (url) => { if (String(url).startsWith('http://redis-cambio.test')) throw new Error('Redis caído'); throw new Error('sin red'); };
    assert.match((await cambioBce('USD', '2026-10-21')).error, /Escríbelo a mano/);
  } finally { globalThis.fetch = original; }
});
