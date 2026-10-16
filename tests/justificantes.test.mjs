import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { leerZip, zip } from '../lib/zip.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]);
const PDF = Buffer.from('%PDF-1.7\nfactura\n');

let srv, J, R, almacen;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  J = await import('../lib/justificantes.js');
  R = await import('../lib/redis.js');
});
after(() => srv?.cerrar());
beforeEach(() => { almacen = J.almacenMemoria(); J.ponerAlmacen(almacen); });

// La ruta real, con la sesión simulada (globalThis.__just.u y sus permisos) y el resto de lib/ de verdad.
async function ruta(archivo) {
  let fuente = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8');
  fuente = fuente.replace(/import \{([^}]+)\} from '@\/lib\/([^']+)';/g, (_, nombres, mod) => {
    if (mod !== 'api') return `import {${nombres}} from '${new URL(`../lib/${mod}.js`, import.meta.url)}';`;
    const mock = `export const error = (msg, status = 400) => Response.json({ error: msg }, { status });
      export const cuerpo = (req) => req.json().catch(() => ({}));
      export const usuarioApi = async ({ permiso } = {}) => (globalThis.__just.permisos.includes(permiso) || !permiso ? { u: globalThis.__just.u } : { res: Response.json({ error: "No tienes permiso" }, { status: 403 }) });`;
    return `import {${nombres}} from 'data:text/javascript,${encodeURIComponent(mock)}';`;
  });
  return import(`data:text/javascript,${encodeURIComponent(fuente)}`);
}
const peticion = (url, opciones = {}) => Object.assign(new Request(`http://netto.test${url}`, opciones), { nextUrl: new URL(`http://netto.test${url}`) });

let n = 0;
const empresa = (permisos = ['gastos', 'gastar']) => {
  n += 1;
  const u = { id: `u-just-${n}`, empresa: `e-just-${n}`, rol: 'admin', empresaNombre: 'Pruebas' };
  globalThis.__just = { u, permisos };
  return u;
};
const gasto = (id, extra = {}) => ({ id, fecha: '2026-10-13', actividad: 'servicios', concepto: 'Material', proveedor: 'Ferretería Pérez', base: 10, ivaPct: 21, ...extra });

test('solo se guardan fotos y PDF reconocidos por sus primeros bytes, de hasta 5 MB', () => {
  assert.equal(J.validarArchivo(PNG).tipo, 'image/png');
  assert.equal(J.validarArchivo(JPG).tipo, 'image/jpeg');
  assert.equal(J.validarArchivo(PDF).tipo, 'application/pdf');
  assert.equal(J.validarArchivo(Buffer.from('RIFF\0\0\0\0WEBPVP8 ')).tipo, 'image/webp');
  assert.match(J.validarArchivo(Buffer.from('<html><script>')).error, /foto .* o un PDF/);
  assert.match(J.validarArchivo(Buffer.alloc(0)).error, /vacío/);
  const grande = Buffer.concat([PDF, Buffer.alloc(J.MAX_BYTES)]);
  assert.match(J.validarArchivo(grande).error, /5 MB/);
  assert.equal(J.huellaDe(PDF), J.huellaDe(Buffer.from(PDF)));
  assert.ok(J.huellaValida(J.huellaDe(PDF)));
  assert.ok(!J.huellaValida('../../otra'));
});

test('adjuntar, ver y sustituir el justificante por la API, con su referencia en el gasto', async () => {
  const u = empresa();
  await R.guardar(u, 'gastos', gasto('g1'));
  const api = await ruta('app/api/gastos/justificante/route.js');
  const sin = await api.GET(peticion('/api/gastos/justificante?id=g1'));
  assert.equal(sin.status, 404);

  const r = await api.PUT(peticion('/api/gastos/justificante?id=g1', { method: 'PUT', body: JPG, headers: { 'content-type': 'image/jpeg' } }));
  assert.equal(r.status, 200, await r.clone().text());
  const g = await R.leerUno(u, 'gastos', 'g1');
  assert.deepEqual({ ...g.archivo, subido: undefined }, { clave: `justificantes/${u.empresa}/g1-${J.huellaDe(JPG).slice(0, 16)}.jpg`, tipo: 'image/jpeg', tamano: JPG.length, huella: J.huellaDe(JPG), subido: undefined });
  assert.equal(g.concepto, 'Material');
  assert.ok(almacen.datos.has(g.archivo.clave));

  const ver = await api.GET(peticion('/api/gastos/justificante?id=g1'));
  assert.equal(ver.status, 200);
  assert.equal(ver.headers.get('content-type'), 'image/jpeg');
  assert.equal(ver.headers.get('cache-control'), 'private, no-store');
  assert.match(ver.headers.get('content-disposition'), /^inline; filename="2026-10-13-Ferreteria-Perez-g1\.jpg"$/);
  assert.deepEqual(Buffer.from(await ver.arrayBuffer()), JPG);

  // Sustituir: el archivo anterior se borra del almacén.
  const s = await api.PUT(peticion('/api/gastos/justificante?id=g1', { method: 'PUT', body: PDF, headers: { 'content-type': 'application/pdf' } }));
  assert.equal(s.status, 200);
  const g2 = await R.leerUno(u, 'gastos', 'g1');
  assert.equal(g2.archivo.tipo, 'application/pdf');
  assert.deepEqual([...almacen.datos.keys()], [g2.archivo.clave]);
});

test('sin permiso no se ve ni se sube; un archivo raro o un gasto que no existe no dejan nada guardado', async () => {
  const u = empresa(['gastos']);
  await R.guardar(u, 'gastos', gasto('g1'));
  const api = await ruta('app/api/gastos/justificante/route.js');
  assert.equal((await api.PUT(peticion('/api/gastos/justificante?id=g1', { method: 'PUT', body: PNG }))).status, 403);
  globalThis.__just.permisos = [];
  assert.equal((await api.GET(peticion('/api/gastos/justificante?id=g1'))).status, 403);
  globalThis.__just.permisos = ['gastos', 'gastar'];
  assert.equal((await api.PUT(peticion('/api/gastos/justificante?id=g1', { method: 'PUT', body: Buffer.from('<svg onload=alert(1)>') }))).status, 400);
  assert.equal((await api.PUT(peticion('/api/gastos/justificante?id=otro', { method: 'PUT', body: PNG }))).status, 404);
  assert.equal(almacen.datos.size, 0);
  assert.equal((await R.leerUno(u, 'gastos', 'g1')).archivo, undefined);
});

test('la clave de otra empresa nunca se lee ni se borra', async () => {
  const u = empresa();
  await almacen.poner('justificantes/otra/g9-x.pdf', PDF);
  await R.guardar(u, 'gastos', gasto('g1', { archivo: { clave: 'justificantes/otra/g9-x.pdf', tipo: 'application/pdf', tamano: PDF.length } }));
  const api = await ruta('app/api/gastos/justificante/route.js');
  assert.equal((await api.GET(peticion('/api/gastos/justificante?id=g1'))).status, 404);
  await J.borrarJustificantes(u, [{ clave: 'justificantes/otra/g9-x.pdf' }]);
  assert.ok(almacen.datos.has('justificantes/otra/g9-x.pdf'));
});

test('sin almacén configurado (producción sin Blob) se avisa y el gasto no cambia', async () => {
  const u = empresa();
  J.ponerAlmacen(null);
  await R.guardar(u, 'gastos', gasto('g1'));
  const api = await ruta('app/api/gastos/justificante/route.js');
  const r = await api.PUT(peticion('/api/gastos/justificante?id=g1', { method: 'PUT', body: PNG }));
  assert.equal(r.status, 503);
  assert.match((await r.json()).error, /no está configurado/);
});

test('borrar el gasto borra su justificante; la purga de una baja borra los de la empresa', async () => {
  const u = empresa();
  const { archivo } = await J.subirJustificante(u, 'g1', PNG);
  await R.guardar(u, 'gastos', gasto('g1', { archivo }));
  await almacen.poner(`justificantes/${u.empresa}/suelto.pdf`, PDF);
  await almacen.poner('justificantes/otra/g2.pdf', PDF);
  const { borrarGasto } = await import('../lib/gastosServidor.js');
  const { antes } = await borrarGasto(u, 'g1');
  await J.borrarJustificantes(u, [antes.archivo]);
  assert.ok(!almacen.datos.has(archivo.clave));
  // Lo que hace DELETE /api/gastos: la ruta llama a borrarJustificantes con el gasto borrado.
  const fuente = await readFile(new URL('../app/api/gastos/route.js', import.meta.url), 'utf8');
  assert.match(fuente, /if \(antes\?\.archivo\) await borrarJustificantes\(u, \[antes\.archivo\]\);/);
  assert.equal(await J.borrarDeEmpresa(u.empresa), 1);
  assert.deepEqual([...almacen.datos.keys()], ['justificantes/otra/g2.pdf']);
});

test('los justificantes van en el .zip con un nombre legible; los que faltan, en FALTAN.txt', async () => {
  const u = empresa();
  const a = (await J.subirJustificante(u, 'g1', PDF)).archivo;
  const b = (await J.subirJustificante(u, 'g2', JPG)).archivo;
  await almacen.borrar([b.clave]);
  const gastos = [gasto('g1', { archivo: a }), gasto('g2', { archivo: b, proveedor: '', concepto: 'Taxi a Bilbao' }), gasto('g3'), gasto('g4', { archivo: { huella: 'abc' } })];
  const archivos = await J.justificantesParaZip(u, gastos);
  const z = leerZip(zip(archivos));
  assert.deepEqual(Object.keys(z), ['justificantes/2026-10-13-Ferreteria-Perez-g1.pdf', 'justificantes/FALTAN.txt']);
  assert.deepEqual(z['justificantes/2026-10-13-Ferreteria-Perez-g1.pdf'], PDF);
  assert.match(z['justificantes/FALTAN.txt'].toString(), /2026-10-13-Taxi-a-Bilbao-g2\.jpg: no se ha podido leer/);
  const justo = await J.justificantesParaZip(u, [gasto('g1', { archivo: a })], { tope: 3 });
  assert.match(String(justo.at(-1).datos), /no cabe/);
});

test('el almacén en disco (desarrollo) guarda, lista y borra en una carpeta temporal', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const dir = await mkdtemp(path.join(tmpdir(), 'just-'));
  const d = J.almacenDisco(dir);
  await d.poner('justificantes/e1/g1-a.pdf', PDF);
  assert.deepEqual(await d.leer('justificantes/e1/g1-a.pdf'), PDF);
  assert.deepEqual(await d.listar('justificantes/e1/'), ['justificantes/e1/g1-a.pdf']);
  await d.borrar(['justificantes/e1/g1-a.pdf']);
  assert.equal(await d.leer('justificantes/e1/g1-a.pdf'), null);
  await rm(dir, { recursive: true, force: true });
});
