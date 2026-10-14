// Regresiones del informe del 14/10/2026 (R01–R05) por HTTP contra la app local, en base VACÍA. P01 residual se prueba
// sin HTTP en tests/migracion-instantaneas.test.mjs (necesita pausar la migración a mitad).
// Solo contra una copia local (tests/apoyo/upstash-mem.mjs), igual que tests/e2e/regresiones.mjs:
//   node tests/apoyo/upstash-mem.mjs 8079
//   KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=x npx next start -p 3001
//   BASE=http://localhost:3001 KV_REST_API_URL=http://127.0.0.1:8079 node tests/e2e/informe-r.mjs
import assert from 'node:assert/strict';
import { pendienteDe, pagadoDe, saldoDe } from '../../lib/calculos.js';
import { generarAsientos } from '../../lib/asientos.js';

const BASE = process.env.BASE || 'http://localhost:3001';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('Solo contra una copia local con la base de datos vacía');
let fallos = 0;
const ok = (nombre, fn) => { try { fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos += 1; console.log(`  ✗ ${nombre}\n    ${e.message.split('\n')[0]}`); } };
const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
let ip = 0;
const pedir = (ruta, { metodo = 'GET', cuerpo, cookie, form } = {}) => fetch(BASE + ruta, {
  method: metodo, redirect: 'manual',
  headers: { Origin: BASE, 'X-Real-IP': `10.2.${Math.floor(++ip / 250)}.${ip % 250}`, ...(cookie ? { Cookie: `t=${cookie}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
  body: form || (cuerpo ? JSON.stringify(cuerpo) : undefined),
});
const json = async (ruta, op) => { const r = await pedir(ruta, op); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

const alta = await pedir('/api/registro', { metodo: 'POST', form: form({ nombre: 'Prueba', email: `regr${Date.now()}@test.es`, password: 'pruebaprueba1' }) });
const yo = /t=([^;]+)/.exec(alta.headers.get('set-cookie') || '')?.[1];
if (!yo) throw new Error('No se pudo crear la cuenta de prueba: ¿la base de datos está vacía?');
const invitacion = (await json('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Informe R SL', nombre: 'Rita', email: `rita${Date.now()}@test.es` } })).enlace;
const rita = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: form({ codigo: invitacion.split('/').pop(), password: 'ritarita12' }) })).headers.get('set-cookie') || '')?.[1];
if (!rita) throw new Error('No se pudo crear la empresa de prueba');
const E = JSON.parse(await kv(['HGET', 'cuentas:usuarios', await kv(['GET', `cuentas:sesion:${rita}`])])).empresa;
const conf = await json('/api/cuenta', { metodo: 'PATCH', cookie: rita, cuerpo: { configuracion: {
  fiscal: { tipo: 'autonomo', iva: 'general' },
  emisor: { nombre: 'Informe R SL', nif: '12345678Z', direccion: 'C/ Uno 1', ciudad: '08001 Barcelona', plazo: 30 },
  actividades: [{ nombre: 'Servicios', ivaPct: 21, irpfPct: 0 }],
} } });
const act = conf.actividades[0].id;
const Y = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 4);
const todos = async (hash) => ((await kv(['HGETALL', `cuentas:${hash}:${E}`])) || []).filter((_, i) => i % 2 === 1).map((x) => JSON.parse(x));
const uno = async (hash, id) => JSON.parse((await kv(['HGET', `cuentas:${hash}:${E}`, id])) || 'null');
const movimiento = async (id, importe) => kv(['HSET', `cuentas:banco:${E}`, id, JSON.stringify({ id, fecha: `${Y}-03-20`, importe, concepto: 'Transferencia', cuenta: 'c1', estado: 'pendiente' })]);
const banco = (cuerpo) => json('/api/banco', { metodo: 'POST', cookie: rita, cuerpo });
const factura121 = async () => (await json('/api/facturas', { metodo: 'POST', cookie: rita, cuerpo: { fecha: `${Y}-03-10`, actividad: act, irpfPct: 0, cliente: { nombre: 'Cliente', nif: '00000000T', direccion: 'C/ Sol', ciudad: 'Madrid' }, lineas: [{ concepto: 'Servicio', cantidad: 1, precio: '100', ivaPct: 21 }] } })).factura;
const cobradoEnBanco = (f) => generarAsientos({ facturas: [f] }, `${Y}-12-31`).filter((a) => a.concepto.startsWith('Cobro')).reduce((s, a) => s + a.lineas.filter((l) => l.cuenta === '572').reduce((x, l) => x + l.debe, 0), 0);

console.log('R01 · conciliar 1 € con una factura de 121 €');
{
  const f = await factura121();
  await movimiento('mov-r01', 1);
  const r = await banco({ accion: 'emparejar', id: 'mov-r01', tipo: 'factura', destino: f.id });
  const x = await uno('facturas', f.id);
  ok('la API lo acepta', () => assert.equal(r.status, 200, JSON.stringify(r)));
  ok('cobrado 1 €, pendiente 120 €', () => assert.deepEqual([pagadoDe(x), saldoDe(x), pendienteDe(x)], [1, 120, 120]));
  ok('la contabilidad lleva 1 € al banco (no 121 €)', () => assert.equal(cobradoEnBanco(x), 1));
  await movimiento('mov-r01-b', 500);
  const mucho = await banco({ accion: 'emparejar', id: 'mov-r01-b', tipo: 'factura', destino: f.id });
  ok('un ingreso mayor que lo pendiente se rechaza', () => assert.equal(mucho.status, 400, JSON.stringify(mucho)));
  await movimiento('mov-r01-c', 120);
  await banco({ accion: 'emparejar', id: 'mov-r01-c', tipo: 'factura', destino: f.id });
  await banco({ accion: 'deshacer', id: 'mov-r01-c' });
  const y = await uno('facturas', f.id);
  ok('completar con 120 € y deshacer ese cobro → vuelve a faltar 120 €', () => assert.deepEqual([pagadoDe(y), saldoDe(y), Boolean(y.cobrada)], [1, 120, false]));
  const g = (await json('/api/gastos', { metodo: 'POST', cookie: rita, cuerpo: { fecha: `${Y}-03-01`, concepto: 'Material', base: 100, ivaPct: 21, pendiente: true } })).gasto;
  await movimiento('mov-r01-g', -1);
  const pg = await banco({ accion: 'emparejar', id: 'mov-r01-g', tipo: 'gasto', destino: g.id });
  ok('un cargo de 1 € no paga un gasto de 121 €', () => assert.equal(pg.status, 400, JSON.stringify(pg)));
  const gx = await uno('gastos', g.id);
  ok('y el gasto sigue pendiente', () => assert.ok(gx.pendiente && !gx.banco, JSON.stringify(gx)));
}

console.log('R02 · 20 albaranes simultáneos');
{
  const doc = (tipo) => ({ tipo, fecha: `${Y}-04-01`, cliente: { nombre: 'Cliente' }, lineas: [{ concepto: 'Cosa', cantidad: '1', precio: '10', ivaPct: 21 }] });
  for (const tipo of ['albaran', 'pedido']) {
    const rs = await Promise.all(Array.from({ length: 20 }, () => json('/api/albaranes', { metodo: 'POST', cookie: rita, cuerpo: doc(tipo) })));
    const nums = rs.filter((r) => r.ok).map((r) => r.doc.numero);
    ok(`${tipo}: 20 altas → 20 números distintos`, () => assert.equal(new Set(nums).size, 20, JSON.stringify(nums.sort((a, b) => a - b))));
  }
  const albs = (await todos('albaranes')).filter((d) => d.tipo === 'albaran' && d.anio === Number(Y));
  const ultimo = albs.sort((a, b) => b.numero - a.numero)[0];
  await json(`/api/albaranes?id=${ultimo.id}`, { metodo: 'DELETE', cookie: rita });
  const otro = await json('/api/albaranes', { metodo: 'POST', cookie: rita, cuerpo: doc('albaran') });
  ok('borrar el último y crear otro no reutiliza su número', () => assert.ok(otro.doc.numero > ultimo.numero, `${otro.doc.numero} tras borrar el ${ultimo.numero}`));
}

console.log('R03 · 20 pedidos a proveedor simultáneos');
{
  const nuevo = () => json('/api/pedidos-proveedor', { metodo: 'POST', cookie: rita, cuerpo: { fecha: `${Y}-04-01`, proveedor: 'Proveedor SL', lineas: [{ concepto: 'Cosa', cantidad: 1, coste: 2 }] } });
  const rs = await Promise.all(Array.from({ length: 20 }, nuevo));
  const nums = rs.filter((r) => r.ok).map((r) => r.pedido.numero);
  ok('20 altas → 20 números distintos', () => assert.equal(new Set(nums).size, 20, JSON.stringify(nums.sort((a, b) => a - b))));
  const ultimo = rs.map((r) => r.pedido).sort((a, b) => b.numero - a.numero)[0];
  await json(`/api/pedidos-proveedor?id=${ultimo.id}`, { metodo: 'DELETE', cookie: rita });
  const otro = await nuevo();
  ok('borrar el último y crear otro no reutiliza su número', () => assert.ok(otro.pedido.numero > ultimo.numero, `${otro.pedido.numero} tras borrar el ${ultimo.numero}`));
}

console.log('R04 · editar el gasto de una recepción');
{
  const prod = 'cccccccccccc';
  await kv(['HSET', `cuentas:productos:${E}`, prod, JSON.stringify({ id: prod, nombre: 'Cable', coste: 2 })]);
  const p = (await json('/api/pedidos-proveedor', { metodo: 'POST', cookie: rita, cuerpo: { fecha: `${Y}-03-01`, proveedor: 'Proveedor SL', lineas: [{ producto: prod, cantidad: 10, coste: 2 }] } })).pedido;
  const r1 = await json('/api/pedidos-proveedor', { metodo: 'POST', cookie: rita, cuerpo: { accion: 'recibir', id: p.id, fecha: `${Y}-03-02`, recibido: [{ linea: 0, cantidad: 2, coste: 2 }] } });
  const g = r1.gasto;
  const e = await json('/api/gastos', { metodo: 'PATCH', cookie: rita, cuerpo: { ...g, base: 10, stock: [{ producto: prod, cantidad: 5, coste: 2 }] } });
  const gx = await uno('gastos', g.id);
  const px = await uno('pedidosProv', p.id);
  const enRecepciones = px.recepciones.flatMap((x) => x.lineas).reduce((s, l) => s + l.cantidad, 0);
  ok('gasto y recepción cuentan las mismas unidades tras editar', () => assert.equal(gx.stock.reduce((s, l) => s + l.cantidad, 0), enRecepciones, `gasto ${JSON.stringify(gx.stock)} · status ${e.status}`));
  await json('/api/pedidos-proveedor', { metodo: 'POST', cookie: rita, cuerpo: { accion: 'recibir', id: p.id, fecha: `${Y}-03-03` } });
  const total = (await todos('gastos')).filter((x) => x.pedidoProv === p.id).flatMap((x) => x.stock || []).reduce((s, l) => s + l.cantidad, 0);
  ok('al recibir el resto, el inventario del pedido suma 10 (no 13)', () => assert.equal(total, 10));
  const cambiaConcepto = await json('/api/gastos', { metodo: 'PATCH', cookie: rita, cuerpo: { ...gx, base: gx.base, concepto: 'Factura 33' } });
  ok('cambiar solo el concepto sí se permite', () => assert.equal(cambiaConcepto.status, 200, JSON.stringify(cambiaConcepto)));
}

console.log('R05 · corregir y facturar un albarán a la vez');
{
  let perdidas = 0, rondas = 0;
  for (let i = 0; i < 8; i++) {
    const a = (await json('/api/albaranes', { metodo: 'POST', cookie: rita, cuerpo: { tipo: 'albaran', fecha: `${Y}-05-01`, cliente: { nombre: 'Cliente', nif: '00000000T' }, lineas: [{ concepto: 'Servicio', cantidad: '1', precio: '100', ivaPct: 21 }] } })).doc;
    const [fac, ed] = await Promise.all([
      json('/api/albaranes', { metodo: 'POST', cookie: rita, cuerpo: { accion: 'facturar', ids: [a.id], fecha: `${Y}-05-31`, actividad: act } }),
      json('/api/albaranes', { metodo: 'POST', cookie: rita, cuerpo: { id: a.id, fecha: `${Y}-05-01`, cliente: { nombre: 'Cliente', nif: '00000000T' }, lineas: [{ concepto: 'Servicio', cantidad: '1', precio: '999', ivaPct: 21 }] } }),
    ]);
    rondas += 1;
    const guardado = await uno('albaranes', a.id);
    if (fac.ok && ed.ok && (guardado.lineas[0].precio !== 999 || fac.factura.base !== 999)) perdidas += 1;
  }
  ok(`nunca dos «hecho» con la corrección perdida (${rondas} rondas)`, () => assert.equal(perdidas, 0, `${perdidas} correcciones aceptadas y perdidas`));
}

console.log(fallos ? `\n${fallos} comprobaciones fallidas` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
