import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearBase } from './apoyo/upstash-mem.mjs';

// Peticiones de documentos, mensajes guardados y vista previa del despacho, con el cliente Upstash real y el transporte
// REST en memoria (sin puertos), como tests/despachos.test.mjs.
const base = crearBase();
const fetchOriginal = globalThis.fetch;
const entorno = { KV_REST_API_URL: process.env.KV_REST_API_URL, KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN };
process.env.KV_REST_API_URL = 'https://peticiones.test';
process.env.KV_REST_API_TOKEN = 'solo-pruebas';
globalThis.fetch = async (url, opciones) => {
  if (new URL(String(url)).origin !== 'https://peticiones.test') throw new Error('Petición inesperada: ' + String(url));
  const comandos = JSON.parse(opciones.body);
  const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
  const codificar = new Headers(opciones.headers).get('upstash-encoding') === 'base64';
  const ejecutar = (c) => { try { const r = base.run(c); return { result: codificar ? b64(r) : r }; } catch (e) { return { error: e.message }; } };
  return Response.json(/\/(pipeline|multi-exec)/.test(String(url)) ? comandos.map(ejecutar) : ejecutar(comandos));
};
after(() => {
  globalThis.fetch = fetchOriginal;
  for (const [k, v] of Object.entries(entorno)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});

const { redis } = await import('../lib/redis.js');
const { pedir, peticionesDe, pendientes, anular, entregar } = await import('../lib/peticionesDespacho.js');
const { guardarPlantilla, plantillasDe, PLANTILLAS_INICIALES, MAX_PLANTILLAS } = await import('../lib/plantillasDespacho.js');
const { resumenDocumento, tipoValido } = await import('../lib/documentoVista.js');
const { comentar } = await import('../lib/comentariosDespacho.js');

const quien = { id: 'u1', nombre: 'Núria Ferrer' };
const ctx = { id: 'u1', empresa: 'e1' };
beforeEach(() => { for (const k of [...base.db.keys()]) base.db.delete(k); });

test('peticiones: pedir un ticket o un documento, sin repetir el mismo ticket ni pedir nada vacío', async () => {
  assert.equal((await pedir('e1', quien, { despacho: 'd1', tipo: 'otro' })).error, 'Tipo de petición no válido');
  assert.match((await pedir('e1', quien, { despacho: 'd1', tipo: 'documento', texto: ' ' })).error, /qué documento/);
  assert.match((await pedir('e1', quien, { despacho: 'd1', tipo: 'ticket' })).error, /gasto/);
  const t = await pedir('e1', quien, { despacho: 'd1', tipo: 'ticket', gasto: { id: 'g1', texto: 'Repsol (01/10/2026)' } });
  assert.equal(t.peticion.estado, 'pendiente');
  assert.equal(t.peticion.gasto.id, 'g1');
  assert.equal((await pedir('e1', quien, { despacho: 'd1', tipo: 'ticket', gasto: { id: 'g1' } })).status, 409);
  const d = await pedir('e1', quien, { despacho: 'd1', tipo: 'documento', texto: '  El contrato   de alquiler ' });
  assert.equal(d.peticion.texto, 'El contrato de alquiler');
  assert.equal(pendientes(await peticionesDe('e1', { despacho: 'd1' })).length, 2);
  // Otro despacho no ve las de este.
  assert.equal((await peticionesDe('e1', { despacho: 'd2' })).length, 0);
});

test('peticiones: un ticket queda entregado en cuanto el gasto tiene justificante; anular y entregar solo si está pendiente', async () => {
  await redis.hset('gastos:e1', { g1: { id: 'g1', fecha: '2026-10-01', concepto: 'Gasolina', base: 50, ivaPct: 21 }, g2: { id: 'g2', fecha: '2026-10-02', concepto: 'Comida', base: 20, ivaPct: 10, archivo: { clave: 'justificantes/e1/g2-x.jpg', tipo: 'image/jpeg', subido: '2026-10-03T10:00:00.000Z' } } });
  await pedir('e1', quien, { despacho: 'd1', tipo: 'ticket', gasto: { id: 'g1' } });
  const p2 = (await pedir('e1', quien, { despacho: 'd1', tipo: 'ticket', gasto: { id: 'g2' } })).peticion;
  const p3 = (await pedir('e1', quien, { despacho: 'd1', tipo: 'ticket', gasto: { id: 'g3' } })).peticion;
  const lista = await peticionesDe('e1', { despacho: 'd1', ctx });
  assert.equal(lista.find((p) => p.id === p2.id).estado, 'entregada');
  assert.equal(lista.find((p) => p.id === p3.id).estado, 'anulada', 'el gasto ya no existe');
  assert.equal(lista.filter((p) => p.estado === 'pendiente').length, 1);
  const doc = (await pedir('e1', quien, { despacho: 'd1', tipo: 'documento', texto: 'Modelo 036' })).peticion;
  assert.equal((await anular('e1', doc.id, 'd2')).status, 404, 'otro despacho no la anula');
  const e = await entregar('e1', doc.id, { nombre: 'Marta' }, { archivo: { clave: 'justificantes/e1/peticion-x.pdf', tipo: 'application/pdf' } });
  assert.equal(e.peticion.estado, 'entregada');
  assert.equal(e.peticion.entrega.archivo.tipo, 'application/pdf');
  assert.equal((await anular('e1', doc.id, 'd1')).status, 409, 'ya entregada');
  assert.equal((await entregar('e1', doc.id, { nombre: 'Marta' })).status, 409, 'no se entrega dos veces');
});

test('mensajes guardados: los de ejemplo hasta guardar uno; nuevo, cambiar, borrar y tope', async () => {
  await redis.hset('despachos', { d1: { id: 'd1', nombre: 'Gestoría', miembros: { u1: { rol: 'titular' } } } });
  assert.deepEqual(plantillasDe(await redis.hget('despachos', 'd1')), PLANTILLAS_INICIALES);
  assert.match((await guardarPlantilla('d1', { titulo: '', texto: 'x' })).error, /nombre/);
  const r = await guardarPlantilla('d1', { titulo: 'Renta', texto: 'Empieza la Renta' });
  assert.equal(r.plantillas.length, PLANTILLAS_INICIALES.length + 1);
  const nueva = r.plantillas.at(-1);
  const c = await guardarPlantilla('d1', { id: nueva.id, titulo: 'Renta 2026', texto: 'Empieza la Renta' });
  assert.equal(c.plantillas.find((p) => p.id === nueva.id).titulo, 'Renta 2026');
  const b = await guardarPlantilla('d1', { id: PLANTILLAS_INICIALES[0].id, borrar: true });
  assert.ok(!b.plantillas.some((p) => p.id === PLANTILLAS_INICIALES[0].id));
  assert.deepEqual(plantillasDe(await redis.hget('despachos', 'd1')), b.plantillas);
  for (let i = b.plantillas.length; i < MAX_PLANTILLAS; i++) await guardarPlantilla('d1', { titulo: `P${i}`, texto: 'x' });
  assert.equal((await guardarPlantilla('d1', { titulo: 'Una más', texto: 'x' })).status, 409);
});

test('vista previa: datos de la factura o el gasto, sin archivo si no lo tiene; tipos raros fuera', async () => {
  assert.equal(tipoValido('factura'), true);
  assert.equal(tipoValido('asiento'), false);
  await redis.hset('facturas:e1', { '2026-7': { id: '2026-7', numero: 7, anio: 2026, fecha: '2026-10-05', cliente: { nombre: 'Bar Pepe', nif: 'B12345678' }, concepto: 'Sonido', base: 1000, ivaPct: 21, irpfPct: 15, cobrada: false } });
  await redis.hset('gastos:e1', { g1: { id: 'g1', fecha: '2026-10-01', proveedor: 'Repsol', concepto: 'Gasolina', base: 50, ivaPct: 21, pendiente: true, vence: '2026-11-01' } });
  const f = await resumenDocumento(ctx, 'factura', '2026-7');
  assert.equal(f.titulo, 'Factura 07-2026');
  assert.equal(f.total, 1060);
  assert.equal(f.irpf, 150);
  assert.equal(f.estado, 'Pendiente de cobro');
  assert.deepEqual(f.archivo, { tipo: 'application/pdf' });
  const g = await resumenDocumento(ctx, 'gasto', 'g1');
  assert.equal(g.titulo, 'Repsol');
  assert.equal(g.archivo, null);
  assert.equal(g.vence, '2026-11-01');
  assert.equal(await resumenDocumento(ctx, 'gasto', 'no-existe'), null);
  assert.equal(await resumenDocumento(ctx, 'asiento', 'g1'), null);
});

test('chat: el informe del trimestre se puede citar en un mensaje; otros tipos, no', async () => {
  const ok = await comentar('e1', quien, 'despacho', { anio: 2026, t: 3, despacho: 'd1', doc: { tipo: 'informe', id: '2026-3', texto: 'Informe del 3T 2026' }, texto: 'Te lo envío' });
  assert.equal(ok.comentario.doc.tipo, 'informe');
  assert.equal((await comentar('e1', quien, 'despacho', { anio: 2026, t: 3, despacho: 'd1', doc: { tipo: 'nomina', id: 'n1' }, texto: 'x' })).error, 'Documento no válido');
});
