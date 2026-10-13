import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Redis } from '@upstash/redis';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { hacerCopia, cifrar, copiaDeDatos, verificarCopia } from '../lib/copias.js';
import { simulacro } from '../scripts/simulacro.mjs';

const clave = Buffer.alloc(32, 7).toString('base64');

function entornoLocal(t) {
  const anterior = process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_URL;
  t.after(() => {
    if (anterior === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = anterior;
  });
}

async function ejemplo(t) {
  entornoLocal(t);
  const s = await arrancar();
  t.after(() => s.cerrar());
  const r = new Redis({ url: s.url, token: 'prueba', automaticDeserialization: false });
  await r.hset('cuentas:empresas', { a: JSON.stringify({ nombre: 'Empresa A' }), b: JSON.stringify({ nombre: 'Empresa B' }) });
  await r.hset('cuentas:usuarios', {
    ua: JSON.stringify({ empresa: 'a', email: 'a@example.test' }),
    ub: JSON.stringify({ empresa: 'b', email: 'b@example.test' }),
    compartido: JSON.stringify({ empresa: 'b', membresias: ['a', 'b'] }),
  });
  await r.hset('cuentas:emails', { 'a@example.test': 'ua', 'b@example.test': 'ub', 'comun@example.test': 'compartido' });
  for (const id of ['a', 'b']) {
    let anterior = '';
    for (let n = 1; n <= 2; n++) {
      const factura = `${id}-${n}`;
      const huella = createHash('sha256').update(`${anterior}:${factura}`).digest('hex').toUpperCase();
      const registro = { factura, tipo: 'alta', Huella: huella, HuellaAnterior: anterior };
      // Facturas históricas sin instantánea de emisor: sin-instantanea es un aviso,
      // pero sus registros, enlaces y cabeza de cadena deben ser íntegros.
      await r.hset(`cuentas:facturas:${id}`, { [factura]: JSON.stringify({ id: factura, serie: 'F', anio: 2026, numero: n, verifactu: { huella } }) });
      await r.hset(`cuentas:registros:${id}`, { [huella]: JSON.stringify(registro) });
      anterior = huella;
    }
    await r.set(`cuentas:verifactu:${id}`, anterior);
    await r.hset(`cuentas:numeracion:${id}`, { 'F:2026': '2' });
  }
  await r.sadd('cuentas:etiquetas:a', 'musica', 'eventos');
  await r.rpush('cuentas:lista:b', 'primero', 'segundo');
  await r.set('cuentas:temporal:a', 'vigente');
  await r.pexpire('cuentas:temporal:a', 60_000);
  const copia = await hacerCopia(r);
  assert.equal(verificarCopia(copia).ok, true, 'El ejemplo debe partir de una copia válida');
  const dir = await mkdtemp(join(tmpdir(), 'simulacro-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ruta = join(dir, 'copia.json.enc');
  await writeFile(ruta, cifrar(copia, clave));
  return { ruta, copia, dir };
}

test('copia cifrada: restaura todo y una empresa con cadenas, numeración y usuarios', async (t) => {
  const { ruta, copia } = await ejemplo(t);
  const informe = await simulacro(ruta, { clave });
  assert.equal(informe.ok, true);
  assert.equal(informe.empresa, 'a');
  assert.equal(informe.completa.claves, copia.resumen.claves);
  assert.deepEqual(Object.keys(informe.integridad), ['a', 'b']);
  assert.equal(informe.integridad.a.errores, 0);
  assert.equal(informe.integridad.b.errores, 0);
  assert.equal(informe.integridadEmpresa.a.errores, 0);
  for (const paso of ['restaurarTodo', 'volverACopiar', 'comprobarTodo', 'restaurarEmpresa', 'comprobarEmpresa']) {
    assert.ok(informe.pasos[paso].ms >= 0, `Falta duración de ${paso}`);
  }
  assert.ok(informe.totalMs >= 0);
});

test('rechaza una copia cifrada manipulada', async (t) => {
  const { ruta, copia } = await ejemplo(t);
  const cifrada = cifrar(copia, clave);
  cifrada[cifrada.length - 1] ^= 1;
  await writeFile(ruta, cifrada);
  await assert.rejects(simulacro(ruta, { clave }), /manipulada|autenticación/);
});

test('rechaza datos manipulados y una cadena rota aunque se recalcule la huella', async (t) => {
  const { copia } = await ejemplo(t);
  const alterada = structuredClone(copia);
  alterada.datos['cuentas:numeracion:a'].valor['F:2026'] = '99';
  await assert.rejects(simulacro(alterada), /Huella SHA-256 incorrecta/);
  const rota = structuredClone(copia.datos);
  rota['cuentas:verifactu:a'].valor = 'DESCONOCIDA';
  await assert.rejects(simulacro(copiaDeDatos(rota)), /cabeza-desconocida/);
});

test('acepta JSON en claro y omite las claves ya caducadas', async (t) => {
  const { copia, dir } = await ejemplo(t);
  copia.datos['cuentas:caducada:a'] = { tipo: 'string', valor: 'no restaurar', caduca: Date.now() - 1000 };
  const ruta = join(dir, 'copia.json');
  await writeFile(ruta, JSON.stringify(copiaDeDatos(copia.datos)));
  const informe = await simulacro(ruta);
  assert.equal(informe.ok, true);
  assert.deepEqual(informe.completa.caducadas, ['cuentas:caducada:a']);
});

test('aborta antes de arrancar servidores si la URL KV no es local', async (t) => {
  entornoLocal(t);
  process.env.KV_REST_API_URL = 'https://base-real.example.test';
  await assert.rejects(simulacro(copiaDeDatos({})), /127\.0\.0\.1\/localhost/);
});
