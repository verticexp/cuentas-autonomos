// Prueba de punta a punta de la entrega de integridad (auditoría de octubre de 2026), por HTTP contra la app en local,
// como la hizo la auditoría. Solo contra una copia local con una base de datos VACÍA (tests/apoyo/upstash-mem.mjs):
//   node tests/apoyo/upstash-mem.mjs 8079
//   KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=x VERIFICAR_EMAIL=off BLOQUEO_SERVIDOR=activo \
//     STRIPE_WEBHOOK_SECRET=whsec_pruebas_local npx next dev -p 3001
//   BASE=http://localhost:3001 UPSTASH=http://127.0.0.1:8079 node tests/e2e/integridad.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { comprobarIntegridad } from '../../lib/integridad.js';
import { importes } from '../../lib/calculos.js';

const BASE = process.env.BASE || 'http://localhost:3001';
const UPSTASH = process.env.UPSTASH || 'http://127.0.0.1:8079';
if (!/localhost|127\.0\.0\.1/.test(BASE + UPSTASH)) throw new Error('Solo contra una copia local con la base de datos vacía');
let fallos = 0;
const ok = async (n, f) => { try { await f(); console.log('  ✓', n); } catch (e) { fallos++; console.log('  ✗', n, '→', e.message); } };
const db = async (...cmd) => (await (await fetch(UPSTASH, { method: 'POST', body: JSON.stringify(cmd) })).json()).result;
const hash = async (k) => { const r = await db('hgetall', `cuentas:${k}`); const o = {}; for (let i = 0; i < r.length; i += 2) o[r[i]] = JSON.parse(r[i + 1]); return o; };

let t = '', d = '';
const pedir = (ruta, { metodo = 'GET', cuerpo, form, sinDesbloqueo, cabeceras = {} } = {}) => fetch(BASE + ruta, {
  method: metodo, redirect: 'manual',
  headers: { Origin: BASE, Cookie: [t && `t=${t}`, d && !sinDesbloqueo && `d=${d}`].filter(Boolean).join('; '), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}), ...cabeceras },
  body: form || (cuerpo ? JSON.stringify(cuerpo) : undefined),
});
const json = async (ruta, op) => { const r = await pedir(ruta, op); return { status: r.status, d: await r.json().catch(() => ({})) }; };

const fd = new FormData(); fd.set('nombre', 'Prueba'); fd.set('email', `integridad${Date.now()}@test.es`); fd.set('password', 'Clave-Local-01-2026');
const alta = await pedir('/api/registro', { metodo: 'POST', form: fd });
const ck = alta.headers.getSetCookie();
t = /^t=([^;]+)/.exec(ck.find((c) => c.startsWith('t=')) || '')?.[1];
d = /^d=([^;]+)/.exec(ck.find((c) => c.startsWith('d=')) || '')?.[1];
if (!t) throw new Error('No se pudo crear la cuenta de prueba: ¿la base de datos está vacía?');
// Sociedad: desde el PR #218 una S.L. con CIF no se puede configurar como autónomo.
const conf = await json('/api/cuenta', { metodo: 'PATCH', cuerpo: { configuracion: {
  fiscal: { tipo: 'sociedad', iva: 'general' },
  emisor: { nombre: 'Integridad S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', iban: 'ES9121000418450200051332', plazo: 30 },
  actividades: [{ nombre: 'Servicios', ivaPct: 21, irpfPct: 0 }],
} } });
const ACT = conf.d.actividades[0].id;
const factura = (i, extra = {}) => ({ fecha: '2026-03-10', actividad: ACT, cliente: { nombre: `Cliente ${i}`, nif: '12345678Z' }, lineas: [{ concepto: 'Servicio', cantidad: '1', precio: String(100 + i), ivaPct: 21 }], irpfPct: 0, ...extra });
const empresa = (await db('hkeys', 'cuentas:empresas'))[0];

console.log('F07 · bloqueo de pantalla también en la API');
// Desde el 17-10-2026 el bloqueo es opcional y personal (Ajustes › Face ID y contraseña): se activa para comprobarlo.
await json('/api/cuenta', { metodo: 'PATCH', cuerpo: { bloqueoPantalla: true } });
await ok('sin desbloqueo, la API no da datos (423)', async () => {
  assert.equal((await pedir('/api/exportar?tipo=facturas', { sinDesbloqueo: true })).status, 423);
  assert.equal((await pedir('/api/facturas', { metodo: 'POST', cuerpo: factura(0), sinDesbloqueo: true })).status, 423);
});
await ok('con desbloqueo, sí (200)', async () => assert.equal((await pedir('/api/exportar?tipo=facturas')).status, 200));
await ok('las páginas siguen igual: a /bloqueo', async () => assert.match((await pedir('/facturas', { sinDesbloqueo: true })).headers.get('location') || '', /\/bloqueo/));

console.log('F01 · 20 emisiones simultáneas por la API');
await ok('20 facturas distintas, números 1–20', async () => {
  const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => json('/api/facturas', { metodo: 'POST', cuerpo: factura(i) })));
  assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.find((r) => r.status !== 200)));
  const ids = rs.map((r) => r.d.factura.id);
  assert.equal(new Set(ids).size, 20);
  const fs = Object.values(await hash(`facturas:${empresa}`));
  assert.equal(fs.length, 20);
  assert.deepEqual(fs.map((f) => f.numero).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});
await ok('doble clic con la misma clave: una sola factura', async () => {
  const rs = await Promise.all([1, 2, 3].map(() => json('/api/facturas', { metodo: 'POST', cuerpo: factura(50, { idem: 'clic-e2e-1' }) })));
  assert.equal(new Set(rs.map((r) => r.d.factura.id)).size, 1);
  assert.equal(Object.keys(await hash(`facturas:${empresa}`)).length, 21);
});

console.log('F03 · borrar no libera el número');
await ok('se borra la 21 y la siguiente es la 22', async () => {
  assert.equal((await json(`/api/facturas?id=2026-21`, { metodo: 'DELETE' })).status, 200);
  const r = await json('/api/facturas', { metodo: 'POST', cuerpo: factura(60) });
  assert.equal(r.d.factura.id, '2026-22');
  assert.ok((await hash(`facturasBorradas:${empresa}`))['2026-21']);
});

console.log('F06 · validación en el servidor');
await ok('fecha imposible, IVA 99 % y base negativa no rectificativa: 400 con errores por campo', async () => {
  const r = await json('/api/facturas', { metodo: 'POST', cuerpo: { ...factura(1), fecha: '2026-02-31', lineas: [{ concepto: 'X', cantidad: '1', precio: '100', ivaPct: 99 }] } });
  assert.equal(r.status, 400);
  assert.ok(r.d.errores.fecha && r.d.errores['lineas.0.ivaPct']);
  assert.equal((await json('/api/facturas', { metodo: 'POST', cuerpo: factura(1, { lineas: [{ concepto: 'X', cantidad: '1', precio: '-100', ivaPct: 21 }] }) })).status, 400);
  assert.equal((await json('/api/facturas', { metodo: 'POST', cuerpo: factura(1, { cliente: { nombre: 'X', nif: '12345678A' } }) })).status, 400);
});

console.log('F05 · documentos históricos estables');
await ok('cambiar la razón social no cambia el PDF de una factura emitida', async () => {
  const antes = (await hash(`facturas:${empresa}`))['2026-1'];
  assert.equal(antes.emisor.nombre, 'Integridad S.L.');
  await json('/api/cuenta', { metodo: 'PATCH', cuerpo: { nombre: 'Nombre Nuevo S.L.', nif: 'B12345674', direccion: 'C/ Otra 2', ciudad: '08001 Barcelona', iban: 'ES9121000418450200051332', plazo: 60 } });
  // Solo lo que se ve: los datos de la página (en <script>) llevan el nombre de hoy para el selector de empresas.
  const html = (await (await pedir('/facturas/2026-1/pdf')).text()).replace(/<script[\s\S]*?<\/script>/g, '');
  assert.ok(html.includes('Integridad S.L.') && !html.includes('Nombre Nuevo S.L.'), 'el PDF usa el emisor de entonces');
  assert.equal((await hash(`facturas:${empresa}`))['2026-1'].vence, '2026-04-09');
  const nueva = await json('/api/facturas', { metodo: 'POST', cuerpo: factura(70) });
  assert.equal(nueva.d.factura.emisor.nombre, 'Nombre Nuevo S.L.');
});

console.log('F04 · cobros que cuadran');
await ok('0,01 USD no salda; 0,01 EUR queda como pago parcial; repetido no duplica', async () => {
  const f = (await hash(`facturas:${empresa}`))['2026-2'];
  const total = Math.round(importes(f).total * 100);
  const token = `pruebae2e${Date.now()}`;
  await db('hset', 'cuentas:factura-pagos', token, JSON.stringify({ empresa, id: f.id }));
  const aviso = async (s) => {
    const cuerpo = JSON.stringify({ type: 'checkout.session.completed', data: { object: s } });
    const ts = Math.floor(Date.now() / 1000);
    const firma = createHmac('sha256', 'whsec_pruebas_local').update(`${ts}.${cuerpo}`).digest('hex');
    return fetch(`${BASE}/api/stripe`, { method: 'POST', body: cuerpo, headers: { 'stripe-signature': `t=${ts},v1=${firma}` } });
  };
  const s = (id, extra) => ({ id, payment_status: 'paid', currency: 'eur', amount_total: total, metadata: { token, factura: f.id, empresa }, ...extra });
  assert.equal((await aviso(s('cs_1', { currency: 'usd', amount_total: 1 }))).status, 200);
  assert.equal((await hash(`facturas:${empresa}`))[f.id].cobrada, false);
  await Promise.all([aviso(s('cs_2', { amount_total: 1 })), aviso(s('cs_2', { amount_total: 1 }))]);
  let x = (await hash(`facturas:${empresa}`))[f.id];
  assert.equal(x.cobrada, false);
  assert.equal(x.pagos.length, 1);
  await aviso(s('cs_3', { amount_total: total - 1 }));
  x = (await hash(`facturas:${empresa}`))[f.id];
  assert.equal(x.cobrada, true);
});

console.log('F02 · cadena Verifactu con 10 emisiones simultáneas');
await ok('una única cadena, sin huérfanos', async () => {
  assert.equal((await json('/api/cuenta', { metodo: 'PATCH', cuerpo: { verifactu: 'pruebas' } })).status, 200);
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => json('/api/facturas', { metodo: 'POST', cuerpo: factura(100 + i) })));
  assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.find((r) => r.status !== 200)?.d));
  assert.equal(new Set(rs.map((r) => r.d.factura.id)).size, 10);
  const registros = Object.values(await hash(`registros:${empresa}`));
  assert.equal(registros.length, 10);
  const inc = comprobarIntegridad({ facturas: Object.values(await hash(`facturas:${empresa}`)), borradas: Object.values(await hash(`facturasBorradas:${empresa}`)), registros, cabeza: await db('get', `cuentas:verifactu:${empresa}`), numeracion: Object.fromEntries(Object.entries(await db('hgetall', `cuentas:numeracion:${empresa}`).then((r) => { const o = {}; for (let i = 0; i < r.length; i += 2) o[r[i]] = r[i + 1]; return o; }))) });
  assert.deepEqual(inc, []);
});

console.log(fallos ? `\n${fallos} fallos` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
