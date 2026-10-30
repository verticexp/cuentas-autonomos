import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { crearBase } from './apoyo/upstash-mem.mjs';

// Persistencia, índices, permisos, sesiones y rutas reales; transporte Upstash en memoria, sin abrir puertos.
const base = crearBase();
const fetchOriginal = globalThis.fetch;
const entorno = { KV_REST_API_URL: process.env.KV_REST_API_URL, KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN };
process.env.KV_REST_API_URL = 'https://seguridad-api.test';
process.env.KV_REST_API_TOKEN = 'solo-pruebas';
globalThis.fetch = async (url, opciones) => {
  assert.equal(new URL(String(url)).origin, 'https://seguridad-api.test', 'ninguna petición sale a un servicio externo');
  const comandos = JSON.parse(opciones.body);
  const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
  const codificar = new Headers(opciones.headers).get('upstash-encoding') === 'base64';
  const ejecutar = (c) => {
    try { const r = base.run(c); return { result: codificar ? b64(r) : r }; }
    catch (e) { return { error: e.message }; }
  };
  return Response.json(/\/(pipeline|multi-exec)/.test(String(url)) ? comandos.map(ejecutar) : ejecutar(comandos));
};

// Solo se sustituyen el contexto de Next, la ejecución después de responder y la lectura externa del PDF con IA.
const contexto = '__pruebaSeguridadApi';
globalThis[contexto] = {};
const modulo = (fuente) => ({ url: `data:text/javascript,${encodeURIComponent(fuente)}`, shortCircuit: true });
const hooks = registerHooks({
  resolve(spec, ctx, next) {
    if (['next/headers', 'next/headers.js'].includes(spec)) return modulo(`
      export const headers = async () => globalThis.${contexto}.headers;
      export const cookies = async () => ({ get: (k) => globalThis.${contexto}.cookies[k] ? { value: globalThis.${contexto}.cookies[k] } : undefined });
    `);
    if (['next/navigation', 'next/navigation.js'].includes(spec)) return modulo('export const redirect = () => { throw new Error("Redirección inesperada"); };');
    if (['next/server', 'next/server.js'].includes(spec)) return modulo('export const after = () => {};');
    if (spec === './lecturaIA.js' && ctx.parentURL === new URL('../lib/bandejaServidor.js', import.meta.url).href) {
      return modulo(`export const leerConCupo = async () => ({ gasto: globalThis.${contexto}.lectura });`);
    }
    if (spec.startsWith('@/')) return next(new URL(`../${spec.slice(2)}.js`, import.meta.url).href, ctx);
    return next(spec, ctx);
  },
});
after(() => {
  hooks.deregister();
  globalThis.fetch = fetchOriginal;
  delete globalThis[contexto];
  for (const [k, v] of Object.entries(entorno)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

const { redis, guardar, leerUno, leer } = await import('../lib/redis.js');
const { usuarioActual, quitarDeEmpresa } = await import('../lib/auth.js');
const { puede } = await import('../lib/permisos.js');
const { hoy } = await import('../lib/formato.js');
const D = await import('../lib/despachos.js');
const C = await import('../lib/cierres.js');
const F = await import('../lib/facturas.js');
const B = await import('../lib/bandejaServidor.js');
const { remitenteConocido } = await import('../lib/buzon.js');
const { MAX_CUARENTENA, MAX_CUARENTENA_REMITENTE, DIAS_CUARENTENA } = await import('../lib/bandeja.js');
const { ponerAlmacen, almacenMemoria, leerJustificante } = await import('../lib/justificantes.js');
const A = await import('../lib/apiPublica.js');
const { paginaGastos } = await import('../lib/apiPublicaDatos.js');
const W = await import('../lib/webhooks.js');
const tuDespacho = await import('../app/api/tu-despacho/route.js');
const clienteDespacho = await import('../app/api/despacho/cliente/route.js');
const peticiones = await import('../app/api/tu-despacho/peticiones/route.js');
const ajustesApi = await import('../app/api/ajustes/api/route.js');
const detalleGasto = await import('../app/api/v1/gastos/[id]/route.js');
const importarBanco = await import('../app/api/banco/importar/route.js');

const admin = { id: 'u1', nombre: 'Ana', email: 'ana@example.com', empresa: 'e1', rol: 'admin', emailConfirmado: true };
const pdf = Buffer.from('%PDF-1.7\nFactura del proveedor de confianza');
const propuesta = { proveedor: 'Materiales Norte', nif: 'B12345674', concepto: 'Material', numero: 'F-001', fecha: '2026-01-15', base: 100, ivaPct: 21, irpfPct: 0, cuadra: true, avisos: [] };
let almacen;
beforeEach(async () => {
  base.run(['flushdb']);
  almacen = almacenMemoria();
  ponerAlmacen(almacen);
  globalThis[contexto] = { headers: new Headers(), cookies: {}, lectura: { ...propuesta } };
  await redis.hset('empresas', { e1: { id: 'e1', nombre: 'Cliente', emisor: {}, buzon: { remitentes: [] } } });
  await persona(admin);
});
after(() => ponerAlmacen(undefined));

async function persona(p) {
  await redis.hset('usuarios', { [p.id]: p });
  if (p.email) await redis.hset('emails', { [p.email.toLowerCase()]: p.id });
  return p;
}
async function empresa(datos) {
  const e = { ...(await redis.hget('empresas', 'e1')), ...datos };
  await redis.hset('empresas', { e1: e });
  return e;
}
async function sesion(p = admin, ruta = '/api/tu-despacho', metodo = 'GET') {
  await redis.set('sesion:prueba', p.id);
  globalThis[contexto].cookies = { t: 'prueba', e: p.empresa };
  globalThis[contexto].headers = new Headers({ 'x-ruta': ruta, 'x-metodo': metodo });
  return usuarioActual();
}
function json(ruta, datos, method = 'POST') {
  return new Request(`https://fisquo.test${ruta}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
}
async function despacho() {
  const { despacho: d } = await D.crearDespacho({ nombre: 'Asesoría Norte', codigo: 'NORTE', titular: 'gestor', empresa: 'propia' });
  await persona({ id: 'gestor', nombre: 'Gestor', empresa: 'propia', despacho: d.id, rol: 'admin', emailConfirmado: true });
  await redis.hset('empresas', { propia: { id: 'propia', nombre: 'Asesoría' } });
  return d;
}
async function vincular(d) {
  await D.unirCliente('e1', d, 'cliente');
  await D.aceptarCliente('e1', d.id);
}
async function confianza(remitentes = []) {
  await guardar(admin, 'proveedoresConfianza', { id: 'norte', proveedor: propuesta.proveedor, proveedorNif: propuesta.nif, remitentes });
}
async function leerPdf(opciones) {
  const r = await B.recibirArchivo(admin, pdf, { nombre: 'factura.pdf', ...opciones });
  assert.ok(r.doc, JSON.stringify(r));
  if (r.doc.estado === 'cuarentena') await B.releer(admin, r.doc.id);
  const lectura = await B.leerDocumento(admin, r.doc.id);
  assert.equal(lectura.leido, true, JSON.stringify(lectura));
  return leerUno(admin, 'bandeja', r.doc.id);
}

test('seguridad 1: solo cierra trimestres terminados; revocar al despacho permite facturar y el administrador reabre los antiguos', async () => {
  const d = await despacho();
  await vincular(d);
  await sesion(await redis.hget('usuarios', 'gestor'), '/api/despacho/cliente', 'POST');
  const dia = hoy(), anio = Number(dia.slice(0, 4)), t = Math.ceil(Number(dia.slice(5, 7)) / 3);
  for (const periodo of [{ anio, t }, { anio: 2100, t: 4 }]) {
    const r = await clienteDespacho.POST(json('/api/despacho/cliente', { empresa: 'e1', accion: 'cerrar', ...periodo }));
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /aún no ha terminado/);
  }
  assert.deepEqual(await C.cierresDe(admin), {});
  const r = await clienteDespacho.POST(json('/api/despacho/cliente', { empresa: 'e1', accion: 'cerrar', anio: 2025, t: 1 }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).cierre.despachoId, d.id);
  const u = await sesion();
  const datos = { fecha: '2025-02-15', concepto: 'Servicio', cliente: { nombre: 'Cliente', nif: 'B12345674' }, base: 100, ivaPct: 21 };
  assert.match((await F.crearFactura(u, datos)).error, /cerrado/);
  await sesion(admin, '/api/tu-despacho', 'DELETE');
  assert.equal((await tuDespacho.DELETE()).status, 200);
  // Incluso un contexto obtenido antes de la revocación consulta el vínculo actual.
  assert.deepEqual(await C.cierresDe(u), {});
  const alta = await F.crearFactura(u, datos);
  assert.ok(alta.factura, JSON.stringify(alta));
  await redis.hset('cierres:e1', { '2025-2': { fecha: '2025-07-01', despacho: 'Asesoría antigua' } });
  await sesion(admin, '/api/tu-despacho', 'PATCH');
  assert.match(await C.comprobarCierre(admin, '2025-05-15'), /cerrado/);
  assert.equal((await tuDespacho.PATCH(json('/api/tu-despacho', { accion: 'reabrir', anio: 2025, t: 2 }, 'PATCH'))).status, 200);
  assert.equal(await C.comprobarCierre(admin, '2025-05-15'), null);
});

test('seguridad 2: dar acceso a la gestoría exige todos los permisos que recibirá', async () => {
  await despacho();
  const miembro = await persona({ ...admin, id: 'miembro', rol: 'miembro', permisos: ['empresa'], pv: 2 });
  await sesion(miembro, '/api/tu-despacho', 'POST');
  assert.equal((await tuDespacho.POST(json('/api/tu-despacho', { codigo: 'NORTE' }))).status, 403);
  assert.equal((await redis.hget('empresas', 'e1')).despachoCliente, undefined);
  for (const p of [admin, { ...miembro, permisos: ['empresa', ...D.PERMISOS_DESPACHO] }]) {
    await persona(p);
    await sesion(p, '/api/tu-despacho', 'POST');
    assert.equal((await tuDespacho.POST(json('/api/tu-despacho', { codigo: 'NORTE' }))).status, 200);
  }
});

test('seguridad 3: peticiones exige resumen, y entregar el ticket exige además gastos', async () => {
  const d = await despacho();
  await vincular(d);
  const miembro = await persona({ ...admin, id: 'miembro', rol: 'miembro', permisos: [], pv: 2 });
  for (const [metodo, llamar] of [['GET', () => peticiones.GET()], ['PATCH', () => peticiones.PATCH(json('/api/tu-despacho/peticiones', { gasto: 'g1' }, 'PATCH'))], ['PUT', () => peticiones.PUT({})]]) {
    await sesion(miembro, '/api/tu-despacho/peticiones', metodo);
    assert.equal((await llamar()).status, 403);
  }
  const conResumen = { ...miembro, permisos: ['resumen'] };
  await persona(conResumen);
  await sesion(conResumen, '/api/tu-despacho/peticiones', 'GET');
  assert.equal((await peticiones.GET()).status, 200);
  await sesion(conResumen, '/api/tu-despacho/peticiones', 'PATCH');
  assert.equal((await peticiones.PATCH(json('/api/tu-despacho/peticiones', { gasto: 'g1' }, 'PATCH'))).status, 403);
  const conGastos = { ...miembro, permisos: ['resumen', 'gastos'] };
  await persona(conGastos);
  await guardar(admin, 'gastos', { id: 'g1', fecha: '2026-01-15', base: 100, archivo: { clave: 'justificantes/e1/ticket.pdf' } });
  await sesion(conGastos, '/api/tu-despacho/peticiones', 'PATCH');
  assert.equal((await peticiones.PATCH(json('/api/tu-despacho/peticiones', { gasto: 'g1' }, 'PATCH'))).status, 200);
  await redis.hset('despacho-peticiones:e1', { p1: { id: 'p1', despacho: d.id, tipo: 'documento', texto: 'Contrato', estado: 'pendiente' } });
  await sesion(conResumen, '/api/tu-despacho/peticiones', 'PUT');
  const req = new Request('https://fisquo.test/api/tu-despacho/peticiones?id=p1', { method: 'PUT', body: pdf });
  req.nextUrl = new URL(req.url);
  assert.equal((await peticiones.PUT(req)).status, 200);
  assert.equal((await redis.hget('despacho-peticiones:e1', 'p1')).estado, 'entregada');
});

test('seguridad 4: releer y aprobar sola una factura en cuarentena no amplía los remitentes conocidos', async () => {
  const de = 'externo@example.com';
  await confianza([de]);
  const d = await leerPdf({ origen: 'correo', correo: { de }, cuarentena: true });
  assert.equal(d.estado, 'aprobado');
  assert.deepEqual((await redis.hget('empresas', 'e1')).buzon.remitentes, []);
  const e = await redis.hget('empresas', 'e1');
  assert.equal(await remitenteConocido({ ...e, empresa: e.id }, de), false);
  const siguiente = await B.recibirArchivo(admin, Buffer.concat([pdf, Buffer.from('\nOtro adjunto')]), { origen: 'correo', correo: { de }, cuarentena: true });
  assert.equal(siguiente.doc.estado, 'cuarentena');
});

test('seguridad 5: el PDF de confianza solo se aprueba desde miembros con gastar o remitentes validados para ese proveedor', async () => {
  await confianza();
  await guardar(admin, 'proveedoresConfianza', { id: 'otro', proveedor: 'Otro proveedor', proveedorNif: 'B87654321', remitentes: ['otro@example.com'] });
  const limitado = await persona({ ...admin, id: 'limitado', email: 'limitado@example.com', rol: 'miembro', permisos: ['gastos'], pv: 2 });
  const autorizado = await persona({ ...admin, id: 'autorizado', email: 'autorizado@example.com', rol: 'miembro', permisos: ['gastar'], pv: 2 });
  for (const opciones of [{ por: limitado.id }, { origen: 'correo', correo: { de: limitado.email } }, { origen: 'correo', correo: { de: 'otro@example.com' } }]) {
    await redis.del('bandeja:e1');
    const d = await leerPdf(opciones);
    assert.equal(d.estado, 'revisar');
    assert.deepEqual(await leer(admin, 'gastos'), []);
  }
  // Una aprobación manual enlaza el correo con el proveedor revisado.
  const pendiente = (await leer(admin, 'bandeja'))[0];
  assert.ok((await B.aprobar(admin, pendiente.id, B.datosDe(pendiente))).gasto);
  assert.deepEqual((await leerUno(admin, 'proveedoresConfianza', 'norte')).remitentes, ['otro@example.com']);
  for (const opciones of [{ por: autorizado.id }, { origen: 'correo', correo: { de: autorizado.email } }, { origen: 'correo', correo: { de: 'OTRO@example.com' } }]) {
    await redis.del('bandeja:e1', 'gastos:e1');
    assert.equal((await leerPdf(opciones)).estado, 'aprobado');
  }
  // Perder el permiso, la pertenencia o la cuenta impide nuevas aprobaciones por identidad.
  for (const cambio of [{ permisos: [] }, { empresas: { otra: { rol: 'admin' } }, empresa: 'otra' }, { baja: '2026-01-01' }]) {
    await persona({ ...autorizado, ...cambio });
    await redis.del('bandeja:e1', 'gastos:e1');
    assert.equal((await leerPdf({ por: autorizado.id })).estado, 'revisar');
  }
});

test('seguridad 6: cuarentena limitada por empresa y remitente, con caducidad y borrado del archivo, sin bloquear entradas legítimas', async () => {
  for (let i = 0; i < MAX_CUARENTENA; i++) {
    const r = await B.recibirArchivo(admin, Buffer.concat([pdf, Buffer.from(String(i))]), { origen: 'correo', correo: { de: `desconocido${Math.floor(i / MAX_CUARENTENA_REMITENTE)}@example.com` }, cuarentena: true });
    assert.equal(r.doc.estado, 'cuarentena');
  }
  assert.equal((await B.recibirArchivo(admin, pdf, { correo: { de: 'nuevo@example.com' }, cuarentena: true })).status, 429);
  // El mismo contenido en cuarentena tampoco bloquea una subida legítima.
  const copia = Buffer.concat([pdf, Buffer.from('0')]);
  const subida = await B.recibirArchivo(admin, copia, { por: admin.id });
  assert.equal(subida.doc.estado, 'leyendo');
  const conocido = await B.recibirArchivo(admin, pdf, { origen: 'correo', correo: { de: admin.email } });
  assert.equal(conocido.doc.estado, 'leyendo');
  const viejos = (await leer(admin, 'bandeja')).filter((d) => d.estado === 'cuarentena');
  await B.documentosBandeja(admin, Date.now() + (DIAS_CUARENTENA + 1) * 864e5);
  for (const d of viejos) {
    assert.equal(await leerUno(admin, 'bandeja', d.id), null);
    assert.equal(await leerJustificante(admin, d.archivo), null);
  }
  assert.ok(await leerJustificante(admin, subida.doc.archivo));
  await redis.del('bandeja:e1');
  const resultados = await Promise.all(Array.from({ length: MAX_CUARENTENA_REMITENTE + 2 }, (_, i) => B.recibirArchivo(admin, Buffer.concat([pdf, Buffer.from(`simultáneo-${i}`)]), { correo: { de: i % 2 ? ' MISMO@example.com ' : 'mismo@example.com' }, cuarentena: true })));
  assert.equal(resultados.filter((r) => r.doc).length, MAX_CUARENTENA_REMITENTE);
  assert.equal(resultados.filter((r) => r.status === 429).length, 2);
});

test('seguridad 7: gastos:leer de un administrador agrupa nóminas y responde 404 al sueldo individual', async () => {
  await guardar(admin, 'gastos', { id: 'nomina-ana', fecha: '2026-01-31', nomina: 'ana', concepto: 'Sueldo Ana', proveedor: 'Ana', base: 2500, ivaPct: 0 });
  await guardar(admin, 'gastos', { id: 'nomina-luis', fecha: '2026-01-31', nomina: 'luis', concepto: 'Sueldo Luis', proveedor: 'Luis', base: 3000, ivaPct: 0 });
  const k = await A.crearClave(admin, { nombre: 'Solo gastos', alcances: ['gastos:leer'] });
  const req = new Request('https://fisquo.test/api/v1/gastos', { headers: { authorization: `Bearer ${k.clave}` } });
  const { u, res } = await A.usuarioClave(req, { alcance: 'gastos:leer' });
  assert.equal(res, undefined);
  assert.equal(puede(u, 'nominas'), false);
  assert.equal(puede(u, 'empresa'), false);
  assert.equal(puede(u, 'gastos'), true);
  const pagina = await paginaGastos(u, { limite: 50 });
  assert.equal(pagina.datos.length, 1);
  assert.equal(pagina.datos[0].base, 5500);
  assert.doesNotMatch(JSON.stringify(pagina), /Sueldo|Ana|Luis|nomina-ana|nomina-luis/);
  assert.equal((await detalleGasto.GET(req, { params: Promise.resolve({ id: 'nomina-ana' }) })).status, 404);
});

test('seguridad 8: los webhooks nuevos revalidan al creador; los antiguos sin uid siguen entregando', async () => {
  const p = await persona({ ...admin, id: 'integrador', rol: 'miembro', permisos: ['facturas', 'gastos', 'nominas'], pv: 2, empresas: { e1: { rol: 'miembro', permisos: ['facturas', 'gastos', 'nominas'], pv: 2 }, otra: { rol: 'admin' } } });
  const w = await W.crearWebhook(p, { url: 'https://receptor.example.com/entrada', eventos: ['factura.creada', 'gasto.creado'] });
  assert.equal(w.uid, p.id);
  assert.equal((await W.webhooksDe(admin))[0].uid, p.id);
  let enviados = 0;
  const transporte = { resolver: async () => [{ address: '8.8.8.8', family: 4 }], enviar: async () => { enviados++; return { ok: true, status: 200 }; } };
  const entrega = (id = w.id, tipo = 'factura.creada') => W.entregarWebhook({ empresa: 'e1', webhook: id, evento: { id: 'evento1', tipo, datos: {} } }, transporte);
  assert.deepEqual(await entrega(), { entregado: true });
  await persona({ ...p, empresas: { ...p.empresas, e1: { rol: 'miembro', permisos: ['gastos'], pv: 2 } } });
  assert.deepEqual(await entrega(), { omitido: true });
  assert.deepEqual(await entrega(w.id, 'gasto.creado'), { omitido: true });
  await persona(p);
  await quitarDeEmpresa(p.id, 'e1');
  assert.deepEqual(await entrega(), { omitido: true });
  await persona({ ...p, baja: '2026-01-01' });
  assert.deepEqual(await entrega(), { omitido: true });
  const { uid: _uid, creador: _creador, ...antiguo } = w;
  await redis.hset('webhooks:e1', { antiguo: { ...antiguo, id: 'antiguo' } });
  assert.deepEqual(await entrega('antiguo'), { entregado: true });
  assert.equal(enviados, 2, 'ninguna entrega omitida llega al transporte');
});

test('seguridad 9: el plan vencido permite revocar claves y webhooks, pero mantiene bloqueada su creación', async () => {
  const plan = { tipo: 'aut', nombre: 'Esencial', desde: '2020-01-01', hasta: '2020-01-31' };
  await empresa({ plan });
  const k = await A.crearClave(admin, { nombre: 'Revocar', alcances: ['gastos:leer'] });
  const w = await W.crearWebhook(admin, { url: 'https://receptor.example.com/entrada', eventos: ['factura.creada'] });
  const req = new Request('https://fisquo.test/api/v1/gastos', { headers: { authorization: `Bearer ${k.clave}` } });
  assert.ok((await A.usuarioClave(req, { alcance: 'gastos:leer' })).u);
  for (const [tipo, id] of [['clave', k.id], ['webhook', w.id]]) {
    await sesion(admin, '/api/ajustes/api', 'DELETE');
    assert.equal((await ajustesApi.DELETE(new Request(`https://fisquo.test/api/ajustes/api?${tipo}=${id}`, { method: 'DELETE' }))).status, 200);
  }
  assert.equal((await A.usuarioClave(req, { alcance: 'gastos:leer' })).res.status, 401);
  await sesion(admin, '/api/ajustes/api', 'POST');
  for (const datos of [{ accion: 'clave', nombre: 'Nueva', alcances: ['gastos:leer'] }, { accion: 'webhook', url: w.url, eventos: w.eventos }]) {
    assert.equal((await ajustesApi.POST(json('/api/ajustes/api', datos))).status, 402);
  }
});

test('seguridad 10: importar un CSV en Autónomo Esencial guarda pendientes; con Pro concilia la misma factura', async () => {
  for (const [nombre, auto] of [['Esencial', 0], ['Pro', 1]]) {
    await redis.del('facturas:e1', 'banco:e1', 'bancos:e1');
    await empresa({ plan: { tipo: 'aut', nombre, pagado: true, hasta: '2099-01-01', version: 3 } });
    await guardar(admin, 'facturas', { id: '2026-1', numero: 1, anio: 2026, fecha: '2026-01-15', concepto: 'Servicio', cliente: { nombre: 'Cliente Norte', nif: 'B12345674' }, base: 100, ivaPct: 21, cobrada: false });
    const form = new FormData();
    form.set('archivo', new File(['Fecha;Concepto;Importe\n15/01/2026;Factura 01-2026 Cliente Norte;121,00\n'], 'extracto.csv', { type: 'text/csv' }));
    form.set('cuenta', 'nueva');
    form.set('nombre', 'Banco de pruebas');
    await sesion(admin, '/api/banco/importar', 'POST');
    const r = await importarBanco.POST(new Request('https://fisquo.test/api/banco/importar', { method: 'POST', body: form }));
    const datos = await r.json();
    assert.equal(r.status, 200, JSON.stringify(datos));
    assert.equal(datos.auto, auto);
    assert.equal(datos.nuevos, 1);
    const factura = await leerUno(admin, 'facturas', '2026-1');
    const movimientos = await leer(admin, 'banco');
    assert.equal(movimientos.length, 1);
    assert.equal(Boolean(factura.cobrada), Boolean(auto));
    assert.equal(Boolean(movimientos[0].enlace), Boolean(auto));
  }
});
