// Prueba de punta a punta: crea una empresa de prueba en una base de datos VACÍA, mete facturas y gastos
// por la API como lo haría la app, y comprueba que cada pantalla enseña exactamente las cifras calculadas a mano.
// Uso: BASE=http://localhost:3001 node tests/e2e/verificar.mjs   (nunca contra la app de verdad)
import assert from 'node:assert/strict';
import { panelResumen } from '../../lib/panel.js';
import { importes, numeroFactura, r2 } from '../../lib/calculos.js';
import { eur, eurSin } from '../../lib/formato.js';
import { limpiarFiscal } from '../../lib/empresa.js';

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

console.log(fallos ? `\n${fallos} comprobaciones fallidas: NO publicar.` : '\nTodo cuadra.');
process.exit(fallos ? 1 : 0);
