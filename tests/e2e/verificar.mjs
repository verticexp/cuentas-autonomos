// Prueba de punta a punta: crea una empresa de prueba en una base de datos VACÍA, mete facturas y gastos
// por la API como lo haría la app, y comprueba que cada pantalla enseña exactamente las cifras calculadas a mano.
// Uso: BASE=http://localhost:3001 node tests/e2e/verificar.mjs   (nunca contra la app de verdad)
import assert from 'node:assert/strict';
import { panelResumen } from '../../lib/panel.js';
import { importes, numeroFactura, r2 } from '../../lib/calculos.js';
import { eur, eurSin } from '../../lib/formato.js';
import { limpiarFiscal } from '../../lib/empresa.js';
import { prevision } from '../../lib/tesoreria.js';
import { xlsx } from '../../lib/xlsx.js';

const BASE = process.env.BASE || 'http://localhost:3001';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('Solo contra una copia local con la base de datos vacía');
const Y = new Date().getFullYear();
const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
let fallos = 0;
const ok = (nombre, fn) => { try { fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos += 1; console.log(`  ✗ ${nombre}\n    ${e.message.split('\n')[0]}`); } };

async function pedir(ruta, { metodo = 'GET', cuerpo, cookie, form } = {}) {
  const r = await fetch(BASE + ruta, {
    method: metodo, redirect: 'manual',
    headers: { Origin: BASE, ...(cookie ? { Cookie: `t=${cookie}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: form || (cuerpo ? JSON.stringify(cuerpo) : undefined),
  });
  return r;
}
const texto = async (ruta, cookie) => (await (await pedir(ruta, { cookie })).text())
  .replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|\u00A0/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const n = (s) => s.replace(/\u00A0/g, ' ');

// 1. Alta de la cuenta (la primera de la base de datos es la del administrador).
const fd = new FormData();
fd.set('nombre', 'Prueba'); fd.set('email', `prueba${Date.now()}@test.es`); fd.set('password', 'pruebaprueba1');
const alta = await pedir('/api/registro', { metodo: 'POST', form: fd });
const yo = /t=([^;]+)/.exec(alta.headers.get('set-cookie') || '')?.[1];
if (!yo) throw new Error('No se pudo crear la cuenta de prueba: ¿la base de datos está vacía?');
console.log('Cuestionario de bienvenida');
const antesDe = await pedir('/', { cookie: yo });
const htmlAntes = await antesDe.text();
ok('una empresa nueva empieza por el cuestionario', () => assert.ok(htmlAntes.includes('url=/bienvenida') || antesDe.headers.get('location')?.includes('/bienvenida'), `status ${antesDe.status}`));
const conf = await pedir('/api/cuenta', { metodo: 'PATCH', cookie: yo, cuerpo: { configuracion: {
  fiscal: { tipo: 'autonomo', iva: 'general' },
  emisor: { nombre: 'Prueba Pérez', nif: '12345678Z', direccion: 'C/ Uno 1', ciudad: '08001 Barcelona', iban: 'ES00', plazo: 30 },
  actividades: [{ nombre: 'Diseño gráfico', ivaPct: 21, irpfPct: 15 }, { nombre: 'Formación', ivaPct: 0, irpfPct: 0 }],
} } });
const { actividades: ACTS } = await conf.json();
ok('se guardan sus actividades con su serie', () => assert.deepEqual(ACTS.map((a) => [a.nombre, a.serie]), [['Diseño gráfico', ''], ['Formación', 'A']]));
const despues = await (await pedir('/', { cookie: yo })).text();
ok('después ya entra al resumen', () => assert.ok(!despues.includes('url=/bienvenida'), 'sigue mandando al cuestionario'));
await pedir('/api/cuenta', { metodo: 'PATCH', cookie: yo, cuerpo: { nombre: 'Prueba Pérez', nif: '12345678Z', direccion: 'C/ Uno 1', ciudad: '08001 Barcelona', iban: 'ES00', plazo: 30, limite: 17094 } });

// 2. Datos: los mismos que en tests/panel.test.mjs, en el año en curso.
const FAC = [
  { fecha: `${Y}-01-10`, base: 1000, irpfPct: 15, cobrada: true, cliente: 'Ana' },
  { fecha: `${Y}-02-15`, base: 500, irpfPct: 0, cobrada: true, cliente: 'Bea' },
  { fecha: `${Y}-05-20`, base: 2000, irpfPct: 15, cobrada: false, cliente: 'Ana' },
  { fecha: `${Y}-08-01`, base: 800, irpfPct: 15, cobrada: false, cliente: 'Carla' },
  { fecha: `${Y - 1}-12-01`, base: 300, irpfPct: 15, cobrada: false, cliente: 'Dani' },
];
const GAS = [{ fecha: `${Y}-01-20`, base: 100, ivaPct: 21, concepto: 'Gestoría' }, { fecha: `${Y}-07-10`, base: 200, ivaPct: 21, concepto: 'Cables' }, { fecha: `${Y}-08-15`, base: 50, ivaPct: 0, concepto: 'Parking' }];
const facturas = [];
const gastos = [];
for (const x of FAC) {
  const r = await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: x.fecha, actividad: ACTS[0].id, cliente: { nombre: x.cliente }, concepto: 'Sesión', base: String(x.base), ivaPct: 21, irpfPct: x.irpfPct, cobrada: x.cobrada } });
  assert.equal(r.status, 200, `crear factura ${x.fecha}`);
  facturas.push((await r.json()).factura);
}
for (const x of GAS) {
  const r = await pedir('/api/gastos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: x.fecha, actividad: ACTS[0].id, concepto: x.concepto, base: String(x.base), ivaPct: x.ivaPct } });
  assert.equal(r.status, 200, `crear gasto ${x.fecha}`);
  gastos.push((await r.json()).gasto);
}

console.log('Lo guardado es lo enviado');
ok('facturas', () => assert.deepEqual(facturas.map((f) => [f.fecha, f.base, f.cobrada]), FAC.map((x) => [x.fecha, x.base, x.cobrada])));
ok('gastos', () => assert.deepEqual(gastos.map((g) => [g.fecha, g.base, g.ivaPct]), GAS.map((x) => [x.fecha, x.base, x.ivaPct])));

// Una factura de la segunda actividad: va en su propia serie (A) y no cuenta en el total de 2025 (es de este año).
const rf = await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-03-03`, actividad: ACTS[1].id, cliente: { nombre: 'Escuela' }, concepto: 'Curso', base: '400', ivaPct: 0, irpfPct: 0, cobrada: true } });
const fa = (await rf.json()).factura;
ok(`la segunda actividad numera en su serie: A${Y}-001`, () => assert.equal(numeroFactura(fa), `A${Y}-001`));
ok(`y la primera sigue la suya: 01-${Y}`, () => assert.equal(numeroFactura(facturas[0]), `01-${Y}`));
facturas.push(fa);

const P = panelResumen({ facturas, gastos, emisor: { plazo: 30, limite: 17094 }, hoy, actividades: ACTS, fiscal: limpiarFiscal({ tipo: 'autonomo' }) });

console.log('Resumen');
const res = n(await texto('/', yo));
ok(`beneficio ${eurSin(P.beneficio)}`, () => assert.ok(res.includes(n(eurSin(P.beneficio))), 'no aparece'));
ok(`facturado ${eur(P.facturado)} y gastos ${eur(P.gastado)}`, () => assert.ok(res.includes(n(`Facturado ${eur(P.facturado)} · Gastos ${eur(P.gastado)}`)), 'no aparece'));
ok(`por cobrar ${eurSin(P.porCobrar)} (incluye la del año pasado)`, () => { assert.equal(P.porCobrar, 3286); assert.equal(P.facturado, 4700); assert.ok(res.includes(n(eurSin(P.porCobrar))), 'no aparece'); });
ok('Hacienda', () => assert.ok(res.includes(n(eurSin(P.debe ? P.aPagar : P.apartado))), 'no aparece la cifra de Hacienda'));
for (const q of P.r.trimestres) ok(`${q.t}T: 303 ${eur(q.m303)} y 130 ${eur(q.m130)}`, () => assert.ok(res.includes(n(eur(q.m303))) && res.includes(n(eur(q.m130))), 'no aparecen'));

console.log('Facturas');
const fac = n(await texto('/facturas', yo));
ok(`por cobrar ${eur(P.porCobrar)}`, () => assert.ok(fac.includes(n(`Por cobrar ${eur(P.porCobrar)}`)), 'no aparece'));
for (const f of facturas) ok(`total de la de ${f.cliente.nombre} ${eur(importes(f).total)}`, () => assert.ok(fac.includes(n(eur(importes(f).total))), 'no aparece'));
ok('vencidas', () => assert.ok(fac.includes(`${P.vencidas.length} vencidas`) || P.vencidas.length < 2, 'no aparece'));

console.log('Gastos');
const gas = n(await texto('/gastos', yo));
const delAnio = gastos.filter((g) => g.fecha.startsWith(`${Y}-`));
ok(`este año sin IVA ${eur(P.gastado)}`, () => assert.ok(gas.includes(n(`Este año, sin IVA ${eur(P.gastado)}`)), 'no aparece'));
ok(`IVA que recuperas ${eur(r2(delAnio.reduce((s, g) => s + importes(g).iva, 0)))}`, () => assert.ok(gas.includes(n(eur(63))), 'no aparece'));

console.log('PDF');
const pdf = await pedir(`/api/facturas/pdf?id=${encodeURIComponent(facturas[0].id)}`, { cookie: yo });
ok('se genera', () => assert.ok(pdf.status === 200 && pdf.headers.get('content-type').includes('pdf'), `status ${pdf.status}`));

console.log('Facturas con varias líneas');
const lin = await (await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-11-02`, actividad: ACTS[0].id, cliente: { nombre: 'Varias líneas' }, irpfPct: 15, lineas: [
  { concepto: 'Sesión DJ', cantidad: '2', precio: '300', dto: '10', ivaPct: 21 }, { concepto: 'Libro', cantidad: '1', precio: '50,00', dto: '', ivaPct: 4 }] } })).json();
ok('se guarda con base, IVA principal y concepto resumidos', () => assert.deepEqual([lin.factura?.base, lin.factura?.ivaPct, lin.factura?.concepto, lin.factura?.lineas?.length], [590, 21, 'Sesión DJ y 1 más', 2]));
const det = n(await texto(`/facturas/${lin.factura.id}`, yo));
ok('el detalle enseña el total y el IVA de cada tipo', () => assert.ok(det.includes(n(eur(616.9))) && det.includes(n(eur(113.4))) && det.includes(n(eur(2))), 'no aparece'));
const a4 = n(await texto(`/facturas/${lin.factura.id}/pdf`, yo));
ok('la factura A4 lista cada línea', () => assert.ok(a4.includes('Sesión DJ') && a4.includes('Libro') && a4.includes(n(eur(540))), 'no aparece'));
const pdf2 = await pedir(`/api/facturas/pdf?id=${encodeURIComponent(lin.factura.id)}`, { cookie: yo });
ok('su PDF se genera', () => assert.ok(pdf2.status === 200 && pdf2.headers.get('content-type').includes('pdf'), `status ${pdf2.status}`));
const sinConcepto = await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-11-02`, cliente: { nombre: 'X' }, lineas: [{ concepto: '', precio: '10', ivaPct: 21 }] } });
ok('una línea sin concepto no se acepta', () => assert.equal(sinConcepto.status, 400));

console.log('Enviar factura por email');
if (process.env.RESEND_URL) {
  const { readFileSync, rmSync } = await import('node:fs');
  rmSync('/tmp/resend.json', { force: true });
  const env = await (await pedir('/api/facturas/enviar', { metodo: 'POST', cookie: yo, cuerpo: { id: lin.factura.id, para: 'cliente@ejemplo.es', asunto: 'Tu factura', mensaje: 'Hola,\n\nAdjunta.' } })).json();
  const mail = JSON.parse(readFileSync('/tmp/resend.json', 'utf8').trim().split('\n').pop());
  ok('sale con el PDF adjunto y al cliente', () => assert.ok(env.ok && mail.to[0] === 'cliente@ejemplo.es' && mail.attachments[0].filename.endsWith('.pdf') && Buffer.from(mail.attachments[0].content, 'base64').subarray(0, 4).toString() === '%PDF'));
  const sinAbrir = n(await texto(`/facturas/${lin.factura.id}`, yo));
  ok('el detalle dice que está sin abrir', () => assert.ok(sinAbrir.includes('Enviada a cliente@ejemplo.es') && sinAbrir.includes('Sin abrir')));
  const pixel = /src="([^"]+\/api\/abierta\/[a-f0-9]+)"/.exec(mail.html)[1];
  const img = await fetch(pixel);
  ok('la imagen del email se sirve sin sesión', () => assert.ok(img.status === 200 && img.headers.get('content-type') === 'image/gif'));
  const abierta = n(await texto(`/facturas/${lin.factura.id}`, yo));
  ok('al abrir el email, la factura sale como abierta', () => assert.ok(abierta.includes('Abierta ·')));
  const mal = await pedir('/api/facturas/enviar', { metodo: 'POST', cookie: yo, cuerpo: { id: lin.factura.id, para: 'no-es-email' } });
  ok('un email no válido no se envía', () => assert.equal(mal.status, 400));
} else console.log('  (sin RESEND_URL: se salta)');

console.log('Cobro con tarjeta o Bizum y recordatorios');
if (process.env.RESEND_URL && process.env.STRIPE_URL) {
  const { readFileSync, rmSync } = await import('node:fs');
  const { createHmac } = await import('node:crypto');
  const ultimoEmail = () => JSON.parse(readFileSync('/tmp/resend.json', 'utf8').trim().split('\n').pop());
  // Una factura vencida hace 60 días, con email del cliente.
  const hace = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  const venc = (await (await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: hace(60), actividad: ACTS[0].id, cliente: { nombre: 'Moroso', email: 'moroso@ejemplo.es' }, irpfPct: 15, lineas: [{ concepto: 'Bolo', cantidad: 1, precio: '1000', ivaPct: 21 }] } })).json()).factura;
  ok('el email del cliente se guarda en la factura', () => assert.equal(venc.cliente.email, 'moroso@ejemplo.es'));
  const sinCron = await pedir('/api/recordatorios');
  ok('los recordatorios solo los lanza Vercel (con CRON_SECRET)', () => assert.equal(sinCron.status, 401));
  const cron = () => fetch(`${BASE}/api/recordatorios`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  rmSync('/tmp/resend.json', { force: true });
  const r0 = await cron();
  ok('sin activarlos en Ajustes no se envía ninguno', () => assert.equal(r0.enviados, 0));
  await pedir('/api/cuenta', { metodo: 'PATCH', cookie: yo, cuerpo: { nombre: 'Prueba Pérez', nif: '12345678Z', direccion: 'C/ Uno 1', ciudad: '08001 Barcelona', iban: 'ES00', plazo: 30, limite: 17094, recordatorios: 7 } });
  const r1 = await cron();
  const rec = ultimoEmail();
  ok('activados, sale el recordatorio de la vencida con el PDF', () => assert.ok(r1.enviados === 1 && rec.to[0] === 'moroso@ejemplo.es' && rec.subject.includes('Recordatorio') && rec.attachments[0].filename.endsWith('.pdf'), JSON.stringify(r1)));
  const r2 = await cron();
  ok('al día siguiente no se repite', () => assert.equal(r2.enviados, 0));
  const enlace = /href="([^"]+\/pagar\/[a-f0-9]+)"/.exec(rec.html)?.[1];
  ok('lleva el enlace de pago', () => assert.ok(enlace));
  const pub = n(await (await fetch(enlace)).text().then((h) => h.replace(/<[^>]+>/g, ' ')));
  ok('la página de pago se abre sin cuenta y enseña el total', () => assert.ok(pub.includes('con tarjeta o Bizum') && pub.includes(n(eur(importes(venc).total)))));
  const token = enlace.split('/').pop();
  const fd3 = new FormData(); fd3.set('token', token);
  const ir = await fetch(`${BASE}/api/pagar`, { method: 'POST', body: fd3, redirect: 'manual', headers: { Origin: BASE } });
  const ses = await (await fetch(ir.headers.get('location').replace('/pagina/', '/v1/checkout/sessions/'))).json();
  ok('lleva a Stripe con el importe exacto de la factura', () => assert.ok(ir.status === 303 && ses.amount_total === Math.round(importes(venc).total * 100), `${ir.status} ${ses.amount_total}`));
  const vuelta = n(await (await fetch(`${enlace}?sesion=${ses.id}`)).text());
  ok('al volver pagada, lo dice', () => assert.ok(vuelta.includes('ya está pagada')));
  const det2 = n(await texto(`/facturas/${venc.id}`, yo));
  ok('y la factura queda cobrada', () => assert.ok(det2.includes('Pagada con tarjeta o Bizum') && det2.includes('Cobrada')));
  const r3 = await cron();
  ok('una cobrada ya no recibe recordatorios', () => assert.equal(r3.enviados, 0));
  // Aviso de Stripe (webhook) firmado, para otra factura: la marca cobrada aunque el cliente no vuelva.
  const otra = (await (await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: hace(5), actividad: ACTS[0].id, cliente: { nombre: 'Webhook' }, irpfPct: 0, lineas: [{ concepto: 'X', cantidad: 1, precio: '10', ivaPct: 21 }] } })).json()).factura;
  await pedir('/api/facturas/enviar', { metodo: 'POST', cookie: yo, cuerpo: { id: otra.id, para: 'w@ejemplo.es', mensaje: 'Hola' } });
  const tok2 = /\/pagar\/([a-f0-9]+)/.exec(ultimoEmail().html)?.[1];
  ok('el email normal también lleva el enlace de pago', () => assert.ok(tok2));
  const evento = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_w', payment_status: 'paid', amount_total: 1210, metadata: { token: tok2 } } } });
  const t = Math.floor(Date.now() / 1000);
  const firma = `t=${t},v1=${createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${evento}`).digest('hex')}`;
  const falso = await fetch(`${BASE}/api/stripe`, { method: 'POST', body: evento, headers: { 'stripe-signature': 't=1,v1=00' } });
  ok('un aviso sin firma buena se rechaza', () => assert.equal(falso.status, 400));
  const wh = await fetch(`${BASE}/api/stripe`, { method: 'POST', body: evento, headers: { 'stripe-signature': firma } });
  const det3 = n(await texto(`/facturas/${otra.id}`, yo));
  ok('el aviso firmado de Stripe la marca cobrada', () => assert.ok(wh.status === 200 && det3.includes('Pagada con tarjeta o Bizum')));
} else console.log('  (sin RESEND_URL y STRIPE_URL: se salta)');

console.log('Facturas recurrentes');
{
  const orig = (await (await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: hoy, actividad: ACTS[0].id, cliente: { nombre: 'Cuota mensual', email: 'cuota@ejemplo.es' }, irpfPct: 15, lineas: [{ concepto: 'Mantenimiento web', cantidad: 1, precio: '150', ivaPct: 21 }] } })).json()).factura;
  const rec = await (await pedir('/api/recurrentes', { metodo: 'POST', cookie: yo, cuerpo: { factura: orig.id, dia: 31, enviar: true } })).json();
  ok('se crea con el día ajustado a 28 como máximo', () => assert.ok(rec.ok && rec.recurrente.dia === 28 && rec.recurrente.plantilla.lineas.length === 1));
  const det = n(await texto(`/facturas/${orig.id}`, yo));
  ok('el detalle dice que se repite', () => assert.ok(det.includes('Se repite el día 28 de cada mes')));
  const lista = n(await texto('/facturas/recurrentes', yo));
  ok('sale en la lista de recurrentes', () => assert.ok(lista.includes('Cuota mensual') && lista.includes(n(eur(importes(orig).total)))));
  if (process.env.CRON_SECRET) {
    const cron = () => fetch(`${BASE}/api/recurrentes/cron`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
    const c0 = await cron();
    ok('este mes no se repite (ya está la original)', () => assert.equal(c0.creadas.length, 0));
    // Simula que la última fue el mes pasado y que hoy ya es su día (solo en la copia local de pruebas).
    const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json());
    const clave = (await kv(['KEYS', 'cuentas:recurrentes:*'])).result[0];
    const r0 = JSON.parse((await kv(['HGET', clave, rec.recurrente.id])).result);
    await kv(['HSET', clave, r0.id, JSON.stringify({ ...r0, ultima: '2000-01', dia: 1 })]);
    if (process.env.RESEND_URL) (await import('node:fs')).rmSync('/tmp/resend.json', { force: true });
    const c1 = await cron();
    const nueva = c1.creadas[0] && await (await pedir(`/facturas/${c1.creadas[0]}`, { cookie: yo })).text();
    ok('al llegar el día, se crea la factura nueva con el número siguiente', () => assert.ok(c1.creadas.length === 1 && c1.creadas[0] !== orig.id && n(nueva.replace(/<[^>]+>/g, ' ')).includes(n(eur(importes(orig).total))), JSON.stringify(c1)));
    const c2 = await cron();
    ok('y no se repite el mismo mes', () => assert.equal(c2.creadas.length, 0));
    if (process.env.RESEND_URL) {
      const m = JSON.parse((await import('node:fs')).readFileSync('/tmp/resend.json', 'utf8').trim().split('\n').pop());
      ok('se envía sola al cliente', () => assert.ok(m.to[0] === 'cuota@ejemplo.es' && m.attachments.length === 1));
    }
    await pedir('/api/recurrentes', { metodo: 'PATCH', cookie: yo, cuerpo: { id: r0.id, activa: false } });
    await kv(['HSET', clave, r0.id, JSON.stringify({ ...JSON.parse((await kv(['HGET', clave, r0.id])).result), ultima: '2000-01' })]);
    const c3 = await cron();
    ok('en pausa no se crea', () => assert.equal(c3.creadas.length, 0));
  }
  await pedir(`/api/recurrentes?id=${rec.recurrente.id}`, { metodo: 'DELETE', cookie: yo });
  const vacia = n(await texto('/facturas/recurrentes', yo));
  ok('al quitarla, desaparece de la lista', () => assert.ok(!vacia.includes('Cuota mensual')));
}

console.log('Foto del ticket');
{
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const t = await pedir('/api/gastos/ticket', { metodo: 'POST', cookie: yo, cuerpo: { imagen: png } });
  const tj = await t.json();
  if (t.status === 503) console.log('  (sin ANTHROPIC_API_KEY: se salta)');
  else {
    ok('rellena proveedor, fecha y base (sacada del total)', () => assert.deepEqual([tj.gasto?.proveedor, tj.gasto?.fecha, tj.gasto?.base, tj.gasto?.ivaPct], ['Ferretería Sol', '2026-09-12', 50, 21]));
    const malo = await pedir('/api/gastos/ticket', { metodo: 'POST', cookie: yo, cuerpo: { imagen: 'data:text/plain;base64,aG9sYQ==' } });
    ok('solo acepta imágenes', () => assert.equal(malo.status, 400));
  }
  const gp = await (await pedir('/api/gastos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-09-12`, concepto: 'Cables XLR', base: '50', ivaPct: 21, proveedor: 'Ferretería Sol', proveedorNif: 'b11111111' } })).json();
  ok('el gasto guarda su proveedor', () => assert.ok(gp.gasto.proveedor === 'Ferretería Sol' && gp.gasto.proveedorNif === 'B11111111'));
  await pedir(`/api/gastos?id=${gp.gasto.id}`, { metodo: 'DELETE', cookie: yo });
}

console.log('Catálogo');
{
  const pr = await (await pedir('/api/productos', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Sesión DJ 4 horas', precio: '450,00', ivaPct: 21 } })).json();
  ok('se añade con su precio', () => assert.ok(pr.ok && pr.producto.precio === 450));
  const sin = await pedir('/api/productos', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'X', precio: '' } });
  ok('sin precio no se acepta', () => assert.equal(sin.status, 400));
  const cat = n(await texto('/facturas/catalogo', yo));
  ok('sale en el catálogo', () => assert.ok(cat.includes('Sesión DJ 4 horas') && cat.includes(n(eur(450)))));
  const form = n(await texto('/facturas/nueva', yo));
  ok('y en la factura nueva, para añadirlo en un toque', () => assert.ok(form.includes('+ Sesión DJ 4 horas')));
  await pedir('/api/productos', { metodo: 'POST', cookie: yo, cuerpo: { ...pr.producto, precio: '500' } });
  const cat2 = n(await texto('/facturas/catalogo', yo));
  ok('al editarlo se actualiza', () => assert.ok(cat2.includes(n(eur(500))) && !cat2.includes(n(eur(450)))));
  await pedir(`/api/productos?id=${pr.producto.id}`, { metodo: 'DELETE', cookie: yo });
  const cat3 = n(await texto('/facturas/catalogo', yo));
  ok('al quitarlo desaparece', () => assert.ok(!cat3.includes('Sesión DJ 4 horas')));
}

console.log('Paquete para la gestoría');
{
  const { leerZip } = await import('../../lib/zip.js');
  const r = await pedir(`/api/paquete?anio=${Y}&t=3`, { cookie: yo });
  const z = leerZip(Buffer.from(await r.arrayBuffer()));
  ok('un clic: un .zip con el Excel y el PDF del trimestre', () => assert.deepEqual(Object.keys(z), [`gestoria-3T-${Y}.xlsx`, `gestoria-3T-${Y}.pdf`]));
  ok('el PDF es un PDF', () => assert.equal(z[`gestoria-3T-${Y}.pdf`].subarray(0, 4).toString(), '%PDF'));
  const x = leerZip(z[`gestoria-3T-${Y}.xlsx`]);
  ok('el Excel tiene resumen, facturas, gastos y modelos', () => assert.ok(['Resumen', 'Facturas', 'Gastos', 'Modelos'].every((h) => x['xl/workbook.xml'].toString().includes(`name="${h}"`))));
  // Las mismas facturas y gastos que la exportación de siempre (CSV) de ese trimestre.
  const filas = async (tipo) => (await (await pedir(`/api/exportar?tipo=${tipo}&anio=${Y}&t=3`, { cookie: yo })).text()).trim().split('\r\n').length - 1;
  const filasX = (i) => (x[`xl/worksheets/sheet${i}.xml`].toString().match(/<row /g) || []).length - 2;
  const [nf, ng] = [await filas('facturas'), await filas('gastos')];
  ok(`facturas (${nf}) y gastos (${ng}) del trimestre`, () => assert.deepEqual([filasX(2), filasX(3)], [nf, ng]));
  ok('lleva el modelo 303 y el 130', () => assert.ok(['>303<', '>130<'].every((m) => x['xl/worksheets/sheet4.xml'].toString().includes(m))));
  const solo = await pedir(`/api/paquete?anio=${Y}&t=3&formato=pdf`, { cookie: yo });
  ok('también por separado (PDF)', () => assert.equal(solo.headers.get('content-type'), 'application/pdf'));
  const res = n(await texto('/', yo));
  ok('el enlace está en el resumen', () => assert.ok(res.includes('paquete para la gestoría')));
}

console.log('Proveedores');
{
  const nuevo = (x) => pedir('/api/gastos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-05-0${x.d}`, actividad: ACTS[0].id, concepto: x.c, base: x.b, ivaPct: 21, proveedor: x.p, proveedorNif: x.nif, pendiente: x.pend } }).then((r) => r.json());
  await nuevo({ d: 1, c: 'Altavoces', b: '1000', p: 'Audio Pro', nif: 'B22222222', pend: true });
  await nuevo({ d: 2, c: 'Cables', b: '100', p: 'AUDIO PRO S.L.', nif: 'b22222222' });
  const lista = n(await texto('/gastos/proveedores', yo));
  ok('sale el proveedor una vez, con lo que se le debe', () => assert.ok(lista.includes('AUDIO PRO S.L.') && !lista.includes('Audio Pro ') && lista.includes(`debes ${n(eur(1210))}`), lista.slice(0, 300)));
  const ficha = n(await texto('/gastos/proveedores/B22222222', yo));
  ok('su ficha tiene el historial y el total pagado', () => assert.ok(ficha.includes('Altavoces') && ficha.includes('Cables') && ficha.includes(n(eur(1331))) && ficha.includes('Sin pagar')));
  const pg = n(await texto('/gastos', yo));
  ok('el enlace está en Gastos con la deuda', () => assert.ok(pg.includes(`Proveedores · debes ${n(eur(1210))}`) && pg.includes('Sin pagar')));
  const pago = await (await pedir('/api/proveedores', { metodo: 'POST', cookie: yo, cuerpo: { clave: 'B22222222' } })).json();
  const ficha2 = n(await texto('/gastos/proveedores/B22222222', yo));
  ok('al marcarlo pagado ya no se le debe nada', () => assert.ok(pago.pagados === 1 && !ficha2.includes('Sin pagar') && !ficha2.includes('Le debes')));
  const otra = await pedir('/api/proveedores', { metodo: 'POST', cookie: yo, cuerpo: { clave: 'B22222222' } });
  ok('si no hay nada pendiente, lo dice', () => assert.equal(otra.status, 404));
}

console.log('Más modelos: 115, 349, 390 y renta');
{
  const { leerZip } = await import('../../lib/zip.js');
  await pedir('/api/gastos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-04-30`, actividad: ACTS[0].id, concepto: 'Alquiler local abril', base: '1000', ivaPct: 21, proveedor: 'Locales Pérez', proveedorNif: 'B33333333', alquiler: true } });
  await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-05-05`, actividad: ACTS[0].id, cliente: { nombre: 'Studio Paris', nif: 'FR 12 345678901' }, concepto: 'Diseño', base: '700', ivaPct: 0, irpfPct: 0, cobrada: true } });
  const m = n(await texto(`/modelos?anio=${Y}`, yo));
  ok('115: el 19 % del alquiler en su trimestre', () => assert.ok(m.includes(`03 · Retenciones a ingresar ${n(eur(190))}`), m.slice(0, 200)));
  ok('349: el cliente francés con su NIF-IVA', () => assert.ok(m.includes(`FR12345678901 · Studio Paris (S) ${n(eur(700))}`)));
  // El 390 es la suma de los cuatro 303 (los mismos que van en el paquete de cada trimestre).
  let suma303 = 0;
  for (const t of [1, 2, 3, 4]) {
    const x = leerZip(leerZip(Buffer.from(await (await pedir(`/api/paquete?anio=${Y}&t=${t}`, { cookie: yo })).arrayBuffer()))[`gestoria-${t}T-${Y}.xlsx`]);
    const h = x['xl/worksheets/sheet4.xml'].toString();
    suma303 += Number(/>303<.{0,200}?>46<.*?<v>(-?[\d.]+)<\/v>/.exec(h)?.[1] ?? NaN);
    if (t === 2) ok('el paquete del 2T lleva el 115 y el 349', () => assert.ok(h.includes('>115<') && h.includes('>349<')));
  }
  ok('390: resultado del año = suma de los cuatro 303', () => assert.ok(m.includes(`Resultado del año ${n(eur(r2(suma303)))}`), `${suma303}`));
  ok('borrador de la renta con rendimiento y resultado', () => assert.ok(m.includes('Borrador de la renta') && m.includes('Rendimiento neto') && /Saldría a (pagar|devolver)/.test(m)));
  const res = n(await texto(`/?anio=${Y}`, yo));
  ok('desde el resumen se llega a los anuales', () => assert.ok(res.includes('Resumen anual del IVA') && res.includes('Borrador')));
}

console.log('Avisos en el móvil');
if (process.env.PUSH_PRUEBAS && process.env.CRON_SECRET) {
  const { createECDH, createDecipheriv, hkdfSync, randomBytes } = await import('node:crypto');
  const fs = await import('node:fs');
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = randomBytes(16);
  const sub = { endpoint: `https://127.0.0.1:8075/movil-${Date.now()}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
  // Descifra el aviso como lo haría el móvil (RFC 8291, aes128gcm).
  const descifrar = (b) => {
    const salt = b.subarray(0, 16), idlen = b[20], servidor = b.subarray(21, 21 + idlen), c = b.subarray(21 + idlen);
    const info = Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), servidor]);
    const ikm = Buffer.from(hkdfSync('sha256', ecdh.computeSecret(servidor), auth, info, 32));
    const clave = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = createDecipheriv('aes-128-gcm', clave, nonce); d.setAuthTag(c.subarray(-16));
    const p = Buffer.concat([d.update(c.subarray(0, -16)), d.final()]);
    return JSON.parse(p.subarray(0, p.lastIndexOf(2)).toString());
  };
  const recibidos = () => (fs.existsSync('/tmp/push.json') ? fs.readFileSync('/tmp/push.json', 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.ruta === new URL(sub.endpoint).pathname) : []);
  const { clave } = await (await pedir('/api/push', { cookie: yo })).json();
  ok('da la clave pública VAPID', () => assert.equal(clave, process.env.VAPID_PUBLIC_KEY));
  const mala = await pedir('/api/push', { metodo: 'POST', cookie: yo, cuerpo: { sub: { ...sub, endpoint: 'https://10.0.0.1/x' } } });
  ok('no acepta direcciones que no sean de un servicio push', () => assert.equal(mala.status, 400));
  await pedir('/api/push', { metodo: 'POST', cookie: yo, cuerpo: { sub } });
  await pedir('/api/push', { metodo: 'POST', cookie: yo, cuerpo: { prueba: true } });
  const prueba = recibidos();
  ok('llega el aviso de prueba, firmado y cifrado', () => assert.ok(prueba.length === 1 && prueba[0].auth.startsWith('vapid t=') && descifrar(Buffer.from(prueba[0].cuerpo, 'base64')).titulo === 'Avisos activados'));
  // Una factura que venció ayer (plazo de 30 días).
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 31 * 864e5).toISOString().slice(0, 10);
  await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: ayer, actividad: ACTS[0].id, cliente: { nombre: 'Moroso Push' }, concepto: 'Sesión', base: '100', ivaPct: 21, irpfPct: 0 } });
  const cron = () => fetch(`${BASE}/api/recordatorios`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  const c1 = await cron();
  const avisos = recibidos().slice(1).map((x) => descifrar(Buffer.from(x.cuerpo, 'base64')));
  ok('el cron de la mañana avisa de la factura que venció ayer', () => assert.ok(c1.avisos >= 1 && avisos.some((a) => a.titulo === 'Factura vencida: Moroso Push' && a.url.startsWith('/facturas/')), JSON.stringify(avisos)));
  const c2 = await cron();
  ok('y no repite el aviso el mismo día', () => assert.equal(recibidos().length, 1 + avisos.length, JSON.stringify(c2)));
  const aj = n(await texto('/ajustes', yo));
  ok('Ajustes dice en cuántos dispositivos están activados', () => assert.ok(aj.includes('Activados en 1 dispositivo')));
  await pedir('/api/push', { metodo: 'DELETE', cookie: yo, cuerpo: { endpoint: sub.endpoint } });
  const aj2 = n(await texto('/ajustes', yo));
  ok('al desactivarlos se quita el dispositivo', () => assert.ok(!aj2.includes('Activados en')));
  const sw = await fetch(`${BASE}/sw`);
  ok('el service worker se sirve sin sesión', () => assert.ok(sw.status === 200 && sw.headers.get('content-type').includes('javascript')));
} else console.log('  (sin PUSH_PRUEBAS y CRON_SECRET: se salta)');

console.log('Permisos');
const inv = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Solo gastos', email: `g${Date.now()}@test.es`, rol: 'miembro', permisos: ['gastos', 'gastar'] } })).json();
const fd2 = new FormData(); fd2.set('codigo', inv.enlace.split('/').pop()); fd2.set('password', 'gastosgastos1');
const acepta = await pedir('/api/invitacion', { metodo: 'POST', form: fd2 });
const otro = /t=([^;]+)/.exec(acepta.headers.get('set-cookie') || '')?.[1];
const intento = await pedir('/api/facturas', { metodo: 'POST', cookie: otro, cuerpo: { fecha: `${Y}-09-01`, cliente: { nombre: 'X' }, base: '10', ivaPct: 21 } });
ok('el de gastos no puede crear facturas (403)', () => assert.equal(intento.status, 403));
const vista = await pedir('/', { cookie: otro });
const html = await vista.text();
ok('el de gastos va a Gastos al abrir', () => assert.ok(([307, 303].includes(vista.status) && vista.headers.get('location').includes('/gastos')) || html.includes('url=/gastos'), `status ${vista.status}`));
const provs = await pedir('/api/proveedores', { metodo: 'POST', cookie: otro, cuerpo: { clave: 'x' } });
ok('el de gastos sí puede gestionar proveedores', () => assert.equal(provs.status, 404));
const paq = await pedir(`/api/paquete?anio=${Y}&t=3`, { cookie: otro });
ok('el de gastos no puede bajar el paquete de la gestoría', () => assert.equal(paq.status, 403));
const mod = await pedir('/modelos', { cookie: otro });
const modHtml = await mod.text();
ok('el de gastos no ve los modelos', () => assert.ok(mod.headers.get('location')?.includes('/gastos') || modHtml.includes('url=/gastos'), `status ${mod.status}`));
ok('el de gastos no ve cifras del resumen', () => assert.ok(!html.includes(eurSin(P.beneficio)), 'se ve el beneficio'));

console.log('Sociedad');
const alta2 = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Náutica Prueba SL', nombre: 'Pere', email: `p${Date.now()}@test.es` } })).json();
const fd3 = new FormData(); fd3.set('codigo', alta2.enlace.split('/').pop()); fd3.set('password', 'perepere123');
const soc = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fd3 })).headers.get('set-cookie') || '')?.[1];
await pedir('/api/cuenta', { metodo: 'PATCH', cookie: soc, cuerpo: { configuracion: { fiscal: { tipo: 'sociedad', iva: 'general', trabajadores: true }, emisor: { nombre: 'Náutica Prueba SL', nif: 'B12345678' }, actividades: [{ nombre: 'Chárter', ivaPct: 21, irpfPct: 15 }] } } });
const sf = await (await pedir('/api/facturas', { metodo: 'POST', cookie: soc, cuerpo: { fecha: `${Y}-02-02`, cliente: { nombre: 'Cliente' }, base: '1000', ivaPct: 21, irpfPct: 15 } })).json();
const resSoc = n(await texto('/', soc));
ok('la sociedad ve su facturado', () => assert.ok(resSoc.includes(n(eurSin(1000))), 'no aparece su facturado'));
ok('a la sociedad no le sale el 130', () => assert.ok(!resSoc.includes('Modelo 130') && resSoc.includes('Modelo 303'), 'sale el 130 o falta el 303'));
ok('a la sociedad le salen el 111 y el 200', () => assert.ok(resSoc.includes('111') && resSoc.includes('Impuesto sobre Sociedades'), 'faltan modelos'));
ok('la sociedad no ve las facturas de la otra empresa', () => assert.ok(!resSoc.includes('Carla'), 'se ve un cliente ajeno'));
ok('a una sociedad no se le aplica retención aunque se envíe', () => assert.equal(sf.factura.irpfPct, 0));

console.log('Kilometraje y dietas');
{
  const km = await (await pedir('/api/gastos/dieta', { metodo: 'POST', cookie: yo, cuerpo: { tipo: 'km', quien: 'empleado', km: '150', fecha: `${Y}-06-10`, persona: 'Ana', motivo: 'Bolo en Girona' } })).json();
  ok('kilometraje: 150 km × 0,26 = 39 € exentos, sin IVA', () => assert.deepEqual([km.gasto.base, km.gasto.ivaPct, km.gasto.dieta.exento, km.gasto.concepto], [39, 0, 39, 'Kilometraje: 150 km · Ana · Bolo en Girona']));
  const mas = await (await pedir('/api/gastos/dieta', { metodo: 'POST', cookie: yo, cuerpo: { tipo: 'manutencion', quien: 'empleado', dias: 2, pernocta: true, pagado: '120', fecha: `${Y}-06-11` } })).json();
  ok('dietas con noche: 106,68 € exentos y 13,32 € de más', () => assert.deepEqual([mas.gasto.base, mas.gasto.dieta.exento, mas.gasto.dieta.exceso], [120, 106.68, 13.32]));
  const com = await (await pedir('/api/gastos/dieta', { metodo: 'POST', cookie: yo, cuerpo: { tipo: 'manutencion', quien: 'titular', dias: 1, pagado: '40', ivaPct: 10, electronico: true, fecha: `${Y}-06-12` } })).json();
  ok('comida del autónomo: deducible hasta 26,67 € con su IVA', () => assert.deepEqual([com.gasto.base, com.gasto.ivaPct, com.gasto.dieta.deducible], [24.25, 10, 26.67]));
  const efectivo = await pedir('/api/gastos/dieta', { metodo: 'POST', cookie: yo, cuerpo: { tipo: 'manutencion', quien: 'titular', dias: 1, pagado: '20', electronico: false, fecha: `${Y}-06-12` } });
  ok('en efectivo no se deduce (400)', () => assert.equal(efectivo.status, 400));
  const propio = await pedir('/api/gastos/dieta', { metodo: 'POST', cookie: yo, cuerpo: { tipo: 'km', quien: 'titular', km: '10', fecha: `${Y}-06-12` } });
  ok('el coche propio del autónomo no va a 0,26 €/km (400)', () => assert.equal(propio.status, 400));
  const gp = n(await texto('/gastos', yo));
  ok('salen en la lista de gastos', () => assert.ok(gp.includes('Kilometraje: 150 km') && gp.includes('Dietas: 2 días con noche') && gp.includes('Comidas: 1 día')));
  const det = n(await texto(`/gastos/${encodeURIComponent(mas.gasto.id)}`, yo));
  ok('el detalle explica lo exento y lo que va a nómina', () => assert.ok(det.includes(n(`Exento para el trabajador: ${eur(106.68)}`)) && det.includes(n(eur(13.32)))));
  for (const x of [km, mas, com]) await pedir(`/api/gastos?id=${encodeURIComponent(x.gasto.id)}`, { metodo: 'DELETE', cookie: yo });
}

console.log('Previsión de tesorería');
{
  const alta3 = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Tesorería Prueba', nombre: 'Tere', email: `t${Date.now()}@test.es` } })).json();
  const fd4 = new FormData(); fd4.set('codigo', alta3.enlace.split('/').pop()); fd4.set('password', 'teretere123');
  const te = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fd4 })).headers.get('set-cookie') || '')?.[1];
  const cfg = await (await pedir('/api/cuenta', { metodo: 'PATCH', cookie: te, cuerpo: { configuracion: { fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: { nombre: 'Tere', nif: '11111111H', plazo: 30 }, actividades: [{ nombre: 'Música', ivaPct: 21, irpfPct: 15 }] } } })).json();
  const masD = (d) => new Date(Date.parse(`${hoy}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
  const F2 = [];
  for (const [fecha, base, cobrada] of [[masD(-5), 1000, false], [masD(-60), 400, false], [masD(-10), 300, true]]) {
    F2.push((await (await pedir('/api/facturas', { metodo: 'POST', cookie: te, cuerpo: { fecha, actividad: cfg.actividades[0].id, cliente: { nombre: `Cliente ${base}` }, concepto: 'Bolo', base: String(base), ivaPct: 21, irpfPct: 15, cobrada } })).json()).factura);
  }
  const G2 = [(await (await pedir('/api/gastos', { metodo: 'POST', cookie: te, cuerpo: { fecha: masD(3), actividad: cfg.actividades[0].id, concepto: 'Altavoces', proveedor: 'Sonido SL', base: '200', ivaPct: 21, pendiente: true } })).json()).gasto];
  const mala = await pedir('/api/tesoreria', { metodo: 'POST', cookie: te, cuerpo: { saldo: 'mucho' } });
  ok('un saldo que no es un importe da error', () => assert.equal(mala.status, 400));
  const sv = await (await pedir('/api/tesoreria', { metodo: 'POST', cookie: te, cuerpo: { saldo: '2.500,50' } })).json();
  ok('se guarda el saldo de hoy', () => assert.deepEqual(sv.saldo, { importe: 2500.5, fecha: hoy }));
  const esp = prevision({ facturas: F2, gastos: G2, fiscal: { tipo: 'autonomo', iva: 'general' }, plazo: 30, saldo: sv.saldo, actividades: cfg.actividades.map((a) => a.id), hoy, meses: 3 });
  const pt = n(await texto('/tesoreria', te));
  ok('cifras de la pantalla: cobrar, pagar, Hacienda y saldo final', () => assert.ok([esp.entra, esp.sale, esp.hacienda, esp.final].every((v) => pt.includes(n(eur(v)))), JSON.stringify([esp.entra, esp.sale, esp.hacienda, esp.final])));
  ok('la factura vencida se cuenta hoy y la otra a su vencimiento', () => assert.ok(pt.includes('Cliente 400') && pt.includes('vencida') && pt.includes('Cliente 1000') && !pt.includes('Cliente 300')));
  ok('el gasto pendiente sale como pago', () => assert.ok(pt.includes('Sonido SL') && pt.includes(n(eur(242)))));
  ok('cada mes con su saldo', () => assert.ok(esp.meses.every((m) => pt.includes(n(eur(m.saldo)))) && esp.meses.length === 4));
  const p6 = n(await texto('/tesoreria?meses=6', te));
  const esp6 = prevision({ facturas: F2, gastos: G2, fiscal: { tipo: 'autonomo', iva: 'general' }, plazo: 30, saldo: sv.saldo, actividades: cfg.actividades.map((a) => a.id), hoy, meses: 6 });
  ok('a 6 meses', () => assert.ok(p6.includes(n(eur(esp6.final)))));
  const res3 = n(await texto('/', te));
  ok('el resumen enseña el saldo previsto', () => assert.ok(res3.includes('Tesorería') && res3.includes(n(eurSin(esp.final)))));
  await pedir('/api/tesoreria', { metodo: 'POST', cookie: te, cuerpo: { saldo: null } });
  const sin = n(await texto('/tesoreria', te));
  ok('sin saldo, parte de 0', () => assert.ok(sin.includes(n(eur(r2(esp.final - 2500.5))))));
  const ajena = await pedir('/api/tesoreria', { metodo: 'POST', cookie: otro, cuerpo: { saldo: '1' } });
  ok('quien no ve el resumen no puede tocar el saldo (403)', () => assert.equal(ajena.status, 403));
}

console.log('Portal del cliente');
{
  const alta4 = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Portal Prueba', nombre: 'Pau', email: `pp${Date.now()}@test.es` } })).json();
  const fd5 = new FormData(); fd5.set('codigo', alta4.enlace.split('/').pop()); fd5.set('password', 'paupaupau123');
  const pp = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fd5 })).headers.get('set-cookie') || '')?.[1];
  const cfg = await (await pedir('/api/cuenta', { metodo: 'PATCH', cookie: pp, cuerpo: { configuracion: { fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: { nombre: 'Pau Portal', nif: '22222222J', iban: 'ES11 2222', plazo: 30 }, actividades: [{ nombre: 'Música', ivaPct: 21, irpfPct: 15 }] } } })).json();
  const act = cfg.actividades[0].id;
  const fac = async (cliente, base, cobrada) => (await (await pedir('/api/facturas', { metodo: 'POST', cookie: pp, cuerpo: { fecha: `${Y}-03-0${base % 9 + 1}`, actividad: act, cliente, concepto: 'Bolo', base: String(base), ivaPct: 21, irpfPct: 15, cobrada } })).json()).factura;
  const f1 = await fac({ nombre: 'Sala Apolo', nif: 'B12345678' }, 1000, false);
  const f2 = await fac({ nombre: 'Sala Apolo', nif: 'B12345678' }, 400, true);
  const f3 = await fac({ nombre: 'Otro Club' }, 700, false);
  const pre = (await (await pedir('/api/presupuestos', { metodo: 'POST', cookie: pp, cuerpo: { fecha: hoy, actividad: act, cliente: { nombre: 'Sala Apolo', nif: 'B12345678' }, concepto: 'Fiesta', base: '2000', ivaPct: 21, irpfPct: 15 } })).json()).presupuesto;
  const det = await (await pedir(`/facturas/${f1.id}`, { cookie: pp })).text();
  const ruta = /\/portal\/[\w-]+/.exec(det)?.[0];
  ok('la factura da el enlace del portal de su cliente', () => assert.ok(ruta && det.includes('Enviar su portal')));
  const det2 = await (await pedir(`/presupuestos/${pre.id}`, { cookie: pp })).text();
  ok('el presupuesto del mismo cliente da el mismo enlace', () => assert.equal(/\/portal\/[\w-]+/.exec(det2)?.[0], ruta));
  const tok = ruta.split('/').pop();
  const pt = n(await texto(ruta));
  ok('se abre sin sesión con sus facturas y presupuestos', () => assert.ok(pt.includes('Sala Apolo') && pt.includes(`Factura ${numeroFactura(f1)}`) && pt.includes(`Factura ${numeroFactura(f2)}`) && pt.includes('Presupuesto P')));
  ok('no enseña las de otros clientes', () => assert.ok(!pt.includes('Otro Club') && !pt.includes(`Factura ${numeroFactura(f3)} `)));
  ok('lo pendiente: solo la no pagada', () => assert.ok(pt.includes(n(eur(importes(f1).total))) && pt.includes('Pendiente de pago · 1 factura') && pt.includes('Pagada')));
  const pdf = await pedir(`/api/portal/pdf?t=${tok}&id=${encodeURIComponent(f1.id)}`);
  ok('descarga el PDF de su factura', () => assert.ok(pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf'));
  const pdfP = await pedir(`/api/portal/pdf?t=${tok}&tipo=presupuesto&id=${encodeURIComponent(pre.id)}`);
  ok('y el de su presupuesto', () => assert.ok(pdfP.status === 200 && decodeURIComponent(pdfP.headers.get('content-disposition')).includes('Presupuesto')));
  const ajeno = await pedir(`/api/portal/pdf?t=${tok}&id=${encodeURIComponent(f3.id)}`);
  ok('el PDF de una factura de otro cliente no se da (404)', () => assert.equal(ajeno.status, 404));
  const malo = await (await pedir('/portal/inventado123')).text();
  ok('un enlace inventado no enseña nada (página 404)', () => assert.ok(malo.includes('could not be found') && !malo.includes('Pendiente de pago')));
  const fdp = new FormData(); fdp.set('t', tok); fdp.set('id', f1.id);
  const pg = await pedir('/api/portal/pagar', { metodo: 'POST', form: fdp });
  const destino = pg.headers.get('location') || '';
  ok('«Pagar» lleva a la página de pago de esa factura', () => assert.ok(pg.status === 303 && /\/pagar\/[0-9a-f]{32}$/.test(destino), destino));
  const pagina = n(await (await fetch(destino)).text());
  ok('que enseña la factura y su importe', () => assert.ok(pagina.includes(numeroFactura(f1)) && pagina.includes(n(eur(importes(f1).total)))));
  const fdq = new FormData(); fdq.set('t', tok); fdq.set('id', f2.id);
  const pg2 = await pedir('/api/portal/pagar', { metodo: 'POST', form: fdq });
  ok('una pagada vuelve al portal', () => assert.ok(pg2.status === 303 && pg2.headers.get('location').endsWith(ruta)));
  const fdr = new FormData(); fdr.set('t', tok); fdr.set('id', f3.id);
  const pg3 = await pedir('/api/portal/pagar', { metodo: 'POST', form: fdr });
  ok('pagar la de otro cliente da 404', () => assert.equal(pg3.status, 404));
}

console.log('Importar desde Holded o Excel');
{
  const alta5 = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Importar Prueba', nombre: 'Imma', email: `im${Date.now()}@test.es` } })).json();
  const fd6 = new FormData(); fd6.set('codigo', alta5.enlace.split('/').pop()); fd6.set('password', 'immaimma123');
  const im = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fd6 })).headers.get('set-cookie') || '')?.[1];
  await pedir('/api/cuenta', { metodo: 'PATCH', cookie: im, cuerpo: { configuracion: { fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: { nombre: 'Imma', nif: '33333333P', iban: 'ES22', plazo: 30 }, actividades: [{ nombre: 'Música', ivaPct: 21, irpfPct: 15 }] } } });
  const subir = async (tipo, nombre, datos, guardar, cookie = im) => {
    const f = new FormData(); f.set('tipo', tipo); f.set('archivo', new Blob([datos]), nombre); if (guardar) f.set('guardar', '1');
    const r = await pedir('/api/importar', { metodo: 'POST', cookie, form: f });
    return { status: r.status, ...(await r.json()) };
  };
  const libro = xlsx([{ nombre: 'Facturas', filas: [['Facturas emitidas'], ['Num', 'Fecha', 'Contacto', 'NIF', 'Descripción', 'Subtotal', 'IVA', 'Retención', 'Total', 'Estado'],
    ['F260001', `10/01/${Y}`, 'Sala Apolo', 'B12345678', 'Bolo', 1000, 210, 150, 1060, 'Cobrada'], ['F260002', `12/02/${Y}`, 'Ana Pérez', '', 'Boda', 500, 105, 0, 605, 'Pendiente'], ['F260003', 'sin fecha', 'Ana Pérez', '', 'x', 1, 0, 0, 1, '']] }]);
  const v1 = await subir('facturas', 'facturas.xlsx', libro);
  ok('vista previa de facturas de Holded: 2 nuevas y 1 con error', () => assert.deepEqual([v1.status, v1.nuevos, v1.duplicados, v1.errores], [200, 2, 0, 1]));
  const fvacia = n(await texto('/facturas', im));
  ok('la vista previa no guarda nada', () => assert.ok(!fvacia.includes('F260001')));
  const g1 = await subir('facturas', 'facturas.xlsx', libro, true);
  ok('se importan las 2 nuevas', () => assert.equal(g1.guardados, 2));
  const fl = n(await texto('/facturas', im));
  ok('salen en Facturas con su número original', () => assert.ok(fl.includes('F260001') && fl.includes('F260002') && fl.includes('Sala Apolo')));
  ok('con su estado', () => assert.ok(fl.includes('Cobrada') && /Pendiente|Vencida/.test(fl)));
  const det = n(await texto(`/facturas/${encodeURIComponent(`F${Y}-260001`)}`, im));
  ok('la factura importada da sus importes', () => assert.ok(det.includes(n(eur(1060))) && det.includes('F260001')));
  const v2 = await subir('facturas', 'facturas.xlsx', libro);
  ok('al repetir, ya existen y no se duplican', () => assert.deepEqual([v2.nuevos, v2.duplicados], [0, 2]));
  const csv = 'Nombre;CIF;Email;Código postal;Población\r\nSala Apolo SL;B-12345678;;08004;Barcelona\r\nBar Nuevo;B87654321;bar@nuevo.es;08001;Barcelona\r\n';
  const c1 = await subir('clientes', 'clientes.csv', Buffer.from(csv, 'latin1'), true);
  ok('clientes: el del mismo NIF ya existe (vino con las facturas) y se añade el nuevo', () => assert.deepEqual([c1.guardados, c1.duplicados], [1, 1]));
  const nueva = await (await pedir('/facturas/nueva', { cookie: im })).text();
  ok('el cliente importado se puede elegir al facturar', () => assert.ok(nueva.includes('Bar Nuevo') && nueva.includes('B87654321')));
  const gx = xlsx([{ nombre: 'Gastos', filas: [['Fecha', 'Proveedor', 'Concepto', 'Base imponible', '% IVA', 'Estado'], [`${Y}-02-01`, 'Sonido SL', 'Altavoces', 200, 21, 'Pagado'], [`${Y}-02-03`, 'Gasolinera', '', 50, 21, 'Pendiente']] }]);
  const gg = await subir('gastos', 'gastos.xlsx', gx, true);
  ok('gastos importados', () => assert.equal(gg.guardados, 2));
  const gl = n(await texto('/gastos', im));
  ok('salen en Gastos', () => assert.ok(gl.includes('Altavoces') && gl.includes('Gasolinera')));
  const gg2 = await subir('gastos', 'gastos.xlsx', gx);
  ok('repetir gastos: ya existen', () => assert.deepEqual([gg2.nuevos, gg2.duplicados], [0, 2]));
  const pr = await subir('productos', 'productos.csv', Buffer.from('Producto,Precio,IVA\n"Hora de DJ","120,50",21\nAlquiler altavoz,80,21\n'), true);
  ok('productos importados', () => assert.equal(pr.guardados, 2));
  const cat = n(await texto('/facturas/catalogo', im));
  ok('salen en el catálogo', () => assert.ok(cat.includes('Hora de DJ') && cat.includes(n(eur(120.5)))));
  const malo = await subir('facturas', 'x.csv', Buffer.from('Fecha;Total\n01/01/2026;5\n'));
  ok('si faltan columnas lo dice (400)', () => assert.ok(malo.status === 400 && /numero/.test(malo.error)));
  const sinPermiso = await subir('gastos', 'gastos.xlsx', gx, false, otro);
  ok('quien no gestiona la empresa no puede importar (403)', () => assert.equal(sinPermiso.status, 403));
  const aj = n(await texto('/ajustes/importar', im));
  ok('la pantalla de Ajustes → Importar datos', () => assert.ok(aj.includes('Importar datos') && aj.includes('Holded')));
}

console.log('Barra lateral del ordenador');
{
  const lateral = async (cookie) => /<nav class="tabs-extra"[\s\S]*?<\/nav>/.exec(await (await pedir('/gastos', { cookie })).text())?.[0] || '';
  const mia = await lateral(yo);
  ok('el administrador ve todas las secciones', () => assert.ok(['/presupuestos', '/facturas/recurrentes', '/facturas/catalogo', '/tesoreria', '/modelos', '/gastos/proveedores', '/nominas', '/ajustes/importar', '/usuarios', '/ajustes'].every((h) => mia.includes(`href="${h}"`))));
  const suya = await lateral(otro);
  ok('el de gastos solo ve lo suyo', () => assert.ok(suya.includes('href="/gastos/proveedores"') && !suya.includes('href="/tesoreria"') && !suya.includes('href="/presupuestos"') && !suya.includes('href="/ajustes/importar"')));
  const marca = await (await pedir('/tesoreria', { cookie: yo })).text();
  ok('marca la pantalla en la que estás', () => assert.ok(/class="activo"[^>]*href="\/tesoreria"|href="\/tesoreria"[^>]*class="activo"/.test(marca)));
}

console.log(fallos ? `\n${fallos} comprobaciones fallidas: NO publicar.` : '\nTodo cuadra.');
process.exit(fallos ? 1 : 0);
