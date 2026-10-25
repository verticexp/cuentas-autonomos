// Facturas simplificadas en su propia serie (art. 7.1.a del Reglamento de facturación; Manual práctico de IVA de la AEAT,
// «Facturas simplificadas»: quien expide simplificadas y completas en un mismo año las numera en series separadas).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { limpiarActividades, serieSimplificada } from '../lib/empresa.js';

let srv, F, Cal;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [F, Cal] = await Promise.all([import('../lib/facturas.js'), import('../lib/calculos.js')]);
});
after(() => srv.cerrar());

test('serie FS reservada (FSX si una actividad antigua ya la usaba)', () => {
  assert.equal(serieSimplificada([{ serie: '' }, { serie: 'V' }]), 'FS');
  assert.equal(serieSimplificada([{ serie: 'FS' }]), 'FSX');
  assert.match(limpiarActividades([{ nombre: 'Tienda', serie: 'FS' }]).error, /reservada/);
});

test('una factura sin NIF del cliente va a la serie FS y la completa sigue en la de su actividad', async () => {
  const u = { id: 'u1', empresa: 'serie-fs', rol: 'admin', emisor: { nombre: 'Tienda S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', plazo: 30 },
    actividades: [{ id: 'tienda', nombre: 'Tienda', serie: '', ivaPct: 21, irpfPct: 0 }] };
  const base = { fecha: '2026-03-10', actividad: 'tienda', concepto: 'Venta', base: 100, ivaPct: 21, irpfPct: 0 };
  const completa = (await F.crearFactura(u, { ...base, cliente: { nombre: 'Cliente SL', nif: 'B87654321', direccion: 'C/ Sol 2', ciudad: 'Madrid' } })).factura;
  const simple1 = (await F.crearFactura(u, { ...base, cliente: { nombre: 'Mostrador' } })).factura;
  const simple2 = (await F.crearFactura(u, { ...base, cliente: { nombre: 'Mostrador' } })).factura;
  const completa2 = (await F.crearFactura(u, { ...base, cliente: { nombre: 'Cliente SL', nif: 'B87654321', direccion: 'C/ Sol 2', ciudad: 'Madrid' } })).factura;
  assert.deepEqual([completa, simple1, simple2, completa2].map(Cal.numeroFactura), ['01-2026', 'FS2026-001', 'FS2026-002', '02-2026']);
  // Un cliente extranjero sin NIF español no es simplificada: sigue en la serie de la actividad.
  const fuera = (await F.crearFactura(u, { ...base, ivaPct: 0, operacion: 'servicios-fuera', cliente: { nombre: 'Acme Inc', pais: 'US' } })).factura;
  assert.equal(Cal.numeroFactura(fuera), '03-2026');
});
