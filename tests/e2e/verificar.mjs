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
// Bloqueo del servidor: como el navegador, cada sesión manda su cookie «d» de desbloqueo (la que recibió al entrar).
const DESBLOQUEOS = {};
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const ck = op.headers?.Cookie;
  const t = /(?:^|; )t=([^;]+)/.exec(ck || '')?.[1];
  if (t && DESBLOQUEOS[t] && !/(?:^|; )d=/.test(ck)) op = { ...op, headers: { ...op.headers, Cookie: `${ck}; d=${DESBLOQUEOS[t]}` } };
  // Límite de intentos por IP: cada petición como si viniera de una IP distinta (la sección «Límite de intentos» fija la suya).
  if (!op.headers?.['X-Real-IP'] && !(op.headers instanceof Headers)) op = { ...op, headers: { ...op.headers, 'X-Real-IP': `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } };
  const r = await fetchReal(url, op);
  const sc = r.headers.getSetCookie?.() || [];
  const nt = sc.map((c) => /^t=([^;]+)/.exec(c)?.[1]).find(Boolean), nd = sc.map((c) => /^d=([^;]+)/.exec(c)?.[1]).find(Boolean);
  if (nd && (nt || t)) DESBLOQUEOS[nt || t] = nd;
  // Email confirmado: tras registrarse o aceptar una invitación, abre el enlace del email de confirmación (como haría la persona).
  if (nt && /\/api\/(registro|invitacion)$/.test(String(url)) && process.env.RESEND_URL) {
    const { readFileSync } = await import('node:fs');
    let ultimo = ''; try { ultimo = readFileSync('/tmp/resend.json', 'utf8').trim().split('\n').pop(); } catch {}
    const conf = /\/api\/confirmar\?t=[\w-]+/.exec(ultimo)?.[0];
    if (conf) await fetchReal(BASE + conf, { redirect: 'manual' });
  }
  return r;
};
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
    ok('solo acepta imágenes y PDF', () => assert.equal(malo.status, 400));
    const pdf = await (await pedir('/api/gastos/ticket', { metodo: 'POST', cookie: yo, cuerpo: { imagen: 'data:application/pdf;base64,JVBERi0xLjQK' } })).json();
    ok('también lee facturas en PDF', () => assert.equal(pdf.gasto?.proveedor, 'Ferretería Sol'));
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
  const res59 = n(await texto(`/?anio=${Y}`, yo));
  ok('303: lo facturado sin IVA al cliente francés, en la casilla 59', () => assert.ok(res59.includes(`59 · Empresas de otros países de la UE ${n(eur(700))}`)));
  ok('Impuestos: qué presentas y cuándo, y el 303 trimestral con la casilla 59', () => assert.ok(m.includes('Impuestos') && m.includes('Qué presentas y cuándo') && m.includes('303 · IVA trimestral') && m.includes(`59 · Empresas de otros países de la UE ${n(eur(700))}`) && m.includes(`Hasta el 30 de enero de ${Y + 1}`)));
  ok('Impuestos: el 115 del 4T, hasta el 20 de enero', () => assert.ok(/115 · Retenciones del alquiler[\s\S]*?Hasta el 20 de enero de \d{4}/.test(m)));
  // Gastos de proveedores de fuera de España sin IVA: el de la UE (por su NIF-IVA) y uno de fuera, a mano.
  const gUE = (await (await pedir('/api/gastos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-05-06`, actividad: ACTS[0].id, concepto: 'Publicidad', base: '120', ivaPct: 0, proveedor: 'Google Ireland', proveedorNif: 'IE6388047V' } })).json()).gasto;
  const gFuera = (await (await pedir('/api/gastos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-05-07`, actividad: ACTS[0].id, concepto: 'Hosting', base: '50', ivaPct: 0, proveedor: 'Hosting Inc', origen: 'fuera' } })).json()).gasto;
  ok('un gasto sin IVA con NIF-IVA de la UE queda como de la UE; el de fuera, como se eligió', () => assert.deepEqual([gUE?.origen, gFuera?.origen], ['ue', 'fuera']));
  const mUE = n(await texto(`/modelos?anio=${Y}`, yo));
  ok('303: autoliquida la compra de la UE (10-11 y 36-37) y la de fuera (12-13)', () => assert.ok(mUE.includes(`10 · Compras a la UE: base ${n(eur(120))}`) && mUE.includes(`37 · Compras a la UE: cuota deducible ${n(eur(25.2))}`) && mUE.includes(`13 · Compras de fuera de la UE: cuota ${n(eur(10.5))}`)));
  ok('349: el proveedor de la UE, con clave I', () => assert.ok(mUE.includes(`IE6388047V · Google Ireland (I) ${n(eur(120))}`)));
  // Un profesional con retención (la gestoría): va en el 111 (07 a 09) y en el 190 (clave G).
  const gRet = (await (await pedir('/api/gastos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-05-08`, actividad: ACTS[0].id, concepto: 'Gestoría', base: '200', ivaPct: 21, irpfPct: 15, proveedor: 'Gestoría Ruiz', proveedorNif: 'B11111111' } })).json()).gasto;
  const mRet = n(await texto(`/modelos?anio=${Y}`, yo));
  ok('gasto con retención del 15 %: en el 111 (07 a 09) y en el 190 con clave G', () => assert.ok(gRet?.irpfPct === 15 && mRet.includes(`09 · Retenciones ${n(eur(30))}`) && mRet.includes('B11111111 · Gestoría Ruiz (G)')));
  await Promise.all([gUE, gFuera, gRet].map((g) => pedir(`/api/gastos?id=${encodeURIComponent(g.id)}`, { metodo: 'DELETE', cookie: yo })));
  const q130 = (txt, re) => re.exec(txt)?.[1];
  const en130 = q130(m, new RegExp(`130 · Pago a cuenta del IRPF[\\s\\S]*?1 ?T ${Y}[\\s\\S]*?07 · A ingresar ([\\d.,]+ €)`));
  const enRes = q130(res59, new RegExp(`1 ?T ${Y}[\\s\\S]*?Modelo 130 ([\\d.,]+ €)`));
  ok('Impuestos: el 130 del 1T es el mismo que en el Resumen', () => assert.ok(en130 && en130 === enRes, `${en130} | ${enRes}`));
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
  const invL = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: te, cuerpo: { nombre: 'Lectora', email: `le${Date.now()}@test.es`, rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos'] } })).json();
  const fL = new FormData(); fL.set('codigo', invL.enlace.split('/').pop()); fL.set('password', 'lectora123');
  const lectora = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fL })).headers.get('set-cookie') || '')?.[1];
  const ptL = await (await pedir('/tesoreria', { cookie: lectora })).text();
  const ptLt = n(await texto('/tesoreria', lectora));
  ok('quien solo ve el resumen ve el saldo apuntado pero sin campo para cambiarlo', () => assert.ok(!ptL.includes('id="saldo"') && ptLt.includes(n(eur(2500.5))) && ptLt.includes('Apuntado el')));
  const ptT = await (await pedir('/tesoreria', { cookie: te })).text();
  ok('quien factura sí tiene el campo', () => assert.ok(ptT.includes('id="saldo"')));
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
  ok('un enlace inventado no enseña nada (página 404)', () => assert.ok(malo.includes('Vaya, esto no existe') && !malo.includes('could not be found') && !malo.includes('Pendiente de pago')));
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

console.log('Banco: extractos, conexión y emparejar');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const hget = async (h, k) => JSON.parse((await kv(['HGET', `cuentas:${h}`, k])) || 'null');
  const masD = (d) => new Date(Date.parse(`${hoy}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
  const es = (f) => f.split('-').reverse().join('/');
  const entrar = async (alta, pass) => { const f = new FormData(); f.set('codigo', alta.enlace.split('/').pop()); f.set('password', pass); return /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: f })).headers.get('set-cookie') || '')?.[1]; };
  const emailB = `banco${Date.now()}@test.es`;
  const bq = await entrar(await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Banco Prueba', nombre: 'Berta', email: emailB } })).json(), 'bertaberta1');
  const empresa = await kv(['HGET', 'cuentas:emails', emailB]);
  const cfg = await (await pedir('/api/cuenta', { metodo: 'PATCH', cookie: bq, cuerpo: { configuracion: { fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: { nombre: 'Berta', nif: '22222222J', plazo: 30 }, actividades: [{ nombre: 'Eventos', ivaPct: 21, irpfPct: 0 }] } } })).json();
  const act = cfg.actividades[0].id;
  const fac = async (fecha, cliente, base) => (await (await pedir('/api/facturas', { metodo: 'POST', cookie: bq, cuerpo: { fecha, actividad: act, cliente: { nombre: cliente }, concepto: 'Evento', base: String(base), ivaPct: 21, irpfPct: 0, cobrada: false } })).json()).factura;
  const gas = async (fecha, concepto, base, proveedor, pendiente) => (await (await pedir('/api/gastos', { metodo: 'POST', cookie: bq, cuerpo: { fecha, actividad: act, concepto, base: String(base), ivaPct: 21, proveedor, pendiente } })).json()).gasto;
  const f1 = await fac(masD(-20), 'Hotel Mirador del Port S.A.', 1000);
  const f2 = await fac(masD(-15), 'Celebra Bodas S.L.', 500);
  const f3 = await fac(masD(-10), 'Fundació Música Viva', 800);
  const g1 = await gas(masD(-12), 'Cables', 50, 'Ferretería Sol', true);
  const g2 = await gas(masD(-8), 'Gestoría', 100, '', false);
  const subir = async (contenido, nombre, cookie = bq) => { const f = new FormData(); f.set('archivo', new Blob([contenido]), nombre); const r = await pedir('/api/banco/importar', { metodo: 'POST', cookie, form: f }); return { status: r.status, ...(await r.json()) }; };

  const csv = `Movimientos de la cuenta\nF. Operación;Concepto;Importe;Saldo\n${es(masD(-5))};TRANSF HOTEL MIRADOR DEL PORT FRA ${numeroFactura(f1)};1.210,00;5.000,00\n${es(masD(-6))};COMPRA TARJETA FERRETERIA SOL;-60,50;3.790,00\n${es(masD(-7))};BIZUM RECIBIDO;25,00;3.850,50\n`;
  const c1 = await subir(csv, 'extracto.csv');
  ok('CSV: se leen los 3 movimientos', () => assert.deepEqual([c1.status, c1.nuevos, c1.repetidos], [200, 3, 0]));
  ok('CSV: el saldo es el del último día', () => assert.deepEqual([c1.saldo.importe, c1.saldo.fecha], [5000, masD(-5)]));
  const c2 = await subir(csv, 'extracto.csv');
  ok('subirlo otra vez no duplica nada', () => assert.deepEqual([c2.nuevos, c2.repetidos], [0, 3]));
  const { norma43 } = await import('./n43.mjs');
  const n43 = norma43({ inicial: 1000, movimientos: [
    { fecha: masD(-3), importe: 605, ref1: 'TRANSFEREN', ref2: 'CIA RECIBIDA' },
    { fecha: masD(-2), importe: 968, ref1: 'TRANSF', texto: 'FUNDACIO MUSICA VIVA' },
    { fecha: masD(-7), importe: -121, ref1: 'RECIBO', ref2: 'GESTORIA' },
  ] });
  const c3 = await subir(n43, 'extracto.n43');
  ok('Norma 43: 3 movimientos y su saldo final', () => assert.deepEqual([c3.status, c3.nuevos, c3.saldo.importe, c3.saldo.cuentas], [200, 3, 7452, 2]));
  const malo = await subir('hola;adios\n1;2\n', 'x.csv');
  ok('un archivo que no es un extracto da error (400)', () => assert.ok(malo.status === 400 && malo.error.includes('columnas')));

  const movs = (await kv(['HVALS', `cuentas:banco:${empresa}`])).map((x) => JSON.parse(x));
  const mov = (importe) => movs.find((m) => m.importe === importe);
  ok('6 movimientos guardados en su empresa', () => assert.equal(movs.length, 6));
  const pb = n(await texto('/banco', bq));
  ok('pantalla: saldo de las dos cuentas', () => assert.ok(pb.includes(n(eur(7452))) && pb.includes('Extracto subido') && pb.includes('SONORA EVENTOS'), pb.slice(0, 400)));
  ok('pantalla: sugerencias seguras y dudosas', () => assert.ok(pb.includes('Por confirmar 5') && pb.includes('Es esta') && pb.includes('Puede ser') && pb.includes(`Factura ${numeroFactura(f1)}`) && pb.includes('Ferretería Sol · Cables')));
  ok('pantalla: el Bizum sin pareja', () => assert.ok(pb.includes('Sin pareja 1') && pb.includes('BIZUM RECIBIDO')));
  ok('pantalla: confirmar las 4 seguras', () => assert.ok(pb.includes('Confirmar las 4 seguras')));
  const pt = n(await texto('/tesoreria', bq));
  ok('tesorería parte del saldo real y enlaza al banco con lo pendiente', () => assert.ok(pt.includes('De tus cuentas') && pt.includes('7.452,00') && pt.includes('6 movimientos por revisar') === false && /Banco Saldo real[^€]*? 6 /.test(pt), pt.slice(0, 600)));

  const gestoria = await entrar(await (await pedir('/api/usuarios', { metodo: 'POST', cookie: bq, cuerpo: { nombre: 'Gestoría', email: `ge${Date.now()}@test.es`, rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos', 'nominas'] } })).json(), 'gestoria123');
  const g403 = await pedir('/api/banco', { metodo: 'POST', cookie: gestoria, cuerpo: { accion: 'emparejar', id: mov(1210).id, tipo: 'factura', destino: f1.id } });
  ok('la gestoría ve el banco pero no puede marcar cobros (403)', () => assert.equal(g403.status, 403));
  const gs = await (await pedir('/api/banco', { metodo: 'POST', cookie: gestoria, cuerpo: { accion: 'seguras' } })).json();
  ok('ni confirmar las seguras', () => assert.equal(gs.hechos, 0));
  const gc = await pedir('/api/banco/conectar', { cookie: gestoria });
  ok('ni conectar bancos (403)', () => assert.equal(gc.status, 403));
  const movsAntes = (await kv(['HLEN', `cuentas:banco:${empresa}`]));
  const saldoAntes = JSON.stringify(await kv(['GET', `cuentas:saldo:${empresa}`]));
  const gi = await subir(csv.replace('BIZUM RECIBIDO', 'BIZUM DE LA GESTORIA').replace('25,00;3.850,50', '33,00;9.999,00'), 'extracto.csv', gestoria);
  const movsDespues = (await kv(['HLEN', `cuentas:banco:${empresa}`]));
  const saldoDespues = JSON.stringify(await kv(['GET', `cuentas:saldo:${empresa}`]));
  ok('ni subir extractos (solo lectura): 403 y no cambian los movimientos ni el saldo', () => assert.ok(gi.status === 403 && movsDespues === movsAntes && saldoDespues === saldoAntes && saldoAntes?.includes('importe'), `${gi.status} ${movsAntes}→${movsDespues} ${saldoAntes}`));
  const pbG = await (await pedir('/banco', { cookie: gestoria })).text();
  const pbA = await (await pedir('/banco', { cookie: bq })).text();
  ok('y no le sale «Subir extracto» (al administrador sí)', () => assert.ok(!pbG.includes('Subir extracto') && pbA.includes('Subir extracto')));
  const contable = await entrar(await (await pedir('/api/usuarios', { metodo: 'POST', cookie: bq, cuerpo: { nombre: 'Contable', email: `co${Date.now()}@test.es`, rol: 'miembro', permisos: ['resumen', 'gastos', 'gastar'] } })).json(), 'contable123');
  const ci = await subir(csv, 'extracto.csv', contable);
  ok('quien puede apuntar gastos (o facturar) sí sube extractos', () => assert.equal(ci.status, 200));
  const gSync = await pedir('/api/banco/sincronizar', { metodo: 'POST', cookie: gestoria, cuerpo: { forzar: true } });
  const gSync2 = await pedir('/api/banco/sincronizar', { metodo: 'POST', cookie: gestoria, cuerpo: {} });
  const gSaldo = await pedir('/api/tesoreria', { metodo: 'POST', cookie: gestoria, cuerpo: { saldo: '1' } });
  const saldoFin = JSON.stringify(await kv(['GET', `cuentas:saldo:${empresa}`]));
  ok('ni «Actualizar» el banco ni escribir el saldo a mano (403) y el saldo no cambia', () => assert.ok(gSync.status === 403 && gSync2.status === 403 && gSaldo.status === 403 && saldoFin === saldoAntes, `${gSync.status} ${gSync2.status} ${gSaldo.status}`));
  const ptG = await (await pedir('/tesoreria', { cookie: gestoria })).text();
  ok('en Tesorería ve el saldo pero sin campo para cambiarlo', () => assert.ok(!ptG.includes('id="saldo"') && ptG.includes('Saldo en el banco hoy')));
  const ajeno = await pedir('/api/banco', { metodo: 'POST', cookie: yo, cuerpo: { accion: 'ignorar', id: mov(25).id } });
  ok('otra empresa no ve estos movimientos (404)', () => assert.equal(ajeno.status, 404));
  const signo = await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'emparejar', id: mov(25).id, tipo: 'gasto', destino: g2.id } });
  ok('un ingreso no puede pagar un gasto (400)', () => assert.equal(signo.status, 400));

  const seg = await (await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'seguras' } })).json();
  ok('se confirman las 4 seguras', () => assert.equal(seg.hechos, 4));
  const [F1, F3, G1, G2] = await Promise.all([hget(`facturas:${empresa}`, f1.id), hget(`facturas:${empresa}`, f3.id), hget(`gastos:${empresa}`, g1.id), hget(`gastos:${empresa}`, g2.id)]);
  ok('las facturas quedan cobradas con la fecha del banco', () => assert.ok(F1.cobrada && F1.cobro.fecha === masD(-5) && F3.cobrada && F3.cobro.fecha === masD(-2)));
  ok('el gasto pendiente queda pagado', () => assert.ok(!G1.pendiente && G1.banco === mov(-60.5).id && G1.pagado === masD(-6) && G2.banco === mov(-121).id));
  const man = await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'emparejar', id: mov(605).id, tipo: 'factura', destino: f2.id } });
  ok('emparejar a mano la dudosa', () => assert.ok(man.status === 200));
  const yaCob = await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'deshacer', id: mov(1210).id } });
  const F1b = await hget(`facturas:${empresa}`, f1.id);
  ok('deshacer: la factura vuelve a estar sin cobrar', () => assert.ok(yaCob.status === 200 && !F1b.cobrada && !F1b.cobro));
  const dos = await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'emparejar', id: mov(1210).id, tipo: 'factura', destino: f2.id } });
  ok('una factura ya cobrada no se empareja otra vez (400)', () => assert.equal(dos.status, 400));
  await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'ignorar', id: mov(25).id } });
  const pb2 = n(await texto('/banco', bq));
  ok('pantalla: emparejados con su factura o gasto, e ignorados aparte', () => assert.ok(pb2.includes('Emparejados') && pb2.includes(`Factura ${numeroFactura(f2)}`) && pb2.includes('Ignorados 1') && pb2.includes('Por confirmar 1') && !pb2.includes('Sin pareja')));
  const lateral = /<nav class="tabs-extra"[\s\S]*?<\/nav>/.exec(await (await pedir('/banco', { cookie: bq })).text())?.[0] || '';
  ok('el banco está en la barra lateral, marcado', () => assert.ok(/class="activo"[^>]*href="\/banco"|href="\/banco"[^>]*class="activo"/.test(lateral)));

  // Emparejado atómico: dos clics a la vez no emparejan dos veces el mismo movimiento ni cobran dos veces la misma factura.
  const fxA = await fac(masD(-9), 'Carrera A S.L.', 1000);
  const fxB = await fac(masD(-9), 'Carrera B S.L.', 1000);
  const par = (id, destino) => pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'emparejar', id, tipo: 'factura', destino } });
  const carrera1 = await Promise.all([par(mov(1210).id, fxA.id), par(mov(1210).id, fxB.id)]);
  const [cA, cB, m1210] = await Promise.all([hget(`facturas:${empresa}`, fxA.id), hget(`facturas:${empresa}`, fxB.id), hget(`banco:${empresa}`, mov(1210).id)]);
  ok('mismo movimiento con dos facturas a la vez: solo una queda cobrada', () => assert.ok(carrera1.filter((r) => r.status === 200).length === 1 && [cA.cobrada, cB.cobrada].filter(Boolean).length === 1 && [fxA.id, fxB.id].includes(m1210.enlace.id), JSON.stringify([carrera1.map((r) => r.status), cA.cobrada, cB.cobrada])));
  await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'deshacer', id: mov(1210).id } });
  await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'deshacer', id: mov(605).id } });
  const fxC = await fac(masD(-9), 'Carrera C S.L.', 500);
  const carrera2 = await Promise.all([par(mov(1210).id, fxC.id), par(mov(605).id, fxC.id)]);
  const [cC, mA, mB] = await Promise.all([hget(`facturas:${empresa}`, fxC.id), hget(`banco:${empresa}`, mov(1210).id), hget(`banco:${empresa}`, mov(605).id)]);
  ok('misma factura con dos movimientos a la vez: se cobra una sola vez', () => assert.ok(carrera2.filter((r) => r.status === 200).length === 1 && cC.cobrada && [mA.estado, mB.estado].filter((e) => e === 'emparejado').length === 1, JSON.stringify([carrera2.map((r) => r.status), mA.estado, mB.estado])));
  const cerrojos = await kv(['KEYS', 'cuentas:cerrojo:*']);
  ok('no quedan cerrojos puestos después', () => assert.deepEqual(cerrojos, []));
  // Se deja como estaba para lo que viene después.
  for (const mv of [mA, mB]) if (mv.estado === 'emparejado') await pedir('/api/banco', { metodo: 'POST', cookie: bq, cuerpo: { accion: 'deshacer', id: mv.id } });
  await par(mov(605).id, f2.id);

  if (process.env.ENABLE_BANKING_URL) {
    const sim = (ruta, cuerpo) => fetch(`${process.env.ENABLE_BANKING_URL}${ruta}`, cuerpo ? { method: 'POST', body: JSON.stringify(cuerpo) } : {}).then((r) => r.json());
    const f4 = await fac(masD(-4), 'Agencia Brisa Incentivos S.L.', 2000);
    const tx = (d, imp, info, nombre, ref) => ({ entry_reference: ref, transaction_amount: { amount: String(Math.abs(imp)), currency: 'EUR' }, credit_debit_indicator: imp < 0 ? 'DBIT' : 'CRDT', status: 'BOOK', booking_date: masD(d), remittance_information: [info], ...(imp < 0 ? { creditor: { name: nombre } } : { debtor: { name: nombre } }) });
    await sim('/_prueba', { cuentas: [{ uid: 'acc-1', iban: 'ES9121000418450200051332', nombre: 'Cuenta Negocios', saldo: 3210.55, movimientos: [
      tx(-1, 2420, `FRA ${numeroFactura(f4)}`, 'AGENCIA BRISA INCENTIVOS SL', 'R1'), tx(-2, -15, 'COMISION', 'BANCO', 'R2'), tx(-3, -9.99, 'SPOTIFY', 'Spotify', 'R3'),
      tx(-4, 50, 'BIZUM', 'Ana', 'R4'), tx(-5, -30, 'PARKING', 'Saba', 'R5'), { ...tx(-1, 99, 'PENDIENTE', 'X', 'R6'), status: 'PDNG' },
    ] }] });
    const lista = await (await pedir('/api/banco/conectar', { cookie: bq })).json();
    ok('lista de bancos de España', () => assert.deepEqual(lista.bancos.map((b) => [b.nombre, b.dias]), [['Banco Simulado', 90], ['Caja Simulada', 180]]));
    const ini = await (await pedir('/api/banco/conectar', { metodo: 'POST', cookie: bq, cuerpo: { banco: 'Banco Simulado', tipo: 'business' } })).json();
    const auth = Object.values((await sim('/_prueba')).auth).at(-1);
    const APP = (process.env.APP_URL || BASE).replace(/\/$/, '');
    ok('pide permiso al banco con firma, 90 días y vuelta a la app (APP_URL si está)', () => assert.ok(ini.url && auth.psu_type === 'business' && auth.redirect_url === `${APP}/api/banco/vuelta` &&Math.abs(Date.parse(auth.access.valid_until) - Date.now() - 90 * 864e5) < 120000));
    const banco = await fetch(ini.url, { redirect: 'manual' });
    const vuelta = new URL(banco.headers.get('location'));
    const robo = await pedir(vuelta.pathname + vuelta.search, { cookie: yo });
    ok('otra persona no puede usar esa vuelta del banco', () => assert.ok(robo.headers.get('location')?.endsWith('/banco?error=caducado')));
    const bien = await pedir(vuelta.pathname + vuelta.search, { cookie: bq });
    ok('al volver del banco queda conectada', () => assert.ok(bien.headers.get('location')?.endsWith('/banco?conectado=1'), bien.headers.get('location')));
    ok('la vuelta lleva a la dirección fija de la app', () => assert.ok(bien.headers.get('location')?.startsWith(`${APP}/banco?`) && robo.headers.get('location')?.startsWith(`${APP}/banco?`)));
    const ebMod = await import('../../lib/enableBanking.js');
    const ebA = (await sim('/_prueba')).llamadas;
    await ebMod.listaBancos();
    const eb0 = (await sim('/_prueba')).llamadas;
    ok('fuera de producción sí usa el simulador (control)', () => assert.ok(eb0 > ebA));
    const ebProd = await Promise.resolve(ebMod).then(async (m) => {
      const v = process.env.VERCEL_ENV; process.env.VERCEL_ENV = 'production';
      try { await m.listaBancos(); } catch { /* sin clave real: el banco de verdad la rechaza */ } finally { if (v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = v; }
      return (await sim('/_prueba')).llamadas;
    });
    ok('en producción (VERCEL_ENV) no usa el simulador aunque ENABLE_BANKING_URL esté puesta', () => assert.equal(ebProd, eb0));
    const cuentasB = (await kv(['HVALS', `cuentas:bancos:${empresa}`])).map((x) => JSON.parse(x));
    const eb = cuentasB.find((c) => c.origen === 'enable');
    ok('cuenta conectada con su saldo disponible', () => assert.ok(eb && eb.saldo === 3210.55 && eb.iban.endsWith('1332') && eb.sesion === 'sesion-1'));
    const movs2 = (await kv(['HVALS', `cuentas:banco:${empresa}`])).map((x) => JSON.parse(x)).filter((m) => m.cuenta === eb.id);
    ok('trae los 5 movimientos (en varias páginas, sin los pendientes)', () => assert.equal(movs2.length, 5));
    const saldo = JSON.parse(await kv(['GET', `cuentas:saldo:${empresa}`]));
    ok('saldo real: la suma de las tres cuentas', () => assert.deepEqual([saldo.importe, saldo.cuentas], [10662.55, 3]));
    const pb3 = n(await texto('/banco', bq));
    ok('pantalla: la cuenta y la factura cobrada por el banco', () => assert.ok(pb3.includes('Cuenta Negocios') && pb3.includes('•••• 1332') && pb3.includes(`Factura ${numeroFactura(f4)}`) && pb3.includes(n(eur(10662.55)))));
    const antes = (await sim('/_prueba')).llamadas;
    const s1 = await (await pedir('/api/banco/sincronizar', { metodo: 'POST', cookie: bq, cuerpo: {} })).json();
    const medio = (await sim('/_prueba')).llamadas;
    const s2 = await (await pedir('/api/banco/sincronizar', { metodo: 'POST', cookie: bq, cuerpo: { forzar: true } })).json();
    const despues = (await sim('/_prueba')).llamadas;
    ok('al abrir no vuelve a llamar al banco antes de 6 horas; «Actualizar» sí', () => assert.ok(s1.nuevos === 0 && medio === antes && s2.nuevos === 0 && despues > medio));
    const no = await (await pedir('/api/banco/conectar', { metodo: 'POST', cookie: bq, cuerpo: { banco: 'Caja Simulada', tipo: 'personal' } })).json();
    const v2 = new URL((await fetch(no.url, { redirect: 'manual' })).headers.get('location'));
    const can = await pedir(v2.pathname + v2.search, { cookie: bq });
    ok('si no da permiso en el banco, lo dice', () => assert.ok(can.headers.get('location')?.endsWith('/banco?error=cancelado')));
    const des = await pedir(`/api/banco/conectar?id=${eb.id}`, { metodo: 'DELETE', cookie: bq });
    const saldo2 = JSON.parse(await kv(['GET', `cuentas:saldo:${empresa}`]));
    ok('desconectar retira el permiso del banco y su saldo', () => assert.ok(des.status === 200 && saldo2.importe === 7452));
    const cerr = (await sim('/_prueba')).cerradas;
    ok('sesión cerrada en el banco', () => assert.ok(cerr.includes('sesion-1')));
  } else console.log('  (sin ENABLE_BANKING_URL: se salta la conexión)');
}

console.log('Asistente con IA');
if (process.env.ANTHROPIC_URL) {
  const { readFileSync, rmSync: borrarLog } = await import('node:fs');
  const { resumenAnual, trimestre } = await import('../../lib/calculos.js');
  const { totalDe } = await import('../../lib/proveedores.js');
  const { euros } = await import('../../lib/asistente.js');
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const mia = await kv(['HGET', 'cuentas:emails', fd.get('email')]);
  const todos = async (h) => (await kv(['HVALS', `cuentas:${h}:${mia}`])).map((x) => JSON.parse(x));
  const [FA, GA] = [await todos('facturas'), await todos('gastos')];
  const m303 = resumenAnual(FA, GA, Y, {}, []).trimestres[trimestre(hoy) - 1].m303;
  const preguntar = async (cookie, pregunta, historial) => { const r = await pedir('/api/asistente', { metodo: 'POST', cookie, cuerpo: { pregunta, historial } }); return { status: r.status, ...(await r.json()) }; };
  const log = () => readFileSync('/tmp/ia.json', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  borrarLog('/tmp/ia.json', { force: true });
  const iva = await preguntar(yo, '¿Cuánto IVA llevo este trimestre?', [{ role: 'user', content: 'Hola' }, { role: 'assistant', content: 'Hola, ¿qué necesitas?' }]);
  ok('responde el IVA del trimestre con la cifra de la app', () => assert.ok(iva.status === 200 && iva.respuesta.includes(euros(Math.abs(m303))), JSON.stringify(iva)));
  ok('dice de dónde sale la cifra', () => assert.deepEqual(iva.fuentes, ['Impuestos']));
  const l1 = log()[0];
  ok('la IA recibe todas las herramientas del administrador, la fecha y la conversación', () => assert.ok(l1.herramientas.includes('impuestos') && l1.herramientas.includes('nominas') && l1.sistema.includes(`Hoy es ${hoy}`) && l1.historial === 3 && l1.auth === process.env.ANTHROPIC_API_KEY));
  borrarLog('/tmp/ia.json', { force: true });
  const sinPermiso = await preguntar(otro, '¿Cuánto IVA llevo este trimestre?');
  ok('quien solo ve gastos no recibe el IVA', () => assert.ok(sinPermiso.respuesta.includes('Con tus permisos no puedo ver eso') && !sinPermiso.respuesta.includes('€')));
  ok('…porque a la IA solo le llega la herramienta de gastos', () => assert.deepEqual(log()[0].herramientas, ['gastos']));
  const gasto = await preguntar(otro, '¿Cuánto he gastado?');
  ok('pero sí lo que ha gastado su empresa', () => assert.ok(gasto.respuesta.includes(euros(r2(GA.reduce((s, g) => s + totalDe(g), 0)))) && gasto.fuentes[0] === 'Gastos', JSON.stringify(gasto)));
  const corrige = await preguntar(yo, 'Inventa el IVA de este trimestre');
  ok('si la IA se inventa una cifra, se le corrige y responde con la buena', () => assert.ok(corrige.respuesta.includes(euros(Math.abs(m303))) && !corrige.respuesta.includes('9.999,99') && !corrige.sinComprobar, JSON.stringify(corrige)));
  const terca = await preguntar(yo, 'Siempre inventa el IVA');
  ok('si insiste, no se enseña la cifra inventada', () => assert.ok(terca.sinComprobar && !terca.respuesta.includes('9.999,99')));
  const vacia = await preguntar(yo, '  ');
  ok('pregunta vacía (400)', () => assert.equal(vacia.status, 400));
  const anon = await pedir('/api/asistente', { metodo: 'POST', cuerpo: { pregunta: 'IVA' } });
  ok('sin sesión no (401)', () => assert.equal(anon.status, 401));
  const pa = n(await texto('/asistente', yo));
  const po = n(await texto('/asistente', otro));
  ok('pantalla con preguntas de ejemplo según los permisos', () => assert.ok(pa.includes('Pregunta a Netto') && pa.includes('¿Cuánto IVA llevo este trimestre?') && po.includes('¿Cuánto he gastado este mes?') && !po.includes('IVA llevo')));
  const res = n(await texto('/', yo));
  const aj = await (await pedir('/ajustes', { cookie: otro })).text();
  ok('se llega desde el resumen, desde Ajustes y desde la barra lateral', () => assert.ok(res.includes('Pregunta por tus cuentas') && aj.includes('href="/asistente"') && /<nav class="tabs-extra"[\s\S]*?href="\/asistente"/.test(aj)));
} else console.log('  (sin ANTHROPIC_URL: se salta)');

console.log('Varias empresas en la misma cuenta');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const eDe = (r) => /(?:^|,\s*)e=([^;]+)/.exec(r.headers.get('set-cookie') || '')?.[1];
  const A = await kv(['HGET', 'cuentas:emails', fd.get('email')]);
  const nA = (await (await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: hoy, cliente: { nombre: 'Cliente de A' }, concepto: 'x', base: '10', ivaPct: 21, irpfPct: 0 } })).json()).factura.numero;
  const alta = await pedir('/api/empresas', { metodo: 'POST', cookie: yo, cuerpo: { nueva: 'Segunda Empresa S.L.' } });
  const B = eDe(alta);
  ok('se crea otra empresa en la misma cuenta y se pasa a ella', () => assert.ok(alta.status === 200 && B && B !== A));
  const enB = `${yo}; e=${B}`;
  const nueva = await pedir('/', { cookie: enB });
  const nuevaHtml = await nueva.text();
  ok('la empresa nueva empieza por su cuestionario', () => assert.ok(nueva.headers.get('location')?.includes('/bienvenida') || nuevaHtml.includes('url=/bienvenida'), `status ${nueva.status}`));
  const cfgB = await (await pedir('/api/cuenta', { metodo: 'PATCH', cookie: enB, cuerpo: { configuracion: { fiscal: { tipo: 'sociedad', iva: 'general' }, emisor: { nombre: 'Segunda Empresa S.L.', nif: 'B87654321', plazo: 15 }, actividades: [{ nombre: 'Consultoría', ivaPct: 21, irpfPct: 0 }] } } })).json();
  const fB = (await (await pedir('/api/facturas', { metodo: 'POST', cookie: enB, cuerpo: { fecha: hoy, actividad: cfgB.actividades[0].id, cliente: { nombre: 'Cliente de B' }, concepto: 'Consultoría', base: '500', ivaPct: 21, irpfPct: 0 } })).json()).factura;
  ok('cada empresa con su numeración (B empieza en 1)', () => assert.ok(fB.numero === 1 && nA > 1, `${fB.numero} ${nA}`));
  const listaB = n(await texto('/facturas', enB)), listaA = n(await texto('/facturas', yo));
  ok('cada empresa ve solo sus facturas', () => assert.ok(listaB.includes('Cliente de B') && !listaB.includes('Cliente de A') && listaA.includes('Cliente de A') && !listaA.includes('Cliente de B')));
  const resB = n(await texto('/', enB)), resA = n(await texto('/', yo));
  ok('y sus modelos (B es sociedad, A autónomo)', () => assert.ok(resB.includes('Impuesto sobre Sociedades') && !resA.includes('Impuesto sobre Sociedades') && resA.includes('Pago a cuenta del IRPF')));
  const ajA = n(await texto('/ajustes', yo));
  const chipA = await (await pedir('/', { cookie: yo })).text();
  ok('cambio rápido: en el resumen (con su nombre) y en Ajustes las dos', () => assert.ok(/class="emp emp-chip/.test(chipA) && resB.includes('Segunda Empresa S.L.') && ajA.includes('Tus empresas') && ajA.includes('Segunda Empresa S.L.') && ajA.includes('Añadir empresa')));
  const htmlA = await (await pedir('/gastos', { cookie: yo })).text();
  ok('selector en la barra lateral del ordenador', () => assert.ok(/class="emp emp-lateral[^"]*"/.test(htmlA)));
  const ajeno = await pedir('/api/empresas', { metodo: 'POST', cookie: otro, cuerpo: { id: B } });
  ok('nadie puede pasar a una empresa que no es suya (403)', () => assert.equal(ajeno.status, 403));
  const truco = await (await pedir('/facturas', { cookie: `${otro}; e=${B}` })).text();
  ok('ni forzando la cookie: sigue en la suya', () => assert.ok(!truco.includes('Cliente de B')));

  // Invitar a alguien que ya tiene cuenta (el de solo gastos de A) a la empresa B, con otros permisos.
  const otroId = await kv(['GET', `cuentas:sesion:${otro}`]);
  const otroEmail = JSON.parse(await kv(['HGET', 'cuentas:usuarios', otroId])).email;
  const inv = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: enB, cuerpo: { nombre: 'Solo gastos', email: otroEmail, rol: 'miembro', permisos: ['facturas', 'facturar'] } })).json();
  ok('invitar a quien ya tiene cuenta le añade la empresa (sin enlace nuevo)', () => assert.ok(inv.existente && !inv.enlace, JSON.stringify(inv)));
  const dos = await pedir('/api/usuarios', { metodo: 'POST', cookie: enB, cuerpo: { nombre: 'x', email: otroEmail, rol: 'miembro', permisos: [] } });
  ok('no se le puede invitar dos veces (400)', () => assert.equal(dos.status, 400));
  const cambio = await pedir('/api/empresas', { metodo: 'POST', cookie: otro, cuerpo: { id: B } });
  ok('ya puede pasar a B', () => assert.ok(cambio.status === 200 && eDe(cambio) === B));
  const otroB = `${otro}; e=${B}`;
  const facB = await pedir('/api/facturas', { metodo: 'POST', cookie: otroB, cuerpo: { fecha: hoy, actividad: cfgB.actividades[0].id, cliente: { nombre: 'Otro cliente B' }, base: '100', ivaPct: 21, irpfPct: 0 } });
  const gasB = await pedir('/api/gastos', { metodo: 'POST', cookie: otroB, cuerpo: { fecha: hoy, concepto: 'x', base: '10', ivaPct: 21 } });
  const facA = await pedir('/api/facturas', { metodo: 'POST', cookie: otro, cuerpo: { fecha: hoy, cliente: { nombre: 'X' }, base: '10', ivaPct: 21 } });
  ok('en B factura y no apunta gastos; en A sigue al revés: permisos separados', () => assert.deepEqual([facB.status, gasB.status, facA.status], [200, 403, 403]));
  const usB = n(await texto('/usuarios', enB)), usA = n(await texto('/usuarios', yo));
  ok('aparece en los usuarios de las dos empresas, con su perfil en cada una', () => assert.ok(/Solo gastos.{0,80}Facturación/.test(usB) && /Solo gastos.{0,80}Gastos/.test(usA), usB.slice(0, 300)));
  const quitar = await pedir(`/api/usuarios?id=${otroId}`, { metodo: 'DELETE', cookie: enB });
  const yaNo = await pedir('/api/empresas', { metodo: 'POST', cookie: otro, cuerpo: { id: B } });
  const sigueA = await pedir('/gastos', { cookie: otro });
  ok('quitarle de B no borra su cuenta: sigue en A', () => assert.ok(quitar.status === 200 && yaNo.status === 403 && sigueA.status === 200));
  const vuelta = await pedir('/api/empresas', { metodo: 'POST', cookie: enB, cuerpo: { id: A } });
  ok('volver a la primera empresa', () => assert.equal(eDe(vuelta), A));
}

console.log('Registro de jornada');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const { laborables, minutos } = await import('../../lib/jornada.js');
  const { leerZip } = await import('../../lib/zip.js');
  const A = await kv(['HGET', 'cuentas:emails', fd.get('email')]);
  const mesPrev = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const evaEmail = `eva${Date.now()}@test.es`;
  const altaEva = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Eva Fichadora', email: evaEmail, rol: 'miembro', permisos: [] } })).json();
  const fe = new FormData(); fe.set('codigo', altaEva.enlace.split('/').pop()); fe.set('password', 'evaevaeva123');
  const eva = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fe })).headers.get('set-cookie') || '')?.[1];
  const emp = async (cuerpo) => pedir('/api/empleados', { metodo: 'POST', cookie: yo, cuerpo: { nif: '', puesto: '', baja: '', irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65, ...cuerpo } });
  const E = (await (await emp({ nombre: 'Eva Fichadora', nif: '87654321X', alta: `${mesPrev}-01`, bruto: '1500', email: evaEmail.toUpperCase(), horasSemana: 5, precioHoraExtra: '20' })).json()).empleado;
  const L = (await (await emp({ nombre: 'Leo Sinapp', alta: `${mesPrev}-01`, bruto: '1200' })).json()).empleado;
  ok('ficha del empleado con su email para fichar y su jornada', () => assert.deepEqual([E.email, E.horasSemana, E.precioHoraExtra], [evaEmail, 5, 20]));
  const rep = await emp({ nombre: 'Otra', alta: hoy, bruto: '1000', email: evaEmail });
  ok('dos empleados no pueden tener el mismo email (400)', () => assert.equal(rep.status, 400));

  const fichar = (cookie, accion, empleado) => pedir('/api/jornada', { metodo: 'POST', cookie, cuerpo: { accion, empleado } });
  const pantalla = n(await texto('/jornada', eva));
  ok('el empleado entra y ve el botón de fichar', () => assert.ok(pantalla.includes('Registro de jornada') && pantalla.includes('Fichar entrada'), pantalla.slice(0, 300)));
  const ent = await (await fichar(eva, 'entrar')).json();
  ok('ficha la entrada con la hora del servidor (España)', () => assert.ok(ent.fichaje?.entrada.startsWith(hoy) && ent.fichaje.empleado === E.id, JSON.stringify(ent)));
  const doble = await fichar(eva, 'entrar');
  ok('no puede fichar la entrada dos veces (400)', () => assert.equal(doble.status, 400));
  const pd = n(await texto('/jornada', eva));
  ok('la pantalla dice que está trabajando', () => assert.ok(pd.includes('Trabajando desde las') && pd.includes('Pausa') && pd.includes('Fichar salida')));
  const pausa = await fichar(eva, 'pausa'), vuelve = await fichar(eva, 'volver'), sale = await (await fichar(eva, 'salir')).json();
  ok('pausa, vuelta y salida', () => assert.ok(pausa.status === 200 && vuelve.status === 200 && sale.fichaje.salida && sale.fichaje.pausas.length === 1 && sale.fichaje.pausas[0].fin));
  const ajeno = await fichar(eva, 'entrar', L.id);
  const corrige = await pedir('/api/jornada', { metodo: 'PATCH', cookie: eva, cuerpo: { id: sale.fichaje.id, entrada: `${hoy}T08:00`, salida: `${hoy}T09:00`, motivo: 'yo mismo' } });
  ok('solo ficha por sí mismo y no puede corregir su registro (403)', () => assert.deepEqual([ajeno.status, corrige.status], [403, 403]));
  const sinFicha = await fichar(otro, 'entrar');
  ok('quien no es empleado no puede fichar (403)', () => assert.ok(sinFicha.status === 403));

  const manual = (cuerpo) => pedir('/api/jornada', { metodo: 'POST', cookie: yo, cuerpo: { accion: 'manual', empleado: E.id, ...cuerpo } });
  const sinMotivo = await manual({ entrada: `${mesPrev}-10T08:00`, salida: `${mesPrev}-10T20:00`, motivo: '' });
  const d1 = await (await manual({ entrada: `${mesPrev}-10T08:00`, salida: `${mesPrev}-10T20:30`, pausas: [{ inicio: `${mesPrev}-10T14:00`, fin: `${mesPrev}-10T14:30` }], motivo: 'Fichaje en papel' })).json();
  const d2 = await (await manual({ entrada: `${mesPrev}-11T08:00`, salida: `${mesPrev}-11T20:00`, motivo: 'Fichaje en papel' })).json();
  const solapa = await manual({ entrada: `${mesPrev}-11T19:00`, salida: `${mesPrev}-11T21:00`, motivo: 'Fichaje en papel' });
  const futuro = await manual({ entrada: '2099-01-01T08:00', salida: '2099-01-01T09:00', motivo: 'Fichaje en papel' });
  ok('apuntar días a mano: con motivo, sin solaparse y nunca en el futuro', () => assert.ok(sinMotivo.status === 400 && d1.ok && d2.ok && solapa.status === 400 && futuro.status === 400));
  const mal = await pedir('/api/jornada', { metodo: 'PATCH', cookie: yo, cuerpo: { id: d2.fichaje.id, entrada: `${mesPrev}-11T08:00`, salida: `${mesPrev}-11T20:00` } });
  const bien = await pedir('/api/jornada', { metodo: 'PATCH', cookie: yo, cuerpo: { id: d2.fichaje.id, entrada: `${mesPrev}-11T08:00`, salida: `${mesPrev}-11T20:30`, pausas: [{ inicio: `${mesPrev}-11T14:00`, fin: `${mesPrev}-11T14:30` }], motivo: 'Faltaba la pausa de la comida' } });
  const D2 = JSON.parse(await kv(['HGET', `cuentas:jornada:${A}`, d2.fichaje.id]));
  ok('corregir guarda cómo estaba, quién, cuándo y por qué', () => assert.ok(mal.status === 400 && bien.status === 200 && D2.cambios.length === 1 && D2.cambios[0].antes.salida === `${mesPrev}-11T20:00` && D2.cambios[0].motivo === 'Faltaba la pausa de la comida' && minutos(D2) === 720));

  const gen = await (await pedir('/api/nominas', { metodo: 'POST', cookie: yo, cuerpo: { mes: mesPrev } })).json();
  const noms = (await kv(['HVALS', `cuentas:nominas:${A}`])).map((x) => JSON.parse(x)).filter((x) => x.mes === mesPrev);
  const nE = noms.find((x) => x.empleado === E.id), nL = noms.find((x) => x.empleado === L.id);
  const teor = laborables(`${mesPrev}-01`, new Date(Date.UTC(Number(mesPrev.slice(0, 4)), Number(mesPrev.slice(5, 7)), 0)).toISOString().slice(0, 10)) * 60;
  const extra = 1440 - teor;
  ok('la nómina del mes lleva sus horas registradas', () => assert.ok(gen.ok && nE.horas.trabajadas === 1440 && nE.horas.teoricas === teor && nE.horas.extra === extra, JSON.stringify(nE)));
  ok('y le paga las horas extra a su precio, dentro del bruto', () => assert.ok(nE.extras.importe === r2((extra / 60) * 20) && nE.bruto === r2(1500 + (extra / 60) * 20)));
  ok('quien no ficha, nómina como siempre', () => assert.ok(nL && !nL.horas && nL.bruto === 1200));
  const m111 = n(await texto(`/modelos?anio=${mesPrev.slice(0, 4)}`, yo));
  ok('Impuestos: el 111 del trimestre con los trabajadores y sus retenciones', () => assert.ok(/111 · Retenciones de trabajadores y profesionales[\s\S]*?01 · Trabajadores \d[\s\S]*?03 · Retenciones [\d.,]+ €/.test(m111)));
  const pn = n(await texto(`/nominas/${nE.id}`, yo));
  ok('la nómina enseña las horas del registro', () => assert.ok(pn.includes('Registro de jornada') && pn.includes('24:00 h trabajadas') && pn.includes('h extra pagadas'), pn.slice(0, 400)));

  const ex = await pedir(`/api/jornada/exportar?mes=${mesPrev}`, { cookie: yo });
  const z = leerZip(Buffer.from(await ex.arrayBuffer()));
  const hojaJ = z['xl/worksheets/sheet2.xml'].toString(), hojaE = z['xl/worksheets/sheet1.xml'].toString(), hojaR = z['xl/worksheets/sheet3.xml'].toString();
  ok('Excel para la Inspección: empresa, jornadas con pausas y correcciones, y resumen', () => assert.ok(ex.headers.get('content-type').includes('spreadsheetml') && hojaE.includes('12345678Z') && hojaE.includes('Estatuto') && hojaJ.includes('Eva Fichadora') && hojaJ.includes('87654321X') && hojaJ.includes('14:00-14:30') && hojaJ.includes('Faltaba la pausa de la comida') && hojaJ.includes('Fichaje en papel') && hojaR.includes('24:00') && hojaR.includes('Leo Sinapp')));
  const suyo = await pedir(`/api/jornada/exportar?mes=${mesPrev}`, { cookie: eva });
  const zs = leerZip(Buffer.from(await suyo.arrayBuffer()));
  ok('el empleado solo descarga lo suyo', () => assert.ok(suyo.status === 200 && !zs['xl/worksheets/sheet3.xml'].toString().includes('Leo Sinapp') && zs['xl/worksheets/sheet3.xml'].toString().includes('Eva Fichadora')));
  const ningun = await pedir(`/api/jornada/exportar?mes=${mesPrev}`, { cookie: otro });
  ok('quien no es empleado ni lleva nóminas no descarga nada (403)', () => assert.equal(ningun.status, 403));

  const pg = n(await texto(`/jornada?mes=${mesPrev}`, yo));
  ok('pantalla de la empresa: horas de cada uno, días y correcciones', () => assert.ok(pg.includes('Eva Fichadora') && pg.includes('Leo Sinapp') && pg.includes('24:00 h') && pg.includes('Corregida: Faltaba la pausa') && pg.includes('Apuntar un día a mano') && pg.includes("Descargar el registro (Excel)"), pg.slice(0, 500)));
  const pe = n(await texto(`/jornada?mes=${mesPrev}`, eva));
  ok('el empleado ve solo sus horas', () => assert.ok(pe.includes('Eva Fichadora') && !pe.includes('Leo Sinapp') && !pe.includes('Apuntar un día a mano')));
  const ajEva = n(await texto('/ajustes', eva));
  const lat = await (await pedir('/nominas', { cookie: yo })).text();
  ok('se llega desde Ajustes (empleado), desde Nóminas y desde la barra lateral', () => assert.ok(ajEva.includes('Fichar y registro de jornada') && lat.includes('href="/jornada"') && /<nav class="tabs-extra"[\s\S]*?href="\/jornada"/.test(lat)));
}

console.log('\nSeguridad');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const ajeno = (ruta, init = {}) => fetch(BASE + ruta, { redirect: 'manual', ...init, headers: { Origin: 'https://malo.example', ...(init.headers || {}) } });
  const csrfLogin = await ajeno('/api/login', { method: 'POST', body: form({ email: 'x@test.es', password: 'x' }) });
  const csrfReg = await ajeno('/api/invitacion', { method: 'POST', body: form({ codigo: 'x', password: 'xxxxxxxxx' }) });
  const csrfApi = await ajeno('/api/facturas', { method: 'POST', headers: { Cookie: `t=${yo}`, 'Content-Type': 'application/json' }, body: '{}' });
  ok('otra web no puede enviar formularios a Netto (login, invitación ni API)', () => assert.deepEqual([csrfLogin.status, csrfReg.status, csrfApi.status], [403, 403, 403]));
  const stripeSinOrigen = await fetch(`${BASE}/api/stripe`, { method: 'POST', body: '{}' });
  ok('los avisos de Stripe (sin Origin) siguen llegando y se rechazan solo por firma', () => assert.equal(stripeSinOrigen.status, 400));
  const lgFalso = await texto('/login?error=Llama%20al%20600%20000%20000');
  const invFalso = await texto('/invitacion/x?error=Llama%20al%20600%20000%20000');
  ok('un texto inventado en ?error= no sale en el login ni en la invitación', () => assert.ok(!lgFalso.includes('Llama al 600') && !invFalso.includes('Llama al 600')));
  const cab = await pedir('/login');
  ok('cabeceras: COOP, sin iframes y sin Referer', () => assert.ok(cab.headers.get('cross-origin-opener-policy') === 'same-origin' && cab.headers.get('x-frame-options') === 'DENY' && cab.headers.get('referrer-policy') === 'no-referrer'));

  // Alguien que gestiona usuarios sin ser administrador no puede crear administradores ni tocar a uno.
  const alta = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Gestor', email: `gu${Date.now()}@test.es`, rol: 'miembro', permisos: ['usuarios', 'facturas'] } })).json();
  const gestor = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: form({ codigo: alta.enlace.split('/').pop(), password: 'gestorgestor1' }) })).headers.get('set-cookie') || '')?.[1];
  const nuevoAdmin = await pedir('/api/usuarios', { metodo: 'POST', cookie: gestor, cuerpo: { nombre: 'Colado', email: `co${Date.now()}@test.es`, rol: 'admin' } });
  const yoId = await kv(['GET', `cuentas:sesion:${yo}`]);
  const tocarAdmin = await pedir('/api/usuarios', { metodo: 'PATCH', cookie: gestor, cuerpo: { id: yoId, rol: 'miembro', permisos: [] } });
  const quitarAdmin = await pedir(`/api/usuarios?id=${yoId}`, { metodo: 'DELETE', cookie: gestor });
  ok('quien gestiona usuarios sin ser administrador no crea administradores ni toca a uno (403)', () => assert.deepEqual([nuevoAdmin.status, tocarAdmin.status, quitarAdmin.status], [403, 403, 403]));
  const mas = await pedir('/api/usuarios', { metodo: 'POST', cookie: gestor, cuerpo: { nombre: 'Ayudante', email: `ay${Date.now()}@test.es`, rol: 'miembro', permisos: ['facturas'] } });
  ok('y tampoco invita a nadie: solo el administrador de la empresa (403)', () => assert.equal(mas.status, 403));
  const usG = await (await pedir('/usuarios', { cookie: gestor })).text();
  ok('a quien gestiona usuarios sin ser administrador no le sale «Invitar a alguien»', () => assert.ok(usG.includes('Gestor') && !usG.includes('Invitar a alguien') && !usG.includes('Reenviar invitación')));

  // Exportar a Excel: un cliente que empieza por «=» no se convierte en fórmula.
  await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-04-04`, actividad: ACTS[0].id, cliente: { nombre: '=HYPERLINK("http://malo.example","pulsa")' }, concepto: '+SUM(1)', base: '10', ivaPct: 21, irpfPct: 0, cobrada: false } });
  const csvT = await (await pedir(`/api/exportar?tipo=facturas&anio=${Y}`, { cookie: yo })).text();
  ok('exportar: textos que empiezan por = o + van con apóstrofo; los importes negativos no', () => assert.ok(csvT.includes(`"'=HYPERLINK(""http://malo.example"",""pulsa"")"`) && csvT.includes(";'+SUM(1);") && !csvT.includes(';=HYPERLINK')));

  const pushMalo = await pedir('/api/push', { metodo: 'POST', cookie: yo, cuerpo: { sub: { endpoint: 'https://malo.example/x', keys: { p256dh: 'a', auth: 'b' } } } });
  ok('avisos: solo servicios push de los navegadores (nada de direcciones cualquiera)', () => assert.ok([400, 503].includes(pushMalo.status)));
  const otra = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Otra Seguridad SL', nombre: 'Olga', email: `os${Date.now()}@test.es` } })).json();
  const olga = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: form({ codigo: otra.enlace.split('/').pop(), password: 'olgaolga123' }) })).headers.get('set-cookie') || '')?.[1];
  const ct = await pedir('/api/controlat', { metodo: 'POST', cookie: olga, cuerpo: { activar: true } });
  ok("Controla'T: el administrador de otra empresa no lo activa (escribiría en la cuenta de Controla'T de ese email)", () => assert.equal(ct.status, 403));

  // El del administrador escribe el neto en la base de datos de Controla'T: la misma, o la de CONTROLAT_KV_REST_API_URL si la hay.
  const URL_C = process.env.CONTROLAT_KV_REST_API_URL;
  const kvA = (url, cmd) => fetch(url, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const C = URL_C || process.env.KV_REST_API_URL;
  await kvA(C, ['SET', 'admin:email', fd.get('email')]);
  const act = await (await pedir('/api/controlat', { metodo: 'POST', cookie: yo, cuerpo: { activar: true } })).json();
  const mesC = (await kvA(C, ['KEYS', 'movs:*'])).find((k) => /^movs:\d{4}-\d{2}$/.test(k));
  const nomina = mesC ? JSON.parse((await kvA(C, ['HGET', mesC, `autonomo-${mesC.slice(5)}`])) || '{}') : {};
  ok(`Controla'T: el administrador lo activa y el neto llega a ${URL_C ? 'su base de datos aparte' : 'la base de datos compartida'}`, () => assert.ok(act.ok && act.meses > 0 && nomina.comercio === 'Netto', JSON.stringify(act)));
  if (URL_C) { const fuga = await kvA(process.env.KV_REST_API_URL, ['KEYS', 'movs:*']); ok("Controla'T aparte: nada se escribe en la base de datos de Netto", () => assert.equal(fuga.length, 0)); }
  await pedir('/api/controlat', { metodo: 'POST', cookie: yo, cuerpo: { activar: false } });
}

console.log('\nPrivacidad y condiciones');
{
  const pr = await pedir('/privacidad');
  const prT = n(await pr.text());
  ok('privacidad se ve sin sesión, con responsable, encargados y derechos', () => assert.ok(pr.status === 200 && prT.includes('Política de privacidad') && prT.includes('Enable Banking') && prT.includes('aepd.es') && prT.includes('mailto:'), `${pr.status}`));
  const co = await pedir('/condiciones');
  const coT = n(await co.text());
  ok('condiciones se ven sin sesión y explican que el banco es solo lectura', () => assert.ok(co.status === 200 && coT.includes('Condiciones de uso') && coT.includes('no puede hacer pagos ni transferencias'), `${co.status}`));
  ok('sin barra de la app en las páginas legales', () => assert.ok(!prT.includes('class="tabs') && !coT.includes('class="tabs')));
  const lg = n(await (await pedir('/login')).text());
  ok('el login enlaza a privacidad y condiciones', () => assert.ok(lg.includes('href="/privacidad"') && lg.includes('href="/condiciones"')));
  ok('el formulario de entrar no llega pintado (no sale bajo la animación de inicio) y sí el panel de marca', () => assert.ok(!lg.includes('type="password"') && lg.includes('login-marca')));
  const mal = await pedir('/api/login', { metodo: 'POST', form: (() => { const f = new FormData(); f.set('email', 'nadie@test.es'); f.set('password', 'x'); return f; })() });
  const malJ = await fetch(BASE + '/api/login', { method: 'POST', headers: { Origin: BASE, Accept: 'application/json' }, body: (() => { const f = new FormData(); f.set('email', 'nadie@test.es'); f.set('password', 'x'); return f; })() });
  const malD = await malJ.json();
  ok('login fallido: 401 con «Email o contraseña incorrectos.»', () => assert.ok(malJ.status === 401 && malD.error === 'Email o contraseña incorrectos.' && mal.status === 303));
  const fav = await pedir('/favicon.ico');
  const favB = Buffer.from(await fav.arrayBuffer());
  ok('favicon.ico con la N (16, 32 y 48 px)', () => assert.ok(fav.status === 200 && favB.readUInt16LE(2) === 1 && favB.readUInt16LE(4) === 3, `${fav.status}`));
  ok('el login enlaza al favicon.ico y al icon1.svg (dirección nueva: sin el icono antiguo en caché)', () => assert.ok(lg.includes('href="/favicon.ico') && lg.includes('href="/icon1.svg') && !lg.includes('href="/icon.svg')));
  const ico = await pedir('/icon1.svg');
  ok('el icono de la pestaña se sirve sin sesión', () => assert.ok(ico.status === 200 && ico.headers.get('content-type').includes('svg'), `${ico.status}`));
  const priv = await pedir('/facturas');
  ok('/facturas sin sesión redirige al login', () => assert.ok(priv.status >= 300 && priv.status < 400 && (priv.headers.get('location') || '').includes('/login')));
}

console.log('\nPresupuestos con varios conceptos');
{
  const pv = (await (await pedir('/api/presupuestos', { metodo: 'POST', cookie: yo, cuerpo: { fecha: hoy, actividad: ACTS[0].id, cliente: { nombre: 'Boda Varios' }, ivaPct: 21, irpfPct: 0, senalPct: 30, validez: 15,
    lineas: [{ concepto: 'Sesión DJ', cantidad: '2', precio: '300', ivaPct: 21 }, { concepto: 'Iluminación', cantidad: '1', precio: '400,00', ivaPct: 21 }] } })).json()).presupuesto;
  ok('se guarda con la base sumada y el concepto resumido', () => assert.deepEqual([pv?.base, pv?.concepto, pv?.lineas?.length], [1000, 'Sesión DJ y 1 más', 2]));
  const pub = n(await texto(`/p/${pv.token}`));
  ok('el cliente ve cada concepto', () => assert.ok(pub.includes('Sesión DJ') && pub.includes('Iluminación') && pub.includes(n(eur(600))) && pub.includes(n(eur(1210))), 'no aparece'));
  const fs = await (await pedir('/api/presupuestos/facturar', { metodo: 'POST', cookie: yo, cuerpo: { id: pv.id, tipo: 'senal' } })).json();
  ok('la señal se factura de una vez (30 %)', () => assert.ok(fs.factura?.base === 300 && !fs.factura.lineas));
  const fr = await (await pedir('/api/presupuestos/facturar', { metodo: 'POST', cookie: yo, cuerpo: { id: pv.id, tipo: 'resto' } })).json();
  ok('el resto lleva todos los conceptos y resta la señal', () => assert.deepEqual([fr.factura?.base, fr.factura?.lineas?.map((l) => l.precio)], [700, [300, 400, -300]]));
}

console.log('\nInvitaciones por email');
if (process.env.RESEND_URL) {
  const { readFileSync, rmSync } = await import('node:fs');
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const correos = () => { try { return readFileSync('/tmp/resend.json', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const codigoDe = (url) => url.split('/').pop();
  const valida = async (url) => !n(await texto(new URL(url).pathname)).includes('Invitación no válida');
  rmSync('/tmp/resend.json', { force: true });
  const emailL = `laura${Date.now()}@test.es`;
  const iv = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Laura Gestora', email: emailL, rol: 'miembro', permisos: ['facturas', 'gastos'] } })).json();
  const [m1] = correos();
  ok('al crear el usuario se le envía la invitación', () => assert.ok(iv.ok && iv.enviado && !iv.aviso && m1?.to?.[0] === emailL, JSON.stringify(iv)));
  const eA = JSON.parse(await kv(['HGET', 'cuentas:empresas', await kv(['HGET', 'cuentas:emails', fd.get('email')])]));
  const empA = eA.emisor?.nombre || eA.nombre;
  ok('el asunto dice quién invita y a qué empresa', () => assert.equal(m1?.subject, `Prueba te ha invitado a ${empA} en Netto`));
  const urlM1 = /href="([^"]+)"/.exec(m1?.html || '')?.[1] || '';
  ok('botón y enlace en texto con el enlace que ve el administrador más el token de confirmar el email', () => assert.ok(urlM1.startsWith(`${iv.enlace}?v=`) && m1.html.split(`href="${urlM1}"`).length === 3 && m1.html.includes(`>${urlM1}</a>`) && m1.html.includes('Aceptar la invitación'), urlM1));
  ok('sin imagen de seguimiento', () => assert.ok(!/<img/i.test(m1.html) && !m1.html.includes('/api/abierta')));
  ok('responder va al email de quien invita', () => assert.equal(m1.reply_to, fd.get('email')));
  const abre = n(await texto(new URL(iv.enlace).pathname));
  ok('la página de la invitación saluda por su nombre', () => assert.ok(abre.includes('Hola, Laura Gestora'), abre.slice(0, 200)));
  const lid = await kv(['HGET', 'cuentas:emails', emailL]);

  const us = await (await pedir('/usuarios', { cookie: yo })).text();
  ok('la lista de usuarios ofrece «Reenviar invitación» a quien no ha aceptado', () => assert.ok(/Laura Gestora[\s\S]{0,1200}Invitación pendiente[\s\S]{0,300}Reenviar invitación/.test(us)));
  ok('el formulario dice que la invitación se envía', () => assert.ok(us.includes('Crear y enviar invitación')));

  rmSync('/tmp/resend.json', { force: true });
  const re = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { reenviar: lid } })).json();
  const [m2] = correos();
  ok('reenviar manda otro email con un enlace nuevo', () => assert.ok(re.enviado && re.enlace !== iv.enlace && m2?.to?.[0] === emailL && m2.html.includes(re.enlace)));
  const [viejaOk, nuevaOk] = [await valida(iv.enlace), await valida(re.enlace)];
  ok('el enlace anterior deja de valer y el nuevo vale', () => assert.deepEqual([viejaOk, nuevaOk], [false, true], `vieja ${viejaOk} · nueva ${nuevaOk}`));

  // Sin permiso de usuarios (el de solo gastos): 403 y no sale ningún email.
  rmSync('/tmp/resend.json', { force: true });
  const sinPermiso = await pedir('/api/usuarios', { metodo: 'POST', cookie: otro, cuerpo: { reenviar: lid } });
  ok('sin permiso de usuarios no se puede reenviar (403)', () => assert.ok(sinPermiso.status === 403 && correos().length === 0));

  // Administrador de otra empresa: no puede reenviar invitaciones de esta.
  const altaAj = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Ajena Eventos SL', nombre: 'Álex', email: `aj${Date.now()}@test.es` } })).json();
  const mAj = correos().pop();
  ok('dar de alta una empresa también envía la invitación a su administrador', () => assert.ok(altaAj.enviado && mAj?.subject === 'Prueba te ha invitado a Ajena Eventos SL en Netto'));
  const fA = new FormData(); fA.set('codigo', codigoDe(altaAj.enlace)); fA.set('password', 'ajenaajena1');
  const aj = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fA })).headers.get('set-cookie') || '')?.[1];
  rmSync('/tmp/resend.json', { force: true });
  const ajeno = await pedir('/api/usuarios', { metodo: 'POST', cookie: aj, cuerpo: { reenviar: lid } });
  ok('el administrador de otra empresa no puede reenviar invitaciones ajenas', () => assert.ok(aj && ajeno.status >= 400 && correos().length === 0, `${ajeno.status}`));
  const sigue = await valida(re.enlace);
  rmSync('/tmp/resend.json', { force: true });
  await pedir('/api/usuarios', { metodo: 'POST', cookie: aj, cuerpo: { nombre: 'Técnico', email: `tec${Date.now()}@test.es`, rol: 'miembro', permisos: ['gastos'] } });
  ok('cada empresa con su nombre y quien la envía', () => assert.equal(correos()[0]?.subject, 'Álex te ha invitado a Ajena Eventos SL en Netto'));
  const altaX = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Xavi Soler', nombre: 'Xavi Soler', email: `xs${Date.now()}@test.es` } })).json();
  const fX = new FormData(); fX.set('codigo', codigoDe(altaX.enlace)); fX.set('password', 'xavixavi12');
  const xs = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: fX })).headers.get('set-cookie') || '')?.[1];
  rmSync('/tmp/resend.json', { force: true });
  await pedir('/api/usuarios', { metodo: 'POST', cookie: xs, cuerpo: { nombre: 'Ayuda', email: `ayx${Date.now()}@test.es`, rol: 'miembro', permisos: ['gastos'] } });
  const mX = correos()[0];
  ok('si la empresa solo tiene el nombre de quien invita: «te ha invitado a unirte a su empresa»', () => assert.ok(mX?.subject === 'Xavi Soler te ha invitado a unirte a su empresa en Netto' && mX.html.includes('te ha invitado a unirte a su empresa en Netto.'), mX?.subject));
  ok('el intento ajeno no cambia el enlace', () => assert.ok(sigue));

  // Quien ya aceptó no tiene invitación que reenviar.
  const yaDentro = await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { reenviar: await kv(['GET', `cuentas:sesion:${otro}`]) } });
  ok('a quien ya entró no se le reenvía (400)', () => assert.equal(yaDentro.status, 400));

  // Si Resend falla, el usuario se crea igual y se enseña el enlace con un aviso.
  const emailR = `rebota${Date.now()}@test.es`;
  const rb = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Rebote', email: emailR, rol: 'miembro', permisos: ['gastos'] } })).json();
  ok('si el email no sale: se crea igual, con el enlace y el motivo', () => assert.ok(rb.ok && rb.enlace && !rb.enviado && /No se pudo enviar el email: The to address is invalid/.test(rb.aviso), JSON.stringify(rb)));
  const us2 = n(await texto('/usuarios', yo));
  ok('el usuario con el email fallido aparece en la lista', () => assert.ok(us2.includes('Rebote') && us2.includes(emailR)));
  const rbOk = await valida(rb.enlace);
  ok('el enlace del email fallido funciona', () => assert.ok(rbOk));

  // El enlace sigue caducando a los 7 días (también el reenviado).
  const lu = JSON.parse(await kv(['HGET', 'cuentas:usuarios', lid]));
  await kv(['HSET', 'cuentas:usuarios', lid, JSON.stringify({ ...lu, creado: new Date(Date.now() - 8 * 864e5).toISOString() })]);
  const fC = new FormData(); fC.set('codigo', codigoDe(re.enlace)); fC.set('password', 'lauralaura1');
  const cad = await pedir('/api/invitacion', { metodo: 'POST', form: fC });
  ok('a los 8 días el enlace ha caducado', () => assert.ok(decodeURIComponent(cad.headers.get('location') || '').includes('ha caducado')));
  const re2 = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { reenviar: lid } })).json();
  const fC2 = new FormData(); fC2.set('codigo', codigoDe(re2.enlace)); fC2.set('password', 'lauralaura1');
  const entra = await pedir('/api/invitacion', { metodo: 'POST', form: fC2 });
  ok('al reenviarla vuelve a valer 7 días y se puede entrar', () => assert.ok(re2.enviado && /t=/.test(entra.headers.get('set-cookie') || ''), `${entra.status}`));
} else console.log('  (sin RESEND_URL: se salta)');

console.log('\nSolo el administrador de Netto da de alta empresas');
{
  const entrar = async (alta, pass) => { const f = new FormData(); f.set('codigo', alta.enlace.split('/').pop()); f.set('password', pass); return /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: f })).headers.get('set-cookie') || '')?.[1]; };
  const jefa = await entrar(await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Cliente Pagando SL', nombre: 'Julia', email: `ju${Date.now()}@test.es` } })).json(), 'juliajulia1');
  await pedir('/api/cuenta', { metodo: 'PATCH', cookie: jefa, cuerpo: { configuracion: { fiscal: { tipo: 'sociedad', iva: 'general' }, emisor: { nombre: 'Cliente Pagando SL', nif: 'B11111111', plazo: 30 }, actividades: [{ nombre: 'Eventos', ivaPct: 21, irpfPct: 0 }] } } });
  const crea = await pedir('/api/empresas', { metodo: 'POST', cookie: jefa, cuerpo: { nueva: 'Empresa Gratis' } });
  ok('el administrador de una empresa cliente no puede crear otra empresa (403)', () => assert.equal(crea.status, 403));
  const crea2 = await pedir('/api/usuarios', { metodo: 'POST', cookie: jefa, cuerpo: { empresaNueva: 'Otra Gratis', nombre: 'X', email: `xg${Date.now()}@test.es` } });
  ok('ni dar de alta empresas desde Usuarios (401)', () => assert.equal(crea2.status, 401));
  const ajJ = await (await pedir('/ajustes', { cookie: jefa })).text();
  const iniJ = await (await pedir('/gastos', { cookie: jefa })).text();
  ok('no le sale «Añadir empresa» (ni en Ajustes ni en la barra lateral)', () => assert.ok(!ajJ.includes('Añadir empresa') && !iniJ.includes('Añadir empresa')));
  const usJ = await (await pedir('/usuarios', { cookie: jefa })).text();
  ok('ni la sección de empresas en Usuarios', () => assert.ok(!usJ.includes('Dar de alta una empresa')));
  const invJ = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: jefa, cuerpo: { nombre: 'Gestoría de Julia', email: `gj${Date.now()}@test.es`, rol: 'miembro', permisos: ['facturas', 'gastos'] } })).json();
  ok('pero sí invita a su gente (es la administradora de su empresa)', () => assert.ok(invJ.ok && invJ.enlace, JSON.stringify(invJ)));
  ok('y le sale el formulario de invitar', () => assert.ok(usJ.includes('Invitar a alguien')));
  const ajYo = await (await pedir('/ajustes', { cookie: yo })).text();
  ok('al administrador de Netto sí le sale «Añadir empresa»', () => assert.ok(ajYo.includes('Añadir empresa')));
}

console.log('\nAislamiento entre empresas (todas las rutas /api)');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((x) => x.result);
  const alta = async (empresaNueva, nombre) => {
    const email = `${nombre.toLowerCase()}${Date.now()}@test.es`;
    const inv = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva, nombre, email } })).json();
    const f = new FormData(); f.set('codigo', inv.enlace.split('/').pop()); f.set('password', `${nombre}clave123`);
    const t = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: f })).headers.get('set-cookie') || '')?.[1];
    const conf = await (await pedir('/api/cuenta', { metodo: 'PATCH', cookie: t, cuerpo: { configuracion: { fiscal: { tipo: 'sociedad', iva: 'general' }, emisor: { nombre: empresaNueva, nif: 'B22222222', plazo: 30 }, actividades: [{ nombre: 'Eventos', ivaPct: 21, irpfPct: 0 }] } } })).json();
    const id = await kv(['HGET', 'cuentas:emails', email]);
    return { t, email, id, empresa: JSON.parse(await kv(['HGET', 'cuentas:usuarios', id])).empresa, act: conf.actividades?.[0]?.id };
  };
  const B = await alta('Víctima Secreta SL', 'Vicky');
  const C = await alta('Curiosa SL', 'Carlos');
  const comoB = (ruta, metodo, cuerpo) => pedir(ruta, { metodo, cookie: B.t, cuerpo });
  // Datos de la empresa B
  const fB = (await (await comoB('/api/facturas', 'POST', { fecha: hoy, actividad: B.act, cliente: { nombre: 'Cliente Secreto B' }, concepto: 'Secreto', base: '1000', ivaPct: 21, irpfPct: 0, cobrada: false })).json()).factura;
  const gB = (await (await comoB('/api/gastos', 'POST', { fecha: hoy, actividad: B.act, concepto: 'Gasto secreto', base: '100', ivaPct: 21, proveedor: 'Proveedor Secreto', proveedorNif: 'b33333333', pendiente: true })).json()).gasto;
  const eB = (await (await comoB('/api/empleados', 'POST', { nombre: 'Empleada Secreta', email: B.email, nif: '', puesto: 'Jefa', alta: `${Y}-01-01`, baja: '', bruto: '2000', horasSemana: 40, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 })).json()).empleado;
  await comoB('/api/nominas', 'POST', { mes: hoy.slice(0, 7) });
  const nB = JSON.parse((await kv(['HVALS', `cuentas:nominas:${B.empresa}`]))[0] || 'null');
  const rB = (await (await comoB('/api/recurrentes', 'POST', { factura: fB.id, dia: 5, enviar: false })).json()).recurrente;
  const pB = (await (await comoB('/api/productos', 'POST', { nombre: 'Producto secreto', precio: '99', ivaPct: 21 })).json()).producto;
  const prB = (await (await comoB('/api/presupuestos', 'POST', { fecha: hoy, actividad: B.act, cliente: { nombre: 'Cliente Secreto B' }, concepto: 'Presupuesto secreto', base: '500', ivaPct: 21, irpfPct: 0 })).json()).presupuesto;
  const jB = (await (await comoB('/api/jornada', 'POST', { accion: 'entrar' })).json()).fichaje;
  const csv = `F. Operación;Concepto;Importe;Saldo\n${hoy.split('-').reverse().join('/')};TRANSF SECRETA;1.210,00;9.000,00\n`;
  const fd2 = new FormData(); fd2.set('archivo', new Blob([csv]), 'b.csv');
  await pedir('/api/banco/importar', { metodo: 'POST', cookie: B.t, form: fd2 });
  const movB = Object.keys((await kv(['HGETALL', `cuentas:banco:${B.empresa}`])).reduce((o, x, i, a) => (i % 2 ? o : { ...o, [x]: a[i + 1] }), {}))[0];
  ok('la empresa B tiene de todo para atacar', () => assert.ok(fB?.id && gB?.id && eB?.id && nB?.id && rB?.id && pB?.id && prB?.id && jB?.id && movB, JSON.stringify({ f: fB?.id, g: gB?.id, e: eB?.id, n: nB?.id, r: rB?.id, p: pB?.id, pr: prB?.id, j: jB?.id, movB })));
  // Foto de todo lo de B antes del ataque
  const foto = async () => {
    const claves = (await kv(['KEYS', `cuentas:*:${B.empresa}`])).sort();
    const datos = {};
    for (const k of claves) datos[k] = await kv(['TYPE', k]) === 'hash' ? (await kv(['HGETALL', k])) : await kv(['GET', k]);
    datos.empresa = await kv(['HGET', 'cuentas:empresas', B.empresa]);
    datos.usuario = await kv(['HGET', 'cuentas:usuarios', B.id]);
    return JSON.stringify(datos);
  };
  const antes = await foto();
  // C (administradora de otra empresa) prueba con los ids de B en todas las rutas
  const comoC = (ruta, metodo = 'GET', cuerpo) => pedir(ruta, { metodo, cookie: C.t, cuerpo });
  const intentos = {
    'PATCH /api/facturas': await comoC('/api/facturas', 'PATCH', { id: fB.id, cobrada: true }),
    'DELETE /api/facturas': await comoC(`/api/facturas?id=${fB.id}`, 'DELETE'),
    'GET /api/facturas/pdf': await comoC(`/api/facturas/pdf?id=${fB.id}`),
    'POST /api/facturas/enviar': await comoC('/api/facturas/enviar', 'POST', { id: fB.id, para: 'malo@test.es', asunto: 'x', mensaje: 'x' }),
    'POST /api/facturas (rectificar)': await comoC('/api/facturas', 'POST', { rectifica: fB.id, fecha: hoy, actividad: C.act }),
    'POST /api/recurrentes (de su factura)': await comoC('/api/recurrentes', 'POST', { factura: fB.id, dia: 5 }),
    'PATCH /api/recurrentes': await comoC('/api/recurrentes', 'PATCH', { id: rB.id, activa: false }),
    'DELETE /api/recurrentes': await comoC(`/api/recurrentes?id=${rB.id}`, 'DELETE'),
    'PATCH /api/gastos': await comoC('/api/gastos', 'PATCH', { id: gB.id, fecha: hoy, concepto: 'x', base: '1', ivaPct: 21 }),
    'DELETE /api/gastos': await comoC(`/api/gastos?id=${gB.id}`, 'DELETE'),
    'POST /api/proveedores (pagar)': await comoC('/api/proveedores', 'POST', { clave: 'B33333333' }),
    'PATCH /api/empleados': await comoC('/api/empleados', 'PATCH', { id: eB.id, nombre: 'Cambiada', alta: `${Y}-01-01`, bruto: '1' }),
    'DELETE /api/empleados': await comoC(`/api/empleados?id=${eB.id}`, 'DELETE'),
    'PATCH /api/nominas': await comoC('/api/nominas', 'PATCH', { id: nB.id, pagada: true }),
    'DELETE /api/nominas': await comoC(`/api/nominas?id=${nB.id}`, 'DELETE'),
    'DELETE /api/productos': await comoC(`/api/productos?id=${pB.id}`, 'DELETE'),
    'PATCH /api/presupuestos': await comoC('/api/presupuestos', 'PATCH', { id: prB.id, estado: 'rechazado' }),
    'DELETE /api/presupuestos': await comoC(`/api/presupuestos?id=${prB.id}`, 'DELETE'),
    'POST /api/presupuestos/facturar': await comoC('/api/presupuestos/facturar', 'POST', { id: prB.id, tipo: 'resto' }),
    'PATCH /api/jornada': await comoC('/api/jornada', 'PATCH', { id: jB.id, entrada: `${hoy}T08:00`, salida: `${hoy}T09:00`, motivo: 'ataque' }),
    'POST /api/jornada (a mano para su empleada)': await comoC('/api/jornada', 'POST', { accion: 'manual', empleado: eB.id, entrada: `${hoy}T08:00`, salida: `${hoy}T09:00`, motivo: 'ataque' }),
    'POST /api/jornada (fichar por su empleada)': await comoC('/api/jornada', 'POST', { accion: 'entrar', empleado: eB.id }),
    'POST /api/banco (emparejar)': await comoC('/api/banco', 'POST', { accion: 'emparejar', id: movB, tipo: 'factura', destino: fB.id }),
    'POST /api/banco (deshacer)': await comoC('/api/banco', 'POST', { accion: 'deshacer', id: movB }),
    'POST /api/banco (ignorar)': await comoC('/api/banco', 'POST', { accion: 'ignorar', id: movB }),
    'PATCH /api/usuarios': await comoC('/api/usuarios', 'PATCH', { id: B.id, rol: 'miembro', permisos: [] }),
    'DELETE /api/usuarios': await comoC(`/api/usuarios?id=${B.id}`, 'DELETE'),
    'DELETE /api/usuarios (empresa)': await comoC(`/api/usuarios?empresa=${B.empresa}`, 'DELETE'),
    'POST /api/usuarios (reenviar)': await comoC('/api/usuarios', 'POST', { reenviar: B.id }),
    'POST /api/empresas (pasarse a B)': await comoC('/api/empresas', 'POST', { id: B.empresa }),
  };
  const despues = await foto();
  ok('ningún intento de C con ids de B cambia nada de B (facturas, gastos, empleados, nóminas, recurrentes, productos, presupuestos, jornada, banco, usuarios)', () => assert.equal(despues, antes));
  const pasaronTodos = Object.entries(intentos).filter(([k, r]) => r.status < 400 && !/^DELETE \/api\/(facturas|gastos|empleados|productos|recurrentes)$/.test(k)).map(([k, r]) => `${k} ${r.status}`);
  ok('y todos responden con error (los borrados sin efecto aparte)', () => assert.deepEqual(pasaronTodos, [], pasaronTodos.join(', ')));
  const pdf = intentos['GET /api/facturas/pdf'];
  ok('el PDF de una factura ajena no se descarga', () => assert.ok(pdf.status >= 400));
  // Elegir la empresa B con la cookie «e» no da acceso: sigue en la suya
  const conE = (ruta) => fetch(BASE + ruta, { headers: { Origin: BASE, Cookie: `t=${C.t}; e=${B.empresa}` } });
  const exp = await (await conE('/api/exportar?tipo=facturas')).text();
  const expG = await (await conE('/api/exportar?tipo=gastos')).text();
  const jor = await (await conE(`/api/jornada/exportar?mes=${hoy.slice(0, 7)}`)).text();
  const pag = await (await conE('/facturas')).text();
  ok('con la cookie de empresa apuntando a B: ni exportar, ni jornada, ni pantallas enseñan nada de B', () => assert.ok(![exp, expG, jor, pag].some((x) => /Secreto|Secreta|Víctima/.test(x)), [exp, expG, jor].map((x) => x.slice(0, 80)).join(' | ')));
  const ia = process.env.ANTHROPIC_URL ? await (await pedir('/api/asistente', { metodo: 'POST', cookie: C.t, cuerpo: { pregunta: '¿Cuánto ha facturado Cliente Secreto B?', historial: [] } })).text() : '';
  ok('el asistente de C no recibe datos de B', () => assert.ok(!/Secreto|Víctima/.test(ia)));
}

console.log('\nSesiones y contraseñas');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((x) => x.result);
  const email = `sesion${Date.now()}@test.es`, clave = 'sesionclave1';
  const inv = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Sesiones', email, rol: 'miembro', permisos: ['facturas'] } })).json();
  const fi = new FormData(); fi.set('codigo', inv.enlace.split('/').pop()); fi.set('password', clave);
  await pedir('/api/invitacion', { metodo: 'POST', form: fi });
  const id = await kv(['HGET', 'cuentas:emails', email]);
  const entrar = async (pass = clave) => { const f = new FormData(); f.set('email', email); f.set('password', pass); const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { Origin: BASE, Accept: 'application/json' }, body: f }); return { r, t: /^t=([^;]+)/.exec(r.headers.getSetCookie().find((c) => c.startsWith('t=')) || '')?.[1] }; };
  const vale = async (t) => (await fetch(BASE + '/api/exportar?tipo=facturas', { headers: { Origin: BASE, Cookie: `t=${t}` } })).status === 200;
  const s1 = await entrar();
  const ct = s1.r.headers.getSetCookie().find((c) => c.startsWith('t=')) || '';
  ok('la cookie de sesión es HttpOnly, Secure y SameSite=Lax', () => assert.ok(/HttpOnly/i.test(ct) && /Secure/i.test(ct) && /SameSite=lax/i.test(ct), ct));
  const pass = JSON.parse(await kv(['HGET', 'cuentas:usuarios', id])).pass;
  ok('la contraseña se guarda con scrypt y sal (nunca en claro)', () => assert.ok(/^[0-9a-f]{32}:[0-9a-f]{128}$/.test(pass) && !pass.includes(clave), pass?.slice(0, 20)));
  const s2 = await entrar();
  const ambas = [await vale(s1.t), await vale(s2.t)];
  ok('dos dispositivos con sesión a la vez valen', () => assert.deepEqual(ambas, [true, true]));
  // Cambiar la contraseña cierra las demás sesiones
  const nueva = 'sesionclave2';
  const cambio = await fetch(BASE + '/api/cuenta', { method: 'PATCH', headers: { Origin: BASE, Cookie: `t=${s1.t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ actual: clave, nueva }) });
  const t1b = /^t=([^;]+)/.exec(cambio.headers.getSetCookie().find((c) => c.startsWith('t=')) || '')?.[1];
  const trasCambio = [await vale(s2.t), await vale(s1.t), await vale(t1b)];
  ok('al cambiar la contraseña se cierran las demás sesiones (y quien la cambia sigue dentro)', () => assert.deepEqual(trasCambio, [false, false, true]));
  const vieja = await entrar(clave);
  ok('la contraseña antigua ya no entra', () => assert.ok(!vieja.t));
  // Cerrar sesión en todos los dispositivos
  const s3 = await entrar(nueva), s4 = await entrar(nueva);
  const pagina = await (await fetch(BASE + '/ajustes/seguridad', { headers: { Origin: BASE, Cookie: `t=${s3.t}` } })).text();
  ok('Ajustes › Face ID y contraseña tiene «Cerrar sesión en todos los dispositivos»', () => assert.ok(pagina.includes('Cerrar sesión en todos los dispositivos') && pagina.includes('/api/logout?todas=1')));
  const todas = await fetch(BASE + '/api/logout?todas=1', { method: 'POST', redirect: 'manual', headers: { Origin: BASE, Cookie: `t=${s3.t}` } });
  const trasTodas = [await vale(s3.t), await vale(s4.t), await vale(t1b)];
  ok('«Cerrar sesión en todos los dispositivos» cierra todas sus sesiones y lleva al login', () => assert.ok(trasTodas.every((x) => !x) && todas.headers.get('location')?.includes('/login'), JSON.stringify(trasTodas)));
  const s5 = await entrar(nueva), s5b = await entrar(nueva);
  await fetch(BASE + '/api/logout', { method: 'POST', redirect: 'manual', headers: { Origin: BASE, Cookie: `t=${s5.t}` } });
  const trasSalir = [await vale(s5.t), await vale(s5b.t)];
  ok('el «Cerrar sesión» normal sigue cerrando solo la de ese dispositivo', () => assert.deepEqual(trasSalir, [false, true]));
  const sinSesion = await fetch(BASE + '/api/logout?todas=1', { method: 'POST', redirect: 'manual', headers: { Origin: BASE, Cookie: `t=${yo}x` } });
  const yoSigue = await vale(yo);
  ok('con una sesión falsa no cierra la de nadie', () => assert.ok(sinSesion.status === 303 && yoSigue));
  // Quitar el acceso cierra sus sesiones
  const s6 = await entrar(nueva);
  const antesQuitar = await vale(s6.t);
  await pedir(`/api/usuarios?id=${id}`, { metodo: 'DELETE', cookie: yo });
  const trasQuitar = await vale(s6.t);
  ok('al quitarle el acceso, su sesión deja de valer al momento', () => assert.deepEqual([antesQuitar, trasQuitar], [true, false]));
}

console.log('\nBloqueo en el servidor');
{
  const modo = { activo: 'activo', off: 'off' }[process.env.BLOQUEO_SERVIDOR] || 'registrar';
  const dDe = (r) => r.headers.getSetCookie().find((c) => /^d=[^;]+/.test(c));
  ok('al registrarse se recibe la cookie de desbloqueo', () => assert.ok(dDe(alta)));
  const f = new FormData(); f.set('email', fd.get('email')); f.set('password', 'pruebaprueba1');
  const lr = await fetchReal(BASE + '/api/login', { method: 'POST', headers: { Origin: BASE, Accept: 'application/json' }, body: f });
  const t2 = /^t=([^;]+)/.exec(lr.headers.getSetCookie().find((c) => c.startsWith('t=')) || '')?.[1];
  const cd = dDe(lr) || '';
  const d2 = /^d=([^;]+)/.exec(cd)?.[1];
  ok('al entrar con contraseña también, HttpOnly, Secure y de sesión (se va al cerrar la app)', () => assert.ok(t2 && d2 && /HttpOnly/i.test(cd) && /Secure/i.test(cd) && !/Max-Age|Expires/i.test(cd), cd));
  const con = (ruta, d) => fetchReal(BASE + ruta, { redirect: 'manual', headers: { Origin: BASE, Cookie: `t=${t2}; d=${d}` } });
  // Adónde manda: cabecera Location o, si la página ya empezó a enviarse (app/loading.js), la redirección en el HTML.
  const destino = async (r) => decodeURIComponent(r.headers.get('location') || /NEXT_REDIRECT;\w+;([^;]+);/.exec(await r.text())?.[1] || '');
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((x) => x.result);
  const ttl = Number(await kv(['TTL', `cuentas:desbloqueo:${d2}`]));
  ok('el desbloqueo caduca (15 min, se alarga con el uso)', () => assert.ok(ttl > 800 && ttl <= 900, String(ttl)));
  const bien = await con('/facturas', d2);
  ok('desbloqueada: la página da sus datos', () => assert.equal(bien.status, 200));
  const sinD = await con('/facturas', 'falsa');
  const sinDT = await sinD.clone().text();
  const aSinD = await destino(sinD);
  if (modo === 'activo') {
    ok('sin desbloquear: la página no da datos y manda a /bloqueo con la ruta de vuelta', () => assert.ok(aSinD.startsWith('/bloqueo?a=/facturas') && !sinDT.includes('Ana') && !sinDT.includes('Gestoría'), `${sinD.status} ${aSinD}`));
    const pb = await con('/bloqueo?a=%2Ffacturas', 'falsa');
    const pbT = await pb.text();
    ok('/bloqueo solo pinta la pantalla de bloqueo, sin datos', () => assert.ok(pb.status === 200 && pbT.includes('pantalla-bloqueo') && !pbT.includes('Ana') && !pbT.includes('Gestoría')));
    const sinU = await fetchReal(BASE + '/bloqueo', { redirect: 'manual', headers: { Origin: BASE } });
    ok('/bloqueo sin sesión manda al login', () => assert.ok(sinU.headers.get('location')?.includes('/login')));
  } else ok(`modo ${modo}: sin desbloquear la página sigue dando datos (solo se registra)`, () => assert.ok(sinD.status === 200 && !aSinD && sinDT.includes('Ana')));
  const vuelve = await destino(await con('/bloqueo?a=%2Ffacturas', d2));
  ok('ya desbloqueada, /bloqueo devuelve a la página de antes', () => assert.equal(vuelve, '/facturas'));
  const fuera = await destino(await con('/bloqueo?a=' + encodeURIComponent('//malo.com/x'), d2));
  const fuera2 = await destino(await con('/bloqueo?a=' + encodeURIComponent('https://malo.com'), d2));
  ok('y nunca a otra web', () => assert.deepEqual([fuera, fuera2], ['/', '/']));
  const seguir = await (await fetchReal(BASE + '/api/bloqueo', { method: 'POST', headers: { Origin: BASE, Cookie: `t=${t2}; d=${d2}`, 'Content-Type': 'application/json' }, body: '{"accion":"seguir"}' })).json();
  ok('«seguir» con la app abierta mantiene el desbloqueo', () => assert.equal(seguir.ok, true));
  const otraSesion = await (await fetchReal(BASE + '/api/bloqueo', { method: 'POST', headers: { Origin: BASE, Cookie: `t=${yo}; d=${d2}`, 'Content-Type': 'application/json' }, body: '{"accion":"seguir"}' })).json();
  ok('el desbloqueo de una sesión no vale para otra', () => assert.equal(otraSesion.ok, false));
  const bl = await fetchReal(BASE + '/api/bloqueo', { method: 'POST', headers: { Origin: BASE, Cookie: `t=${t2}; d=${d2}`, 'Content-Type': 'application/json' }, body: '{}' });
  const queda = await kv(['GET', `cuentas:desbloqueo:${d2}`]);
  ok('al bloquearse la app, el servidor borra el desbloqueo', () => assert.ok(bl.ok && !queda));
  const tras = await destino(await con('/facturas', d2));
  ok(modo === 'activo' ? 'y la página vuelve a mandar a /bloqueo' : `y (modo ${modo}) la página sigue respondiendo`, () => assert.equal(tras.startsWith('/bloqueo'), modo === 'activo'));
  const ajena = await fetchReal(BASE + '/api/bloqueo', { method: 'POST', headers: { Origin: 'https://malo.com', Cookie: `t=${t2}`, 'Content-Type': 'application/json' }, body: '{}' });
  ok('bloquear desde otra web: no (CSRF)', () => assert.equal(ajena.status, 403));
  const inv = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre: 'Bloqueo', email: `bq${Date.now()}@test.es`, rol: 'miembro', permisos: ['facturas'] } })).json();
  const fi = new FormData(); fi.set('codigo', inv.enlace.split('/').pop()); fi.set('password', 'bloqueo123');
  const acepta = await fetchReal(BASE + '/api/invitacion', { method: 'POST', redirect: 'manual', headers: { Origin: BASE }, body: fi });
  ok('al aceptar una invitación también se recibe', () => assert.ok(dDe(acepta)));
}

console.log('\nEmail confirmado');
if (process.env.RESEND_URL) {
  const { readFileSync, rmSync } = await import('node:fs');
  const modo = { activo: 'activo', off: 'off' }[process.env.VERIFICAR_EMAIL] || 'registrar';
  const correos = () => { try { return readFileSync('/tmp/resend.json', 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((x) => x.result);
  const usuario = async (id) => JSON.parse(await kv(['HGET', 'cuentas:usuarios', id]));
  const destino = async (r) => r.headers.get('location') || decodeURIComponent(/NEXT_REDIRECT;\w+;([^;]+);/.exec(await r.text())?.[1] || '');
  const yoId = await kv(['HGET', 'cuentas:emails', fd.get('email').toLowerCase()]);
  const yoU = await usuario(yoId);
  ok('la cuenta registrada queda confirmada tras abrir el enlace', () => assert.equal(yoU.emailVerificado, true));
  const invitar = async (nombre) => {
    rmSync('/tmp/resend.json', { force: true });
    const email = `${nombre.toLowerCase()}${Date.now()}@test.es`;
    const r = await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { nombre, email, rol: 'miembro', permisos: ['facturas'] } })).json();
    const mail = correos().pop();
    const url = /href="([^"]+)"/.exec(mail?.html || '')?.[1]?.replace(/&amp;/g, '&') || '';
    return { ...r, email, url, id: await kv(['HGET', 'cuentas:emails', email]) };
  };
  const aceptar = (codigo, pass, v) => { const f = new FormData(); f.set('codigo', codigo); f.set('password', pass); if (v) f.set('v', v); return fetchReal(BASE + '/api/invitacion', { method: 'POST', redirect: 'manual', headers: { Origin: BASE }, body: f }); };
  const cookiesDe = (r) => r.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => /^[td]=/.test(c)).join('; ');
  const con = (ruta, ck, op = {}) => fetchReal(BASE + ruta, { redirect: 'manual', ...op, headers: { Origin: BASE, Cookie: ck, ...op.headers } });

  const ana = await invitar('Ana');
  const vAna = new URL(ana.url || 'http://x/').searchParams.get('v');
  ok('el email de invitación lleva el token de confirmar (?v=); el enlace que ve el administrador, no', () => assert.ok(vAna && !ana.enlace.includes('v='), ana.url));
  const pv = await (await fetchReal(BASE + new URL(ana.url).pathname + new URL(ana.url).search)).text();
  ok('la página de invitación lo pasa al formulario', () => assert.ok(pv.includes(`name="v" value="${vAna}"`)));
  rmSync('/tmp/resend.json', { force: true });
  await aceptar(ana.enlace.split('/').pop(), 'anaana1234', vAna);
  const anaU = await usuario(ana.id);
  ok('quien entra con el enlace del email queda confirmada y no recibe otro email', () => assert.ok(anaU.emailVerificado === true && correos().length === 0, JSON.stringify(anaU.emailVerificado)));

  const bea = await invitar('Bea');
  const otro = await invitar('Otro');
  rmSync('/tmp/resend.json', { force: true });
  const ab = await aceptar(bea.enlace.split('/').pop(), 'beabea1234', new URL(otro.url).searchParams.get('v'));
  const ckB = cookiesDe(ab);
  const beaU = await usuario(bea.id);
  const conf = correos().find((m) => m.to?.[0] === bea.email);
  ok('con el enlace del administrador (o el token de otra persona) queda sin confirmar', () => assert.equal(beaU.emailVerificado, false));
  ok('y le llega un email para confirmarlo', () => assert.ok(conf?.subject === 'Confirma tu email en Netto' && /\/api\/confirmar\?t=/.test(conf.html)));
  const pag = await con('/facturas', ckB);
  const aPag = await destino(pag.clone());
  const api = await con('/api/exportar?tipo=facturas', ckB);
  if (modo === 'activo') {
    ok('sin confirmar: las páginas mandan a /confirmar-email', () => assert.equal(aPag, '/confirmar-email'));
    ok('y la API no da datos (403)', () => assert.equal(api.status, 403));
  } else ok(`modo ${modo}: sin confirmar sigue entrando (solo se registra)`, () => assert.ok(!aPag && pag.status === 200 && api.status === 200, `${pag.status} ${aPag} ${api.status}`));
  const pce = await (await con('/confirmar-email', ckB)).text();
  ok('/confirmar-email dice a qué email ha ido y deja reenviarlo', () => assert.ok(pce.includes(bea.email) && pce.includes('Reenviar el enlace')));
  rmSync('/tmp/resend.json', { force: true });
  await con('/api/confirmar', ckB, { method: 'POST' });
  await con('/api/confirmar', ckB, { method: 'POST' });
  ok('reenviar manda otro enlace, como mucho uno por minuto', () => assert.equal(correos().length, 1));
  const enlaceConf = /\/api\/confirmar\?t=[\w-]+/.exec(correos()[0]?.html || '')?.[0];
  const abre = await fetchReal(BASE + enlaceConf, { redirect: 'manual' });
  const beaU2 = await usuario(bea.id);
  ok('el enlace confirma el email (aunque se abra sin sesión) y lleva a la app', () => assert.ok(beaU2.emailVerificado === true && abre.headers.get('location')?.endsWith('/'), abre.headers.get('location')));
  const otraVez = await fetchReal(BASE + enlaceConf, { redirect: 'manual' });
  ok('un enlace ya usado no vale', () => assert.ok(otraVez.headers.get('location')?.includes('caducado')));
  const pag2 = await con('/facturas', ckB);
  ok('ya confirmada entra con normalidad', () => assert.ok(pag2.status === 200 && !(pag2.headers.get('location'))));
  const ya = await con('/confirmar-email', ckB);
  const aYa = await destino(ya);
  ok('/confirmar-email ya confirmada la devuelve a la app', () => assert.equal(aYa, '/'));
  const zoe = await invitar('Zoe');
  const az = await aceptar(zoe.enlace.split('/').pop(), 'zoezoe1234');
  const z = await usuario(zoe.id);
  delete z.emailVerificado;
  await kv(['HSET', 'cuentas:usuarios', zoe.id, JSON.stringify(z)]);
  const aZ = await destino(await con('/facturas', cookiesDe(az)));
  ok('las cuentas de antes (sin la marca) siguen entrando: no hace falta migrar', () => assert.ok(!aZ.startsWith('/confirmar-email'), aZ));
  const falso = await fetchReal(BASE + '/api/confirmar?t=falso', { redirect: 'manual' });
  ok('un token falso no confirma nada', () => assert.ok(falso.headers.get('location')?.includes('caducado')));
} else console.log('  (sin RESEND_URL: se salta)');

console.log('\nLímite de intentos');
{
  const modo = { activo: 'activo', off: 'off' }[process.env.LIMITES] || 'registrar';
  const activo = modo === 'activo';
  const ip = `203.0.113.${Date.now() % 200}`;
  const conIp = (ruta, op = {}, desde = ip) => fetchReal(BASE + ruta, { redirect: 'manual', ...op, headers: { Origin: BASE, 'X-Real-IP': desde, ...op.headers } });
  const invitacion = (desde) => { const f = new FormData(); f.set('codigo', 'falso'); f.set('password', 'xxxxxxxxx'); return conIp('/api/invitacion', { method: 'POST', body: f }, desde); };
  let r;
  for (let i = 0; i < 31; i++) r = await invitacion();
  const loc = r.headers.get('location') || '';
  ok(activo ? 'invitación: a los 31 intentos en 15 min desde la misma IP, «Demasiados intentos»' : `invitación (modo ${modo}): el intento 31 sigue respondiendo igual`, () => assert.ok(activo ? loc.includes('error=Demasiados') : loc.includes('error=Esta'), loc));
  const otra = (await invitacion('198.51.100.7')).headers.get('location') || '';
  ok('desde otra IP sigue respondiendo con normalidad', () => assert.ok(otra.includes('error=Esta'), otra));
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((x) => x.json()).then((x) => x.result);
  const ttl = Number(await kv(['TTL', `cuentas:limite:invitacion:${ip}`]));
  ok(modo === 'off' ? 'modo off: no cuenta nada' : 'el contador caduca solo (15 min)', () => assert.ok(modo === 'off' ? ttl === -2 : ttl > 0 && ttl <= 900, String(ttl)));
  for (let i = 0; i < 61; i++) r = await conIp('/api/passkey', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"accion":"entrar-opciones"}' });
  ok(`llave de acceso: a las 61 llamadas en 15 min ${activo ? '429' : 'sigue respondiendo'}`, () => assert.equal(r.status, activo ? 429 : 200));
  for (let i = 0; i < 31; i++) r = await pedir('/api/banco/importar', { metodo: 'POST', cookie: yo, form: new FormData() });
  ok(`importar extractos: a la subida 31 en una hora ${activo ? '429' : 'sigue respondiendo'}`, () => assert.equal(r.status, activo ? 429 : 400));
  for (let i = 0; i < 11; i++) r = await pedir('/api/banco/sincronizar', { metodo: 'POST', cookie: yo, cuerpo: { forzar: true } });
  ok(`«Actualizar» el banco: a la vez 11 en una hora ${activo ? '429' : 'sigue respondiendo'}`, () => assert.equal(r.status, activo ? 429 : 200));
  const sinForzar = await pedir('/api/banco/sincronizar', { metodo: 'POST', cookie: yo, cuerpo: {} });
  ok('la sincronización normal (cada 6 horas) no cuenta', () => assert.equal(sinForzar.status, 200));
  const login = async (email) => { const f = new FormData(); f.set('email', email); f.set('password', 'mal-mal-mal'); return (await (await fetchReal(BASE + '/api/login', { method: 'POST', headers: { Origin: BASE, Accept: 'application/json', 'X-Real-IP': '192.0.2.9' }, body: f })).json()).error; };
  const [existe, noExiste] = [await login(fd.get('email')), await login(`nadie${Date.now()}@test.es`)];
  ok('el login no revela si un email tiene cuenta (mismo mensaje)', () => assert.ok(existe && existe === noExiste, `${existe} | ${noExiste}`));
}

console.log('CSP (scripts con nonce)');
{
  const modo = { activo: 'activo', off: 'off' }[process.env.CSP] || 'registrar';
  const nombre = modo === 'activo' ? 'content-security-policy' : 'content-security-policy-report-only';
  const scriptsSinNonce = (html, nonce) => [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((x) => !x.includes(`nonce="${nonce}"`));
  if (modo === 'off') { const sin = !(await fetchReal(BASE + '/login')).headers.get('content-security-policy-report-only'); ok('modo off: sin la política nueva', () => assert.ok(sin)); }
  else {
    for (const [ruta, cookie] of [['/login'], ['/precios'], ['/', yo], ['/facturas', yo]]) {
      const r = await pedir(ruta, { cookie });
      const cab = r.headers.get(nombre) || '';
      const nonce = /'nonce-([^']+)'/.exec(cab)?.[1];
      const html = await r.text();
      const malos = scriptsSinNonce(html, nonce);
      ok(`${ruta}${cookie ? ' (con sesión)' : ''}: cabecera ${modo === 'activo' ? 'aplicada' : 'en «solo registrar»'} con nonce, y todos sus scripts lo llevan`, () => assert.ok(nonce && cab.includes("'strict-dynamic'") && cab.includes('report-uri /api/csp') && html.includes('<script') && !malos.length, malos[0] || cab));
    }
    const [a, b] = await Promise.all([fetchReal(BASE + '/login'), fetchReal(BASE + '/login')]);
    ok('un nonce distinto en cada petición', () => assert.notEqual(a.headers.get(nombre), b.headers.get(nombre)));
    ok('la política de antes sigue (frame-ancestors none)', () => assert.ok((a.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'")));
  }
  const aviso = await fetchReal(BASE + '/api/csp', { method: 'POST', headers: { 'Content-Type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'document-uri': `${BASE}/facturas?q=x`, 'violated-directive': 'script-src', 'blocked-uri': 'https://malo.example/x.js' } }) });
  ok('recibe los avisos de la CSP sin sesión (204)', () => assert.equal(aviso.status, 204));
  const basura = await fetchReal(BASE + '/api/csp', { method: 'POST', body: 'esto no es json' });
  ok('un aviso mal formado no rompe nada (204)', () => assert.equal(basura.status, 204));
}

console.log('Registro de actividad');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  await pedir(`/api/exportar?tipo=gastos&anio=${Y}`, { cookie: yo });
  const emisor = JSON.parse(await kv(['HGET', 'cuentas:empresas', await kv(['HGET', 'cuentas:emails', fd.get('email')])])).emisor;
  const conIban = await pedir('/api/cuenta', { metodo: 'PATCH', cookie: yo, cuerpo: { ...emisor, iban: 'ES91 2100 0418 4502 0005 1332' } });
  await pedir('/api/cuenta', { metodo: 'PATCH', cookie: yo, cuerpo: emisor });
  const gO = await (await pedir('/api/gastos', { metodo: 'POST', cookie: otro, cuerpo: { fecha: `${Y}-06-06`, actividad: ACTS[0].id, concepto: 'Gasto para auditar', base: '12', ivaPct: 21 } })).json();
  await pedir(`/api/gastos?id=${encodeURIComponent(gO.gasto?.id)}`, { metodo: 'DELETE', cookie: otro });
  await pedir('/api/usuarios', { metodo: 'PATCH', cookie: yo, cuerpo: { id: await kv(['GET', `cuentas:sesion:${otro}`]), rol: 'miembro', permisos: ['gastos', 'gastar'] } });
  const fB = await (await pedir('/api/facturas', { metodo: 'POST', cookie: yo, cuerpo: { fecha: `${Y}-06-07`, actividad: ACTS[0].id, cliente: { nombre: 'Cliente Auditado' }, concepto: 'Para borrar', base: '33', ivaPct: 21, irpfPct: 0, cobrada: false } })).json();
  await pedir(`/api/facturas?id=${encodeURIComponent(fB.factura?.id)}`, { metodo: 'DELETE', cookie: yo });
  const act = n(await texto('/ajustes/actividad', yo));
  ok('el administrador ve las exportaciones, con quién y qué archivo', () => assert.ok(act.includes('Exportación a Excel') && act.includes(`gastos-${Y}.csv`) && act.includes('Prueba'), act.slice(0, 300)));
  ok('un cambio de IBAN queda anotado con sus 4 últimas cifras (no entero)', () => assert.ok(conIban.ok && act.includes('IBAN cambiado a …1332') && !act.includes('ES91'), act.slice(0, 300)));
  ok('lo que hace otra persona de la empresa también (gasto borrado por «Solo gastos»)', () => assert.ok(act.includes('Gasto borrado') && act.includes('Gasto para auditar') && act.includes('Solo gastos'), act.slice(0, 300)));
  ok('invitaciones, cambios de permisos (con el perfil) y facturas borradas', () => assert.ok(act.includes('Persona invitada') && act.includes('Permisos cambiados') && act.includes('· Gastos') && act.includes('Factura borrada') && act.includes('Cliente Auditado · 33 € sin IVA'), act.slice(-400)));
  const aj = n(await texto('/ajustes', yo));
  ok('Ajustes enlaza a Actividad para el administrador', () => assert.ok(aj.includes('Permisos, datos, borrados y exportaciones')));
  // Se mira el HTML entero (también lo que va en los scripts): nada del registro.
  const noAdmin = await (await pedir('/ajustes/actividad', { cookie: otro })).text();
  ok('quien no es administrador de la empresa ve «No tienes acceso», sin nada del registro en el HTML', () => assert.ok(noAdmin.includes('No tienes acceso') && !noAdmin.includes('Exportaci') && !noAdmin.includes(`gastos-${Y}.csv`)));
  const sinSesion = await pedir('/ajustes/actividad');
  ok('sin sesión, a entrar', () => assert.ok([302, 303, 307].includes(sinSesion.status), String(sinSesion.status)));
}

console.log('Descargar todos los datos');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const r = await pedir('/api/exportar/todo', { cookie: yo });
  const zipT = Buffer.from(await r.arrayBuffer()).toString('utf8'); // ZIP sin comprimir: los JSON se leen tal cual
  const u0 = JSON.parse(await kv(['HGET', 'cuentas:usuarios', await kv(['HGET', 'cuentas:emails', fd.get('email')])]));
  ok('el administrador descarga un .zip', () => assert.ok(r.status === 200 && r.headers.get('content-type') === 'application/zip' && /netto-datos-\d{4}-\d{2}-\d{2}\.zip/.test(r.headers.get('content-disposition'))));
  ok('con un JSON por tipo de dato', () => assert.ok(['empresa', 'personas', 'facturas', 'registros', 'gastos', 'clientes', 'productos', 'presupuestos', 'recurrentes', 'empleados', 'nominas', 'jornada', 'bancos', 'banco', 'actividad'].every((x) => zipT.includes(`${x}.json`))));
  ok('trae los datos de verdad (su email, sus clientes y su actividad)', () => assert.ok(zipT.includes(fd.get('email')) && zipT.includes('Cliente Auditado') && zipT.includes('Exportación a Excel')));
  ok('sin contraseñas ni sesiones', () => assert.ok(u0.pass && !zipT.includes(u0.pass) && !zipT.includes('"pass"') && !zipT.includes(yo)));
  const act = n(await texto('/ajustes/actividad', yo));
  ok('la descarga queda en la actividad', () => assert.ok(act.includes('Descarga de todos los datos')));
  const aj = n(await texto('/ajustes', yo));
  ok('Ajustes tiene el botón para el administrador', () => assert.ok(aj.includes('Descargar todos los datos')));
  const noAdmin = await pedir('/api/exportar/todo', { cookie: otro });
  ok('quien no es administrador no puede (403)', () => assert.equal(noAdmin.status, 403));
  const sinSesion = await pedir('/api/exportar/todo');
  ok('sin sesión, nada (401)', () => assert.equal(sinSesion.status, 401));
}

console.log('Baja de una empresa');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const entra = async (enlace, password) => /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: form({ codigo: enlace.split('/').pop(), password }) })).headers.get('set-cookie') || '')?.[1];
  // Empresa nueva con su administrador (Bruno), una persona solo de ella (Berta) y otra que también está en la de A («Solo gastos»).
  const eBruno = `bruno${Date.now()}@test.es`, eBerta = `berta${Date.now()}@test.es`;
  const bruno = await entra((await (await pedir('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Baja Prueba SL', nombre: 'Bruno', email: eBruno } })).json()).enlace, 'brunobruno1');
  const E = JSON.parse(await kv(['HGET', 'cuentas:usuarios', await kv(['GET', `cuentas:sesion:${bruno}`])])).empresa;
  const berta = await entra((await (await pedir('/api/usuarios', { metodo: 'POST', cookie: bruno, cuerpo: { nombre: 'Berta', email: eBerta, rol: 'miembro', permisos: ['facturas'] } })).json()).enlace, 'bertaberta1');
  const otroId = await kv(['GET', `cuentas:sesion:${otro}`]);
  await pedir('/api/usuarios', { metodo: 'POST', cookie: bruno, cuerpo: { nombre: 'Solo gastos', email: JSON.parse(await kv(['HGET', 'cuentas:usuarios', otroId])).email, rol: 'miembro', permisos: ['gastos'] } });
  const emp = JSON.parse(await kv(['HGET', 'cuentas:empresas', E]));
  await kv(['HSET', 'cuentas:empresas', E, JSON.stringify({ ...emp, pendiente: false, emisor: { nombre: 'Baja Prueba SL' }, drive: { url: 'https://script.google.com/macros/s/x/exec', token: 'secreto' }, marca: { color: '#123456' } })]);
  await kv(['HSET', `cuentas:facturas:${E}`, 'f1', JSON.stringify({ id: 'f1', fecha: `${Y}-01-15`, base: 100 })]);
  await kv(['HSET', `cuentas:presupuestos:${E}`, 'p1', JSON.stringify({ id: 'p1' })]);
  await kv(['HSET', `cuentas:portales:${E}`, 'c1', JSON.stringify({ token: 'x' })]);
  await kv(['SET', `cuentas:saldo:${E}`, '100']);

  const pag = n(await texto('/ajustes/baja', bruno));
  ok('el administrador ve qué se borra y qué se guarda, y el enlace para descargar antes', () => assert.ok(pag.includes('Baja Prueba SL') && pag.includes('se guardan bloqueados 6 años') && pag.includes('descarga todos tus datos'), pag.slice(-300)));
  const noBerta = await pedir('/api/baja', { metodo: 'POST', cookie: berta, cuerpo: { password: 'bertaberta1' } });
  const noYo = await pedir('/api/baja', { metodo: 'POST', cookie: yo, cuerpo: { password: 'pruebaprueba1' } });
  const malPass = await pedir('/api/baja', { metodo: 'POST', cookie: bruno, cuerpo: { password: 'otra-cosa' } });
  ok('quien no es administrador no puede (403), ni la empresa del administrador de Netto (403), ni con otra contraseña (400)', () => assert.deepEqual([noBerta.status, noYo.status, malPass.status], [403, 403, 400]));
  const sigue = JSON.parse(await kv(['HGET', 'cuentas:empresas', E]));
  ok('con la contraseña mal no cambia nada', () => assert.ok(!sigue.baja && sigue.drive));

  const baja = await (await pedir('/api/baja', { metodo: 'POST', cookie: bruno, cuerpo: { password: 'brunobruno1' } })).json();
  const tras = JSON.parse(await kv(['HGET', 'cuentas:empresas', E]));
  const hoyU = new Date().toISOString().slice(0, 10);
  ok('la baja se hace y el borrado final queda a 6 años', () => assert.ok(baja.ok && baja.borrarEl === `${Number(hoyU.slice(0, 4)) + 6}${hoyU.slice(4)}` && tras.baja?.borrarEl === baja.borrarEl, JSON.stringify(baja)));
  const [sesBruno, sesBerta] = await Promise.all([pedir('/api/exportar/todo', { cookie: bruno }), pedir('/api/exportar/todo', { cookie: berta })]);
  ok('nadie de la empresa puede entrar (401)', () => assert.deepEqual([sesBruno.status, sesBerta.status], [401, 401]));
  const [idB, idBe] = await Promise.all([kv(['HGET', 'cuentas:emails', eBruno]), kv(['HGET', 'cuentas:emails', eBerta])]);
  ok('las cuentas de quienes solo estaban en ella se borran, con su email', () => assert.ok(!idB && !idBe));
  const otroU = JSON.parse(await kv(['HGET', 'cuentas:usuarios', otroId]));
  const otroSigue = await pedir('/gastos', { cookie: otro });
  ok('quien también está en otra empresa sigue entrando, sin esta', () => assert.ok(otroSigue.status === 200 && !otroU.empresas?.[E] && Object.keys(otroU.empresas || {}).length > 0));
  const [fac, pre, por, sal, aud] = await Promise.all([kv(['EXISTS', `cuentas:facturas:${E}`]), kv(['EXISTS', `cuentas:presupuestos:${E}`]), kv(['EXISTS', `cuentas:portales:${E}`]), kv(['EXISTS', `cuentas:saldo:${E}`]), kv(['LRANGE', `cuentas:auditoria:${E}`, 0, 0])]);
  ok('las facturas se guardan; presupuestos, portal y banco se borran ya', () => assert.deepEqual([fac, pre, por, sal], [1, 0, 0, 0]));
  ok('sin Google Drive ni marca en la empresa', () => assert.ok(!tras.drive && !tras.marca && tras.emisor?.nombre === 'Baja Prueba SL'));
  ok('la baja queda en la actividad', () => assert.ok(String(aud?.[0] || '').includes('Baja de la empresa')));

  const cron = () => fetch(`${BASE}/api/recordatorios`, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }).then((r) => r.json());
  const antes = await cron();
  ok('antes de los 6 años el cron no borra nada', () => assert.equal(antes.bajas, 0));
  await kv(['HSET', 'cuentas:empresas', E, JSON.stringify({ ...tras, baja: { ...tras.baja, borrarEl: '2000-01-01' } })]);
  const fin = await cron();
  const [facF, audF, empF] = await Promise.all([kv(['EXISTS', `cuentas:facturas:${E}`]), kv(['EXISTS', `cuentas:auditoria:${E}`]), kv(['HEXISTS', 'cuentas:empresas', E])]);
  ok('pasado el plazo, el cron lo borra todo', () => assert.ok(fin.bajas === 1 && facF === 0 && audF === 0 && empF === 0, JSON.stringify(fin)));
}

console.log('Color de la marca');
{
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  const color = await pedir('/api/cuenta', { metodo: 'PATCH', cookie: yo, cuerpo: { marca: { color: '#C4452C' } } });
  const app = await (await pedir('/gastos', { cookie: yo })).text();
  ok('con un color propio, la app sigue con el de Netto (no se tiñe)', () => assert.ok(color.ok && /<body[^>]*--acento:#0F1F1B/i.test(app) && !/C4452C/i.test(app)));
  const emp = await kv(['HGET', 'cuentas:emails', fd.get('email')]);
  const fid = (await kv(['HKEYS', `cuentas:facturas:${emp}`]))[0];
  const pdf = await (await pedir(`/facturas/${encodeURIComponent(fid)}/pdf`, { cookie: yo })).text();
  ok('y la factura sí lleva el color de la marca', () => assert.ok(/C4452C/i.test(pdf)));
  await pedir('/api/cuenta', { metodo: 'PATCH', cookie: yo, cuerpo: { marca: { color: null } } });
}

console.log('Accesos del resumen');
{
  const nav = /<nav class="accesos"[\s\S]*?<\/nav>/.exec(await (await pedir('/', { cookie: yo })).text())?.[0] || '';
  ok('el cuarto acceso es Impuestos (antes «Más», que llevaba a Ajustes)', () => assert.ok(nav.includes('href="/modelos"') && nav.includes('Impuestos') && !nav.includes('href="/ajustes"') && !nav.includes('>Más<'), nav.slice(0, 300)));
}

console.log('Páginas de error');
{
  const noHay = await (await pedir('/facturas/no-existe-esta', { cookie: yo })).text();
  ok('una factura que no existe: «Vaya, esto no existe», con botón al inicio (no el 404 en inglés)', () => assert.ok(noHay.includes('Vaya, esto no existe') && noHay.includes('Ir al inicio') && !noHay.includes('could not be found')));
  const web = await (await pedir('/funciones/inventada')).text(); // con loading.js llega dentro del HTML en streaming
  ok('también en la web pública, con su cabecera', () => assert.ok(web.includes('Puede que la página se haya movido') && !web.includes('could not be found')));
  const sinPermiso = await (await pedir('/ajustes/facturacion', { cookie: otro })).text();
  ok('sin el permiso de datos de la empresa: «No tienes acceso» y cómo pedirlo', () => assert.ok(sinPermiso.includes('No tienes acceso') && sinPermiso.includes('Datos de la empresa') && !sinPermiso.includes('could not be found')));
  const bajaYo = await (await pedir('/ajustes/baja', { cookie: yo })).text();
  ok('el administrador de Netto en «Dar de baja»: le explica por qué no', () => assert.ok(bajaYo.includes('No tienes acceso') && bajaYo.includes('no se puede dar de baja desde aquí')));
}

console.log('Formulario de contacto de la web');
{
  const { readFileSync, rmSync } = await import('node:fs');
  const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
  rmSync('/tmp/resend.json', { force: true });
  const emailC = `contacto${Date.now()}@test.es`;
  const env = await pedir('/api/contacto', { metodo: 'POST', cuerpo: { nombre: 'Ana Contacto', email: emailC, empresa: 'Ana SL', mensaje: 'Hola' } });
  ok('se envía sin sesión (200)', () => assert.equal(env.status, 200));
  const guardada = JSON.parse((await kv(['LRANGE', 'cuentas:solicitudes', 0, 0]))?.[0] || '{}');
  ok('queda guardada en la base de datos', () => assert.equal(guardada.email, emailC));
  let aviso = {}; try { aviso = JSON.parse(readFileSync('/tmp/resend.json', 'utf8').trim().split('\n').pop()); } catch {}
  ok('llega el aviso por email, con «responder a» la persona', () => assert.ok(aviso.subject?.includes('Ana Contacto') && JSON.stringify(aviso.reply_to || '').includes(emailC), JSON.stringify(aviso).slice(0, 200)));
}

console.log(fallos ? `\n${fallos} comprobaciones fallidas: NO publicar.` : '\nTodo cuadra.');
process.exit(fallos ? 1 : 0);
