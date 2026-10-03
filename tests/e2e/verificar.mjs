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
