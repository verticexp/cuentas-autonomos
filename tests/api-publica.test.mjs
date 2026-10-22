import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';

let R, A, W, D, F, FD, G, GD, C, T, TT;
const fetchAnterior = globalThis.fetch;
const env = Object.fromEntries(['KV_REST_API_URL', 'KV_REST_API_TOKEN'].map((k) => [k, process.env[k]]));
before(async () => {
  const base = crearBase(), urlRedis = 'http://redis-api-publica.test';
  // Mismo simulador que las pruebas existentes, sin abrir sockets (también funciona en el sandbox).
  globalThis.fetch = async (url, opciones) => {
    if (!String(url).startsWith(urlRedis)) throw new Error('Red externa no permitida en esta prueba');
    const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
    const uno = (cmd) => {
      const result = base.run(cmd);
      return { result: new Headers(opciones.headers).get('upstash-encoding') === 'base64' ? b64(result) : result };
    };
    const j = JSON.parse(opciones.body);
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  process.env.KV_REST_API_URL = urlRedis;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, A, W, D, F, FD, G, GD, C, T, TT] = await Promise.all([
    import('../lib/redis.js'), import('../lib/apiPublica.js'), import('../lib/webhooks.js'), import('../lib/apiPublicaDatos.js'),
    import('../app/api/v1/facturas/route.js'), import('../app/api/v1/facturas/[id]/route.js'),
    import('../app/api/v1/gastos/route.js'), import('../app/api/v1/gastos/[id]/route.js'),
    import('../app/api/v1/clientes/route.js'), import('../lib/trabajos.js'), import('../lib/trabajosTareas.js'),
  ]);
});
after(() => {
  globalThis.fetch = fetchAnterior;
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
let n = 0;
async function empresa(extra = {}) {
  const id = `api${++n}`;
  const u = { id, empresa: id, rol: 'admin', nombre: 'Prueba', emisor: { nombre: 'Prueba SL', nif: 'B12345674', plazo: 30 },
    plan: { fundador: true }, actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }], ...extra };
  await R.redis.hset('usuarios', { [u.id]: u });
  await R.redis.hset('empresas', { [u.empresa]: { ...u, id: u.empresa } });
  return u;
}
const peticion = (k, ruta = '/facturas', opciones = {}) => new Request(`https://fisquo.test/api/v1${ruta}`, { ...opciones, headers: { authorization: `Bearer ${k.clave}`, ...opciones.headers } });
const clave = (u, alcances = ['facturas:leer']) => A.crearClave(u, { nombre: 'Tienda', alcances });
const factura = (id, fecha = '2026-10-01') => ({ id, numero: 1, anio: 2026, fecha, cliente: { nombre: 'Cliente', nif: '12345678Z', email: 'c@example.org', token: 'privado' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 15, cobrada: false, vence: '2026-11-01', emisor: { nif: 'privado' }, token: 'privado', verifactu: { xml: 'privado' }, envios: ['privado'], marca: { logo: 'privado' } });

test('claves: formato, entropía, hash y ausencia del secreto en Redis y listados', async () => {
  const u = await empresa(), k = await clave(u);
  assert.match(k.clave, /^fsq_[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(k.clave.slice(4), 'base64url').length, 32);
  assert.notEqual(A.generarClave(), A.generarClave());
  const hash = createHash('sha256').update(k.clave).digest('hex');
  assert.equal(A.hashClave(k.clave), hash);
  assert.equal((await R.redis.hget('apiclaves', hash)).id, k.id);
  assert.equal(k.prefijo, k.clave.slice(0, 12));
  for (const nombre of ['apiclaves', `apiclaves:${u.empresa}`, `apiclaves-indice:${u.empresa}`]) assert.ok(!JSON.stringify(await R.redis.hgetall(nombre)).includes(k.clave));
  const lista = await A.clavesDe(u);
  assert.equal(lista[0].ultimoUso, null);
  assert.ok(!JSON.stringify(lista).includes(k.clave));
  assert.ok(!Object.hasOwn(lista[0], 'hash'));
});

test('alcances: no concede permisos ausentes, desconocidos ni prototipos; editar implica leer', async () => {
  const u = await empresa({ rol: 'miembro', permisos: ['empresa', 'facturas'], pv: 2 });
  assert.deepEqual(A.alcancesDe(u), ['facturas:leer', 'clientes:leer']);
  await assert.rejects(clave(u, ['facturas:escribir']), { status: 403 });
  await assert.rejects(clave(u, ['gastos:leer']), { status: 403 });
  await assert.rejects(clave(u, ['__proto__']), { status: 400 });
  await assert.rejects(clave(u, []), { status: 400 });
  assert.ok(A.alcancesDe({ permisos: ['facturar'] }).includes('facturas:leer'));
});

test('autenticación: Bearer obligatorio; cookies no conceden acceso y no se filtran errores', async () => {
  for (const authorization of ['', 'Basic abc', 'Bearer fsq_corta', `Bearer ${A.generarClave()} extra`, `Bearer ${A.generarClave()}`]) {
    const r = await F.GET(new Request('https://fisquo.test/api/v1/facturas', { headers: { authorization, cookie: 't=sesion-de-admin' } }));
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('www-authenticate'), 'Bearer');
    assert.deepEqual(Object.keys(await r.json()), ['error']);
  }
});

test('autenticación: uso por minuto, permisos actuales, empresa vigente y revocación aislada', async () => {
  const u = await empresa(), otro = await empresa(), k = await clave(u);
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).u.empresa, u.empresa);
  const usada = (await A.clavesDe(u))[0].ultimoUso;
  assert.ok(usada);
  await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' });
  assert.equal((await A.clavesDe(u))[0].ultimoUso, usada);
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'gastos:leer' })).res.status, 403);
  await R.redis.hset('usuarios', { [u.id]: { ...u, rol: 'miembro', permisos: [], pv: 2 } });
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res.status, 403);
  await R.redis.hset('usuarios', { [u.id]: { ...u, empresa: otro.empresa } });
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res.status, 403);
  assert.equal(await A.revocarClave(otro, k.id), false);
  await R.redis.hset('usuarios', { [u.id]: u });
  assert.equal(await A.revocarClave(u, k.id), true);
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res.status, 401);
  assert.deepEqual(await A.clavesDe(u), []);
});

test('una membresía sin permiso no hereda el rol antiguo y las empresas dadas de baja no acceden', async () => {
  const u = await empresa(), k = await clave(u);
  await R.redis.hset('usuarios', { [u.id]: { ...u, empresas: { [u.empresa]: { rol: 'miembro', permisos: [], pv: 2 } } } });
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res.status, 403);
  await R.redis.hset('usuarios', { [u.id]: u });
  await R.redis.hset('empresas', { [u.empresa]: { ...u, baja: true } });
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res.status, 403);
});

test('cuotas obligatorias por clave: minuto, día y Retry-After, incluso con LIMITES=off', async () => {
  const u = await empresa(), k = await clave(u), k2 = await clave(u);
  const anterior = process.env.LIMITES; process.env.LIMITES = 'off';
  try {
    await R.redis.set(`limite:api:minuto:${k.id}`, 120, { ex: 60 });
    let r = (await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res;
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.ok((await A.usuarioClave(peticion(k2), { alcance: 'facturas:leer' })).u);
    await R.redis.del(`limite:api:minuto:${k.id}`);
    await R.redis.set(`limite:api:dia:${k.id}`, 5000, { ex: 86400 });
    r = (await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res;
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 60);
  } finally { if (anterior === undefined) delete process.env.LIMITES; else process.env.LIMITES = anterior; }
});

test('varias empresas: usa los permisos de la empresa de la clave, sin heredar el rol de la principal', async () => {
  const principal = await empresa(), secundaria = await empresa();
  const persona = { ...principal, empresas: { [principal.empresa]: { rol: 'admin' }, [secundaria.empresa]: { rol: 'miembro', permisos: ['facturas'], pv: 2 } } };
  await R.redis.hset('usuarios', { [persona.id]: persona });
  const k = await clave({ ...persona, empresa: secundaria.empresa, rol: 'miembro', permisos: ['facturas'], pv: 2 });
  const r = await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' });
  assert.equal(r.u.empresa, secundaria.empresa); assert.equal(r.u.rol, 'miembro');
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'gastos:leer' })).res.status, 403);
  await R.redis.hset('usuarios', { [persona.id]: { ...persona, empresas: { [principal.empresa]: { rol: 'admin' } } } });
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).res.status, 403);
});

test('solo lectura: consulta permitida y escritura 402 según el plan actual de la empresa', async () => {
  const u = await empresa(), k = await clave(u, ['facturas:leer', 'facturas:escribir']);
  await R.redis.hset('empresas', { [u.empresa]: { ...u, plan: { tipo: 'aut', nombre: 'Base', hasta: '2000-01-01', pagado: false } } });
  assert.ok((await A.usuarioClave(peticion(k), { alcance: 'facturas:leer' })).u);
  assert.equal((await A.usuarioClave(peticion(k), { alcance: 'facturas:escribir', escritura: true })).res.status, 402);
});

test('firmas: vector HMAC, alteración de cuerpo/firma, caducidad, futuro y formato incorrecto', () => {
  const cuerpo = '{"id":"prueba","tipo":"factura.creada"}', secreto = 'secreto-solo-de-pruebas', t = Math.floor(Date.now() / 1000);
  const firma = W.firmar(secreto, cuerpo, t);
  assert.equal(firma, `t=${t},v1=${createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')}`);
  assert.equal(W.verificarFirma(secreto, cuerpo, firma), true);
  for (const cabecera of [W.firmar(secreto, cuerpo, t - 301), W.firmar(secreto, cuerpo, t + 301), `t=${t},v1=${'0'.repeat(64)}`, 't=NaN,v1=bad', `${firma},t=${t}`, null]) assert.equal(W.verificarFirma(secreto, cuerpo, cabecera), false);
  assert.equal(W.verificarFirma(secreto, `${cuerpo} `, firma), false);
  assert.equal(W.verificarFirma('otra', cuerpo, firma), false);
});

test('URLs: rechaza redes privadas y representaciones alternativas IPv4/IPv6, http, credenciales y puertos', () => {
  const hosts = ['localhost', 'a.localhost', 'tienda.local', 'tienda.internal', 'localhost.', '10.0.0.1', '127.0.0.1', '127.1', '2130706433', '0x7f000001', '0177.0.0.1', '0.0.0.0', '169.254.169.254', '100.64.0.1', '100.127.255.254', '172.16.0.1', '172.31.0.1', '192.168.0.1', '198.18.0.1', '224.0.0.1', '[::1]', '[::]', '[fc00::1]', '[fd00::1]', '[fe80::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]', '[::ffff:a00:1]', '[64:ff9b::a00:1]', '[2002:7f00:1::]', '[2001:db8::1]'];
  for (const host of hosts) assert.throws(() => W.validarUrl(`https://${host}/hook`), undefined, host);
  for (const url of ['http://example.org', 'ftp://example.org', 'https://a:b@example.org', 'https://user@example.org', 'https://example.org:444/hook', 'https://example.org/#secret', 'https://example.org\\@127.0.0.1/']) assert.throws(() => W.validarUrl(url), undefined, url);
  for (const url of ['https://example.org/hook', 'https://example.org:443/hook', 'https://8.8.8.8/hook', 'https://[2606:4700:4700::1111]/hook']) assert.equal(W.validarUrl(url).protocol, 'https:');
});

test('SSRF: DNS mixto, privado o vacío no envía, y all:true comprueba cada dirección', async () => {
  for (const respuesta of [[], [{ address: '127.0.0.1', family: 4 }], [{ address: '8.8.8.8', family: 4 }, { address: 'fd00::1', family: 6 }]]) {
    await assert.rejects(W.resolverDestino('https://example.org/hook', async (_host, opciones) => { assert.equal(opciones.all, true); return respuesta; }), T.Definitivo);
  }
  assert.deepEqual(await W.resolverDestino('https://example.org/hook', async () => [{ address: '8.8.8.8', family: 4 }]), [{ address: '8.8.8.8', family: 4 }]);
});

test('webhooks: máximo 5 concurrentes, listado sin secretos y bajas aisladas por empresa', async () => {
  const u = await empresa(), otro = await empresa();
  const r = await Promise.allSettled(Array.from({ length: 7 }, () => W.crearWebhook(u, { url: 'https://example.org/hook', eventos: ['factura.creada'] })));
  assert.equal(r.filter((x) => x.status === 'fulfilled').length, 5);
  assert.equal((await W.webhooksDe(u)).length, 5);
  const w = r.find((x) => x.status === 'fulfilled').value;
  assert.match(w.secreto, /^whsec_[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(await W.webhooksDe(u)).includes(w.secreto));
  assert.equal(await W.revocarWebhook(otro, w.id), false);
  assert.equal(await W.revocarWebhook(u, w.id), true);
  await assert.rejects(W.crearWebhook({ ...u, rol: 'miembro', permisos: ['empresa'] }, { url: 'https://example.org', eventos: ['factura.creada'] }), { status: 403 });
});

test('cola: trabajos por evento y destino, firma de cuerpo exacto, estados HTTP, baja y SSRF', async () => {
  const u = await empresa(), w = await W.crearWebhook(u, { url: 'https://example.org/hook', eventos: ['factura.creada'] });
  const evento = await W.emitirEvento(u, 'factura.creada', { id: 'F1' });
  const trabajo = await R.redis.hget(`trabajos:${u.empresa}`, `webhook:${evento.id}:${w.id}`);
  assert.equal(trabajo.tipo, 'webhook');
  assert.deepEqual(trabajo.datos.evento, evento);
  assert.ok(!JSON.stringify(trabajo).includes(w.secreto));
  await W.emitirEvento(u, 'factura.creada', evento.datos, evento);
  assert.equal(await R.redis.hlen(`trabajos:${u.empresa}`), 1);
  assert.equal(TT.TAREAS.webhook, W.entregarWebhook);
  const datos = { empresa: u.empresa, webhook: w.id, evento };
  const resolver = async () => [{ address: '8.8.8.8', family: 4 }];
  let llamadas = 0;
  const enviar = (status) => async (url, opciones) => {
    llamadas++;
    assert.equal(url, w.url); assert.equal(opciones.redirect, 'manual'); assert.ok(opciones.signal); assert.ok(opciones.dispatcher);
    assert.deepEqual(JSON.parse(opciones.body), evento);
    assert.equal(W.verificarFirma(w.secreto, opciones.body, opciones.headers['Fisquo-Firma']), true);
    return new Response(null, { status });
  };
  assert.deepEqual(await W.entregarWebhook(datos, { resolver, enviar: enviar(204) }), { entregado: true });
  for (const status of [400, 401, 404, 410]) await assert.rejects(W.entregarWebhook(datos, { resolver, enviar: enviar(status) }), T.Definitivo);
  for (const status of [302, 408, 429, 500]) await assert.rejects(W.entregarWebhook(datos, { resolver, enviar: enviar(status) }), (e) => !(e instanceof T.Definitivo));
  const antes = llamadas;
  await assert.rejects(W.entregarWebhook(datos, { resolver: async () => [{ address: '10.0.0.1', family: 4 }], enviar: enviar(200) }), T.Definitivo);
  assert.equal(llamadas, antes);
  await W.revocarWebhook(u, w.id);
  assert.deepEqual(await W.entregarWebhook(datos, { resolver, enviar: enviar(200) }), { omitido: true });
  assert.equal(llamadas, antes);
});

test('factura pública: forma estable, cálculos reales y ningún campo interno, tampoco en líneas/cliente', () => {
  const f = factura('F1');
  f.lineas = [{ concepto: 'Servicio', cantidad: 1, precio: 100, ivaPct: 21, producto: 'interno', albaran: 'interno', token: 'privado' }];
  const p = D.facturaPublica(f);
  assert.deepEqual(Object.keys(p).sort(), ['id', 'numero', 'serie', 'fecha', 'cliente', 'lineas', 'base', 'iva', 'irpf', 'total', 'cobrada', 'pendiente', 'vence', 'idioma', 'moneda'].sort());
  assert.deepEqual(Object.keys(p.cliente).sort(), ['nombre', 'nif', 'email'].sort());
  assert.deepEqual(Object.keys(p.lineas[0]).sort(), ['concepto', 'cantidad', 'precio', 'dto', 'ivaPct'].sort());
  assert.equal(p.numero, '01-2026'); assert.equal(p.total, 106); assert.equal(p.pendiente, 106);
  assert.ok(!JSON.stringify(p).includes('privado'));
  assert.equal(D.facturaPublica({ ...f, cobrada: true }).pendiente, 0);
});

test('endpoints: aislamiento, fechas reales, cursor, límite, detalle y clientes sin campos internos', async () => {
  const u = await empresa(), otro = await empresa(), k = await clave(u, ['facturas:leer', 'clientes:leer']);
  for (const [id, fecha] of [['F1', '2026-10-01'], ['F2', '2026-10-02'], ['F3', '2026-09-01']]) await R.guardar(u, 'facturas', factura(id, fecha));
  await R.guardar(otro, 'facturas', factura('AJENA'));
  let r = await F.GET(peticion(k, '/facturas?limite=1&desde=2026-10-01&hasta=2026-10-31'));
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
  let p = await r.json(); assert.equal(p.datos[0].id, 'F2'); assert.ok(p.siguiente);
  p = await (await F.GET(peticion(k, `/facturas?limite=1&desde=2026-10-01&hasta=2026-10-31&cursor=${encodeURIComponent(p.siguiente)}`))).json();
  assert.equal(p.datos[0].id, 'F1'); assert.equal(p.siguiente, null);
  for (const q of ['limite=0', 'limite=101', 'limite=Infinity', 'desde=2026-02-30', 'desde=2026-10-02&hasta=2026-10-01', 'cursor=basura']) assert.equal((await F.GET(peticion(k, `/facturas?${q}`))).status, 400);
  assert.equal((await FD.GET(peticion(k), { params: Promise.resolve({ id: 'AJENA' }) })).status, 404);
  assert.equal((await FD.GET(peticion(k), { params: Promise.resolve({ id: 'F1' }) })).status, 200);
  await R.guardar(u, 'clientes', { id: 'c1', nombre: 'Cliente', nif: '12345678Z', portalToken: 'privado', riesgo: 123 });
  const clientes = await (await C.GET(peticion(k, '/clientes'))).json();
  assert.equal(clientes.datos.length, 1); assert.ok(!JSON.stringify(clientes).includes('privado')); assert.ok(!Object.hasOwn(clientes.datos[0], 'riesgo'));
});

test('gastos: nóminas agregadas antes de paginar; su detalle individual sigue oculto', async () => {
  const u = await empresa({ rol: 'miembro', permisos: ['empresa', 'gastos'], pv: 2 }), k = await clave(u, ['gastos:leer']);
  for (const [id, base] of [['n1', 1200], ['n2', 1800]]) await R.guardar(u, 'gastos', { id, nomina: id, fecha: '2026-10-01', base, ivaPct: 0, concepto: 'Sueldo de persona privada', proveedor: 'Persona privada' });
  await R.guardar(u, 'gastos', { id: 'g1', fecha: '2026-09-01', base: 50, ivaPct: 21, concepto: 'Compra', archivo: { url: 'privado' } });
  let p = await (await G.GET(peticion(k, '/gastos?limite=1'))).json();
  assert.equal(p.datos[0].base, 3000); assert.ok(p.siguiente); assert.ok(!JSON.stringify(p).includes('privada'));
  const id = p.datos[0].id;
  assert.equal((await GD.GET(peticion(k), { params: Promise.resolve({ id: 'n1' }) })).status, 404);
  assert.equal((await (await GD.GET(peticion(k), { params: Promise.resolve({ id }) })).json()).base, 3000);
  p = await (await G.GET(peticion(k, `/gastos?limite=1&cursor=${encodeURIComponent(p.siguiente)}`))).json();
  assert.equal(p.datos[0].id, 'g1'); assert.equal(p.siguiente, null);
});

test('clientes: se puede seguir el cursor con nombres reales, acentos, espacios y delimitadores', async () => {
  const u = await empresa(), k = await clave(u, ['clientes:leer']);
  const ids = ['CLIENTE RAMÍREZ ~ SOCIEDAD', 'TIENDA DE JOSÉ', 'MÚSICA Y EVENTOS'];
  for (const id of ids) await R.guardar(u, 'clientes', { id, nombre: id });
  const encontrados = [], cursores = new Set();
  let cursor = '';
  do {
    const r = await C.GET(peticion(k, `/clientes?limite=1&cursor=${encodeURIComponent(cursor)}`));
    assert.equal(r.status, 200);
    const p = await r.json(); encontrados.push(...p.datos.map((c) => c.id));
    cursor = p.siguiente;
    if (cursor) { assert.ok(!cursores.has(cursor)); cursores.add(cursor); }
  } while (cursor);
  assert.deepEqual(encontrados.sort(), ids.sort());
});

test('gestión con sesión: exige empresa en todos los métodos, entrega secretos una vez y audita sin ellos', async () => {
  // Aísla solo la sesión y el contexto de auditoría de Next. El almacenamiento y la ruta son los reales.
  const u = await empresa(), estado = { u, negar: false, permisos: [], auditoria: [] };
  globalThis.__gestionApiPublica = estado;
  const modulo = (fuente) => `data:text/javascript;base64,${Buffer.from(fuente).toString('base64')}`;
  const archivo = new URL('../app/api/ajustes/api/route.js', import.meta.url);
  let fuente = await readFile(archivo, 'utf8');
  fuente = fuente.replace(/from '([^']+)'/g, (_todo, origen) => {
    let destino;
    if (origen.endsWith('/lib/api.js')) destino = modulo("export const usuarioApi = async (opciones) => { const e=globalThis.__gestionApiPublica; e.permisos.push(opciones); return e.negar ? {res:Response.json({error:'Sin permiso'},{status:403})} : {u:e.u}; };");
    else if (origen.endsWith('/lib/auditoria.js')) destino = modulo('export const auditar = async (...args) => globalThis.__gestionApiPublica.auditoria.push(args);');
    else destino = new URL(origen, archivo).href;
    return `from '${destino}'`;
  });
  try {
    const gestion = await import(modulo(fuente));
    const req = (datos) => new Request('https://fisquo.test/api/ajustes/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    const k = await (await gestion.POST(req({ accion: 'clave', nombre: 'Tienda', alcances: ['facturas:leer'] }))).json();
    const w = await (await gestion.POST(req({ accion: 'webhook', url: 'https://example.org/hook', eventos: ['factura.creada'] }))).json();
    assert.ok(k.clave); assert.ok(w.secreto);
    const listado = await (await gestion.GET()).text();
    assert.ok(!listado.includes(k.clave)); assert.ok(!listado.includes(w.secreto));
    assert.equal((await gestion.DELETE(new Request(`https://fisquo.test/api/ajustes/api?clave=${k.id}`))).status, 200);
    assert.equal((await gestion.DELETE(new Request(`https://fisquo.test/api/ajustes/api?webhook=${w.id}`))).status, 200);
    assert.equal(estado.auditoria.length, 4);
    assert.ok(!JSON.stringify(estado.auditoria).includes(k.clave)); assert.ok(!JSON.stringify(estado.auditoria).includes(w.secreto));
    estado.negar = true;
    assert.equal((await gestion.GET()).status, 403);
    assert.equal((await gestion.POST(req({ accion: 'clave' }))).status, 403);
    assert.equal((await gestion.DELETE(new Request(`https://fisquo.test/api/ajustes/api?clave=${k.id}`))).status, 403);
    assert.ok(estado.permisos.every((o) => o.permiso === 'empresa'));
    assert.equal(estado.auditoria.length, 4);
  } finally { delete globalThis.__gestionApiPublica; }
});

test('POST: flujo real de emisión, idempotencia, sin rectificativas, validación y orden de fechas', async () => {
  const u = await empresa(), k = await clave(u, ['facturas:escribir']);
  const datos = { fecha: '2026-10-10', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0 };
  const enviar = (body, idem = 'pedido-123') => F.POST(peticion(k, '/facturas', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem }, body: JSON.stringify(body) }));
  let r = await enviar(datos); assert.equal(r.status, 201, JSON.stringify(await r.clone().json()));
  const p = await r.json();
  assert.equal(p.total, 121); assert.ok(!Object.hasOwn(p, 'emisor'));
  assert.equal((await (await enviar(datos)).json()).id, p.id);
  assert.equal((await R.leer(u, 'facturas')).length, 1);
  assert.equal((await enviar({ ...datos, fecha: '2026-10-09' }, 'otro-pedido')).status, 409);
  assert.equal((await enviar({ ...datos, rectifica: p.id })).status, 400);
  assert.equal((await enviar(datos, 'bad key')).status, 400);
  assert.equal((await enviar({ ...datos, base: -100 })).status, 400);
  assert.equal((await F.POST(peticion(k, '/facturas', { method: 'POST', body: '{}' }))).status, 415);
  assert.equal((await F.POST(peticion(k, '/facturas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'a'.repeat(131073) }))).status, 413);
});

test('POST: el riesgo del cliente devuelve 409 sin emitir y no permite forzar el bloqueo', async () => {
  const u = await empresa(), k = await clave(u, ['facturas:escribir']);
  await R.guardar(u, 'clientes', { id: 'CLIENTE', nombre: 'Cliente', nif: '12345678Z', riesgoMax: 0 });
  const r = await F.POST(peticion(k, '/facturas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fecha: '2026-10-10', actividad: 'servicios', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, forzarRiesgo: true }) }));
  assert.equal(r.status, 409, JSON.stringify(await r.clone().json()));
  assert.deepEqual(Object.keys(await r.json()), ['error']);
  assert.equal((await R.leer(u, 'facturas')).length, 0);
});

test('proxy: solo api/v1/ es pública, no api/v10 ni la gestión con sesión', async () => {
  const { PUBLICO } = await import('../lib/rutasPublicas.js');
  assert.equal(PUBLICO.test('/api/v1/facturas'), true);
  for (const ruta of ['/api/v1', '/api/v10/facturas', '/api/v1x/facturas', '/api/ajustes/api']) assert.equal(PUBLICO.test(ruta), false);
});
