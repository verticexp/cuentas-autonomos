import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { nuevoPlan } from '../lib/prueba.js';
import { SOLO_LECTURA, SOLO_LECTURA_APP } from '../lib/planes.js';

const auth = `export const bloqueoDe = () => 'off'; export const bloquearPorEmail = () => false; export const desbloqueada = async () => true; export const usuarioActual = async () => globalThis.__planUsuario;`;
const bd = `export const redis = { hincrby: async (_clave, funcion) => { globalThis.__planUsos.push(funcion); } };`;
const cabeceras = `export const headers = async () => globalThis.__planCabeceras;`;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === './auth.js' && c.parentURL.endsWith('/lib/api.js')) return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(auth)}), shortCircuit: true };
  if (s === './redis.js' && /\\/lib\\/(api|usoPlan)\\.js$/.test(c.parentURL)) return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(bd)}), shortCircuit: true };
  if (s === 'next/headers') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(cabeceras)}), shortCircuit: true };
  return next(s, c);
}`), import.meta.url);
const { usuarioApi } = await import('../lib/api.js');
beforeEach(() => {
  globalThis.__planUsuario = { id: 'ana', empresa: 'e1', rol: 'admin', plan: { ...nuevoPlan('pym', 'Esencial'), pagado: true } };
  globalThis.__planCabeceras = new Headers({ 'x-ruta': '/api/remesas', 'x-metodo': 'POST' });
  globalThis.__planUsos = [];
});

test('la API rechaza funciones Pro aunque la petición llegue directamente al endpoint', async () => {
  for (const funcion of ['remesas', 'albaranes', 'cartera', 'analisis', 'proyectos', 'tesoreria', 'asistente', 'inventario']) {
    const r = await usuarioApi({ funcion });
    assert.equal(r.res.status, 403, funcion);
    assert.match((await r.res.json()).error, /plan Esencial/);
  }
  assert.ok((await usuarioApi({ funcion: 'revision' })).u, 'la revisión del banco va en Pyme Esencial');
  const ruta = await usuarioApi();
  assert.equal(ruta.res.status, 403, 'la ruta del proxy también protege el endpoint');
  assert.deepEqual(globalThis.__planUsos, []);
});

test('Pro y contratos anteriores pasan; el mes de prueba registra el uso sin bloquear', async () => {
  for (const plan of [
    { ...nuevoPlan('pym', 'Pro'), pagado: true },
    { tipo: 'pym', nombre: 'Esencial', pagado: true },
    nuevoPlan('pym', 'Esencial'),
  ]) {
    globalThis.__planUsuario.plan = plan;
    assert.ok((await usuarioApi({ funcion: 'remesas' })).u);
  }
  assert.deepEqual(globalThis.__planUsos, ['remesas']);
});

test('el fin de prueba bloquea escrituras, pero permite exportar los datos', async () => {
  globalThis.__planUsuario.plan = { ...nuevoPlan('pym', 'Esencial'), hasta: '2020-01-01' };
  const escritura = await usuarioApi({ funcion: 'albaranes' });
  assert.equal(escritura.res.status, 402);
  globalThis.__planCabeceras = new Headers({ 'x-ruta': '/api/exportar/todo', 'x-metodo': 'GET' });
  assert.ok((await usuarioApi()).u);
  globalThis.__planCabeceras = new Headers({ 'x-ruta': '/api/suscripcion', 'x-metodo': 'POST' });
  assert.ok((await usuarioApi()).u, 'puede contratar al terminar la prueba');
});

test('el perfil de gestoría no adquiere permisos de escritura por estar incluido aparte', async () => {
  globalThis.__planUsuario = { ...globalThis.__planUsuario, rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos', 'nominas'], plan: { ...nuevoPlan('pym', 'Pro'), pagado: true } };
  const r = await usuarioApi({ permiso: 'facturar', funcion: 'remesas' });
  assert.equal(r.res.status, 403);
  assert.match((await r.res.json()).error, /No tienes permiso/);
});

// La app de iOS tiene compras dentro de la app (lib/compraApple.js): puede llevar a Ajustes › Tu plan como la web. La de
// Android, aún sin compras, no habla de planes.
const ANDROID = 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36 FisquoApp/1';
const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 FisquoApp/1';

test('el error 402 conserva la señal de solo lectura y adapta solo el texto a la app de Android', async () => {
  globalThis.__planUsuario.plan = { ...nuevoPlan('pym', 'Esencial'), hasta: '2020-01-01' };
  for (const ua of ['Mozilla/5.0 Safari/604.1', IOS, ANDROID]) {
    globalThis.__planCabeceras = new Headers({ 'x-ruta': '/api/facturas', 'x-metodo': 'POST', 'user-agent': ua });
    const { res } = await usuarioApi();
    assert.equal(res.status, 402);
    assert.deepEqual(await res.json(), { error: ua === ANDROID ? SOLO_LECTURA_APP : SOLO_LECTURA, soloLectura: true });
    globalThis.__planCabeceras.set('x-ruta', '/api/exportar/todo');
    globalThis.__planCabeceras.set('x-metodo', 'GET');
    assert.ok((await usuarioApi()).u);
  }
});

test('las funciones no disponibles siguen bloqueadas en las apps; solo la de Android calla los planes', async () => {
  for (const funcion of ['remesas', 'albaranes', 'cartera', 'analisis', 'proyectos', 'tesoreria', 'asistente', 'inventario']) {
    globalThis.__planCabeceras.set('user-agent', ANDROID);
    let { res } = await usuarioApi({ funcion });
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'Esta acción no está disponible en tu cuenta.' });
    globalThis.__planCabeceras.set('user-agent', IOS);
    ({ res } = await usuarioApi({ funcion }));
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /Ajustes › Tu plan/);
  }
  assert.deepEqual(globalThis.__planUsos, []);
});
