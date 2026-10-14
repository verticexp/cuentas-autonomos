// Informe del 14/10/2026 (P01 residual): congelar la instantánea de las facturas antiguas no pisa un cobro que llega
// mientras tanto. Se pausa la escritura de la migración en el Redis simulado y se cobra en medio, de forma determinista.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, F, R, A, Cal;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [F, R, A, Cal] = await Promise.all([import('../lib/facturas.js'), import('../lib/redis.js'), import('../lib/actualizarFactura.js'), import('../lib/calculos.js')]);
});
after(() => srv.cerrar());

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
let n = 0;
const empresa = () => ({ id: `u${++n}`, empresa: `mig${n}`, emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: 'Madrid', plazo: 30 },
  actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] });
// Una factura de antes de la instantánea: sin emisor ni pagos.
const antigua = (id) => ({ id, numero: 1, anio: 2025, fecha: '2025-05-10', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, cobrada: false });
const cobro = (u, id) => A.actualizarFactura(u, id, (f) => ({ nueva: { ...f, pagos: [...(f.pagos || []), { fecha: '2026-10-14', importe: 50, metodo: 'manual' }] } }));

test('P01: un cobro de 50 € registrado mientras se migra la instantánea se conserva, y la instantánea queda congelada', async () => {
  const u = empresa();
  await R.guardar(u, 'facturas', antigua('2025-1'));
  let cobrando = null;
  // Cuando la migración va a escribir la factura, otro proceso apunta un cobro con el cerrojo común de cobros.
  srv.ganchos.antes = async (cuerpo) => {
    if (!cuerpo.includes('congelada') || cobrando) return;
    cobrando = cobro(u, '2025-1');
    // Si el cobro puede terminar en medio (sin arreglo), termina; con el arreglo espera a que la migración suelte la factura.
    await Promise.race([cobrando, dormir(400)]);
  };
  try {
    assert.equal(await F.congelarInstantaneas(u), 1);
    const r = await cobrando;
    assert.ok(r?.guardada, r?.error);
  } finally { srv.ganchos.antes = null; }
  const f = await R.leerUno(u, 'facturas', '2025-1');
  assert.equal(Cal.pagadoDe(f), 50, 'el cobro no se pierde');
  assert.equal(f.pagos?.length, 1);
  assert.equal(f.emisor?.nif, 'B12345674', 'la instantánea queda congelada');
  assert.ok(f.congelada);
});

test('P01: la migración congela todas las antiguas y no toca las que ya tienen instantánea', async () => {
  const u = empresa();
  for (let i = 1; i <= 5; i++) await R.guardar(u, 'facturas', antigua(`2025-${i}`));
  const nueva = { ...antigua('2025-9'), numero: 9, emisor: { nombre: 'Otra', nif: 'A00000000' } };
  await R.guardar(u, 'facturas', nueva);
  assert.equal(await F.congelarInstantaneas(u), 5);
  const todas = await R.leer(u, 'facturas');
  assert.ok(todas.every((f) => f.emisor?.nif));
  assert.deepEqual((await R.leerUno(u, 'facturas', '2025-9')).emisor, nueva.emisor);
  assert.equal(await F.congelarInstantaneas(u), 0, 'idempotente');
});
