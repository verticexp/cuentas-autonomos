// Auditoría completa (21-10-2026): permisos del paquete de la gestoría y de adónde se envían los datos, carreras al
// numerar presupuestos, generar nóminas y facturar señal y resto, mensajes de correo, nombres de archivo y cámara.
// Rutas reales con Redis simulado sin abrir puertos (mismo método que tests/seguridad-auditoria.test.mjs).
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';
import { motivoEnvio } from '../lib/email.js';
import { nombreArchivoDoc } from '../lib/formato.js';
import config from '../next.config.mjs';

const base = crearBase();
// peticion: cookies y cabeceras propias de una petición (dos personas a la vez); sin ella, las de `estado`.
const estado = { cookies: new Map(), headers: new Headers(), peticion: new AsyncLocalStorage() };
globalThis.__auditoriaCompleta = estado;
const urlRedis = 'http://redis-auditoria-completa.test';
const fetchAnterior = globalThis.fetch;
const env = Object.fromEntries(['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'HIBP', 'BLOQUEO_SERVIDOR', 'VERCEL_ENV'].map((k) => [k, process.env[k]]));
let A, R;
const modulos = new Map();
const modulo = (s) => `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
// Lo que se sustituye por un doble en estas pruebas (lo demás es el código real).
const DOBLES = ['facturas', 'auditoria', 'gestoriaEnvio', 'trabajos'];

async function cargar(archivo) {
  if (modulos.has(archivo)) return import(modulos.get(archivo));
  let fuente = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8');
  fuente = fuente.replace(/import \{([^}]+)\} from '([^']+)';/g, (_, nombres, origen) => {
    let destino;
    const lib = origen.match(/^(?:@\/lib\/|\.\/)([^/]+?)(?:\.js)?$/)?.[1];
    if (lib === 'auth') destino = modulos.get('lib/auth.js');
    else if (lib === 'api') destino = modulos.get('lib/api.js');
    else if (origen === 'react') destino = modulo('export const cache = (fn) => fn;');
    else if (['next/headers', 'next/headers.js'].includes(origen)) destino = modulo('const s=globalThis.__auditoriaCompleta; const p=()=>s.peticion.getStore()||s; export const cookies=async()=>{const c=p().cookies; return {get:(k)=>c.has(k)?{value:c.get(k)}:undefined,set:(k,v)=>c.set(k,v)};}; export const headers=async()=>p().headers;');
    else if (origen === 'next/server') destino = modulo('export const NextResponse = { redirect:(url,status=307)=>new Response(null,{status,headers:{location:url}}),json:Response.json }; export const after = () => {};');
    // Un módulo de lib/ ya cargado con este método (con sus dobles), p. ej. presupuestosServidor.
    else if (lib && modulos.has(`lib/${lib}.js`)) destino = modulos.get(`lib/${lib}.js`);
    else if (lib && DOBLES.includes(lib)) destino = modulo(nombres.split(',').map((x) => `export const ${x.trim()}=(...a)=>globalThis.__auditoriaCompleta[${JSON.stringify(x.trim())}](...a);`).join('\n'));
    else if (lib) destino = new URL(`../lib/${lib}.js`, import.meta.url).href;
    else destino = import.meta.resolve(origen === 'next/navigation' ? 'next/navigation.js' : origen);
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
    if (!String(url).startsWith(urlRedis)) throw new Error('Red externa no permitida en esta prueba');
    const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
    const uno = (cmd) => {
      const result = base.run(cmd);
      return { result: new Headers(opciones.headers).get('upstash-encoding') === 'base64' ? b64(result) : result };
    };
    const j = JSON.parse(opciones.body);
    // Las peticiones se intercalan como en Upstash: cada una espera un poco (las carreras se ven).
    await new Promise((ok) => setTimeout(ok, 1));
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  R = await import('../lib/redis.js');
  A = await cargar('lib/auth.js');
  await cargar('lib/api.js');
});
beforeEach(() => {
  base.run(['flushdb']); estado.cookies.clear(); estado.headers = new Headers();
  process.env.LIMITES = 'activo'; process.env.BLOQUEO_SERVIDOR = 'off';
  Object.assign(estado, { auditar: async () => {}, secundarios: async () => {}, enviarPaqueteGestoria: async () => ({ ok: true, para: 'g@x.test' }) });
});
after(() => {
  globalThis.fetch = fetchAnterior; delete globalThis.__auditoriaCompleta;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

const req = (ruta, b, method = 'POST') => Object.assign(new Request(`http://fisquo.test${ruta}`, {
  method, headers: { 'content-type': 'application/json', 'x-real-ip': '1.2.3.4' }, ...(b === undefined ? {} : { body: JSON.stringify(b) }),
}), { nextUrl: new URL(`http://fisquo.test${ruta}`) });
const ACT = [{ id: 'eventos', nombre: 'Eventos', serie: '', ivaPct: 21, irpfPct: 0 }];
async function entrar({ rol = 'admin', permisos, pv } = {}) {
  const u = { id: 'u', empresa: 'e', rol, ...(permisos ? { permisos } : {}), ...(pv ? { pv } : {}), nombre: 'Prueba', email: 'prueba@example.test', creado: new Date().toISOString() };
  await R.redis.hset('usuarios', { u }); await R.redis.hset('emails', { [u.email]: u.id });
  await R.redis.hset('empresas', { e: { id: 'e', nombre: 'Empresa', emisor: { nombre: 'EMPRESA SL', nif: 'B12345674' }, actividades: ACT, fiscal: { tipo: 'sociedad', iva: 'general' } } });
  estado.cookies.set('t', await A.crearSesion(u.id));
  return u;
}
const ruta = (r, m) => { estado.headers = new Headers({ 'x-ruta': r, 'x-metodo': m }); };

test('paquete: mandarlo a la gestoría exige, además de «Datos de la empresa», poder ver facturas y gastos', async () => {
  const p = await cargar('app/api/paquete/route.js');
  await entrar({ rol: 'miembro', permisos: ['empresa'] }); ruta('/api/paquete', 'POST');
  assert.equal((await p.POST(req('/api/paquete', { anio: 2026, t: 3 }))).status, 403);
  await entrar({ rol: 'miembro', permisos: ['empresa', 'resumen', 'facturas', 'gastos'] });
  assert.equal((await p.POST(req('/api/paquete', { anio: 2026, t: 3 }))).status, 200);
});

test('gestoría y Google Drive: elegir adónde se envían los datos exige poder verlos', async () => {
  const c = await cargar('app/api/cuenta/route.js');
  await entrar({ rol: 'miembro', permisos: ['empresa'] }); ruta('/api/cuenta', 'PATCH');
  const gestoria = { gestoria: { nombre: 'Yo', email: 'yo@example.test', auto: true } };
  const drive = { drive: { url: 'https://script.google.com/macros/s/abc/exec', token: 'x' } };
  assert.equal((await c.PATCH(req('/api/cuenta', gestoria, 'PATCH'))).status, 403);
  assert.equal((await c.PATCH(req('/api/cuenta', drive, 'PATCH'))).status, 403);
  assert.equal((await R.redis.hget('empresas', 'e')).gestoria, undefined);
  await entrar({ rol: 'miembro', permisos: ['empresa', 'resumen', 'facturas', 'gastos'] });
  assert.equal((await c.PATCH(req('/api/cuenta', gestoria, 'PATCH'))).status, 200);
  assert.equal((await R.redis.hget('empresas', 'e')).gestoria.email, 'yo@example.test');
});

test('presupuestos: dos a la vez tienen números distintos y ninguno pisa al otro', async () => {
  const p = await cargar('app/api/presupuestos/route.js');
  await entrar(); ruta('/api/presupuestos', 'POST');
  const datos = (n) => ({ fecha: '2026-10-21', actividad: 'eventos', cliente: { nombre: `Cliente ${n}` }, concepto: `Servicio ${n}`, base: '100', ivaPct: 21, irpfPct: 0 });
  estado.limpiar = (b) => ({ fecha: b.fecha, actividad: b.actividad, cliente: b.cliente, concepto: b.concepto, base: Number(b.base), ivaPct: 21, irpfPct: 0 });
  estado.guardarCliente = async () => {};
  const rs = await Promise.all([1, 2, 3].map((n) => p.POST(req('/api/presupuestos', datos(n)))));
  const ids = await Promise.all(rs.map(async (r) => (await r.json()).presupuesto.id));
  assert.equal(new Set(ids).size, 3, ids.join());
  const guardados = Object.values((await R.redis.hgetall('presupuestos:e')) || {});
  assert.deepEqual(guardados.map((x) => x.concepto).sort(), ['Servicio 1', 'Servicio 2', 'Servicio 3']);
});

test('presupuestos: señal y resto a la vez no facturan más que el presupuesto', async () => {
  await cargar('lib/presupuestosServidor.js'); // factura con el doble de crearFactura
  const f = await cargar('app/api/presupuestos/facturar/route.js');
  await entrar(); ruta('/api/presupuestos/facturar', 'POST');
  await R.redis.hset('presupuestos:e', { 'P2026-1': { id: 'P2026-1', numero: 1, anio: 2026, serie: 'P', fecha: '2026-10-01', validez: 90, actividad: 'eventos', cliente: { nombre: 'Cliente' }, concepto: 'Boda', base: 100, ivaPct: 21, irpfPct: 0, senalPct: 30, estado: 'aceptado', facturas: [] } });
  let n = 0;
  const bases = [];
  estado.crearFactura = async (_u, datos) => {
    bases.push(datos.base);
    await new Promise((ok) => setTimeout(ok, 30)); // la emisión tarda: la otra petición tendría tiempo de leer
    return { factura: { id: `2026-${++n}`, numero: n, anio: 2026, serie: '', fecha: datos.fecha, base: datos.base } };
  };
  const rs = await Promise.all([f.POST(req('/api/presupuestos/facturar', { id: 'P2026-1', tipo: 'senal' })), f.POST(req('/api/presupuestos/facturar', { id: 'P2026-1', tipo: 'resto' }))]);
  assert.deepEqual(rs.map((r) => r.status), [200, 200]);
  assert.equal(bases.reduce((s, x) => s + x, 0), 100, `bases facturadas: ${bases.join(' + ')}`);
  const p = await R.redis.hget('presupuestos:e', 'P2026-1');
  assert.deepEqual(p.facturas.map((x) => x.tipo).sort(), ['resto', 'senal']);
});

test('nóminas: dos «Generar» a la vez no duplican nóminas ni gastos', async () => {
  const r = await cargar('app/api/nominas/route.js');
  await entrar(); ruta('/api/nominas', 'POST');
  await R.redis.hset('empleados:e', { e1: { id: 'e1', nombre: 'Ana', alta: '2026-01-01', baja: '', bruto: 1500, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 }, e2: { id: 'e2', nombre: 'Bea', alta: '2026-01-01', baja: '', bruto: 1800, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 } });
  const rs = await Promise.all([r.POST(req('/api/nominas', { mes: '2026-10' })), r.POST(req('/api/nominas', { mes: '2026-10' }))]);
  assert.deepEqual(rs.map((x) => x.status), [200, 200]);
  const nominas = Object.values((await R.redis.hgetall('nominas:e')) || {});
  assert.deepEqual(nominas.map((x) => x.empleado).sort(), ['e1', 'e2']);
  const gastos = Object.keys((await R.redis.hgetall('gastos:e')) || {}).filter((k) => k.startsWith('nomina-'));
  assert.equal(gastos.length, 2);
});

test('nóminas: el bruto corregido debe ser un importe positivo y razonable; los % que no llegan no cambian', async () => {
  const r = await cargar('app/api/nominas/route.js');
  await entrar(); ruta('/api/nominas', 'PATCH');
  await R.redis.hset('nominas:e', { n1: { id: 'n1', mes: '2026-10', empleado: 'e1', empleadoNombre: 'Ana', bruto: 1500, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 } });
  for (const bruto of [-1000, 1e309, 'abc', 0, 5e6]) assert.equal((await r.PATCH(req('/api/nominas', { id: 'n1', bruto }, 'PATCH'))).status, 400, String(bruto));
  assert.equal((await r.PATCH(req('/api/nominas', { id: 'n1', bruto: '1.600,50' }, 'PATCH'))).status, 200);
  const n = await R.redis.hget('nominas:e', 'n1');
  assert.deepEqual([n.bruto, n.irpfPct, n.ssEmpresaPct], [1600.5, 12, 31.65]);
});

test('email: el motivo dice qué hacer (dirección mal escrita, configuración o reintentar)', () => {
  assert.match(motivoEnvio(Object.assign(new Error('The to address is invalid'), { status: 422 })), /dirección de email esté bien escrita/);
  assert.match(motivoEnvio(Object.assign(new Error('Invalid `to` field.'), { status: 422 })), /bien escrita/);
  assert.match(motivoEnvio(Object.assign(new Error('API key is invalid'), { status: 401 })), /no está bien configurado/);
  assert.match(motivoEnvio(Object.assign(new Error('The domain is not verified'), { status: 403 })), /no está bien configurado/);
  assert.match(motivoEnvio(new Error('Resend ha superado el tiempo máximo de respuesta.')), /Inténtalo de nuevo en unos minutos/);
});

test('nombre de archivo de un documento: conserva acentos y eñes y quita signos', () => {
  assert.equal(nombreArchivoDoc('01-2024', 'Fundació Música Viva'), '01-2024 FUNDACIÓ MÚSICA VIVA');
  assert.equal(nombreArchivoDoc('A2026-001', 'Peña & Hijos, S.L.', 'Presupuesto '), 'Presupuesto A2026-001 PEÑA HIJOS SL');
  assert.equal(nombreArchivoDoc('7', '  a/b\\c:d  '), '7 ABCD');
});

test('la cámara se permite a la propia web (la usa «Varios tickets»); micrófono y ubicación, no', async () => {
  const cabeceras = (await config.headers())[0].headers;
  const pp = cabeceras.find((h) => h.key === 'Permissions-Policy').value;
  assert.match(pp, /camera=\(self\)/);
  assert.match(pp, /microphone=\(\)/);
  assert.match(pp, /geolocation=\(\)/);
});

// Upstash devuelve como número un valor suelto que parece un número: el id «52361640» (8 cifras hexadecimales sin
// letras, un 2 % de las cuentas) llegaba como 52361640 y las comparaciones con `===` fallaban (lib/redis.js mismoId).
const CIFRAS = '52361640';
async function entrarConCifras() {
  const u = { id: CIFRAS, empresa: CIFRAS, rol: 'admin', nombre: 'Cifras', email: 'cifras@example.test', creado: new Date().toISOString() };
  await R.redis.hset('usuarios', { [CIFRAS]: u }); await R.redis.hset('emails', { [u.email]: CIFRAS });
  await R.redis.hset('empresas', { [CIFRAS]: { id: CIFRAS, nombre: 'Empresa', emisor: { nombre: 'EMPRESA SL', nif: 'B12345674' }, actividades: ACT, fiscal: { tipo: 'sociedad', iva: 'general' } } });
  await R.redis.hset('empresa-nif', { B12345674: CIFRAS });
  estado.cookies.set('t', await A.crearSesion(CIFRAS));
  return u;
}

test('ids solo con cifras: reenviar la invitación anula la anterior y borrar a la persona quita las suyas', async () => {
  const r = await cargar('app/api/usuarios/route.js');
  await entrar(); ruta('/api/usuarios', 'POST');
  await R.redis.hset('usuarios', { [CIFRAS]: { id: CIFRAS, empresa: 'e', rol: 'miembro', permisos: ['facturas'], nombre: 'Laura', email: 'laura@example.test', creado: new Date().toISOString() } });
  await R.redis.hset('invitaciones', { vieja: CIFRAS });
  assert.equal(await R.redis.hget('invitaciones', 'vieja'), Number(CIFRAS)); // lo que devuelve el cliente de Upstash
  const res = await r.POST(req('/api/usuarios', { reenviar: CIFRAS }));
  assert.equal(res.status, 200, await res.clone().text());
  const inv = await R.redis.hgetall('invitaciones');
  assert.deepEqual([Object.keys(inv).length, 'vieja' in inv], [1, false]);
  await A.borrarUsuario(CIFRAS);
  assert.equal(await R.redis.hgetall('invitaciones'), null);
  assert.equal(await A.confirmarEmail(await A.tokenEmail(CIFRAS), CIFRAS), null); // ya no existe
});

test('ids solo con cifras: cambiar el NIF libera el anterior y se puede volver a él', async () => {
  const c = await cargar('app/api/cuenta/route.js');
  estado.congelarInstantaneas = async () => {};
  await entrarConCifras(); ruta('/api/cuenta', 'PATCH');
  const datos = (nif) => ({ nombre: 'EMPRESA SL', nif, direccion: 'C/ Uno 1', ciudad: '08001 Barcelona', iban: '' });
  assert.equal((await c.PATCH(req('/api/cuenta', datos('B76543214'), 'PATCH'))).status, 200);
  assert.equal(await R.redis.hget('empresa-nif', 'B12345674'), null);
  const vuelta = await c.PATCH(req('/api/cuenta', datos('B12345674'), 'PATCH'));
  assert.equal(vuelta.status, 200, await vuelta.clone().text());
  assert.equal(String(await R.redis.hget('empresa-nif', 'B12345674')), CIFRAS);
});

test('ids solo con cifras: quitar Face ID de un dispositivo borra también su llave; el email se confirma', async () => {
  const p = await cargar('app/api/passkey/route.js');
  await entrarConCifras(); ruta('/api/passkey', 'DELETE');
  await R.redis.hset(`passkeys:${CIFRAS}`, { llave1: { publicKey: 'x', counter: 0, transports: [], nombre: 'Móvil' } });
  await R.redis.hset('passkey-usuario', { llave1: CIFRAS });
  assert.equal((await p.DELETE(req('/api/passkey?id=llave1', undefined, 'DELETE'))).status, 200);
  assert.equal(await R.redis.hget('passkey-usuario', 'llave1'), null);
  assert.equal(await A.confirmarEmail(await A.tokenEmail(CIFRAS), CIFRAS), CIFRAS);
  assert.equal((await R.redis.hget('usuarios', CIFRAS)).emailVerificado, true);
});

test('una persona en dos empresas: cambiar sus permisos en una mientras la otra le quita el acceso no se lo devuelve (Codex H7)', async () => {
  const r = await cargar('app/api/usuarios/route.js');
  const ahora = new Date().toISOString();
  await R.redis.hset('empresas', { e: { id: 'e', nombre: 'A', emisor: {}, fiscal: { tipo: 'sociedad' } }, b: { id: 'b', nombre: 'B', emisor: {}, fiscal: { tipo: 'sociedad' } } });
  await R.redis.hset('usuarios', {
    a: { id: 'a', empresa: 'e', rol: 'admin', nombre: 'Admin A', email: 'a@example.test', creado: ahora },
    b: { id: 'b', empresa: 'b', rol: 'admin', nombre: 'Admin B', email: 'b@example.test', creado: ahora },
    v: { id: 'v', empresa: 'e', nombre: 'V', email: 'v@example.test', creado: ahora, pass: 'x', empresas: { e: { rol: 'miembro', permisos: ['facturas'] }, b: { rol: 'miembro', permisos: ['gastos'] } } },
  });
  const sesion = async (id, metodo) => ({ cookies: new Map([['t', await A.crearSesion(id)]]), headers: new Headers({ 'x-ruta': '/api/usuarios', 'x-metodo': metodo }) });
  const [sa, sb] = [await sesion('a', 'PATCH'), await sesion('b', 'DELETE')];
  // Justo cuando A va a guardar la ficha de V, B le quita el acceso (y A tarda un poco más en guardar).
  const fetchHarness = globalThis.fetch;
  let quitar;
  globalThis.fetch = async (url, op) => {
    const j = JSON.parse(op.body);
    const ordenes = Array.isArray(j[0]) ? j : [j];
    if (!quitar && ordenes.some((o) => String(o[0]).toLowerCase() === 'hset' && o[1] === 'cuentas:usuarios' && o[2] === 'v')) {
      quitar = estado.peticion.run(sb, () => r.DELETE(req('/api/usuarios?id=v', undefined, 'DELETE')));
      await new Promise((ok) => setTimeout(ok, 100));
    }
    return fetchHarness(url, op);
  };
  try {
    const cambio = await estado.peticion.run(sa, () => r.PATCH(req('/api/usuarios', { id: 'v', rol: 'miembro', permisos: ['facturas', 'gastos'] }, 'PATCH')));
    assert.equal(cambio.status, 200, await cambio.clone().text());
    assert.ok(quitar, 'B no llegó a quitar el acceso');
    assert.equal((await quitar).status, 200);
  } finally { globalThis.fetch = fetchHarness; }
  const v = await R.redis.hget('usuarios', 'v');
  assert.deepEqual(v.empresas, { e: { rol: 'miembro', permisos: ['facturas', 'gastos'], pv: 2 } });
});

test('una invitación no cambia la contraseña de una cuenta que ya está activa', async () => {
  await R.redis.hset('usuarios', { w: { id: 'w', empresa: 'e', rol: 'miembro', permisos: [], nombre: 'W', email: 'w@example.test', creado: new Date().toISOString(), pass: 'guardada' } });
  await R.redis.hset('invitaciones', { cod: 'w' });
  const r = await A.aceptarInvitacion('cod', 'Pino-azul-Verde-2026!');
  assert.equal(r.error, 'Esta invitación ya no es válida');
  assert.equal((await R.redis.hget('usuarios', 'w')).pass, 'guardada');
});

// Decisiones de la auditoría aplicadas (22-10-2026): permiso «Contabilidad» (Codex H3) y sueldos (H2).
test('Contabilidad: apuntar asientos, la memoria y marcar modelos exige el permiso; ver no basta', async () => {
  const [a, c, ca] = await Promise.all([cargar('app/api/asientos/route.js'), cargar('app/api/cuenta/route.js'), cargar('app/api/cuentas-anuales/route.js')]);
  const asiento = { fecha: '2026-10-01', concepto: 'Ajuste', lineas: [{ cuenta: '629', debe: 10, haber: 0 }, { cuenta: '572', debe: 0, haber: 10 }] };
  const marca = { presentado303: { anio: 2026, t: 3, hecho: true } };
  const memoria = { anio: 2025, administradores: 'Ana' };
  const intento = async () => [
    (ruta('/api/asientos', 'POST'), (await a.POST(req('/api/asientos', asiento))).status),
    (ruta('/api/cuenta', 'PATCH'), (await c.PATCH(req('/api/cuenta', marca, 'PATCH'))).status),
    (ruta('/api/cuentas-anuales', 'POST'), (await ca.POST(req('/api/cuentas-anuales', memoria))).status),
  ];
  await entrar({ rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos'], pv: 2 });
  assert.deepEqual(await intento(), [403, 403, 403]);
  await entrar({ rol: 'miembro', permisos: ['contabilidad'], pv: 2 });
  assert.deepEqual(await intento(), [200, 200, 200]);
  // La gestoría de antes (sin versión) conserva lo que hacía.
  await entrar({ rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos', 'nominas'] });
  assert.deepEqual(await intento(), [200, 200, 200]);
});

test('sueldos: sin el permiso «Nóminas», el Excel de gastos lleva las nóminas juntas por mes', async () => {
  const x = await cargar('app/api/exportar/route.js');
  const gn = (id, nombre, base) => ({ id: `nomina-${id}`, fecha: '2026-10-31', actividad: 'eventos', concepto: `Nómina ${nombre} · octubre 2026`, base, ivaPct: 0, nomina: id });
  await R.redis.hset('gastos:e', { 'nomina-n1': gn('n1', 'Ana', 2369.7), 'nomina-n2': gn('n2', 'Luis', 3094.43), g1: { id: 'g1', fecha: '2026-10-05', actividad: 'eventos', concepto: 'Gestoría', base: 100, ivaPct: 21 } });
  const csv = async () => (await (await x.GET(req('/api/exportar?tipo=gastos&anio=2026', undefined, 'GET'))).text());
  await entrar({ rol: 'miembro', permisos: ['gastos'], pv: 2 }); ruta('/api/exportar', 'GET');
  const sin = await csv();
  assert.ok(!/Ana|Luis/.test(sin) && sin.includes('Nóminas de octubre 2026 · 2 personas') && sin.includes('5464,13'), sin);
  await entrar({ rol: 'miembro', permisos: ['gastos', 'nominas'], pv: 2 });
  assert.ok((await csv()).includes('Nómina Ana'));
});


test('111 y 115: se marcan como presentados aparte, con el permiso «Contabilidad»', async () => {
  const c = await cargar('app/api/cuenta/route.js');
  const marca = (cuerpo) => c.PATCH(req('/api/cuenta', { presentadoRet: cuerpo }, 'PATCH'));
  await entrar({ rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos'], pv: 2 }); ruta('/api/cuenta', 'PATCH');
  assert.equal((await marca({ modelo: '111', anio: 2026, t: 3, hecho: true })).status, 403);
  await entrar({ rol: 'miembro', permisos: ['contabilidad'], pv: 2 });
  assert.equal((await marca({ modelo: '111', anio: 2026, t: 3, hecho: true })).status, 200);
  assert.equal((await marca({ modelo: '115', anio: 2026, t: 3, hecho: false })).status, 200);
  const e = await R.redis.hget('empresas', 'e');
  assert.deepEqual([e.pres111, e.pres115, Boolean(e.pagadosHacienda?.['2026-3-111'])], [{ 2026: { 3: true } }, { 2026: { 3: false } }, true]);
  assert.equal((await marca({ modelo: '111', anio: 2026, t: 3, hecho: null })).status, 200);
  assert.deepEqual((await R.redis.hget('empresas', 'e')).pres111, { 2026: {} });
  assert.equal((await marca({ modelo: '303', anio: 2026, t: 3, hecho: true })).status, 400);
});
