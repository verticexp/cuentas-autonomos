// El SDK de Upstash usa el simulador existente por fetch, sin puertos ni servicios externos.
import test, { after, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import dns from 'node:dns/promises';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === 'next/headers') return { url: 'data:text/javascript,export const headers = async () => new Headers(); export const cookies = async () => ({ get: () => undefined });', shortCircuit: true };
  if (s === '@/lib/invitacion') return { url: 'data:text/javascript,export async function enviarConfirmacion() {}', shortCircuit: true };
  if (s.startsWith('@/')) return next(new URL(s.slice(2) + '.js', ${JSON.stringify(new URL('../', import.meta.url).href)}).href, c);
  return next(s, c);
}`), import.meta.url);

const base = crearBase();
const fetchReal = globalThis.fetch;
const variables = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'VERIFACTU_P12', 'VERIFACTU_P12_CLAVE'];
const entorno = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
let redis, POST;
const valido = { nombre: 'Ana García', email: 'ana@ejemplo.es', password: 'Luna!Bosque72Rio', tipo: 'aut', plan: 'Esencial', razon: 'García Pérez Ana', nif: '12345678Z', direccion: 'Calle Mayor 12', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona', telefono: '+34 600 123 456', periodo: 'anio', acepto: '1' };

before(async () => {
  process.env.KV_REST_API_URL = 'https://registro-upstash.test';
  process.env.KV_REST_API_TOKEN = 'pruebas';
  globalThis.fetch = async (url, opciones) => {
    assert.ok(String(url).startsWith('https://registro-upstash.test'), 'no se accede a servicios reales');
    const ordenes = JSON.parse(opciones.body);
    const codificar = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(codificar) : v;
    const b64 = new Headers(opciones.headers).get('upstash-encoding') === 'base64';
    const ejecutar = (orden) => {
      try { const valor = base.run(orden); return { result: b64 ? codificar(valor) : valor }; }
      catch (e) { return { error: e.message }; }
    };
    return Response.json(/\/(pipeline|multi-exec)/.test(String(url)) ? ordenes.map(ejecutar) : ejecutar(ordenes));
  };
  redis = (await import('../lib/redis.js')).redis;
  POST = (await import('../app/api/registro/route.js')).POST;
});
beforeEach(async () => {
  mock.restoreAll();
  mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.ejemplo.es' }]);
  base.run(['flushdb']);
  process.env.LIMITES = 'activo';
  delete process.env.VERIFACTU_P12; delete process.env.VERIFACTU_P12_CLAVE;
  await redis.hset('usuarios', { fundador: { id: 'fundador', nombre: 'Fundador', email: 'fundador@ejemplo.es', admin: true } });
});
after(() => {
  mock.restoreAll(); globalThis.fetch = fetchReal;
  for (const k of variables) if (entorno[k] === undefined) delete process.env[k]; else process.env[k] = entorno[k];
});

async function alta(cambios = {}, ip = '192.0.2.1') {
  const form = new FormData();
  for (const [k, v] of Object.entries({ ...valido, ...cambios })) if (v !== undefined) form.set(k, v);
  const res = await POST(new Request('https://netto.test/api/registro', { method: 'POST', headers: { Accept: 'application/json', 'x-real-ip': ip }, body: form }));
  return { res, datos: await res.json() };
}
async function rechaza(cambios, mensaje, paso = 2) {
  const { res, datos } = await alta(cambios);
  assert.equal(res.status, 400);
  assert.match(datos.error, mensaje);
  assert.equal(datos.paso, paso);
  assert.equal(await redis.hlen('empresas'), 0);
  assert.equal(await redis.hlen('usuarios'), 1);
  assert.equal(await redis.hlen('empresa-nif'), 0);
}
function simularCenso(resultado) {
  process.env.VERIFACTU_P12 = 'cHJ1ZWJh'; process.env.VERIFACTU_P12_CLAVE = 'clave';
  return mock.method(https, 'request', (_url, _opciones, recibir) => {
    const req = new EventEmitter();
    req.end = () => queueMicrotask(() => {
      const res = new EventEmitter(); res.statusCode = 200; res.setEncoding = () => {};
      recibir(res); res.emit('data', `<VNifV2Sal><Contribuyente><Nif>12345678Z</Nif><Nombre>GARCÍA PÉREZ ANA</Nombre><Resultado>${resultado}</Resultado></Contribuyente></VNifV2Sal>`); res.emit('end');
    });
    return req;
  });
}

test('registro: exige aceptar las condiciones con el valor 1', async () => {
  for (const acepto of [undefined, '', 'true', '0']) await rechaza({ acepto }, /Acepta las condiciones/, 5);
});

test('registro: rechaza NIF incorrecto, vacío y extranjero', async () => {
  for (const nif of ['12345678A', '', 'DE123456789', 'ABC']) await rechaza({ nif }, /español válido/);
});

test('registro: autónomo exige persona física y sociedad exige persona jurídica', async () => {
  await rechaza({ nif: 'B12345674' }, /persona física/);
  await rechaza({ tipo: 'pym' }, /persona jurídica/);
  await rechaza({ tipo: 'gra' }, /tipo de negocio/, 1);
  await rechaza({ tipo: 'business' }, /tipo de negocio/, 1);
});

test('registro: valida CP de cinco dígitos, dirección, ciudad, provincia y nombre fiscal', async () => {
  const casos = [
    [{ cp: '0800' }, /5 dígitos/], [{ cp: '0800A' }, /5 dígitos/], [{ cp: '080001' }, /5 dígitos/],
    [{ direccion: '' }, /calle y el número/], [{ ciudad: '' }, /ciudad/], [{ provincia: 'Inventada' }, /provincia/],
    [{ razon: '' }, /nombre fiscal/], [{ telefono: '1'.repeat(31) }, /teléfono/],
  ];
  for (const [cambios, mensaje] of casos) {
    // Cada caso usa otra IP para probar la validación sin agotar el límite existente.
    await redis.del('limite:registro:192.0.2.1');
    await rechaza(cambios, mensaje);
  }
});

test('registro: errores de nombre, email y contraseña vuelven a Tu cuenta', async () => {
  await rechaza({ nombre: ' ' }, /nombre/, 4);
  await rechaza({ email: 'incorrecto' }, /email/, 4);
  await rechaza({ password: 'corta' }, /contraseña/, 4);
});

test('registro: rechaza un NIF repetido en el índice antes de consultar el censo', async () => {
  await redis.hset('empresa-nif', { '12345678Z': 'empresa-existente' });
  const red = simularCenso('IDENTIFICADO');
  const { res, datos } = await alta({ nif: 'es 12.345.678-z' });
  assert.equal(res.status, 400);
  assert.equal(datos.error, 'Ya hay una cuenta con ese NIF. Entra con ella o escríbenos a corporate@nettohq.com.');
  assert.equal(datos.paso, 2);
  assert.equal(red.mock.callCount(), 0);
  assert.equal(await redis.hlen('empresas'), 0);
});

test('registro: también detecta empresas anteriores al índice de NIF', async () => {
  await redis.hset('empresas', { antigua: { id: 'antigua', emisor: { nif: 'ES12345678-Z' } } });
  const { res, datos } = await alta();
  assert.equal(res.status, 400); assert.match(datos.error, /Ya hay una cuenta/);
  assert.equal(await redis.hget('empresa-nif', '12345678Z'), 'antigua');
  assert.equal(await redis.hlen('empresas'), 1);
});

test('registro: NO IDENTIFICADO y similares no crean la cuenta', async () => {
  for (const resultado of ['NO IDENTIFICADO', 'NO IDENTIFICADO-SIMILAR']) {
    simularCenso(resultado);
    await rechaza({}, /Hacienda no reconoce ese NIF con ese nombre/);
    mock.restoreAll();
    mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.ejemplo.es' }]);
  }
  assert.equal(await redis.get('registro-nif:12345678Z'), null);
});

test('registro: NIF de baja o revocado bloquea el alta', async () => {
  for (const resultado of ['IDENTIFICADO-BAJA', 'IDENTIFICADO-REVOCADO']) {
    simularCenso(resultado);
    await rechaza({}, /Ese NIF figura de baja en Hacienda/);
    mock.restoreAll();
    mock.method(dns, 'resolveMx', async () => [{ exchange: 'mx.ejemplo.es' }]);
  }
});

test('registro: sin servicio crea emisor completo, censo pendiente, índice y periodo anual', async () => {
  const antes = Date.now();
  const { res, datos } = await alta({ nif: 'es 12.345.678-z', razon: `  ${valido.razon}  ` });
  assert.equal(res.status, 200); assert.deepEqual(datos, { ok: true });
  const id = await redis.hget('emails', valido.email);
  const empresa = await redis.hget('empresas', id);
  assert.equal(empresa.nombre, valido.razon);
  assert.deepEqual(empresa.emisor, { nombre: valido.razon, nif: '12345678Z', direccion: valido.direccion, cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona', telefono: valido.telefono });
  assert.equal(empresa.censo.estado, 'pendiente');
  assert.ok(Date.parse(empresa.censo.fecha) >= antes);
  assert.equal(empresa.plan.version, 2);
  assert.deepEqual({ tipo: empresa.plan.tipo, nombre: empresa.plan.nombre, periodo: empresa.plan.periodo }, { tipo: 'aut', nombre: 'Esencial', periodo: 'anio' });
  assert.equal(empresa.fiscal.tipo, 'autonomo');
  assert.equal(await redis.hget('empresa-nif', '12345678Z'), id);
  assert.equal(await redis.get('registro-nif:12345678Z'), null);
  assert.match(res.headers.get('set-cookie'), /t=/);
  const segundo = await alta({ email: 'otra@ejemplo.es' });
  assert.equal(segundo.res.status, 400); assert.match(segundo.datos.error, /Ya hay una cuenta/);
  assert.equal(await redis.hlen('empresas'), 1);
});

test('registro: identificado guarda censo ok, teléfono opcional y mensual por defecto', async () => {
  simularCenso('IDENTIFICADO');
  const { res } = await alta({ periodo: undefined, telefono: undefined });
  assert.equal(res.status, 200);
  const empresa = Object.values(await redis.hgetall('empresas'))[0];
  assert.equal(empresa.censo.estado, 'ok'); assert.ok(empresa.censo.fecha);
  assert.equal(empresa.plan.periodo, 'mes'); assert.equal(empresa.emisor.telefono, '');
});

test('registro: pyme acepta CIF y guarda el nombre fiscal completo', async () => {
  const razon = 'Sociedad con una razón social completa que supera los ochenta caracteres para comprobar que se conserva';
  const { res } = await alta({ tipo: 'pym', nif: 'B12345674', razon });
  assert.equal(res.status, 200);
  const empresa = Object.values(await redis.hgetall('empresas'))[0];
  assert.equal(empresa.nombre, razon); assert.equal(empresa.emisor.nombre, razon);
  assert.equal(empresa.fiscal.tipo, 'sociedad');
});

test('registro: dos altas simultáneas con el mismo NIF crean una sola empresa', async () => {
  const resultados = await Promise.all([alta(), alta({ email: 'otra@ejemplo.es' })]);
  assert.equal(resultados.filter((r) => r.res.status === 200).length, 1);
  assert.equal(resultados.filter((r) => [400, 409].includes(r.res.status)).length, 1);
  assert.equal(await redis.hlen('empresas'), 1); assert.equal(await redis.hlen('usuarios'), 2);
});

test('registro: un email existente libera el NIF y permite corregir el alta', async () => {
  await redis.hset('emails', { [valido.email]: 'fundador' });
  await rechaza({}, /email ya tiene cuenta/, 4);
  assert.equal(await redis.get('registro-nif:12345678Z'), null);
  assert.equal((await alta({ email: 'nueva@ejemplo.es' })).res.status, 200);
});

test('registro: conserva el límite de cinco intentos por IP', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await alta({ acepto: '' })).res.status, 400);
  assert.equal((await alta()).res.status, 429);
  assert.equal(await redis.hlen('empresas'), 0);
});

test('registro: la primera cuenta no necesita datos fiscales, censo, plan ni aceptación', async () => {
  base.run(['flushdb']);
  const red = simularCenso('NO IDENTIFICADO');
  const { res } = await alta({ tipo: '', plan: '', acepto: '', nif: '', razon: '', direccion: '', cp: '', provincia: '', periodo: 'otro', empresa: 'Netto' });
  assert.equal(res.status, 200); assert.equal(red.mock.callCount(), 0);
  const usuario = Object.values(await redis.hgetall('usuarios'))[0];
  const empresa = await redis.hget('empresas', usuario.empresa);
  assert.equal(usuario.admin, true); assert.equal(empresa.nombre, 'Netto');
  assert.deepEqual(empresa.emisor, {}); assert.equal(empresa.censo, undefined);
  assert.equal(empresa.plan, undefined); assert.equal(await redis.hlen('empresa-nif'), 0);
});

 test('registro: email inexistente y contraseña débil indican paso 4', async () => {
  await rechaza({ password: 'password123' }, /común/, 4);
  for (const metodo of ['resolveMx', 'resolve4', 'resolve6']) mock.method(dns, metodo, async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }); });
  await rechaza({ email: 'nadie@inexistente.es' }, /no parece existir/, 4);
});
test('registro: tipo y plan indican los pasos nuevos', async () => {
  await rechaza({ tipo: 'otro' }, /tipo/, 1);
  await rechaza({ plan: 'otro' }, /plan/, 3);
  await rechaza({ periodo: 'otro' }, /periodo/, 3);
});

test('registro-email: ruta pública valida y limita a 30 intentos por IP', async () => {
  const { POST: comprobar } = await import('../app/api/registro/email/route.js');
  const pedir = (email) => comprobar(new Request('https://netto.test/api/registro/email', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': '192.0.2.99' }, body: JSON.stringify({ email }) }));
  assert.deepEqual(await (await pedir('ana@ejemplo.es')).json(), { ok: true });
  assert.match((await (await pedir('ana@yopmail.com')).json()).error, /temporales/);
  for (let i = 2; i < 30; i++) assert.equal((await pedir('ana@ejemplo.es')).status, 200);
  assert.equal((await pedir('ana@ejemplo.es')).status, 429);
});

test('registro con enlace de recomendación: 60 días de prueba, queda apuntada y no se suma a la gestoría', async () => {
  await redis.hset('empresas', { reco: { id: 'reco', nombre: 'Recomienda SL', recomienda: { codigo: 'ABCDEFGH', meses: 0 } } });
  await redis.hset('recomendaciones', { ABCDEFGH: 'reco' });
  const { res } = await alta({ ref: 'abcdefgh' });
  assert.equal(res.status, 200);
  const id = await redis.hget('emails', valido.email);
  const empresa = await redis.hget('empresas', id);
  assert.deepEqual(empresa.plan.recomendacion, { codigo: 'ABCDEFGH', empresa: 'reco' });
  const dias = Math.round((Date.parse(`${empresa.plan.hasta}T12:00:00Z`) - Date.now()) / 86400000);
  assert.ok(dias >= 58 && dias <= 60, `prueba de ${dias} días`);
  assert.deepEqual(await redis.smembers('recomendadas:ABCDEFGH'), [id]);
  const mala = await alta({ ref: 'NOEXISTE', email: 'otra@ejemplo.es', nif: '87654321X' });
  assert.equal(mala.res.status, 400); assert.match(mala.datos.error, /recomendación ya no es válido/);
  await redis.hset('gestorias', { ASESORIA: { codigo: 'ASESORIA', nombre: 'Asesoría', activa: true } });
  const dos = await alta({ ref: 'ABCDEFGH', gestoria: 'ASESORIA', email: 'otra@ejemplo.es', nif: '87654321X' });
  assert.equal(dos.res.status, 400); assert.match(dos.datos.error, /no los dos/);
});
