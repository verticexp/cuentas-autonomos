// Rutas reales y Redis en memoria: sin puertos ni envíos externos.
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';

const base = crearBase();
const estado = { cookies: new Map(), headers: new Headers() };
globalThis.__robustezApi = estado;
const urlRedis = 'http://redis-robustez.test';
const fetchAnterior = globalThis.fetch;
const env = Object.fromEntries(['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'HIBP', 'BLOQUEO_SERVIDOR', 'VERCEL_ENV'].map((k) => [k, process.env[k]]));
const modulos = new Map();
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
let A, R, API;

async function cargar(archivo) {
  if (modulos.has(archivo)) return import(modulos.get(archivo));
  let fuente = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8');
  fuente = fuente.replace(/import \{([^}]+)\} from '([^']+)';/g, (_, nombres, origen) => {
    let destino;
    const lib = origen.match(/^(?:@\/lib\/|\.\/)([^/]+?)(?:\.js)?$/)?.[1];
    if (['auth', 'api'].includes(lib)) destino = modulos.get(`lib/${lib}.js`);
    else if (origen === 'react') destino = modulo('export const cache = (fn) => fn;');
    else if (origen === 'next/headers') destino = modulo(`const s=globalThis.__robustezApi; export const cookies=async()=>({get:(k)=>s.cookies.has(k)?{value:s.cookies.get(k)}:undefined,set:(k,v)=>s.cookies.set(k,v)}); export const headers=async()=>s.headers;`);
    else if (origen === 'next/server') destino = modulo('export const NextResponse = { redirect:(url,status=307)=>new Response(null,{status,headers:{location:url}}),json:Response.json };');
    else if (lib && ['auditoria', 'push', 'invitacion', 'stockServidor', 'pdf', 'pdfAlbaran', 'cuentasAnualesPdf', 'documento', 'portal', 'stripe', 'cobros', 'correos'].includes(lib)) {
      destino = modulo(nombres.split(',').map((x) => `export const ${x.trim()}=(...a)=>globalThis.__robustezApi[${JSON.stringify(x.trim())}](...a);`).join('\n'));
    } else if (lib) destino = new URL(`../lib/${lib}.js`, import.meta.url).href;
    else destino = import.meta.resolve(origen === 'next/navigation' ? 'next/navigation.js' : origen);
    assert.ok(destino, origen);
    return `import {${nombres}} from '${destino}';`;
  });
  const url = modulo(fuente);
  modulos.set(archivo, url);
  return import(url);
}

before(async () => {
  process.env.KV_REST_API_URL = urlRedis;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  process.env.HIBP = 'off';
  delete process.env.VERCEL_ENV;
  globalThis.fetch = async (url, opciones) => {
    assert.ok(String(url).startsWith(urlRedis), 'No se permite red externa');
    const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
    const uno = (cmd) => {
      estado.comandos.push(cmd);
      const r = base.run(cmd);
      return { result: new Headers(opciones.headers).get('upstash-encoding') === 'base64' ? b64(r) : r };
    };
    const j = JSON.parse(opciones.body);
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  R = await import('../lib/redis.js');
  A = await cargar('lib/auth.js');
  API = await cargar('lib/api.js');
});
beforeEach(() => {
  base.run(['flushdb']); estado.cookies.clear(); estado.headers = new Headers(); estado.comandos = [];
  estado.emails = 0; estado.avisos = 0; estado.pdf = 0; estado.stock = 0;
  process.env.LIMITES = 'activo'; process.env.BLOQUEO_SERVIDOR = 'activo';
  Object.assign(estado, {
    auditar: async () => {}, pushListo: () => true, clavePublica: () => 'publica',
    enviarPush: async () => { estado.avisos++; return 1; },
    enviarInvitacion: async () => { estado.emails++; return { enviado: true }; },
    enviarConfirmacion: async () => { estado.emails++; },
    enviarCorreo: async () => { estado.emails++; return {}; },
    datosStock: async () => { estado.stock++; return { productos: [{ id: 'p', nombre: 'Producto' }] }; },
    identidadDoc: async () => ({ emisor: { nombre: 'Empresa', nif: 'B12345674', direccion: 'C/ Uno, 1', iban: 'ES1' } }),
    facturaPdf: async () => { estado.pdf++; return Buffer.from('%PDF-prueba'); },
    albaranPdf: async () => { estado.pdf++; return Buffer.from('%PDF-prueba'); },
    cuentasAnualesPdf: async () => { estado.pdf++; return Buffer.from('%PDF-prueba'); },
    nombreArchivo: () => 'albaran.pdf',
    portalDe: async () => { throw new Error('No debe leerse el portal con un formulario inválido'); },
    facturaDePago: async () => { throw new Error('No debe leerse la factura con un formulario inválido'); },
    cobroFacturasListo: () => true,
  });
});
after(() => {
  globalThis.fetch = fetchAnterior; delete globalThis.__robustezApi;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

const req = (ruta, b, method = 'POST') => Object.assign(new Request(`http://fisquo.test${ruta}`, {
  method, headers: { 'content-type': 'application/json', 'x-real-ip': '1.2.3.4' },
  ...(b === undefined ? {} : { body: typeof b === 'string' ? b : JSON.stringify(b) }),
}), { nextUrl: new URL(`http://fisquo.test${ruta}`) });
async function usuario(id = 'u', empresa = 'e') {
  const u = { id, empresa, rol: 'admin', nombre: 'Prueba', email: `${id}@example.test`, bloqueoPantalla: false };
  await R.redis.hset('usuarios', { [id]: u });
  await R.redis.hset('emails', { [u.email]: id });
  await R.redis.hset('empresas', { [empresa]: { id: empresa, nombre: 'Empresa', emisor: {}, fiscal: { tipo: 'autonomo' } } });
  const t = await A.crearSesion(id); estado.cookies.set('t', t);
  return u;
}
async function rechaza(r, patron) {
  assert.equal(r.status, 400, await r.clone().text());
  assert.match((await r.json()).error, patron);
}
const empleado = { nombre: 'Ana', bruto: '1.500,50', alta: '2026-01-01' };
const sub = (i) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${i}`, keys: { p256dh: 'clave', auth: 'auth' } });

test('cuerpo: null, array, número, texto y JSON inválido se convierten en un objeto vacío', async () => {
  for (const b of ['null', '[]', '[{"id":1}]', '123', '"texto"', 'true', '{']) assert.deepEqual(await API.cuerpo(req('/api', b)), {});
  const b = { nombre: 'Ana', lineas: [{ cantidad: 2 }] };
  assert.deepEqual(await API.cuerpo(req('/api', b)), b);
  assert.deepEqual(await API.cuerpo({ json: async () => new Date() }), {});
});

test('formularios ilegibles: 400 (el login de un navegador vuelve a su pantalla con el error)', async () => {
  for (const ruta of ['login', 'invitacion', 'pagar', 'portal/pagar']) {
    const { POST } = await cargar(`app/api/${ruta}/route.js`);
    for (const json of [true, false]) {
      const r = await POST(new Request(`http://fisquo.test/api/${ruta}`, { method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=roto', accept: json ? 'application/json, */*' : 'text/html' }, body: 'formulario roto' }));
      if (json || ruta !== 'login') await rechaza(r, /formulario/);
      else { assert.equal(r.status, 303); assert.match(r.headers.get('location'), /\/login\?error=/); }
    }
  }
  assert.equal(estado.emails, 0);
});

test('invitación: el límite por IP va antes de comprobar el código, vuelve a la misma invitación y la codifica', async () => {
  const { POST } = await cargar('app/api/invitacion/route.js');
  await R.redis.set('limite:invitacion:1.2.3.4', 30);
  const conLimite = new FormData(); conLimite.set('codigo', 'abc/def'); conLimite.set('password', 'Clave!Segura987');
  estado.aceptarInvitacion = () => { throw new Error('Con el límite superado no se comprueba el código'); };
  const r = await POST(Object.assign(new Request('http://fisquo.test/api/invitacion', { method: 'POST', headers: { 'x-real-ip': '1.2.3.4' }, body: conLimite })));
  assert.equal(r.status, 303); assert.match(decodeURIComponent(r.headers.get('location')), /Demasiados/);
  assert.equal(new URL(r.headers.get('location')).pathname, `/invitacion/${encodeURIComponent('abc/def')}`);
  delete estado.aceptarInvitacion;
  await R.redis.del('limite:invitacion:1.2.3.4');
  const codigo = 'no/existe?otro=1#fragmento';
  const form = new FormData(); form.set('codigo', codigo); form.set('password', 'Clave!Segura987');
  const fallo = await POST(new Request('http://fisquo.test/api/invitacion', { method: 'POST', body: form }));
  assert.equal(fallo.status, 303);
  assert.equal(new URL(fallo.headers.get('location')).pathname, `/invitacion/${encodeURIComponent(codigo)}`);
});

test('contacto: null y array no rompen antes del límite', async () => {
  const { POST } = await cargar('app/api/contacto/route.js');
  for (const b of ['null', '[]', '42']) await rechaza(await POST(req('/api/contacto', b)), /nombre/);
  assert.equal(estado.emails, 0);
});

test('empleados: rechaza bruto negativo, 1e309, texto, tipos y valores fuera del tope', async () => {
  const u = await usuario(); const { POST, PATCH } = await cargar('app/api/empleados/route.js');
  for (const bruto of [-1000, 'no es un sueldo', '12 euros', true, [], {}, null, 0, 1000000.01, '1e309']) {
    await rechaza(await POST(req('/api/empleados', { ...empleado, bruto })), /sueldo bruto/);
  }
  await rechaza(await POST(req('/api/empleados', '{"nombre":"Ana","alta":"2026-01-01","bruto":1e309}')), /sueldo bruto/);
  assert.deepEqual(await R.leer(u, 'empleados'), []);
  let r = await POST(req('/api/empleados', { ...empleado, precioHoraExtra: '15,50' }));
  assert.equal(r.status, 200); const e = (await r.json()).empleado;
  assert.equal(e.bruto, 1500.5); assert.equal(e.precioHoraExtra, 15.5);
  for (const precioHoraExtra of [-1, 'Infinity', 'mal', true, 1000000.01]) {
    await rechaza(await PATCH(req('/api/empleados', { ...empleado, id: e.id, precioHoraExtra }, 'PATCH')), /hora extra/);
  }
  await rechaza(await PATCH(req('/api/empleados', { ...empleado, id: e.id, bruto: -1 }, 'PATCH')), /sueldo bruto/);
  assert.equal((await R.leerUno(u, 'empleados', e.id)).precioHoraExtra, 15.5);
});

test('cuotas: rechaza importes negativos, infinitos y texto; conserva el importe local válido', async () => {
  const u = await usuario(); const { POST } = await cargar('app/api/gastos/cuotas/route.js');
  const desde = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 7);
  for (const importe of [-300, 'Infinity', 'mal', true, [], null, 1000000.01]) await rechaza(await POST(req('/api/gastos/cuotas', { importe, desde })), /cuota/);
  assert.deepEqual(await R.leer(u, 'gastos'), []);
  assert.equal((await POST(req('/api/gastos/cuotas', { importe: '300,50', desde }))).status, 200);
  assert.equal((await R.leer(u, 'gastos'))[0].base, 300.5);
});

test('productos: valida precio, coste, cantidades e IVA antes de guardar', async () => {
  const u = await usuario(); const { POST } = await cargar('app/api/productos/route.js');
  for (const [campo, valor] of [['precio', -1], ['precio', 'Infinity'], ['precio', '20 euros'], ['precio', 1000000001], ['coste', -1], ['coste', true], ['coste', 1000000001], ['minimo', -1], ['maximo', 1000001], ['maximo', {}], ['ivaPct', 'mal'], ['ivaPct', 101]]) {
    await rechaza(await POST(req('/api/productos', { nombre: 'Producto', precio: 20, [campo]: valor })), /Escribe/);
  }
  assert.deepEqual(await R.leer(u, 'productos'), []);
  const r = await POST(req('/api/productos', { nombre: 'Producto', precio: '25,50', coste: '12,50', minimo: '2,50', maximo: '100', ivaPct: 21 }));
  assert.equal(r.status, 200); const p = (await r.json()).producto;
  assert.deepEqual([p.precio, p.coste, p.minimo, p.maximo, p.ivaPct], [25.5, 12.5, 2.5, 100, 21]);
});

test('inventario: valida antes de cargar stock y conserva las salidas con signo', async () => {
  const u = await usuario(); const { POST } = await cargar('app/api/inventario/route.js');
  for (const extra of [{ cantidad: 'Infinity' }, { cantidad: 'mal' }, { cantidad: true }, { cantidad: 1000001 }, { cantidad: -1, motivo: 'recuento' }, { cantidad: -1, motivo: 'inicial' }, { coste: -1 }, { coste: 'Infinity' }, { coste: 1000000001 }]) {
    await rechaza(await POST(req('/api/inventario', { producto: 'p', cantidad: 1, ...extra })), /Escribe/);
  }
  assert.equal(estado.stock, 0); assert.deepEqual(await R.leer(u, 'stock'), []);
  for (const cantidad of ['2,5', '-2,5']) {
    const r = await POST(req('/api/inventario', { producto: 'p', motivo: 'consumo', cantidad }));
    assert.equal(r.status, 200); assert.equal((await r.json()).ajuste.cantidad, -2.5);
  }
  const r = await POST(req('/api/inventario', { producto: 'p', motivo: 'inicial', cantidad: '2,5', coste: '12,50' }));
  assert.equal(r.status, 200); assert.equal((await r.json()).ajuste.coste, 12.5);
});

test('asientos: rechaza 201 líneas antes de recorrerlas y permite exactamente 200', async () => {
  const u = await usuario(); const { POST } = await cargar('app/api/asientos/route.js');
  await rechaza(await POST(req('/api/asientos', { lineas: Array(201).fill(null) })), /200 líneas/);
  await rechaza(await POST(req('/api/asientos', { personal: { otros: Array(201).fill(null) } })), /200 líneas/);
  await rechaza(await POST(req('/api/asientos', { personal: { fecha: '2026-01-01', sueldos: 1000, ssEmpresa: 100, irpf: 100, ssTrabajador: 50,
    otros: Array.from({ length: 196 }, (_, i) => ({ cuenta: `641${String(i).padStart(3, '0')}`, importe: 1 })) } })), /200 líneas/);
  assert.deepEqual(await R.leer(u, 'asientos'), []);
  const lineas = Array.from({ length: 200 }, (_, i) => ({ cuenta: i % 2 ? '572' : '430', debe: i % 2 ? 0 : 1, haber: i % 2 ? 1 : 0 }));
  const r = await POST(req('/api/asientos', { fecha: '2026-01-01', concepto: 'Ajuste', lineas }));
  assert.equal(r.status, 200); assert.equal((await r.json()).asiento.lineas.length, 200);
});

test('remesas: rechaza más de 1.000 ids y tipos o longitudes inválidos antes de leer documentos', async () => {
  await usuario(); const { POST } = await cargar('app/api/remesas/route.js');
  for (const accion of ['cobros', 'pagos']) {
    for (const ids of [Array(1001).fill('f'), ['x'.repeat(81)], [12], [''], [null]]) {
      estado.comandos = [];
      await rechaza(await POST(req('/api/remesas', { accion, fecha: '2099-01-01', [accion === 'cobros' ? 'facturas' : 'gastos']: ids })), /1.000|identificador/);
      assert.ok(!estado.comandos.some((c) => c.some((v) => typeof v === 'string' && /(?:facturas|gastos|domiciliaciones|cuentasProv):/.test(v))));
    }
  }
});

test('push: rechaza la undécima suscripción, permite actualizar y libera la plaza al borrar', async () => {
  await usuario(); const ruta = await cargar('app/api/push/route.js');
  for (let i = 0; i < 10; i++) assert.equal((await ruta.POST(req('/api/push', { sub: sub(i) }))).status, 200);
  await rechaza(await ruta.POST(req('/api/push', { sub: sub(10) })), /10 dispositivos/);
  assert.equal(await R.redis.hlen('push:u'), 10);
  assert.equal((await ruta.POST(req('/api/push', { sub: { ...sub(0), keys: { p256dh: 'nueva', auth: 'otra' } } }))).status, 200);
  assert.equal((await R.redis.hget('push:u', sub(0).endpoint)).keys.p256dh, 'nueva');
  assert.equal((await ruta.DELETE(req('/api/push', { endpoint: sub(0).endpoint }, 'DELETE'))).status, 200);
  assert.equal((await ruta.POST(req('/api/push', { sub: sub(10) }))).status, 200);
  await usuario('otro');
  assert.equal((await ruta.POST(req('/api/push', { sub: sub(10) }))).status, 200);
});

test('push: dos altas simultáneas no superan diez suscripciones', async () => {
  await usuario(); const ruta = await cargar('app/api/push/route.js');
  for (let i = 0; i < 9; i++) await R.redis.hset('push:u', { [sub(i).endpoint]: sub(i) });
  const rs = await Promise.all([9, 10].map((i) => ruta.POST(req('/api/push', { sub: sub(i) }))));
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 400]);
  assert.equal(await R.redis.hlen('push:u'), 10);
});

test('push: como mucho cinco avisos de prueba en diez minutos por persona', async () => {
  await usuario(); const { POST } = await cargar('app/api/push/route.js');
  for (let i = 0; i < 5; i++) assert.equal((await POST(req('/api/push', { prueba: true }))).status, 200);
  const r = await POST(req('/api/push', { prueba: true }));
  assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '600'); assert.match((await r.json()).error, /10 minutos/);
  assert.equal(estado.avisos, 5);
  await usuario('otro'); assert.equal((await POST(req('/api/push', { prueba: true }))).status, 200);
});

test('usuarios: reenviar admite diez por hora y empresa, sin cambiar códigos al agotarse', async () => {
  await usuario(); const { POST } = await cargar('app/api/usuarios/route.js');
  await R.redis.hset('usuarios', { pendiente: { id: 'pendiente', empresa: 'e', nombre: 'Pendiente', email: 'pendiente@example.test', rol: 'miembro' } });
  for (let i = 0; i < 10; i++) assert.equal((await POST(req('/api/usuarios', { reenviar: 'pendiente' }))).status, 200);
  const antes = await R.redis.hgetall('invitaciones');
  await usuario('otroAdmin');
  const r = await POST(req('/api/usuarios', { reenviar: 'pendiente' }));
  assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '3600'); assert.match((await r.json()).error, /una hora/);
  assert.equal(estado.emails, 10); assert.deepEqual(await R.redis.hgetall('invitaciones'), antes);
  await usuario('otraEmpresa', 'otra');
  await R.redis.hset('usuarios', { nueva: { id: 'nueva', empresa: 'otra', nombre: 'Otra', email: 'otra@example.test' } });
  assert.equal((await POST(req('/api/usuarios', { reenviar: 'nueva' }))).status, 200);
});

test('usuarios: crear invitaciones admite treinta por hora y empresa', async () => {
  await usuario(); const { POST } = await cargar('app/api/usuarios/route.js');
  for (let i = 0; i < 30; i++) assert.equal((await POST(req('/api/usuarios', { nombre: `Persona ${i}`, email: `persona${i}@example.test` }))).status, 200);
  const antes = await R.redis.hgetall('usuarios');
  const r = await POST(req('/api/usuarios', { nombre: 'Extra', email: 'extra@example.test' }));
  assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '3600');
  assert.equal(estado.emails, 30); assert.deepEqual(await R.redis.hgetall('usuarios'), antes);
});

test('PDF: facturas, albaranes y cuentas anuales comparten 120 descargas por persona cada diez minutos', async () => {
  const u = await usuario();
  await R.guardar(u, 'facturas', { id: 'f', numero: 1, fecha: '2026-01-01', cliente: { nombre: 'Cliente' }, base: 100, ivaPct: 21 });
  await R.guardar(u, 'albaranes', { id: 'a', tipo: 'albaran', fecha: '2026-01-01', lineas: [] });
  const rutas = await Promise.all(['facturas/pdf', 'albaranes/pdf', 'cuentas-anuales'].map(async (ruta) => ({ ruta, GET: (await cargar(`app/api/${ruta}/route.js`)).GET })));
  await R.redis.set('limite:pdf:u', 117);
  for (const { ruta, GET } of rutas) {
    const r = await GET(req(`/api/${ruta}?id=${ruta === 'facturas/pdf' ? 'f' : 'a'}&anio=2026`, undefined, 'GET'));
    assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
  }
  assert.equal(estado.pdf, 3);
  for (const { ruta, GET } of rutas) {
    estado.comandos = [];
    const r = await GET(req(`/api/${ruta}?id=f`, undefined, 'GET'));
    assert.equal(r.status, 429); assert.equal(r.headers.get('retry-after'), '600'); assert.match((await r.json()).error, /10 minutos/);
    assert.ok(!estado.comandos.some((c) => c.some((v) => typeof v === 'string' && /(?:facturas|gastos|albaranes|asientos):/.test(v))));
  }
  assert.equal(estado.pdf, 3);
  await usuario('otraPersona');
  assert.equal((await rutas[0].GET(req('/api/facturas/pdf?id=f', undefined, 'GET'))).status, 200);
});
