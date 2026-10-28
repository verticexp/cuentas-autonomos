import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { claves, VERSION_INDICE } from '../lib/fichas.js';

const correr = (s, email) => promisify(execFile)(process.execPath, ['scripts/cuenta-revision.mjs'], {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, KV_REST_API_URL: s.url, KV_REST_API_TOKEN: 'local', REVISION_EMAIL: email },
});

test('cuenta de revisión: llena la empresa sin tocar el usuario, y no repite', async () => {
  const s = await arrancar();
  try {
    const usuario = { id: 'u1', nombre: 'Revisión', email: 'revision@ejemplo.test', empresa: 'e1', rol: 'admin', pass: 'sal:hash' };
    const empresa = { id: 'e1', nombre: 'Estudio Martín Soler S.L.', emisor: { nif: 'B12345674', plazo: 30 }, plan: { fundador: true },
      fiscal: { tipo: 'sociedad' }, actividades: [{ id: 'diseno-grafico', nombre: 'Diseño gráfico', serie: '', ivaPct: 21, irpfPct: 0 }] };
    s.base.run(['hset', 'cuentas:emails', 'revision@ejemplo.test', 'u1']);
    s.base.run(['hset', 'cuentas:usuarios', 'u1', JSON.stringify(usuario)]);
    s.base.run(['hset', 'cuentas:empresas', 'e1', JSON.stringify(empresa)]);

    await correr(s, '  Revision@Ejemplo.test ');
    const plano = s.base.run(['hgetall', 'cuentas:facturas:e1']);
    const facturas = plano.filter((_, i) => i % 2).map((x) => JSON.parse(x));
    assert.ok(facturas.length >= 12, `pocas facturas: ${facturas.length}`);
    assert.ok(facturas.some((f) => f.cobrada) && facturas.some((f) => !f.cobrada));
    assert.ok(facturas.every((f) => f.actividad === 'diseno-grafico' && f.irpfPct === 0 && f.ivaPct === 21));
    assert.ok(s.base.run(['hlen', 'cuentas:gastos:e1']) >= 20);
    for (const col of ['facturas', 'gastos']) assert.equal(s.base.run(['get', `cuentas:${claves(col, 'e1').ixv}`]), String(VERSION_INDICE), `sin índice de ${col}`);
    assert.deepEqual(JSON.parse(s.base.run(['hget', 'cuentas:usuarios', 'u1'])), usuario, 'el usuario no se toca');
    assert.deepEqual(JSON.parse(s.base.run(['hget', 'cuentas:empresas', 'e1'])), empresa, 'la empresa no se toca');

    await assert.rejects(correr(s, 'revision@ejemplo.test'), /ya tiene/);
    s.base.run(['hset', 'cuentas:empresas', 'e1', JSON.stringify({ ...empresa, verifactu: 'real' })]);
    await assert.rejects(correr(s, 'revision@ejemplo.test'), /Verifactu/);
    await assert.rejects(correr(s, 'nadie@ejemplo.test'), /No hay ninguna cuenta/);
  } finally { await s.cerrar(); }
});
