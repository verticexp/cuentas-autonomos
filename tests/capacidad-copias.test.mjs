// Informe de capacidad E10: la copia hace un SCAN al principio y otro al final, no tres por empresa.
import test from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { Redis } from '@upstash/redis';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { hacerCopia, verificarCopia } from '../lib/copias.js';

test('E10: con 25 empresas la copia recorre la base 2 veces y sigue siendo verificable', async () => {
  const srv = await arrancar();
  try {
    const r = new Redis({ url: srv.url, token: 'p', automaticDeserialization: false });
    const ids = Array.from({ length: 25 }, (_, i) => `e${i}`);
    await r.hset('cuentas:empresas', Object.fromEntries(ids.map((id) => [id, JSON.stringify({ id })])));
    for (const id of ids) await r.hset(`cuentas:clientes:${id}`, { C: JSON.stringify({ id: 'C', nombre: 'C' }) });
    let scans = 0;
    const contado = new Proxy(r, { get(o, m) { if (m === 'scan') return (...a) => { scans++; return o.scan(...a); }; return typeof o[m] === 'function' ? o[m].bind(o) : o[m]; } });
    const copia = await hacerCopia(contado);
    assert.equal(scans, 2);
    assert.equal(copia.resumen.empresas.length, 25);
    assert.equal(verificarCopia(copia).ok, true);
  } finally { await srv.cerrar(); }
});
