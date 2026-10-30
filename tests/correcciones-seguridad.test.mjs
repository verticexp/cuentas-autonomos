// Correcciones de seguridad (auditoría de octubre de 2026): una prueba de regresión por fallo, contra el cliente Upstash
// real con transporte REST en memoria y sin puertos. La recuperación de copias (1) va en tests/copias.test.mjs.
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';
import { zip } from '../lib/zip.js';
import { leerHoja } from '../lib/hoja.js';

const base = crearBase();
const fetchOriginal = globalThis.fetch;
const entorno = { KV_REST_API_URL: process.env.KV_REST_API_URL, KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN };
process.env.KV_REST_API_URL = 'https://seguridad.test';
process.env.KV_REST_API_TOKEN = 'solo-pruebas';
let respuestaScript = null; // lo que devuelve «el Apps Script del usuario» (S10)
globalThis.fetch = async (url, opciones) => {
  if (new URL(String(url)).origin === 'https://script.test' && respuestaScript) return respuestaScript();
  if (new URL(String(url)).origin !== 'https://seguridad.test') throw new Error('Petición inesperada: ' + String(url));
  const comandos = JSON.parse(opciones.body);
  const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
  const codificar = new Headers(opciones.headers).get('upstash-encoding') === 'base64';
  const ejecutar = (c) => {
    try {
      const r = base.run(c);
      return { result: codificar ? b64(r) : r };
    } catch (e) { return { error: e.message }; }
  };
  return Response.json(/\/(pipeline|multi-exec)/.test(String(url)) ? comandos.map(ejecutar) : ejecutar(comandos));
};
after(() => {
  globalThis.fetch = fetchOriginal;
  for (const [k, v] of Object.entries(entorno)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(() => base.run(['flushdb']));

const { redis, guardar, leerUno, leer, clave } = await import('../lib/redis.js');
const P = await import('../lib/portal.js');
const E = await import('../lib/enlaces.js');
const F = await import('../lib/facturas.js');

const token = (ruta) => ruta.split('/').pop();
const doc = (id, nombre, nif, extra = {}) => ({ id, numero: Number(id.replace(/\D/g, '')) || 1, anio: 2026, fecha: '2026-03-01', cliente: { nombre, ...(nif ? { nif } : {}) }, concepto: 'x', base: 100, ivaPct: 21, irpfPct: 0, ...extra });

// 2. Cambiar el enlace del portal revoca también los enlaces de presupuesto que ese portal enseñaba.
test('S02: cambiar el enlace del portal rota los tokens de presupuesto del cliente', async () => {
  const u = { id: 'u2', empresa: 'e2' };
  await redis.hset('empresas', { e2: { id: 'e2', emisor: { nombre: 'Emisora' } } });
  await guardar(u, 'clientes', { id: 'CLI', nombre: 'Cli', nif: '12345678Z' });
  const p = { ...doc('P1', 'Cli', '12345678Z'), token: 'tokviejo' };
  await guardar(u, 'presupuestos', p);
  await redis.hset('presupuesto-enlaces', { tokviejo: { empresa: 'e2', id: 'P1' } });
  const viejo = await P.enlacePortal(u, 'Cli', '12345678Z');
  assert.equal((await P.portalDe(token(viejo))).presupuestos[0].token, 'tokviejo');
  await E.cambiarEnlacePortal(u, 'Cli', '12345678Z');
  assert.equal(await redis.hget('presupuesto-enlaces', 'tokviejo'), null, 'el token visto en el portal anterior ya no existe');
  const nuevo = (await leerUno(u, 'presupuestos', 'P1')).token;
  assert.notEqual(nuevo, 'tokviejo');
  assert.deepEqual(await redis.hget('presupuesto-enlaces', nuevo), { empresa: 'e2', id: 'P1' });
  const { POST } = await import('../app/api/presupuestos/aceptar/route.js');
  const res = await POST(new Request('http://fisquo.test/api/presupuestos/aceptar', { method: 'POST', body: JSON.stringify({ token: 'tokviejo', nombre: 'Intruso', acepta: true }) }));
  assert.equal(res.status, 404);
  assert.equal((await leerUno(u, 'presupuestos', 'P1')).respuesta, undefined);
});

// 3. Un enlace emitido para un documento sin NIF conserva esa identidad: no toma ni recibe el NIF de otra factura.
test('S03: el portal de un documento sin NIF no enseña ni deja tocar las facturas de otro cliente homónimo', async () => {
  const u = { id: 'u3', empresa: 'e3' };
  await redis.hset('empresas', { e3: { id: 'e3', emisor: { nombre: 'Emisora' } } });
  const ficha = (nif) => guardar(u, 'clientes', { id: 'HOM', nombre: 'Hom', ...(nif ? { nif } : {}) });
  await ficha('11111111H'); await guardar(u, 'facturas', doc('FA1', 'Hom', '11111111H'));
  await ficha(''); await guardar(u, 'facturas', doc('FC2', 'Hom', ''));
  const L0 = await P.enlacePortal(u, 'Hom', '');
  await ficha('22222222J'); await guardar(u, 'facturas', doc('FB3', 'Hom', '22222222J'));
  await ficha('11111111H'); await guardar(u, 'facturas', doc('FA4', 'Hom', '11111111H'));
  await ficha('22222222J'); await guardar(u, 'facturas', doc('FB5', 'Hom', '22222222J'));
  const LB = await P.enlacePortal(u, 'Hom', '22222222J');
  assert.notEqual(LB, L0, 'el cliente con NIF no hereda el enlace del documento sin NIF');
  assert.equal(await P.enlacePortal(u, 'Hom', ''), L0);
  assert.equal((await redis.hget('portal-enlaces', token(L0))).nif, undefined, 'el enlace sin NIF no recibe uno');
  const ids = (await P.portalDe(token(L0))).facturas.map((f) => f.id);
  assert.ok(!ids.some((i) => i.startsWith('FB')), `el portal sin NIF no enseña facturas de otro cliente: ${ids}`);
  assert.deepEqual((await P.portalDe(token(LB))).facturas.map((f) => f.id), ['FB5', 'FB3']);
  const { POST } = await import('../app/api/portal/estado/route.js');
  const form = new FormData();
  form.set('t', token(L0)); form.set('id', 'FB5'); form.set('estado', 'aceptada');
  const req = new Request('http://fisquo.test/api/portal/estado', { method: 'POST', body: form });
  req.nextUrl = new URL(req.url);
  assert.equal((await POST(req)).status, 404);
  assert.equal((await leerUno(u, 'facturas', 'FB5')).estadoCliente, undefined);
});

// 4. La importación no pisa una factura emitida (o borrada) después de la vista previa.
test('S04: guardarImportadas no sobrescribe facturas existentes, vivas ni borradas', async () => {
  const u = { id: 'u4', empresa: 'e4', emisor: { nombre: 'Emisora S.L.', nif: 'B12345674' }, actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] };
  const f = (n, extra = {}) => ({ ...doc(`2026-${n}`, 'Cli', '12345678Z', { numero: n, actividad: 'servicios' }), ...extra });
  // Entre la vista previa y el guardado, la emisión registra 2026-2 en Verifactu y 2026-3 queda borrada.
  await redis.hset(clave(u, 'facturas'), { '2026-2': f(2, { verifactu: { huella: 'emitida' } }) });
  await redis.hset(clave(u, 'facturasBorradas'), { '2026-3': f(3, { anulada: true }) });
  const nuevas = [f(1), f(2, { concepto: 'importada' }), f(3, { concepto: 'importada' }), f(4)];
  assert.equal(await F.guardarImportadas(u, nuevas), 2);
  assert.deepEqual(nuevas.map((x) => x.id), ['2026-1', '2026-4'], 'quedan solo las guardadas (la ruta crea clientes solo de ellas)');
  const guardada = await leerUno(u, 'facturas', '2026-2');
  assert.deepEqual(guardada.verifactu, { huella: 'emitida' });
  assert.notEqual(guardada.concepto, 'importada');
  assert.equal(await leerUno(u, 'facturas', '2026-3'), null);
  assert.ok(await leerUno(u, 'facturas', '2026-4'));
});

// 5. El token del Apps Script de Drive solo viaja al navegador en la sección «drive».
test('S05: Ajustes recibe la ficha de Drive solo en la sección drive', async () => {
  const fuente = await readFile(new URL('../app/ajustes/[seccion]/page.js', import.meta.url), 'utf8');
  const uso = fuente.match(/<Ajustes seccion=\{seccion\}[^\n]*/)?.[0] || '';
  assert.match(uso, /drive=\{seccion === 'drive' \? u\.drive : null\}/);
  assert.match(uso, /driveError=\{seccion === 'drive' \? u\.driveError : null\}/);
  assert.ok(!/drive=\{u\.drive\}/.test(fuente), 'ninguna sección recibe la ficha entera');
  // La sección que sí la recibe exige empresa y DETALLE antes de pintar.
  assert.match(fuente, /DE_EMPRESA = \[[^\]]*'drive'/);
  assert.match(fuente, /\['gestoria', 'drive'\]\.includes\(seccion\) && !puede\(u, DETALLE\)/);
});

// 6. Redirección abierta en /bloqueo.
test('S06: el destino de /bloqueo no sale de Fisquo', async () => {
  const { destinoInterno } = await import('../lib/destinoInterno.js');
  for (const a of ['/\t/destino.invalid', '/\n/destino.invalid', '/\r//destino.invalid', '//destino.invalid', '/\\destino.invalid', '/ /x', '/..//destino.invalid', 'https://destino.invalid', 'javascript:alert(1)', '/bloqueo?a=/x', '', undefined, 5]) assert.equal(destinoInterno(a), '/', JSON.stringify(a));
  assert.equal(destinoInterno('/facturas?anio=2026#x'), '/facturas?anio=2026#x');
  assert.equal(destinoInterno('/'), '/');
  for (const f of ['../app/bloqueo/page.js', '../components/Bloqueo.js']) assert.match(await readFile(new URL(f, import.meta.url), 'utf8'), /destinoInterno\(a\)/);
});

// 7. El «sí» por WhatsApp vuelve a comprobar el permiso del efecto.
test('S07: quitar «facturar» o «gastar» vale también para los borradores pendientes de WhatsApp', async () => {
  const { atenderMensaje } = await import('../lib/whatsappServidor.js');
  const tel = '34600000001';
  const usuario = (permisos) => ({ id: 'w1', email: 'w1@ejemplo.test', nombre: 'W', empresa: 'e7', rol: 'miembro', permisos, pv: 2 });
  await redis.hset('empresas', { e7: { id: 'e7', nombre: 'Emisora', emisor: { nombre: 'Emisora' } } });
  await redis.set(`whatsapp:tel:${tel}`, { usuario: 'w1', empresa: 'e7', desde: '2026-10-01T00:00:00.000Z' });
  const u = { id: 'w1', empresa: 'e7' };
  let n = 0;
  const si = (permisos) => redis.hset('usuarios', { w1: usuario(permisos) }).then(() => atenderMensaje({ id: `m${++n}`, de: tel, texto: 'sí' }));
  // Factura: el borrador se preparó con el permiso; después se quita.
  await redis.set(`whatsapp:borrador:${tel}`, { tipo: 'factura', entrega: 'whatsapp', email: '', datos: doc('B1', 'Cli', '12345678Z') }, { ex: 1800 });
  const r1 = await si(['gastar']);
  assert.match(r1, /no tiene permiso para crear facturas/);
  assert.equal(await redis.get(`whatsapp:borrador:${tel}`), null, 'el borrador se descarta');
  assert.deepEqual(await leer(u, 'facturas'), []);
  // Gasto: igual con «gastar».
  await redis.set(`whatsapp:borrador:${tel}`, { tipo: 'gasto', bandeja: 'x1', propuesta: { proveedor: 'P', base: 10 }, duplicados: 0 }, { ex: 1800 });
  const r2 = await si(['facturar']);
  assert.match(r2, /no tiene permiso para apuntar gastos/);
  assert.equal(await redis.get(`whatsapp:borrador:${tel}`), null);
});

// 8. Lo compartido por el service worker no se sube sin que la persona lo acepte.
test('S08: la bandeja enseña los nombres y solo sube lo compartido tras confirmar; cancelar vacía la caché', async () => {
  const { leerCompartidos, descartarCompartidos } = await import('../lib/compartidoCliente.js');
  const almacen = new Map();
  const cache = { keys: async () => [...almacen.keys()], match: async (k) => almacen.get(k)?.clone(), put: async (k, r) => { almacen.set(k, r); } };
  globalThis.window = { caches: { open: async () => cache, delete: async () => { almacen.clear(); return true; } } };
  try {
    const llenar = () => cache.put('/compartido/1-0', new Response(new Blob(['%PDF-']), { headers: { 'Content-Type': 'application/pdf', 'X-Nombre': encodeURIComponent('factura ajena.pdf') } }));
    await llenar();
    const vistos = await leerCompartidos({ conservar: true });
    assert.deepEqual(vistos.map((f) => f.name), ['factura ajena.pdf']);
    assert.equal(almacen.size, 1, 'mirar lo compartido no vacía la caché');
    await descartarCompartidos();
    assert.equal(almacen.size, 0, 'cancelar la deja vacía');
    await llenar();
    assert.equal((await leerCompartidos()).length, 1);
    assert.equal(almacen.size, 0, 'leer sin conservar sigue consumiéndola (uso de siempre)');
  } finally { delete globalThis.window; }
  // La bandeja pregunta (con los nombres) antes de subir, y es el único sitio donde sube lo compartido.
  const bandeja = await readFile(new URL('../components/Bandeja.js', import.meta.url), 'utf8');
  assert.equal(bandeja.match(/subir\(l, 'compartido'\)/g).length, 1);
  assert.ok(bandeja.indexOf("confirmar({ titulo: tr('Subir archivos compartidos')") < bandeja.indexOf("subir(l, 'compartido')"));
  assert.match(bandeja, /f\.name/);
  assert.match(bandeja, /if \(!si\) \{ await descartarCompartidos\(\); return; \}/);
  assert.equal(bandeja.match(/leerCompartidos\(\)/g), null, 'siempre con {conservar: true}');
});

// 9. El análisis del XML de un .xlsx no es cuadrático.
test('S09: un .xlsx con miles de aperturas sin cierre se lee en tiempo lineal y el válido sigue igual', () => {
  const excel = (xml, extra = []) => zip([{ nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from(`<worksheet><sheetData>${xml}</sheetData></worksheet>`) }, ...extra]);
  const medir = (xml, extra) => { const t = process.hrtime.bigint(); try { leerHoja(excel(xml, extra)); } catch {} return Number(process.hrtime.bigint() - t) / 1e6; };
  for (const trozo of ['<row>', '<c>', '<row r="1"><c r="A1"><v>']) {
    const ms = medir(trozo.repeat(Math.ceil(2e6 / trozo.length)));
    assert.ok(ms < 1500, `${trozo}: ${ms} ms con 2 MB`);
  }
  const compartidas = zip([{ nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>') },
    { nombre: 'xl/sharedStrings.xml', datos: Buffer.from('<sst>' + '<si>'.repeat(400000) + '</sst>') }]);
  const t = Date.now(); leerHoja(compartidas); assert.ok(Date.now() - t < 1500, 'sharedStrings sin cierre');
  // Comportamiento de siempre con entrada válida: textos compartidos, inline, huecos y filas autocerradas.
  const filas = leerHoja(zip([
    { nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>2.5</v></c></row><row r="2"/><row r="3"><c r="A3" t="inlineStr"><is><t xml:space="preserve">a &amp; b</t></is></c><c r="B3"/></row></sheetData></worksheet>') },
    { nombre: 'xl/sharedStrings.xml', datos: Buffer.from('<sst><si><t>Hola</t></si><si><r><t>x</t></r></si></sst>') },
  ]), { vacias: true });
  assert.deepEqual(filas, [['Hola', '', 2.5], [], ['a & b', '']]);
});

// 10. La respuesta del Apps Script del usuario se lee con tope y se analiza en tiempo lineal.
test('S10: Drive lee como mucho 64 KB de la respuesta y limpia el HTML sin coste cuadrático', async () => {
  const { enviar, textoVisible } = await import('../lib/drive.js');
  assert.equal(textoVisible('<html><style>a{}</STYLE><script>x()</script><p>Hola&nbsp;<b>mundo</b></p></html>'), 'Hola mundo');
  assert.equal(textoVisible('x <b'), 'x <b');
  const t = Date.now();
  textoVisible('<script'.repeat(40000) + '<style>'.repeat(40000) + '<'.repeat(200000));
  assert.ok(Date.now() - t < 1000, 'sin cierre: lineal');
  // enviar(): una respuesta enorme (en trozos) se corta pronto y no se lee entera.
  let leidos = 0;
  respuestaScript = () => new Response(new ReadableStream({ pull(c) { leidos += 65536; c.enqueue(new TextEncoder().encode('<script '.repeat(8192))); if (leidos > 1e9) c.close(); } }), { status: 200 });
  const ini = Date.now();
  const r = await enviar({ id: 'd1', empresa: 'ed', drive: { url: 'https://script.test/macros/exec', token: 't' } }, { tipo: 'prueba' });
  respuestaScript = null;
  assert.equal(r.ok, false);
  assert.ok(leidos <= 4 * 65536, `leídos ${leidos} bytes`);
  assert.ok(Date.now() - ini < 2000);
  respuestaScript = () => Response.json({ ok: true });
  assert.equal((await enviar({ id: 'd1', empresa: 'ed', drive: { url: 'https://script.test/x', token: 't' } }, {})).ok, true);
  respuestaScript = null;
});
