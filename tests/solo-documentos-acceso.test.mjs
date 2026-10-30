// Cliente «solo documentos» (lib/perfilDocumentos.js): aunque escriba otra dirección en el navegador, no entra en nada
// más de Fisquo. Se prueba la puerta de lib/api.js usuarioApi con TODAS las rutas de la API que existen, y que cada
// pantalla pasa por lib/auth.js requerir (o es pública, o tiene su propia comprobación revisada aquí).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_DOCUMENTOS, PANTALLAS_DOCUMENTOS, permitidoDocumentos, soloDocumentos } from '../lib/perfilDocumentos.js';
import { inicioDe } from '../lib/permisos.js';

const auth = `export const bloqueoDe = () => 'off'; export const bloquearPorEmail = () => false; export const desbloqueada = async () => true; export const usuarioActual = async () => globalThis.__docUsuario;`;
const bd = `export const redis = { hincrby: async () => 1 };`;
const cabeceras = `export const headers = async () => globalThis.__docCabeceras;`;
register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(s, c, next) {
  if (s === './auth.js' && c.parentURL.endsWith('/lib/api.js')) return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(auth)}), shortCircuit: true };
  if (s === './redis.js' && /\\/lib\\/(api|usoPlan)\\.js$/.test(c.parentURL)) return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(bd)}), shortCircuit: true };
  if (s === 'next/headers') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(cabeceras)}), shortCircuit: true };
  return next(s, c);
}`), import.meta.url);
const { usuarioApi } = await import('../lib/api.js');

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
async function archivos(dir, nombre) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await archivos(p, nombre)));
    else if (e.name === nombre) out.push(p);
  }
  return out;
}
// app/api/facturas/[id]/route.js → /api/facturas/x
const rutaDe = (f) => `/${path.relative(path.join(RAIZ, 'app'), path.dirname(f)).split(path.sep).filter((x) => !/^\(.*\)$/.test(x)).map((x) => (/^\[.*\]$/.test(x) ? 'x' : x)).join('/')}`;

const cliente = { id: 'u-doc', empresa: 'e-doc', rol: 'miembro', permisos: [], plan: { tipo: 'doc', nombre: 'Documentos' }, documentos: { despacho: 'd1', desde: '2026-10-01' } };
beforeEach(() => {
  globalThis.__docUsuario = { ...cliente };
  globalThis.__docCabeceras = new Headers({ 'x-ruta': '/api/facturas', 'x-metodo': 'GET' });
});

test('el cliente «solo documentos» recibe 403 en todas las rutas de la API salvo las suyas', async () => {
  const rutas = (await archivos(path.join(RAIZ, 'app', 'api'), 'route.js')).map(rutaDe).sort();
  assert.ok(rutas.length > 100, 'se han encontrado las rutas de la API');
  const permitidas = [];
  for (const ruta of rutas) {
    for (const metodo of ['GET', 'POST', 'PATCH', 'DELETE']) {
      globalThis.__docCabeceras = new Headers({ 'x-ruta': `${ruta}?empresa=otra`, 'x-metodo': metodo });
      const r = await usuarioApi();
      if (permitidoDocumentos(ruta)) assert.ok(r.u, `${metodo} ${ruta} debería dejarle`);
      else {
        assert.equal(r.res?.status, 403, `${metodo} ${ruta} no debería dejarle`);
        assert.match((await r.res.json()).error, /solo para enviar documentos/);
      }
    }
    if (permitidoDocumentos(ruta)) permitidas.push(ruta);
  }
  // Una ruta nueva que case con la lista (o una que desaparezca) se tiene que mirar a propósito.
  assert.deepEqual(permitidas, ['/api/bloqueo', '/api/cuenta', '/api/dispositivo', '/api/documentos', '/api/documentos/archivo', '/api/dos-pasos', '/api/idioma', '/api/logout', '/api/passkey', '/api/push'].filter((r) => rutas.includes(r)).sort());
  assert.ok(permitidas.includes('/api/documentos') && permitidas.includes('/api/documentos/archivo'));
});

test('ni con permisos pedidos ni con trucos en la dirección', async () => {
  for (const ruta of ['/api/documentosx', '/api/documentos/../facturas', '/api/despacho/documentos', '/api/documentos/archivo/otra/cosa', '/API/documentos', '/api/cuenta/plan', '', null]) {
    globalThis.__docCabeceras = new Headers(ruta === null ? {} : { 'x-ruta': ruta, 'x-metodo': 'GET' });
    assert.equal((await usuarioApi()).res?.status, 403, String(ruta));
  }
  // Aunque la ruta sea suya, un permiso de Fisquo sigue sin tenerlo.
  globalThis.__docCabeceras = new Headers({ 'x-ruta': '/api/documentos', 'x-metodo': 'GET' });
  assert.equal((await usuarioApi({ permiso: 'gastos' })).res.status, 403);
  assert.ok((await usuarioApi()).u);
});

test('la gestoría que lo mira desde su panel y los demás usuarios no pasan por esta puerta', async () => {
  globalThis.__docCabeceras = new Headers({ 'x-ruta': '/api/facturas', 'x-metodo': 'GET' });
  globalThis.__docUsuario = { ...cliente, viaDespacho: { id: 'd1', nombre: 'Gestoría' }, permisos: ['resumen', 'facturas', 'gastos'] };
  assert.ok((await usuarioApi({ permiso: 'facturas' })).u);
  globalThis.__docUsuario = { id: 'u2', empresa: 'e2', rol: 'admin' };
  assert.ok((await usuarioApi({ permiso: 'facturas' })).u);
  assert.equal(soloDocumentos({ documentos: { despacho: 'd1' }, viaDespacho: { id: 'd1' } }), false);
  assert.equal(soloDocumentos({ empresa: 'e2' }), false);
});

test('su primera pantalla es /documentos y solo esa', () => {
  assert.equal(inicioDe(cliente), '/documentos');
  assert.equal(inicioDe({ ...cliente, despacho: 'otro' }), '/documentos');
  for (const ruta of ['/documentos', '/documentos/']) assert.ok(PANTALLAS_DOCUMENTOS.test(ruta), ruta);
  for (const ruta of ['/', '/facturas', '/gastos', '/ajustes', '/banco', '/nominas', '/despacho', '/documentosx', '/modelos']) assert.ok(!permitidoDocumentos(ruta), ruta);
  assert.ok(!API_DOCUMENTOS.test('/api/documentos/x/y'));
});

// Pantallas que no llaman a requerir: públicas o con su propia comprobación (revisada una a una). Una nueva tiene que
// entrar aquí a propósito; el layout raíz además manda de vuelta a /documentos (app/layout.js).
const SIN_REQUERIR = {
  '/condiciones': 'pública', '/privacidad': 'pública', '/declaracion-responsable': 'pública', '/sin-conexion': 'pública',
  '/registro': 'pública', '/recuperar': 'pública', '/login': 'pública', '/login/dos-pasos': 'pública', '/bloqueo': 'pública',
  '/confirmar-email': 'pública', '/invitacion/x': 'pública', '/invitacion/despacho': 'pública (acepta por POST)', '/invitacion/unirse': 'pública (acepta por POST)',
  '/portal/x': 'enlace con token', '/pagar/x': 'enlace con token', '/p/x': 'enlace con token',
  '/gastos/bandeja': 'solo redirige a /gastos, que pide requerir',
  '/bienvenida': 'pide el permiso «empresa», que no tiene',
  '/documentos': 'la suya: comprueba soloDocumentos',
};
test('cada pantalla de la app pide requerir o está revisada', async () => {
  const paginas = (await archivos(path.join(RAIZ, 'app'), 'page.js')).filter((f) => !f.includes(`${path.sep}(web)${path.sep}`));
  for (const f of paginas) {
    const codigo = await readFile(f, 'utf8');
    const ruta = rutaDe(f);
    if (/\brequerir(Admin|Despacho|Cliente)?\(/.test(codigo)) continue;
    assert.ok(SIN_REQUERIR[ruta], `${ruta} no llama a requerir: revísala y añádela a la lista con su motivo`);
  }
  const bienvenida = await readFile(path.join(RAIZ, 'app/bienvenida/page.js'), 'utf8');
  assert.match(bienvenida, /if \(!puede\(u, 'empresa'\)\) redirect/);
  const docs = await readFile(path.join(RAIZ, 'app/documentos/page.js'), 'utf8');
  assert.match(docs, /soloDocumentos\(u\)/);
  const layout = await readFile(path.join(RAIZ, 'app/layout.js'), 'utf8');
  assert.match(layout, /if \(docs && !PANTALLAS_DOCUMENTOS\.test\(rutaSola\)/);
  const auth = await readFile(path.join(RAIZ, 'lib/auth.js'), 'utf8');
  assert.match(auth, /if \(soloDocumentos\(u\)\) redirect\('\/documentos'\)/);
});

// Rutas de la API que leen la sesión sin usuarioApi: ninguna enseña datos de una empresa (revisadas una a una).
const SESION_DIRECTA = ['/api/confirmar', '/api/despacho/salir', '/api/invitacion/despacho', '/api/invitacion/gestoria', '/api/invitacion/unirse', '/api/logout', '/api/registro'];
test('las rutas que leen la sesión por su cuenta son las revisadas', async () => {
  const rutas = [];
  for (const f of await archivos(path.join(RAIZ, 'app', 'api'), 'route.js')) {
    const codigo = await readFile(f, 'utf8');
    if (/usuarioActual/.test(codigo) && !/usuarioApi|miDespacho|clienteDelDespacho/.test(codigo)) rutas.push(rutaDe(f));
  }
  assert.deepEqual(rutas.sort(), SESION_DIRECTA);
});
