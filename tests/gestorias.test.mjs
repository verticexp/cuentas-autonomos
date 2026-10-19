import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { crearBase } from './apoyo/upstash-mem.mjs';
import { diasPrueba, nuevoPlan, PRUEBA_DIAS } from '../lib/prueba.js';

// Transporte REST en memoria para el cliente real de Upstash, sin abrir puertos.
const servidor = { base: crearBase() };
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opciones) => {
  if (!String(url).startsWith('https://gestorias.test')) throw new Error('Petición inesperada: ' + String(url));
  const comandos = JSON.parse(opciones.body);
  const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
  const codificar = new Headers(opciones.headers).get('upstash-encoding') === 'base64';
  const ejecutar = (c) => {
    try {
      const r = servidor.base.run(c);
      return { result: codificar ? b64(r) : r };
    } catch (e) { return { error: e.message }; }
  };
  const r = /\/(pipeline|multi-exec)/.test(String(url)) ? comandos.map(ejecutar) : ejecutar(comandos);
  return Response.json(r);
};
const entorno = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
process.env.KV_REST_API_URL = 'https://gestorias.test';
process.env.KV_REST_API_TOKEN = 'solo-pruebas';
const { redis } = await import('../lib/redis.js');
const { normalizarCodigo, crearGestoria, gestoriaPorCodigo, apuntarCliente, listarGestorias, desactivarGestoria, PRUEBA_GESTORIA_DIAS } = await import('../lib/gestorias.js');

// Los endpoints y la persistencia de gestorías son reales. Aislamos sesión, correo, censo y credenciales.
const estado = { usuario: { admin: true }, altas: [], errorAlta: false };
globalThis.__pruebasGestorias = { estado, redis };
const fuente = `
  const { estado, redis } = globalThis.__pruebasGestorias;
  export const cuerpo = (req) => req.json().catch(() => ({}));
  export const error = (error, status = 400) => Response.json({ error }, { status });
  export const usuarioApi = async () => estado.usuario ? { u: estado.usuario } : { res: error('No autorizado', 401) };
  export const validarContrasenaSegura = async () => ({ ok: true });
  export const emailReal = async () => ({ ok: true });
  export const comprobarNif = async () => ({ estado: 'ok' });
  export const pasado = async () => false;
  export const ipDe = () => 'pruebas';
  export const MUCHOS = 'Demasiadas peticiones';
  export const hayUsuarios = async () => true;
  export const usuarioActual = async () => null;
  export const nuevaEmpresa = async () => ({ error: 'sin sesión en estas pruebas' });
  export const opcionesCookie = {};
  export const opcionesDesbloqueo = {};
  export const enviarConfirmacion = async () => {};
  export const tokenEmail = async () => 'confirmacion-de-prueba';
  export const crearSesion = async () => 'sesion-de-prueba';
  export const desbloqueo = async () => 'desbloqueo-de-prueba';
  export async function crearUsuario(cuenta) {
    estado.altas.push(cuenta);
    if (estado.errorAlta) return { error: 'Ese email ya existe.' };
    const empresa = 'empresa-' + estado.altas.length;
    await redis.hset('empresas', { [empresa]: { ...cuenta.empresaDatos, id: empresa } });
    return { usuario: { id: 'usuario-' + estado.altas.length, empresa, email: cuenta.email, nombre: cuenta.nombre } };
  }
`;
const dobles = new Set(['@/lib/api', '@/lib/auth', '@/lib/contrasenaFiltrada', '@/lib/emailReal', '@/lib/censoAeat', '@/lib/limite', '@/lib/invitacion']);
const hooks = registerHooks({
  resolve(spec, context, next) {
    if (dobles.has(spec)) return { url: 'data:text/javascript,' + encodeURIComponent(fuente), shortCircuit: true };
    if (spec === 'next/server') return next('next/server.js', context);
    if (['@/lib/prueba', '@/lib/gestorias', '@/lib/redis', '@/lib/recomendaciones', '@/lib/membresias'].includes(spec)) {
      return { url: new URL('../' + spec.slice(2) + '.js', import.meta.url).href, shortCircuit: true };
    }
    return next(spec, context);
  },
});
const api = await import('../app/api/gestorias/route.js');
const registro = await import('../app/api/registro/route.js');

after(() => {
  hooks.deregister();
  delete globalThis.__pruebasGestorias;
  for (const [k, v] of [['KV_REST_API_URL', entorno.url], ['KV_REST_API_TOKEN', entorno.token]]) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  globalThis.fetch = fetchOriginal;
});
beforeEach(() => {
  servidor.base.run(['flushdb']);
  estado.usuario = { admin: true };
  estado.altas = [];
  estado.errorAlta = false;
});

const HOY = new Date('2026-03-15T00:00:00Z');
const datos = { nombre: 'Asesoría López', email: 'equipo@example.com' };
const post = (body) => new Request('http://localhost/api/gestorias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function alta(gestoria, tipo = 'aut') {
  const campos = { nombre: 'Cliente', email: 'cliente@example.com', password: 'Password-de-prueba-123', acepto: '1', tipo, plan: 'Pro', periodo: 'anio', razon: tipo === 'aut' ? 'Cliente Autónomo' : 'Cliente SL', nif: tipo === 'aut' ? '12345678Z' : 'B12345674', direccion: 'Calle Mayor 1', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona' };
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  if (gestoria !== undefined) form.set('gestoria', gestoria);
  return new Request('http://localhost/api/registro', { method: 'POST', headers: { Accept: 'application/json' }, body: form });
}

test('normaliza mayúsculas y espacios exteriores; valida caracteres y límites', () => {
  assert.equal(normalizarCodigo(' asesoria-lopez '), 'ASESORIA-LOPEZ');
  assert.equal(normalizarCodigo('ab12'), 'AB12');
  assert.equal(normalizarCodigo('a'.repeat(20)), 'A'.repeat(20));
  for (const c of ['', 'abc', 'a'.repeat(21), 'ASESORÍA', 'ASESORIA LOPEZ', 'LOPEZ_1', 'LOPEZ/1', 'ABCD\nEF', null, undefined, 1234, {}, ['ABCD']]) {
    assert.equal(normalizarCodigo(c), null);
  }
});

test('90 días incluyen hoy: hasta es hoy + 89; sin días conserva los 30', () => {
  assert.equal(PRUEBA_GESTORIA_DIAS, 90);
  for (const tipo of ['aut', 'pym']) {
    const plan = nuevoPlan(tipo, 'Pro', HOY, 'anio', PRUEBA_GESTORIA_DIAS);
    assert.equal(plan.hasta, '2026-06-12');
    assert.equal(plan.periodo, 'anio');
    assert.equal(diasPrueba(plan, HOY), 90);
    assert.deepEqual(nuevoPlan(tipo, 'Pro', HOY), nuevoPlan(tipo, 'Pro', HOY, 'mes', PRUEBA_DIAS));
    assert.equal(nuevoPlan(tipo, 'Pro', HOY).hasta, '2026-04-13');
  }
});

test('crea el código desde el nombre, usa el prefijo real y busca solo activas', async () => {
  const g = await crearGestoria(datos);
  assert.equal(g.codigo, 'ASESORIA-LOPEZ');
  assert.equal(g.activa, true);
  assert.ok(Number.isFinite(Date.parse(g.creada)));
  assert.deepEqual(await gestoriaPorCodigo('asesoria-lopez'), g);
  assert.ok(servidor.base.db.has('cuentas:gestorias'));
  assert.equal(servidor.base.db.has('gestorias'), false);
  assert.equal(await gestoriaPorCodigo('NO-EXISTE'), null);
  assert.equal(await gestoriaPorCodigo('in válido'), null);
});

test('los códigos explícitos se normalizan y los duplicados simultáneos no sobrescriben', async () => {
  const resultados = await Promise.all(Array.from({ length: 5 }, () => crearGestoria({ ...datos, codigo: ' partner-1 ' })));
  assert.equal(resultados.filter((g) => !g.error).length, 1);
  assert.equal(resultados.filter((g) => g.error).length, 4);
  assert.equal((await listarGestorias()).length, 1);
  assert.equal((await gestoriaPorCodigo('PARTNER-1')).codigo, 'PARTNER-1');
});

test('rechaza datos o códigos inválidos y limita el código generado a 20 caracteres', async () => {
  for (const d of [{}, { ...datos, nombre: '' }, { ...datos, email: 'no-email' }, { ...datos, codigo: '???' }, { ...datos, codigo: '' }, { ...datos, codigo: null }]) {
    assert.ok((await crearGestoria(d)).error);
  }
  assert.deepEqual(await listarGestorias(), []);
  const g = await crearGestoria({ ...datos, nombre: 'Asesoría con un nombre muy largo' });
  assert.equal(g.codigo.length, 20);
  assert.equal(normalizarCodigo(g.codigo), g.codigo);
});

test('apunta empresas sin duplicarlas y lista también las inactivas con su número de clientes', async () => {
  const g = await crearGestoria(datos);
  const otra = await crearGestoria({ ...datos, codigo: 'OTRA' });
  await apuntarCliente(g.codigo.toLowerCase(), 'empresa-1');
  await apuntarCliente(g.codigo, 'empresa-1');
  await apuntarCliente(g.codigo, 'empresa-2');
  assert.deepEqual((await redis.smembers('gestoria-clientes:' + g.codigo)).sort(), ['empresa-1', 'empresa-2']);
  const inactiva = await desactivarGestoria(g.codigo.toLowerCase());
  assert.equal(inactiva.activa, false);
  assert.equal(await gestoriaPorCodigo(g.codigo), null);
  assert.deepEqual(await listarGestorias(), [{ ...inactiva, clientes: 2 }, { ...otra, clientes: 0 }]);
  assert.ok((await crearGestoria(datos)).error);
  assert.ok((await desactivarGestoria('NO-EXISTE')).error);
});

test('API: GET y ambas operaciones POST exigen admin y no modifican datos al rechazarlas', async () => {
  await crearGestoria(datos);
  estado.usuario = { admin: false };
  assert.equal((await api.GET()).status, 403);
  assert.equal((await api.POST(post(datos))).status, 403);
  assert.equal((await api.POST(post({ desactivar: 'ASESORIA-LOPEZ' }))).status, 403);
  assert.equal((await listarGestorias()).length, 1);
  assert.ok(await gestoriaPorCodigo('ASESORIA-LOPEZ'));
  estado.usuario = null;
  assert.equal((await api.GET()).status, 401);
  assert.equal((await api.POST(post(datos))).status, 401);
});

test('API: el admin crea, lista y desactiva; devuelve errores claros en datos inválidos', async () => {
  const r = await api.POST(post(datos));
  assert.equal(r.status, 200);
  const g = await r.json();
  assert.equal(g.codigo, 'ASESORIA-LOPEZ');
  assert.deepEqual(await (await api.GET()).json(), [{ ...g, clientes: 0 }]);
  assert.equal((await api.POST(post(datos))).status, 400);
  assert.equal((await api.POST(post(null))).status, 400);
  assert.equal((await api.POST(post({ desactivar: 'NO-EXISTE' }))).status, 400);
  const baja = await api.POST(post({ desactivar: g.codigo }));
  assert.equal(baja.status, 200);
  assert.equal((await baja.json()).activa, false);
  assert.equal(await gestoriaPorCodigo(g.codigo), null);
});

test('alta sin código o con espacios conserva los 30 días y no apunta clientes', async () => {
  for (const codigo of [undefined, '   ']) {
    servidor.base.run(['flushdb']);
    const r = await registro.POST(alta(codigo));
    assert.equal(r.status, 200);
    const empresa = Object.values(await redis.hgetall('empresas'))[0];
    assert.equal(empresa.plan.hasta, nuevoPlan('aut', 'Pro', new Date(), 'anio').hasta);
    assert.equal(empresa.plan.gestoria, undefined);
    assert.equal(servidor.base.db.has('cuentas:gestorias'), false);
    assert.deepEqual(await redis.smembers('gestoria-clientes:ASESORIA-LOPEZ'), []);
  }
});

test('alta de autónomo y pyme con código válido guarda 90 días, vínculo y empresa en el set', async () => {
  for (const tipo of ['aut', 'pym']) {
    servidor.base.run(['flushdb']);
    const g = await crearGestoria(datos);
    const r = await registro.POST(alta(' asesoria-lopez ', tipo));
    assert.equal(r.status, 200);
    const empresa = Object.values(await redis.hgetall('empresas'))[0];
    assert.equal(empresa.plan.hasta, nuevoPlan(tipo, 'Pro', new Date(), 'anio', 90).hasta);
    assert.equal(empresa.plan.gestoria, g.codigo);
    assert.equal(empresa.plan.periodo, 'anio');
    assert.deepEqual(await redis.smembers('gestoria-clientes:' + g.codigo), [empresa.id]);
    assert.equal(await redis.hget('empresa-nif', tipo === 'aut' ? '12345678Z' : 'B12345674'), empresa.id);
  }
});

test('alta con código inexistente, mal formado o inactivo vuelve al paso 1 sin crear empresa', async () => {
  const g = await crearGestoria(datos);
  await desactivarGestoria(g.codigo);
  for (const codigo of ['NO-EXISTE', 'no válido', g.codigo]) {
    const r = await registro.POST(alta(codigo));
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: 'Ese código promocional no existe o ya no está activo.', paso: 3 });
  }
  assert.equal(estado.altas.length, 0);
  assert.equal(await redis.hlen('empresas'), 0);
  assert.equal(await redis.hlen('empresa-nif'), 0);
  assert.deepEqual(await redis.smembers('gestoria-clientes:' + g.codigo), []);
});

test('si falla crearUsuario no se añade ninguna empresa a la gestoría', async () => {
  const g = await crearGestoria(datos);
  estado.errorAlta = true;
  assert.equal((await registro.POST(alta(g.codigo))).status, 400);
  assert.deepEqual(await redis.smembers('gestoria-clientes:' + g.codigo), []);
  assert.equal(await redis.hlen('empresa-nif'), 0);
});
