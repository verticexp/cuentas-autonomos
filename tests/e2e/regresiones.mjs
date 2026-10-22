// Regresiones del informe de auditoría de octubre de 2026 (P01–P06, N01–N12) por HTTP contra la app local, en base VACÍA.
// Solo contra una copia local (tests/apoyo/upstash-mem.mjs):
//   node tests/apoyo/upstash-mem.mjs 8079
//   KV_REST_API_URL=http://127.0.0.1:8079 KV_REST_API_TOKEN=x STRIPE_SECRET_KEY=sk_test_local STRIPE_URL=http://127.0.0.1:8077 \
//     STRIPE_WEBHOOK_SECRET=whsec_pruebas_local npx next start -p 3001      (y python3 tests/e2e/stripe-local.py)
//   BASE=http://localhost:3001 KV_REST_API_URL=http://127.0.0.1:8079 STRIPE_WEBHOOK_SECRET=whsec_pruebas_local node tests/e2e/regresiones.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { pendienteDe, r2, saldoDe } from '../../lib/calculos.js';
import { eur } from '../../lib/formato.js';

const BASE = process.env.BASE || 'http://localhost:3001';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('Solo contra una copia local con la base de datos vacía');
let fallos = 0;
const ok = (nombre, fn) => { try { fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos += 1; console.log(`  ✗ ${nombre}\n    ${e.message.split('\n')[0]}`); } };
const kv = (cmd) => fetch(process.env.KV_REST_API_URL, { method: 'POST', headers: { Authorization: 'Bearer local' }, body: JSON.stringify(cmd) }).then((r) => r.json()).then((d) => d.result);
let ip = 0;
const pedir = (ruta, { metodo = 'GET', cuerpo, cookie, form } = {}) => fetch(BASE + ruta, {
  method: metodo, redirect: 'manual',
  headers: { Origin: BASE, 'X-Real-IP': `10.1.${Math.floor(++ip / 250)}.${ip % 250}`, ...(cookie ? { Cookie: `t=${cookie}` } : {}), ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
  body: form || (cuerpo ? JSON.stringify(cuerpo) : undefined),
});
const json = async (ruta, op) => { const r = await pedir(ruta, op); return { status: r.status, ...(await r.json().catch(() => ({}))) }; };
const html = async (ruta, cookie) => (await (await pedir(ruta, { cookie })).text());
const form = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

// Cuenta del administrador de Fisquo y, con ella, una empresa de prueba (Bruno) que sí puede darse de baja.
const alta = await pedir('/api/registro', { metodo: 'POST', form: form({ nombre: 'Prueba', email: `reg${Date.now()}@test.es`, password: 'Clave-Local-01-2026' }) });
const yo = /t=([^;]+)/.exec(alta.headers.get('set-cookie') || '')?.[1];
if (!yo) throw new Error('No se pudo crear la cuenta de prueba: ¿la base de datos está vacía?');
const invitacion = (await json('/api/usuarios', { metodo: 'POST', cookie: yo, cuerpo: { empresaNueva: 'Regresiones SL', nombre: 'Bruno', email: `bruno${Date.now()}@test.es` } })).enlace;
const bruno = /t=([^;]+)/.exec((await pedir('/api/invitacion', { metodo: 'POST', form: form({ codigo: invitacion.split('/').pop(), password: 'Clave-Local-17-2026' }) })).headers.get('set-cookie') || '')?.[1];
if (!bruno) throw new Error('No se pudo crear la empresa de prueba');
const E = JSON.parse(await kv(['HGET', 'cuentas:usuarios', await kv(['GET', `cuentas:sesion:${bruno}`])])).empresa;
const conf = await json('/api/cuenta', { metodo: 'PATCH', cookie: bruno, cuerpo: { configuracion: {
  fiscal: { tipo: 'autonomo', iva: 'general' },
  // Autónomo con nombre de persona: desde el PR #218 un nombre de sociedad («… SL») no vale con NIF de persona física.
  emisor: { nombre: 'Bruno Regresiones', nif: '12345678Z', direccion: 'C/ Uno 1', ciudad: '08001 Barcelona', iban: 'ES9121000418450200051332', plazo: 30 },
  actividades: [{ nombre: 'Servicios', ivaPct: 21, irpfPct: 0 }],
} } });
const act = conf.actividades[0].id;
const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const Y = hoy.slice(0, 4);
const factura = (extra) => json('/api/facturas', { metodo: 'POST', cookie: bruno, cuerpo: { fecha: `${Y}-03-10`, actividad: act, irpfPct: 0, ...extra } });
const linea = (precio, ivaPct = 21) => [{ concepto: 'Servicio', cantidad: 1, precio: String(precio), ivaPct }];

console.log('N11 · validación de gastos');
{
  const mal = await json('/api/gastos', { metodo: 'POST', cookie: bruno, cuerpo: { fecha: `${Y}-02-31`, concepto: 'Material', base: 100, ivaPct: 99 } });
  ok('fecha imposible e IVA del 99 % → 400 (ya no 200)', () => assert.equal(mal.status, 400, JSON.stringify(mal)));
  const bien = await json('/api/gastos', { metodo: 'POST', cookie: bruno, cuerpo: { fecha: `${Y}-03-10`, concepto: 'Material', base: 100, ivaPct: 21 } });
  ok('un gasto válido se guarda', () => assert.ok(bien.ok, JSON.stringify(bien)));
  const edit = await json('/api/gastos', { metodo: 'PATCH', cookie: bruno, cuerpo: { id: bien.gasto.id, fecha: `${Y}-13-01`, concepto: 'Material', base: 100, ivaPct: 21 } });
  ok('editarlo con una fecha imposible → 400', () => assert.equal(edit.status, 400));
}

console.log('N06 · editar un bien migrado');
{
  const g = { id: 'bien-migrado', fecha: `${Number(Y) - 1}-01-10`, actividad: act, concepto: 'Máquina', base: 3000, ivaPct: 0, inversion: { tipo: 'maquinaria', acumulada: 600, desde: `${Y}-07-01`, coef: 10 } };
  await kv(['HSET', `cuentas:gastos:${E}`, g.id, JSON.stringify(g)]);
  const r = await json('/api/gastos', { metodo: 'PATCH', cookie: bruno, cuerpo: { id: g.id, fecha: g.fecha, actividad: act, concepto: 'Máquina renombrada', base: 3000, ivaPct: 0, inversion: { tipo: 'maquinaria' } } });
  const despues = JSON.parse(await kv(['HGET', `cuentas:gastos:${E}`, g.id]));
  ok('cambiar solo la descripción conserva acumulada, fecha de corte y coeficiente', () => assert.ok(r.ok && despues.concepto === 'Máquina renombrada' && JSON.stringify(despues.inversion) === JSON.stringify(g.inversion), JSON.stringify(despues.inversion)));
}

console.log('N05 / N09 · recepciones de pedidos a proveedor');
{
  const nuevo = async (cantidad = 10) => (await json('/api/pedidos-proveedor', { metodo: 'POST', cookie: bruno, cuerpo: { fecha: `${Y}-03-01`, proveedor: 'Proveedor SL', lineas: [{ concepto: 'Cosa', cantidad, coste: 2 }] } })).pedido;
  const gastosDe = async (p) => (await kv(['HGETALL', `cuentas:gastos:${E}`])).filter((_, i, l) => i % 2 === 1).map((x) => JSON.parse(x)).filter((g) => g.pedidoProv === p.id);
  const p1 = await nuevo();
  const r1 = await Promise.all(Array.from({ length: 8 }, () => json('/api/pedidos-proveedor', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'recibir', id: p1.id, fecha: `${Y}-03-02`, idem: 'clic-1' } })));
  const g1 = await gastosDe(p1);
  ok('8 peticiones simultáneas con la misma clave → un solo gasto', () => assert.equal(g1.length, 1, `${g1.length} gastos`));
  ok('y todas devuelven la misma recepción', () => assert.equal(new Set(r1.filter((r) => r.ok).map((r) => r.gasto.id)).size, 1));
  const p2 = await nuevo();
  const r2 = await Promise.all(Array.from({ length: 8 }, () => json('/api/pedidos-proveedor', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'recibir', id: p2.id, fecha: `${Y}-03-02` } })));
  const g2 = await gastosDe(p2);
  ok('8 peticiones distintas sobre 10 unidades → solo una se acepta, el resto 400', () => assert.ok(r2.filter((r) => r.ok).length === 1 && g2.length === 1, `${r2.filter((r) => r.ok).length} aceptadas`));
  const p3 = await nuevo();
  const a = await json('/api/pedidos-proveedor', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'recibir', id: p3.id, fecha: `${Y}-03-02`, recibido: [{ linea: 0, cantidad: 2, coste: 2 }] } });
  ok('recibir 2 de 10 no cierra el pedido', () => assert.ok(a.ok && a.pedido.estado === 'parcial' && !a.pedido.recibido, JSON.stringify(a.pedido)));
  const b = await json('/api/pedidos-proveedor', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'recibir', id: p3.id, fecha: `${Y}-03-03`, recibido: [{ linea: 0, cantidad: 8, coste: 2 }] } });
  ok('quedan 8 pendientes y se pueden recibir', () => assert.ok(b.ok && b.pedido.estado === 'recibido', JSON.stringify(b)));
  const c = await json('/api/pedidos-proveedor', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'recibir', id: p3.id, fecha: `${Y}-03-04`, recibido: [{ linea: 0, cantidad: 1, coste: 2 }] } });
  ok('y solo entonces el pedido queda cerrado (otra recepción → 400)', () => assert.equal(c.status, 400));
}

console.log('P06 · albaranes repetidos');
{
  const alb = (await json('/api/albaranes', { metodo: 'POST', cookie: bruno, cuerpo: { tipo: 'albaran', fecha: `${Y}-03-05`, cliente: { nombre: 'Cli Albaran', nif: '12345678Z' }, lineas: [{ concepto: 'Entrega', cantidad: 1, precio: '100', ivaPct: 21 }] } })).doc;
  const dup = await json('/api/albaranes', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'facturar', ids: [alb.id, alb.id], fecha: `${Y}-03-06`, actividad: act } });
  ok('facturar [A, A] da una factura con base 100 (no 200)', () => assert.ok(dup.ok && dup.factura.base === 100, JSON.stringify(dup)));
  const de = (await json('/api/albaranes', { metodo: 'POST', cookie: bruno, cuerpo: { tipo: 'albaran', fecha: `${Y}-03-05`, cliente: { nombre: 'Cli Albaran', nif: '12345678Z' }, lineas: [{ concepto: 'Entrega', cantidad: 1, precio: '50', ivaPct: 21 }] } })).doc;
  const be = (await json('/api/albaranes', { metodo: 'POST', cookie: bruno, cuerpo: { tipo: 'albaran', fecha: `${Y}-03-05`, cliente: { nombre: 'Cli Albaran', nif: '12345678Z' }, lineas: [{ concepto: 'Entrega', cantidad: 1, precio: '70', ivaPct: 21 }] } })).doc;
  const [x, y] = await Promise.all([
    json('/api/albaranes', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'facturar', ids: [de.id], fecha: `${Y}-03-06`, actividad: act } }),
    json('/api/albaranes', { metodo: 'POST', cookie: bruno, cuerpo: { accion: 'facturar', ids: [de.id, be.id], fecha: `${Y}-03-06`, actividad: act } }),
  ]);
  ok('[A] y [A,B] a la vez: A se factura una sola vez', () => assert.equal([x, y].filter((r) => r.ok).length, 1, JSON.stringify([x.error, y.error])));
}

console.log('N01 · portal con clientes homónimos');
let tokenPortal = '';
{
  const a = (await factura({ cliente: { nombre: 'Homonimo', nif: '12345678Z' }, lineas: linea(100) })).factura;
  const b = (await factura({ cliente: { nombre: 'Homonimo', nif: '87654321X' }, lineas: linea(200) })).factura;
  const pagA = await html(`/facturas/${encodeURIComponent(a.id)}`, bruno);
  tokenPortal = /\/portal\/([\w-]+)/.exec(pagA)?.[1];
  ok('la ficha de la factura da un enlace de portal', () => assert.ok(tokenPortal, `${pagA.length} bytes: ${pagA.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200)}`));
  const portal = (await (await fetch(`${BASE}/portal/${tokenPortal}`)).text()).replace(/<[^>]+>/g, ' ');
  const num = (f) => `${String(f.numero).padStart(2, '0')}-${f.anio}`;
  ok('el portal del cliente A solo muestra su factura', () => assert.ok(portal.includes(num(a)) && !portal.includes(num(b)), `A=${num(a)} B=${num(b)}`));
}

console.log('P01–P03 · cobros parciales por Stripe, en la cuenta de la empresa (Stripe Connect)');
{
  // Antes de cobrar con tarjeta, la empresa conecta su propia cuenta de Stripe (lib/stripeConnect.js).
  const con = await json('/api/stripe/connect', { metodo: 'POST', cookie: bruno });
  ok('la empresa conecta su cuenta de Stripe y recibe el enlace del alta', () => assert.ok(con.status === 200 && /\/alta\/acct_/.test(con.url || ''), JSON.stringify(con)));
  await pedir('/api/stripe/connect?vuelta=1', { cookie: bruno });
  const emp = JSON.parse(await kv(['HGET', 'cuentas:empresas', E]));
  const cuenta = emp.stripeConnect?.cuenta;
  ok('al volver del alta, su cuenta queda lista para cobrar', () => assert.ok(emp.stripeConnect?.estado === 'activa' && /^acct_/.test(cuenta || ''), JSON.stringify(emp.stripeConnect)));
  const f = (await factura({ cliente: { nombre: 'Cliente Parcial', nif: '12345678Z', email: 'p@test.es' }, lineas: linea(100) })).factura; // 121 €
  await pedir('/api/facturas/enviar', { metodo: 'POST', cookie: bruno, cuerpo: { id: f.id, para: 'p@test.es', mensaje: 'Hola' } });
  const conEnlace = JSON.parse(await kv(['HGET', `cuentas:facturas:${E}`, f.id]));
  const token = conEnlace.pago;
  ok('el envío dejó el enlace de pago y el registro del envío', () => assert.ok(token && conEnlace.envios?.length === 1, JSON.stringify(conEnlace.envios)));
  const evento = (id, centimos, desde = cuenta) => {
    const cuerpo = JSON.stringify({ type: 'checkout.session.completed', ...(desde ? { account: desde } : {}), data: { object: { id, payment_status: 'paid', currency: 'eur', amount_total: centimos, metadata: { token, factura: f.id, empresa: E, importe: String(centimos) } } } });
    const t = Math.floor(Date.now() / 1000);
    return fetch(`${BASE}/api/stripe`, { method: 'POST', body: cuerpo, headers: { 'stripe-signature': `t=${t},v1=${createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${cuerpo}`).digest('hex')}` } });
  };
  // Un aviso de otra cuenta conectada (o de la de Fisquo) no marca nada.
  await evento('cs_otra_cuenta', 5000, 'acct_otra');
  await evento('cs_plataforma', 5000, null);
  const intacta = JSON.parse(await kv(['HGET', `cuentas:facturas:${E}`, f.id]));
  ok('un pago de otra cuenta de Stripe no se aplica a la factura', () => assert.ok(!intacta.pagos?.length, JSON.stringify(intacta.pagos)));
  await evento('cs_parcial_1', 5000);
  // Otra operación con la copia antigua (sin pagos): ya no puede borrar el cobro.
  const r = await pedir('/api/facturas/enviar', { metodo: 'POST', cookie: bruno, cuerpo: { id: f.id, para: 'p@test.es', mensaje: 'Otra vez' } });
  const tras = JSON.parse(await kv(['HGET', `cuentas:facturas:${E}`, f.id]));
  ok('tras cobrar 50 € y volver a enviar la factura, el pago y el enlace siguen', () => assert.ok(tras.pagos?.length === 1 && tras.pagos[0].importe === 50 && tras.pago === token && tras.envios.length === 2, `${r.status} ${JSON.stringify(tras.pagos)}`));
  // «Por cobrar» del listado = suma de lo que falta de cada factura (esta debe 71 € y no 121 €).
  const todas = (await kv(['HGETALL', `cuentas:facturas:${E}`])).filter((_, i) => i % 2 === 1).map((x) => JSON.parse(x));
  const esperado = r2(todas.reduce((t, x) => t + pendienteDe(x), 0));
  const lista = (await html('/facturas', bruno)).replace(/<[^>]+>/g, ' ').replace(/[\u00A0\u202F]/g, ' ').replace(/\s+/g, ' ');
  ok('esa factura debe 71 € y el listado suma lo que falta de cada una', () => assert.ok(saldoDe(todas.find((x) => x.id === f.id)) === 71 && lista.includes(eur(esperado).replace(/[\u00A0\u202F]/g, ' ')), `${esperado} / ${eur(esperado)}`));
  await evento('cs_parcial_2', 7100);
  const fin = JSON.parse(await kv(['HGET', `cuentas:facturas:${E}`, f.id]));
  ok('el segundo pago de 71 € deja la factura cobrada con los dos pagos', () => assert.ok(fin.cobrada && fin.pagos.length === 2, JSON.stringify(fin.pagos)));
  // Pago completo desde la página pública: Checkout se crea en la cuenta de la empresa y la vuelta lo aplica.
  const g = (await factura({ cliente: { nombre: 'Cliente Tarjeta', nif: '12345678Z', email: 't@test.es' }, lineas: linea(50) })).factura;
  await pedir('/api/facturas/enviar', { metodo: 'POST', cookie: bruno, cuerpo: { id: g.id, para: 't@test.es', mensaje: 'Hola' } });
  const tok = JSON.parse(await kv(['HGET', `cuentas:facturas:${E}`, g.id])).pago;
  const pagina = await (await fetch(`${BASE}/pagar/${tok}`)).text();
  ok('la página de pago ofrece pagar con tarjeta', () => assert.ok(pagina.includes('con tarjeta'), pagina.slice(0, 200)));
  const fd = new FormData(); fd.set('token', tok);
  const ir = await fetch(`${BASE}/api/pagar`, { method: 'POST', body: fd, redirect: 'manual' });
  const sesion = /\/pagina\/(cs_test_\d+)/.exec(ir.headers.get('location') || '')?.[1];
  ok('«Pagar» abre Checkout de Stripe', () => assert.ok(ir.status === 303 && sesion, `${ir.status} ${ir.headers.get('location')}`));
  // Se lee la página entera: con app/loading.js llega por partes y el pago se aplica antes de terminar.
  await (await fetch(`${BASE}/pagar/${tok}?sesion=${sesion}`)).text();
  const pagada = JSON.parse(await kv(['HGET', `cuentas:facturas:${E}`, g.id]));
  ok('a la vuelta, la factura queda cobrada con el pago de su cuenta de Stripe', () => assert.ok(pagada.cobrada && pagada.pagos?.[0]?.ref === sesion, JSON.stringify(pagada.pagos)));
}

console.log('N02 · baja de la empresa');
{
  const r = await json('/api/baja', { metodo: 'POST', cookie: bruno, cuerpo: { password: 'Clave-Local-17-2026' } });
  ok('la baja se hace', () => assert.ok(r.ok, JSON.stringify(r)));
  // Un enlace desconocido responde con la página de «no encontrado» (Next envía 200 en las rutas ya en streaming): lo que
  // importa es que ya no salgan los documentos.
  const portal = (await (await fetch(`${BASE}/portal/${tokenPortal}`)).text()).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
  ok('el portal anterior ya no enseña los documentos', () => assert.ok(!/Pagar|Descargar|Bruno Regresiones|€/.test(portal), portal.replace(/\s+/g, ' ').slice(0, 200)));
  const conEnlace = (await kv(['HGETALL', `cuentas:facturas:${E}`])).filter((_, i) => i % 2 === 1).map((x) => JSON.parse(x)).find((x) => x.pago);
  if (conEnlace) {
    const pag = (await (await fetch(`${BASE}/pagar/${conEnlace.pago}`)).text()).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ');
    ok('el enlace de pago anterior tampoco', () => assert.ok(!/€|Pagar con tarjeta/.test(pag), pag.replace(/\s+/g, ' ').slice(0, 200)));
  }
  const quedan = await kv(['HLEN', `cuentas:facturas:${E}`]);
  ok('pero las facturas se conservan', () => assert.ok(quedan > 0));
}

console.log(fallos ? `\n${fallos} fallos` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
