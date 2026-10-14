import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generarAsientos, mayor } from '../lib/asientos.js';
import { hoy } from '../lib/formato.js';

test('Aurora: el generador incluye las 96 nóminas en el saldo guardado y conserva sus índices', async () => {
  const copia = join(tmpdir(), `netto-simulada-test-${process.pid}.json`);
  await promisify(execFile)(process.execPath, ['--import', './tests/apoyo/cargador.mjs', 'scripts/cuenta-simulada.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, SIMULADA_PUERTO: '0', SIMULADA_SALIR: '1', SIMULADA_COPIA: copia },
  });
  const snapshot = JSON.parse(await readFile(copia, 'utf8'));
  const db = new Map(snapshot.datos);
  const hash = (k) => Object.values(Object.fromEntries((db.get(`cuentas:${k}`)?.m || []).map(([k, v]) => [k, JSON.parse(v)])));
  const e = hash('empresas')[0];
  const leer = (k) => hash(`${k}:${e.id}`);
  const datos = { facturas: leer('facturas'), gastos: leer('gastos'), nominas: leer('nominas'), manuales: leer('asientos'), productos: leer('productos'), ajustes: leer('stock'), albaranes: leer('albaranes'), fiscal: e.fiscal, pagos130: e.pagos130, pagos202: e.pagos202, cuotaIS: e.cuotaIS };
  const anio = Number(hoy().slice(0, 4));
  const saldo = JSON.parse(db.get(`cuentas:saldo:${e.id}`).v).importe;
  assert.ok(datos.nominas.length >= 80);
  assert.equal(saldo, mayor(generarAsientos(datos, hoy()), '572', anio).final);
  assert.notEqual(saldo, mayor(generarAsientos({ ...datos, nominas: [] }, hoy()), '572', anio).final, 'Omitir nóminas debe cambiar el saldo');
  for (const col of ['facturas', 'gastos', 'presupuestos']) assert.equal(hash(`ixf:${col}:${e.id}`).length, leer(col).length);
});
