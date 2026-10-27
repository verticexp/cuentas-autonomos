// Regresiones del encargo S/C1: código real y Upstash en memoria, sin puertos ni servicios externos.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';
import { zip } from '../lib/zip.js';
import { leerHoja } from '../lib/hoja.js';
import { limpiarAsiento } from '../lib/asientos.js';
import { limpiarCierre } from '../lib/caja.js';
import { calcularDieta } from '../lib/dietas.js';
import { venceValido } from '../lib/pagos.js';
import { previa } from '../lib/importar.js';
import { leerTablaBanco, opciones, sugerencias } from '../lib/banco.js';
import { hoy } from '../lib/formato.js';

const base = crearBase(), estado = { comandos: [], push: [], externas: [] };
globalThis.__seguridadDatos = estado;
const fetchOriginal = globalThis.fetch;
const variables = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'STRIPE_SECRET_KEY'];
const env = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
async function cargar(archivo, dobles = {}) {
  const codigo = (await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8')).replace(/from (['"])([^'"]+)\1/g, (_, _c, origen) => {
    const ruta = origen.startsWith('@/') ? origen.slice(2) + '.js' : null;
    const destino = dobles[origen] || (ruta ? new URL(`../${ruta}`, import.meta.url).href
      : origen.startsWith('.') ? new URL(origen, new URL(`../${archivo}`, import.meta.url)).href
        : import.meta.resolve(/^next\/(headers|navigation|server)$/.test(origen) ? origen + '.js' : origen));
    return `from ${JSON.stringify(destino)}`;
  });
  return import(modulo(codigo));
}
const api = modulo(`export const usuarioApi=async()=>({u:globalThis.__seguridadDatos.u});
export const cuerpo=(r)=>r.json(); export const error=(error,status=400)=>Response.json({error},{status});`);
let R, B, G, A, L, S, C, REC, PUSH, TAREAS;
before(async () => {
  process.env.KV_REST_API_URL = 'http://redis-seguridad-datos.test';
  process.env.KV_REST_API_TOKEN = 'pruebas';
  process.env.VAPID_PUBLIC_KEY = 'publica'; process.env.VAPID_PRIVATE_KEY = 'privada';
  process.env.STRIPE_SECRET_KEY = 'pruebas';
  globalThis.fetch = async (url, op) => {
    if (!String(url).startsWith(process.env.KV_REST_API_URL)) {
      estado.externas.push({ url: String(url), op });
      return Response.json({ id: 'cs_test_valida', metadata: {} });
    }
    const j = JSON.parse(op.body);
    await estado.antes?.(j);
    const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
    const uno = (cmd) => {
      estado.comandos.push(cmd);
      const result = base.run(cmd);
      return { result: new Headers(op.headers).get('upstash-encoding') === 'base64' ? b64(result) : result };
    };
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  [R, B, G, A, L, S, C, REC] = await Promise.all([
    import('../lib/redis.js'), import('../lib/bancoServidor.js'), import('../lib/gastosServidor.js'),
    import('../lib/auth.js'), import('../lib/limite.js'), import('../lib/stripe.js'),
    import('../lib/cobros.js'), import('../lib/recurrentesServidor.js'),
  ]);
  PUSH = await cargar('lib/push.js', { 'web-push': modulo(`export default {setVapidDetails(){},async sendNotification(sub,datos){globalThis.__seguridadDatos.push.push({sub,datos:JSON.parse(datos)});}};`) });
  ({ TAREAS } = await cargar('lib/trabajosTareas.js', { './push.js': modulo(`export const pushListo=()=>true; export const avisosPushEmpresa=(...a)=>globalThis.__seguridadDatos.pushEmpresa(...a);`) }));
});
beforeEach(() => {
  base.run(['flushdb']); estado.comandos = []; estado.push = []; estado.externas = []; estado.antes = null;
  estado.u = usuario(); estado.pushEmpresa = PUSH.avisosPushEmpresa;
  process.env.LIMITES = 'activo';
});
after(() => {
  globalThis.fetch = fetchOriginal; delete globalThis.__seguridadDatos;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const usuario = (extra = {}) => ({ id: 'u', empresa: 'e', rol: 'miembro', pv: 2, permisos: ['resumen', 'facturar', 'gastar'], actividades: [{ id: 'servicios', nombre: 'Servicios' }], ...extra });
const gasto = (extra = {}) => ({ id: 'g', fecha: '2026-10-01', concepto: 'Material', base: 100, ivaPct: 0, pendiente: true, ...extra });
const movimiento = (extra = {}) => ({ id: 'm', fecha: '2026-10-01', importe: -100, concepto: 'Material', estado: 'pendiente', ...extra });
const factura = (extra = {}) => ({ id: 'f', fecha: '2026-08-01', numero: 1, anio: 2026, cliente: { nombre: 'Cliente privado', email: 'cliente@example.com' }, concepto: 'Servicio', actividad: 'servicios', base: 100, ivaPct: 0, irpfPct: 0, cobrada: false, ...extra });
async function guardar(col, doc) { await R.redis.hset(R.clave(estado.u, col), { [doc.id]: doc }); }
const req = (b) => new Request('http://fisquo.test/api/banco', { method: 'POST', body: JSON.stringify(b) });

test('S-01: Banco oculta la nómina en sugerencias y opciones y rechaza mutaciones directas', async () => {
  const n = gasto({ id: 'nomina-1', nomina: '1', concepto: 'Nómina Ana', base: 100 });
  const m = movimiento({ concepto: 'Nómina Ana' });
  assert.equal(sugerencias([m], [], [n], estado.u).m, undefined);
  assert.deepEqual(opciones(m, [], [n], [], estado.u), []);
  assert.equal(opciones(m, [], [n], [], usuario({ rol: 'admin' })).length, 1);
  await guardar('gastos', n); await guardar('banco', m);
  assert.deepEqual((await B.candidatosConciliacion(estado.u, [m])).gastos, []);
  let editado = false;
  assert.equal((await G.editarGasto(estado.u, n.id, () => { editado = true; return { gasto: n }; })).status, 403);
  assert.equal(editado, false);
  assert.equal((await G.borrarGasto(estado.u, n.id)).status, 403);
  assert.equal((await B.emparejar(estado.u, m.id, 'gasto', n.id)).status, 403);
  await guardar('banco', { ...m, estado: 'emparejado', enlace: { tipo: 'gasto', id: n.id } });
  assert.equal((await B.deshacer(estado.u, m.id)).status, 403);
  assert.ok(await R.leerUno(estado.u, 'gastos', n.id));
});

test('S-02: crear o borrar asientos bancarios exige contabilidad, también en la ruta', async () => {
  const { POST } = await cargar('app/api/banco/route.js', { '@/lib/api': api });
  for (const clase of ['prestamo', 'socio', 'ingreso']) {
    const m = movimiento({ id: clase, importe: clase === 'ingreso' ? 100 : -100 });
    await guardar('banco', m);
    assert.equal((await B.contabilizar(estado.u, m.id, clase, { intereses: 10 })).status, 403);
    assert.equal((await POST(req({ accion: 'contabilizar', id: m.id, clase }))).status, 403);
    const admin = usuario({ rol: 'admin' });
    assert.equal((await B.contabilizar(admin, m.id, clase)).ok, true);
    assert.equal((await B.deshacer(estado.u, m.id)).status, 403);
    assert.equal((await POST(req({ accion: 'deshacer', id: m.id }))).status, 403);
    assert.equal((await R.leerUno(estado.u, 'banco', m.id)).estado, 'emparejado');
  }
  assert.equal((await R.leer(estado.u, 'asientos')).length, 3);
});

test('S-03: la eliminación global y sus credenciales siguen bajo usuario:<id>', async () => {
  const id = '52361640';
  await R.redis.hset('usuarios', { [id]: { id, empresa: 'e', email: 'ana@example.com', rol: 'miembro' } });
  await R.redis.hset('emails', { 'ana@example.com': id });
  await R.redis.hset('invitaciones', { invitacion: id });
  await R.redis.sadd(`sesiones:${id}`, 'sesion'); await R.redis.set('sesion:sesion', id);
  await R.redis.hset(`passkeys:${id}`, { llave: {} });
  let borrados = 0;
  estado.antes = (j) => {
    for (const cmd of Array.isArray(j[0]) ? j : [j]) if (String(cmd[0]).toLowerCase() === 'hdel' && cmd[1] === 'cuentas:usuarios') {
      assert.ok(base.run(['get', `cuentas:cerrojo:usuario:${id}`]), 'el borrado global debe conservar el cerrojo'); borrados++;
    }
  };
  await A.quitarDeEmpresa(id, 'e');
  assert.equal(borrados, 1);
  assert.equal(await R.redis.hget('usuarios', id), null);
  assert.equal(await R.redis.hget('invitaciones', 'invitacion'), null);
  assert.equal(await R.redis.get('sesion:sesion'), null);
  assert.equal(await R.redis.hlen(`passkeys:${id}`), 0);
});

test('S-03: una incorporación concurrente conserva la cuenta y las sesiones de la otra empresa', async () => {
  await R.redis.hset('usuarios', { u: { id: 'u', empresa: 'e', rol: 'miembro', email: 'ana@example.com' } });
  await R.redis.set('sesion:otra', 'u'); await R.redis.sadd('sesiones:u', 'otra');
  let soltar, dentro;
  const pausa = new Promise((r) => { soltar = r; });
  const entrada = new Promise((r) => { dentro = r; });
  const alta = A.cambiarUsuario('u', async (x) => {
    dentro(); await pausa;
    return { ...x, empresas: { e: { rol: 'miembro' }, otra: { rol: 'admin' } } };
  });
  await entrada;
  const baja = A.quitarDeEmpresa('u', 'e'); soltar();
  await Promise.all([alta, baja]);
  const u = await R.redis.hget('usuarios', 'u');
  assert.deepEqual(Object.keys(u.empresas), ['otra']);
  assert.equal(await R.redis.get('sesion:otra'), 'u');
});

test('S-05/C1-24: importes no finitos, desbordamientos y fechas inexistentes no pasan los validadores', () => {
  const asiento = { fecha: '2026-10-01', concepto: 'Ajuste', lineas: [{ cuenta: '572', debe: 100 }, { cuenta: '100', haber: 100 }] };
  assert.equal(limpiarAsiento(asiento).error, undefined);
  for (const n of [Infinity, -Infinity, NaN, 'Infinity', '1e309', Number.MAX_VALUE]) {
    assert.equal(limpiarAsiento({ ...asiento, lineas: [{ cuenta: '572', debe: n }, { cuenta: '100', haber: n }] }).status, 400, String(n));
    assert.equal(limpiarCierre({ fecha: '2026-10-01', porIva: [{ pct: 21, total: n }] }).status, 400, String(n));
    assert.equal(calcularDieta({ tipo: 'manutencion', dias: 1, pagado: n }).status, 400, String(n));
  }
  const grande = 1e306;
  assert.equal(limpiarAsiento({ ...asiento, lineas: Array.from({ length: 200 }, (_, i) => ({ cuenta: i % 2 ? '100' : '572', [i % 2 ? 'haber' : 'debe']: grande })) }).status, 400);
  assert.equal(limpiarCierre({ fecha: '2026-10-01', porIva: [{ pct: 0, total: 1e306 }, { pct: 0, total: 1e306 }] }).status, 400);
  assert.equal(limpiarCierre({ fecha: '2026-10-01', porIva: [{ pct: 21, total: 121 }], efectivo: Infinity }).status, 400);
  for (const fecha of ['2026-02-31', '2026-02-29', '2026-13-01']) {
    assert.equal(limpiarAsiento({ ...asiento, fecha }).status, 400);
    assert.equal(limpiarCierre({ fecha, porIva: [{ pct: 21, total: 121 }] }).status, 400);
    assert.equal(venceValido(fecha, '2026-01-01'), undefined);
  }
  assert.equal(venceValido('2028-02-29', '2028-01-01'), '2028-02-29');
});

test('C1-24: Gastos responde 400 si se envía un vencimiento inexistente', async () => {
  const { POST, PATCH } = await cargar('app/api/gastos/route.js', { '@/lib/api': api });
  for (const enviar of [POST, PATCH]) {
    const r = await enviar(req({ id: 'g', fecha: '2026-02-01', vence: '2026-02-31' }));
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /vencimiento real/);
  }
});

test('S-06: limita referencias, filas y celdas antes de expandir la hoja', () => {
  const excel = (xml) => zip([{ nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from(`<worksheet><sheetData>${xml}</sheetData></worksheet>`) }]);
  // ZZZ ya excede el límite sin provocar una reserva grande en una versión vulnerable.
  assert.throws(() => leerHoja(excel('<row r="1"><c r="ZZZ1"><v>1</v></c></row>')), /Divide el archivo/);
  assert.throws(() => leerHoja(excel('<row r="20001"><c r="A20001"><v>1</v></c></row>')), /Divide el archivo/);
  assert.throws(() => leerHoja(excel('<row r="1"><c r="A20001"><v>1</v></c></row>')), /Divide el archivo/);
  assert.throws(() => leerHoja(Buffer.from(Array(201).fill('x').join(';'))), /Divide el archivo/);
  assert.throws(() => leerHoja(Buffer.from('x\n'.repeat(20001))), /Divide el archivo/);
  assert.throws(() => leerHoja(Buffer.from((Array(200).fill('x').join(';') + '\n').repeat(5001))), /Divide el archivo/);
  assert.equal(leerHoja(excel('<row r="20000"><c r="GR20000"><v>1</v></c></row>')).at(-1).length, 200);
});

test('S-07: una tarea push descarta bajas y usa los permisos de su membresía, no los de otra empresa', async () => {
  await guardar('facturas', factura({ fecha: '2026-10-22', vence: '2026-10-22' }));
  const emp = { id: 'e', emisor: {} };
  await R.redis.hset('empresas', { e: emp });
  await R.redis.hset('usuarios', {
    fuera: { id: 'fuera', empresa: 'otra', rol: 'admin' },
    restringido: { id: 'restringido', empresa: 'otra', rol: 'admin', empresas: { otra: { rol: 'admin' }, e: { rol: 'miembro', permisos: [], pv: 2 } } },
    autorizado: { id: 'autorizado', empresa: 'otra', rol: 'miembro', permisos: [], empresas: { otra: { rol: 'miembro', permisos: [] }, e: { rol: 'miembro', permisos: ['facturas'], pv: 2 } } },
  });
  for (const id of ['fuera', 'restringido', 'autorizado']) await R.redis.hset(`push:${id}`, { endpoint: { endpoint: id } });
  await TAREAS['dia-push']({ empresa: 'e', usuarios: ['fuera', 'restringido', 'autorizado'], dia: '2026-10-23' });
  assert.ok(estado.push.length > 0);
  assert.deepEqual([...new Set(estado.push.map((x) => x.sub.endpoint))], ['autorizado']);
});

test('S-08: la tarea y el servicio de recurrentes bloquean el plan caducado antes de emitir o enviar', async () => {
  const plan = { tipo: 'pym', nombre: 'Pro', hasta: '2020-01-01' };
  await R.redis.hset('empresas', { e: { id: 'e', plan } });
  const r = { id: 'r', dia: 1, desde: '2026-10', plantilla: factura(), enviar: true, envios: [{ factura: 'f', periodo: '2026-09', intentos: 0 }] };
  await guardar('recurrentes', r); await guardar('facturas', factura());
  let enviados = 0;
  assert.equal((await REC.procesarRecurrente(estado.u, 'r', '2026-10-23', { enviar: async () => { enviados++; return {}; } })).soloLectura, true);
  assert.deepEqual(await TAREAS['dia-recurrentes']({ empresa: 'e', dia: '2026-10-23' }), { creadas: [] });
  assert.equal(enviados, 0);
  assert.deepEqual(await R.leerUno(estado.u, 'recurrentes', 'r'), r);
  assert.equal((await R.leer(estado.u, 'facturas')).length, 1);
});

test('S-08: envío manual y recurrente comparten cuota; agotarla no consume reintentos', async () => {
  const plan = { tipo: 'pym', nombre: 'Pro', hasta: '2099-12-31' };
  estado.u.plan = plan;
  await R.redis.hset('empresas', { e: { id: 'e', plan } });
  await guardar('facturas', factura());
  await guardar('recurrentes', { id: 'r', activa: false, envios: [{ factura: 'f', periodo: '2026-10', intentos: 0 }] });
  await R.redis.set(`enviar:e:${hoy()}`, 29);
  const envio = modulo(`export const asuntoFactura=()=>''; export const enviarFactura=async()=>({envio:{}});`);
  const { POST } = await cargar('app/api/facturas/enviar/route.js', { '@/lib/api': api, '@/lib/envio': envio });
  const peticion = () => { const r = req({ id: 'f', para: 'cliente@example.com' }); r.nextUrl = new URL(r.url); return r; };
  assert.equal((await POST(peticion())).status, 200);
  let enviados = 0;
  const r = await REC.procesarRecurrente(estado.u, 'r', '2026-10-23', { enviar: async () => { enviados++; return {}; } });
  assert.match(r.falloEnvio, /Durante la prueba puedes enviar 30 facturas/);
  assert.equal(enviados, 0);
  assert.equal((await R.leerUno(estado.u, 'recurrentes', 'r')).envios[0].intentos, 0);
  const respuesta = await POST(peticion());
  assert.equal(respuesta.status, 429);
  assert.equal((await respuesta.json()).error, 'Durante la prueba puedes enviar 30 facturas al día. Inténtalo mañana o elige un plan.');
  await R.redis.set(`enviar:e:${hoy()}`, 0);
  assert.equal((await REC.procesarRecurrente(estado.u, 'r', '2026-10-23', { enviar: async () => { enviados++; return {}; } })).enviada, 'f');
  assert.equal(enviados, 1);
  estado.u.plan = { ...plan, pagado: true };
  await R.redis.set(`enviar:e:${hoy()}`, 200);
  assert.equal((await L.limiteEnvios(estado.u)).error, 'Demasiados envíos por hoy. Inténtalo mañana.');
});

test('S-10: valida el id y limita por token y por IP antes de consultar Stripe', async () => {
  for (const id of ['cs_', 'cs_' + 'a'.repeat(198), 'cs_../ruta', ['cs_valida'], 'otro']) {
    assert.equal(S.sesionPagoValida(id), false);
    assert.ok((await S.leerPago(id, 'acct_1')).error);
    assert.ok((await S.leerPagoPublico(id, 'acct_1', { token: 't', ip: 'i' })).error);
  }
  assert.equal(estado.externas.length, 0);
  for (let i = 0; i < 10; i++) await S.leerPagoPublico(`cs_test_${i}`, 'acct_1', { token: 't', ip: 'i' });
  assert.ok((await S.leerPagoPublico('cs_test_otra', 'acct_1', { token: 't', ip: 'otra' })).error);
  assert.equal(estado.externas.length, 10);
  for (let i = 0; i < 20; i++) await S.leerPagoPublico('cs_test_valida', 'acct_1', { token: `otro-${i}`, ip: 'i' });
  assert.ok((await S.leerPagoPublico('cs_test_valida', 'acct_1', { token: 'ultimo', ip: 'i' })).error);
  assert.equal(estado.externas.length, 30);
  const pagina = await readFile(new URL('../app/pagar/[token]/page.js', import.meta.url), 'utf8');
  assert.match(pagina, /leerPagoPublico\(sesion, cuenta, \{ token, ip: ipDe/);
});

test('S-11: Connect no modifica Billing y los eventos propios siguen funcionando', async () => {
  estado.suscripciones = []; estado.cobros = [];
  const { POST } = await cargar('app/api/stripe/route.js', {
    '@/lib/stripe': modulo(`export const firmaStripe=()=>true; export const stripe=async()=>({id:'sub_propia'});`),
    '@/lib/suscripcion': modulo(`export const aplicarSuscripcion=async(o)=>globalThis.__seguridadDatos.suscripciones.push(o);`),
    '@/lib/cobros': modulo(`export const marcarPagada=async(o)=>globalThis.__seguridadDatos.cobros.push(o);`),
  });
  const evento = async (type, account, object = { id: 'sub_ajena', metadata: { empresa: 'victima' } }) => POST(req({ type, ...(account ? { account } : {}), data: { object } }));
  for (const tipo of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed']) assert.equal((await evento(tipo, 'acct_ajena')).status, 200);
  assert.deepEqual(estado.suscripciones, []);
  assert.deepEqual(estado.cobros, []);
  await evento('customer.subscription.updated');
  assert.equal(estado.suscripciones.length, 1);
  await evento('checkout.session.completed', 'acct_propia', { id: 'cs_test_pagada', mode: 'payment' });
  assert.equal(estado.cobros.length, 1);
});

test('S-12: CSV entrecomilla CR y neutraliza fórmulas, controles y espacios iniciales', async () => {
  const textos = ['Cliente\r=1+1', '=1+1', '+1', '-1+2', '@SUM(1)', '\t=1', '\r=1', '  =1', '\n=1'];
  const filas = textos.map((nombre, i) => factura({ id: `f${i}`, cliente: { nombre }, fecha: '2026-10-01' }));
  estado.filas = filas;
  const { GET } = await cargar('app/api/exportar/route.js', {
    '@/lib/api': api,
    '@/lib/indices': modulo(`export const leerRango=async()=>globalThis.__seguridadDatos.filas;`),
    '@/lib/auditoria': modulo(`export const auditar=async()=>{};`),
  });
  const r = new Request('http://fisquo.test/api/exportar?anio=2026'); r.nextUrl = new URL(r.url);
  const csv = await (await GET(r)).text();
  assert.ok(csv.includes('"Cliente\r=1+1"'));
  for (const t of textos.slice(1)) assert.ok(csv.includes(`'${t}`), JSON.stringify(t));
  // Los importes negativos (rectificativas) siguen siendo números para Excel.
  estado.filas = [factura({ id: 'r', cliente: { nombre: 'Ana' }, fecha: '2026-10-01', base: -100, ivaPct: 21 })];
  const otro = await (await GET(r)).text();
  assert.ok(otro.includes(';-100,00;') && !otro.includes("'-100,00"), otro);
});

test('C1-07: una cuota conciliada deja de estar pendiente y deshacer restaura su estado', async () => {
  const { idCuota } = await import('../lib/cuotas.js');
  const id = idCuota('2026-10');
  await guardar('gastos', gasto({ id, pendiente: true })); await guardar('banco', movimiento());
  assert.equal((await B.contabilizar(estado.u, 'm', 'cuota')).ok, true);
  assert.equal((await R.leerUno(estado.u, 'gastos', id)).pendiente, undefined);
  assert.equal((await R.leerUno(estado.u, 'gastos', id)).pagado, '2026-10-01');
  assert.equal((await B.deshacer(estado.u, 'm')).ok, true);
  assert.equal((await R.leerUno(estado.u, 'gastos', id)).pendiente, true);
});

test('C1-15/C1-21: proveedor y número distinguen gastos y se reconocen las cabeceras habituales', () => {
  const cab = ['Fecha', 'Concepto', 'Proveedor', 'Base', '% IVA', 'Número factura'];
  const fila = ['2026-10-01', 'Material', 'Proveedor A', 100, 21, 'A-123'];
  const p = previa('gastos', [cab, fila, [...fila.slice(0, 2), 'Proveedor B', 100, 21, 'A-123'], [...fila.slice(0, 5), 'A-124'], fila]);
  assert.deepEqual(p.items.map((x) => x.estado), ['nuevo', 'nuevo', 'nuevo', 'duplicado']);
  assert.equal(p.items[0].datos.numero, 'A-123');
  for (const titulo of ['Número factura', 'Nº factura', 'Factura', 'Num. factura']) {
    const q = previa('gastos', [[...cab.slice(0, 5), titulo], fila]);
    assert.equal(q.items[0].datos.numero, 'A-123', titulo);
  }
  // Lo ya apuntado sin número, sin proveedor o con el proveedor escrito de otra forma sigue siendo el mismo gasto.
  const ya = [{ fecha: '2026-10-01', concepto: 'Material', base: 100, ivaPct: 21, proveedor: 'Proveedor A, S.L.', proveedorNif: 'B12345678' }];
  const r = previa('gastos', [cab, fila, [...fila.slice(0, 2), '', 100, 21, ''], [...fila.slice(0, 2), 'Proveedor B', 100, 21, '']], ya);
  assert.deepEqual(r.items.map((x) => x.estado), ['duplicado', 'duplicado', 'nuevo']);
  // Mismo número de factura del mismo proveedor: el mismo gasto aunque cambie el importe.
  const otroImporte = previa('gastos', [cab, [...fila.slice(0, 3), 99, 21, 'A 123']], [{ fecha: '2026-10-01', concepto: 'Otra cosa', base: 100, ivaPct: 21, proveedor: 'Proveedor A', numero: 'A-123' }]);
  assert.equal(otroImporte.items[0].estado, 'duplicado');
});

test('C1-16: paréntesis significan cargo; un signo ambiguo se rechaza', () => {
  const tabla = (importe) => [['Fecha', 'Importe'], ['2026-10-01', importe]];
  assert.equal(leerTablaBanco(tabla('(100,00)')).movimientos[0].importe, -100);
  assert.equal(leerTablaBanco(tabla('(1.234,50)')).movimientos[0].importe, -1234.5);
  assert.equal(leerTablaBanco(tabla('-100,00')).movimientos[0].importe, -100);
  assert.equal(leerTablaBanco(tabla('-1.234,50')).movimientos[0].importe, -1234.5);
  for (const n of ['(-100,00)', '(+100,00)', '100,00-', '(100,00', '1-00', '100 CR']) assert.match(leerTablaBanco(tabla(n)).error, /ambiguo|no válido/i, n);
  assert.match(leerTablaBanco([['Fecha', 'Cargo', 'Abono'], ['2026-10-01', 100, 100]]).error, /ambiguo/);
});

test('C1-19: Stripe guarda la fecha contable de Madrid, también al cambiar de trimestre', async (t) => {
  for (const [instante, fecha] of [['2026-10-22T22:30:00Z', '2026-10-23'], ['2026-03-31T22:30:00Z', '2026-04-01']]) {
    await guardar('facturas', factura({ pago: 'token' }));
    await R.redis.hset('empresas', { e: { id: 'e' } });
    await R.redis.hset('factura-pagos', { token: { empresa: 'e', id: 'f' } });
    t.mock.timers.enable({ apis: ['Date'], now: new Date(instante) });
    try {
      const r = await C.marcarPagada({ id: `cs_${fecha}`, payment_status: 'paid', amount_total: 10000, currency: 'eur', metadata: { token: 'token', factura: 'f', empresa: 'e' } });
      assert.equal(r.aplicado, true);
      const f = await R.leerUno(estado.u, 'facturas', 'f');
      assert.equal(f.pagos[0].fecha, fecha);
      assert.equal(f.cobro.fecha, fecha);
    } finally { t.mock.timers.reset(); }
  }
});
