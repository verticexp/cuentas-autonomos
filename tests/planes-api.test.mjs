import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { nuevoPlan } from '../lib/prueba.js';

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
  for (const funcion of ['remesas', 'albaranes', 'cartera', 'analisis', 'proyectos', 'revision', 'tesoreria', 'asistente', 'inventario']) {
    const r = await usuarioApi({ funcion });
    assert.equal(r.res.status, 403, funcion);
    assert.match((await r.res.json()).error, /plan Esencial/);
  }
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
