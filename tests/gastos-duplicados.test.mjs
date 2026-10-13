import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, G, R;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  G = await import('../lib/gastosServidor.js');
  R = await import('../lib/redis.js');
});
after(() => srv?.cerrar());

let n = 0;
const empresa = () => ({ id: `u-gastos-${++n}`, empresa: `e-gastos-${n}` });
const datos = (id, extra = {}) => ({ id, fecha: '2026-10-13', actividad: 'servicios', concepto: 'Alquiler de equipo', proveedor: 'Sonido S.L.', proveedorNif: 'B12345674', numero: 'F-001', base: 100, ivaPct: 21, ...extra });
const todas = async (u) => (await R.leer(u, 'gastos')) || [];

test('C4: la misma factura del proveedor avisa sin guardar y se guarda al confirmar', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', datos('original'));
  const nuevo = datos('nuevo', { numero: 'F/1', base: 200 });
  const aviso = await G.crearGasto(u, nuevo);
  assert.equal(aviso.error, 'Puede que este gasto ya esté apuntado');
  assert.deepEqual(aviso.duplicados, [{ id: 'original', motivo: 'Misma factura de Sonido S.L. (nº F-001) del 13-10-2026', certeza: 'segura' }]);
  assert.deepEqual(await todas(u), [datos('original')]);

  const alta = await G.crearGasto(u, nuevo, { duplicadoConfirmado: true });
  assert.equal(alta.error, undefined);
  assert.deepEqual(alta.gasto.duplicadoRevisado, ['original']);
  assert.deepEqual(await R.leerUno(u, 'gastos', 'nuevo'), { ...nuevo, duplicadoRevisado: ['original'] });
  assert.equal((await todas(u)).length, 2);
});

test('C4: un gasto distinto se guarda sin aviso', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', datos('original'));
  const nuevo = datos('distinto', { numero: 'F-002', base: 250 });
  assert.deepEqual(await G.crearGasto(u, nuevo), { gasto: nuevo });
  assert.deepEqual(await R.leerUno(u, 'gastos', 'distinto'), nuevo);
  assert.equal((await todas(u)).length, 2);
});

test('C4: solo el booleano true confirma el duplicado', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', datos('original'));
  for (const duplicadoConfirmado of [false, 'true', 1, null]) {
    const aviso = await G.crearGasto(u, datos('nuevo'), { duplicadoConfirmado });
    assert.ok(aviso.error);
  }
  assert.equal((await todas(u)).length, 1);
});

test('C4: la confirmación registra todos los ids revisados', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', datos('original'));
  await R.guardar(u, 'gastos', datos('otro-original'));
  const nuevo = datos('nuevo');
  const aviso = await G.crearGasto(u, nuevo);
  assert.equal(aviso.duplicados.length, 2);
  assert.equal((await todas(u)).length, 2);
  const alta = await G.crearGasto(u, nuevo, { duplicadoConfirmado: true });
  assert.deepEqual([...alta.gasto.duplicadoRevisado].sort(), ['original', 'otro-original'].sort());
  assert.equal((await todas(u)).length, 3);
});

test('C4: una coincidencia probable también requiere confirmación', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', datos('original'));
  const nuevo = datos('probable', { numero: 'F-002', fecha: '2026-10-15' });
  const aviso = await G.crearGasto(u, nuevo);
  assert.equal(aviso.duplicados[0].certeza, 'probable');
  assert.equal((await todas(u)).length, 1);
  const alta = await G.crearGasto(u, nuevo, { duplicadoConfirmado: true });
  assert.deepEqual(alta.gasto.duplicadoRevisado, ['original']);
});

test('C4: solo compara los gastos de la empresa actual', async () => {
  const otra = empresa();
  await R.guardar(otra, 'gastos', datos('original'));
  const u = empresa();
  const nuevo = datos('nuevo');
  assert.deepEqual(await G.crearGasto(u, nuevo), { gasto: nuevo });
  assert.equal((await todas(otra)).length, 1);
  assert.deepEqual(await todas(u), [nuevo]);
});
