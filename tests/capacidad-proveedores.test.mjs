// E01: equivalencia con el histórico y comprobación de los documentos leídos, contra Redis simulado.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, I, P, D, G, M, Fi, lista, detalle, pagar, remesas;
const contexto = { u: null };
globalThis.__capacidadProveedores = contexto;
const modulo = (codigo) => `data:text/javascript,${encodeURIComponent(codigo)}`;
const api = modulo(`
  export const usuarioApi = async () => ({ u: globalThis.__capacidadProveedores.u });
  export const cuerpo = (req) => req.json();
  export const error = (error, status = 400) => Response.json({ error }, { status });
`);
const auth = modulo(`export const requerir = async () => globalThis.__capacidadProveedores.u;`);
const navigation = modulo(`export const notFound = () => { throw new Error('NOT_FOUND'); };`);
// Ejecuta las lecturas reales de las páginas sin necesitar React/JSX ni una sesión de Next.
async function cargar(ruta, salida) {
  let codigo = await readFile(new URL(ruta, import.meta.url), 'utf8');
  if (salida) {
    codigo = codigo.slice(0, codigo.indexOf('  return (\n')) + `  return ${salida};\n}\n`;
    codigo = codigo.replace(/^import .* from '@\/components\/[^']+';\n/gm, '').replace(/^import '@\/app\/[^']+';\n/gm, '');
  }
  codigo = codigo.replace(/(['"])@\/lib\/([^'"]+)\1/g, (_, comilla, nombre) => {
    const url = nombre === 'api' ? api : nombre === 'auth' ? auth
      : nombre === 'auditoria' ? modulo('export const auditar = async () => {};')
        : new URL(`../lib/${nombre}.js`, import.meta.url).href;
    return JSON.stringify(url);
  }).replace("'next/navigation'", JSON.stringify(navigation));
  return import(modulo(codigo));
}
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, I, P, D, G, M, Fi] = await Promise.all([
    import('../lib/redis.js'), import('../lib/indices.js'), import('../lib/proveedores.js'),
    import('../lib/duplicados.js'), import('../lib/gastosServidor.js'), import('../lib/remesas.js'), import('../lib/fichas.js'),
  ]);
  lista = (await cargar('../app/gastos/proveedores/page.js', 'lista')).default;
  detalle = (await cargar('../app/gastos/proveedores/[clave]/page.js', 'p')).default;
  pagar = (await cargar('../app/api/proveedores/route.js')).POST;
  remesas = (await cargar('../app/api/remesas/route.js')).POST;
});
after(async () => { if (srv) await srv.cerrar(); delete globalThis.__capacidadProveedores; });

let numero = 0;
const empresa = () => ({ id: `prov-u${++numero}`, empresa: `prov-cap${numero}`, emisor: {
  nombre: 'Emisora S.L.', nif: 'B12345674', iban: 'ES9121000418450200051332',
} });
const gasto = (id, extra = {}) => ({ id, fecha: '2026-10-14', proveedor: 'Proveedor', concepto: 'Servicio', base: 100, ivaPct: 21, ...extra });
const factura = (id, extra = {}) => ({ id, numero: 1, anio: 2026, fecha: '2026-10-14', cliente: { nombre: 'Ana Pérez', nif: '12345678Z' },
  concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, ...extra });
async function sembrar(u, col, docs) {
  if (docs.length) await R.redis.hset(R.clave(u, col), Object.fromEntries(docs.map((d) => [d.id, d])));
  await I.asegurar(u, col);
}
async function registrar(fn) {
  const cmds = [];
  srv.ganchos.antes = async (cuerpo) => {
    const j = JSON.parse(cuerpo || 'null');
    for (const c of Array.isArray(j?.[0]) ? j : [j]) if (c) cmds.push(c);
  };
  try { return { resultado: await fn(), cmds }; } finally { srv.ganchos.antes = null; }
}
const leidos = (cmds, u, col) => cmds.filter((c) => c[0] === 'hmget' && c[1] === `cuentas:${col}:${u.empresa}`).flatMap((c) => c.slice(2));
function sinHistorico(cmds, u, col) {
  assert.ok(!cmds.some((c) => c[0] === 'hgetall' && c[1] === `cuentas:${col}:${u.empresa}`), `sin HGETALL de ${col}`);
}
const solicitud = (b) => new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'application/json' } });
const resumen = (p) => { const { gastos, ficha, ...resto } = p; return resto; };
const sinFicha = (p) => { const { ficha, ...resto } = p; return resto; };
const variados = () => [
  gasto('primero', { proveedor: 'Álvaro  Sonido', proveedorNif: 'b12345674', fecha: '2025-01-01', pendiente: true, irpfPct: 15 }),
  gasto('ultimo', { proveedor: 'SONIDO nuevo', proveedorNif: 'B12345674', pendiente: true, base: 33.33, ivaPct: 10 }),
  gasto('empate-fecha', { proveedor: 'SONIDO posterior', proveedorNif: 'b12345674', base: -10 }),
  gasto('nombre-1', { proveedor: ' Café  Técnico ', fecha: '2026-09-01', base: 20.05, ivaPct: 4 }),
  gasto('nombre-2', { proveedor: 'CAFE TÉCNICO', base: 0.03, pendiente: true, ivaPct: 21 }),
  gasto('sin-nombre', { proveedor: '', proveedorNif: 'B99999999', pendiente: true }),
  gasto('solo-espacios', { proveedor: '   ', ivaPct: 0 }),
  gasto('otra-clave', { proveedor: 'Café Técnico', proveedorNif: 'X123', base: 50, ivaPct: 0, pendiente: true, migrado: true, inversion: true }),
  gasto('orden-a', { proveedor: 'Empate A', base: 5, ivaPct: 0 }),
  gasto('orden-b', { proveedor: 'Empate B', base: 5, ivaPct: 0 }),
];

test('E01: las fichas de gastos llevan lo pagado al proveedor (base + IVA) y la huella del adjunto', () => {
  const conRetencion = gasto('igual', { irpfPct: 15 });
  assert.equal(Fi.indiceDe('gastos', conRetencion).ficha.tp, P.totalDe(conRetencion));
  const conArchivo = gasto('igual', { proveedor: 'Otro', fecha: '2020-01-01', archivo: { huella: 'igual' } });
  assert.equal(Fi.indiceDe('gastos', conArchivo).ficha.h, 'igual');
});

test('E01: lista de proveedores idéntica en importes, normalización, nombres y orden; solo fichas', async () => {
  const u = empresa(); contexto.u = u;
  await sembrar(u, 'gastos', variados());
  const antes = P.proveedores(await R.leer(u, 'gastos')).map(resumen);
  const { resultado, cmds } = await registrar(() => lista({}));
  assert.deepEqual(resultado.map(resumen), antes);
  sinHistorico(cmds, u, 'gastos');
  assert.deepEqual(leidos(cmds, u, 'gastos'), []);
});

test('E01: listas vacías y detalle inexistente', async () => {
  const u = empresa(); contexto.u = u;
  await sembrar(u, 'gastos', []);
  assert.deepEqual(await lista({}), []);
  await assert.rejects(detalle({ params: Promise.resolve({ clave: 'inexistente' }) }), /NOT_FOUND/);
});

test('E01: detalle lee exactamente los gastos del proveedor y conserva empates de fecha', async () => {
  const u = empresa(); contexto.u = u;
  await sembrar(u, 'gastos', variados());
  const antes = P.proveedores(await R.leer(u, 'gastos'));
  for (const esperado of antes) {
    const { resultado, cmds } = await registrar(() => detalle({ params: Promise.resolve({ clave: encodeURIComponent(esperado.clave) }) }));
    assert.deepEqual(sinFicha(resultado), esperado);
    sinHistorico(cmds, u, 'gastos');
    assert.deepEqual(leidos(cmds, u, 'gastos').sort(), esperado.gastos.map((g) => g.id).sort());
  }
});

test('E01: pagar un proveedor lee solo pendientes y modifica solo los suyos', async () => {
  const u = empresa(); contexto.u = u;
  const gs = variados(); await sembrar(u, 'gastos', gs);
  const clave = 'B12345674';
  const anteriores = await R.leer(u, 'gastos');
  const suyos = anteriores.filter((g) => g.proveedor && g.pendiente && P.claveProveedor(g) === clave);
  const { resultado, cmds } = await registrar(() => pagar(solicitud({ clave })));
  assert.equal(resultado.status, 200);
  assert.deepEqual(await resultado.json(), { ok: true, pagados: suyos.length });
  sinHistorico(cmds, u, 'gastos');
  assert.deepEqual(leidos(cmds, u, 'gastos').sort(), anteriores.filter((g) => g.pendiente).map((g) => g.id).sort());
  for (const g of anteriores) {
    const actual = await R.leerUno(u, 'gastos', g.id);
    if (suyos.some((s) => s.id === g.id)) { assert.ok(!actual.pendiente); assert.match(actual.pagado, /^\d{4}-\d{2}-\d{2}$/); }
    else assert.deepEqual(actual, g);
  }
  assert.equal((await pagar(solicitud({ clave }))).status, 404);
});

test('E01: domiciliación busca facturas solo del nombre que corresponde a clienteId', async () => {
  const u = empresa(); contexto.u = u;
  const fs = [factura('ana', { cliente: { nombre: '  Ana Pérez  ', nif: '12345678Z' }, cobrada: true }),
    factura('otra', { cliente: { nombre: 'Otra', nif: '12345678Z' } })];
  await sembrar(u, 'facturas', fs);
  const datos = { accion: 'domiciliacion', cliente: 'ana pérez', iban: u.emisor.iban, fecha: '2020-01-01' };
  const cliente = (await R.leer(u, 'facturas')).find((f) => M.clienteId(f.cliente.nombre) === M.clienteId(datos.cliente)).cliente;
  const { resultado, cmds } = await registrar(() => remesas(solicitud(datos)));
  assert.equal(resultado.status, 200);
  const guardada = await R.leerUno(u, 'domiciliaciones', M.clienteId(datos.cliente));
  assert.deepEqual(guardada, M.prepararDomiciliacion({ ...datos, cliente }));
  sinHistorico(cmds, u, 'facturas');
  assert.deepEqual(leidos(cmds, u, 'facturas'), ['ana']);
  // El maestro de clientes tiene prioridad y evita incluso leer facturas.
  await R.guardar(u, 'clientes', { id: 'ANA PÉREZ', nombre: 'Ana Pérez', nif: '99999999R' });
  const maestro = await registrar(() => remesas(solicitud(datos)));
  assert.equal(maestro.resultado.status, 200);
  assert.deepEqual(leidos(maestro.cmds, u, 'facturas'), []);
  assert.equal((await remesas(solicitud({ ...datos, cliente: 'No existe' }))).status, 404);
});

test('E01: cuenta de proveedor obtiene documentos solo de ese proveedor', async () => {
  const u = empresa(); contexto.u = u;
  await sembrar(u, 'gastos', variados());
  const clave = 'B12345674';
  const antes = (await R.leer(u, 'gastos')).find((g) => g.proveedor && P.claveProveedor(g) === clave);
  const { resultado, cmds } = await registrar(() => remesas(solicitud({ accion: 'cuentaProveedor', clave, iban: u.emisor.iban })));
  assert.equal(resultado.status, 200);
  assert.deepEqual(await R.leerUno(u, 'cuentasProv', clave), M.prepararCuenta({ id: clave, nombre: antes.proveedor, iban: u.emisor.iban }));
  sinHistorico(cmds, u, 'gastos');
  assert.deepEqual(leidos(cmds, u, 'gastos').sort(), ['primero', 'ultimo', 'empate-fecha'].sort());
});

test('E01: remesas leen los ids seleccionados y conservan XML y errores de pagados o inexistentes', async () => {
  for (const cobros of [true, false]) {
    const u = empresa(); contexto.u = u;
    const col = cobros ? 'facturas' : 'gastos';
    const docs = cobros ? [factura('pendiente'), factura('pagado', { cobrada: true }), factura('fuera')]
      : [gasto('pendiente', { pendiente: true, irpfPct: 15, alquiler: true }), gasto('pagado'), gasto('fuera', { pendiente: true })];
    await sembrar(u, col, docs);
    const cuenta = { id: cobros ? 'ANA PÉREZ' : 'proveedor', nombre: cobros ? 'Ana Pérez' : 'Proveedor', iban: u.emisor.iban,
      ...(cobros ? { mandato: { referencia: 'ANA-2020', fecha: '2020-01-01' } } : {}) };
    await R.guardar(u, cobros ? 'domiciliaciones' : 'cuentasProv', cuenta);
    const ids = ['pendiente', 'pagado', 'inexistente', 'pendiente'];
    const b = { accion: cobros ? 'cobros' : 'pagos', fecha: '2099-01-01', [col]: ids };
    const anteriores = await R.leer(u, col);
    const { resultado, cmds } = await registrar(() => remesas(solicitud(b)));
    assert.equal(resultado.status, 200);
    const xml = await resultado.text();
    const id = xml.match(/<MsgId>([^<]+)<\/MsgId>/)[1];
    const guardada = await R.leerUno(u, 'remesas', id);
    const comunes = { ids, emisor: u.emisor, fecha: b.fecha, id, ahora: guardada.creada };
    const esperado = cobros ? M.prepararCobros({ ...comunes, facturas: anteriores, domiciliaciones: [cuenta] })
      : M.prepararPagos({ ...comunes, gastos: anteriores, cuentasProv: [cuenta] });
    assert.equal(xml, esperado.xml);
    assert.deepEqual(JSON.parse(decodeURIComponent(resultado.headers.get('X-Remesa'))).errores, esperado.errores);
    assert.deepEqual(guardada.docs, esperado.documentos.map((d) => d.id));
    sinHistorico(cmds, u, col);
    assert.deepEqual(leidos(cmds, u, col), [...new Set(ids)]);
    // Un documento pagado seleccionado en solitario conserva el motivo anterior.
    const r = await remesas(solicitud({ ...b, [col]: ['pagado'] }));
    const e = cobros ? M.prepararCobros({ ...comunes, ids: ['pagado'], facturas: anteriores, domiciliaciones: [cuenta] })
      : M.prepararPagos({ ...comunes, ids: ['pagado'], gastos: anteriores, cuentasProv: [cuenta] });
    assert.deepEqual(await r.json(), { error: e.error });
    const invalida = await remesas(solicitud({ ...b, [col]: [null, ''] }));
    assert.equal(invalida.status, 400);
  }
});

test('E01: duplicados idénticos, con fechas límite, números antiguos, céntimos, huellas y orden', async () => {
  const historico = [
    gasto('lejano', { fecha: '2020-01-01', numero: 'FAC-00012/2020', base: 5 }),
    gasto('anterior', { fecha: '2026-10-07', base: 100 }),
    gasto('posterior', { fecha: '2026-10-21', base: 100 }),
    gasto('fuera-ventana', { fecha: '2026-10-06', base: 100 }),
    gasto('centimo', { base: 100.01, ivaPct: 0 }),
    gasto('sin-prov', { proveedor: '', concepto: '  Café  Técnico ', ivaPct: 0 }),
    gasto('huella-antigua', { fecha: '2018-01-01', proveedor: 'Otro', archivo: { huella: 'compartida' }, base: 5 }),
    gasto('huella-reciente', { proveedor: 'Tercero', archivo: { huella: 'compartida' }, base: 8 }),
    gasto('nif-1', { proveedor: 'Nombre anterior', proveedorNif: 'b12345674', fecha: '2024-02-29', numero: '001-02', base: 17 }),
    gasto('sin-nif-1', { proveedor: 'ÁLVARO  sonido', fecha: '2024-02-29', numero: '001-02', base: 17 }),
    gasto('bisiesto', { proveedor: 'Bisiesto', fecha: '2024-02-29' }),
    gasto('cambio-anio', { proveedor: 'Año', fecha: '2025-12-31' }),
    ...Array.from({ length: 150 }, (_, i) => gasto(`irrelevante-${i}`, { proveedor: `Otro ${i}`, fecha: '2022-01-01', base: 999 })),
  ];
  const nuevos = [
    gasto('nuevo'), gasto('nuevo', { numero: 'fac12-2020' }), gasto('nuevo', { base: 100, ivaPct: 0 }),
    gasto('nuevo', { proveedor: '', concepto: 'cafe técnico', ivaPct: 0 }),
    gasto('nuevo', { archivo: { huella: 'compartida' }, numero: 'fac12-2020' }),
    gasto('huella-reciente', { archivo: { huella: 'compartida' } }),
    gasto('nuevo', { proveedor: 'Renombrado', proveedorNif: 'B12345674', numero: '1/2', fecha: '2026-05-01' }),
    gasto('nuevo', { proveedor: 'alvaro sonido', numero: '1/2', fecha: '2026-05-01' }),
    gasto('nuevo', { proveedor: 'Bisiesto', fecha: '2024-03-07' }),
    gasto('nuevo', { proveedor: 'Año', fecha: '2026-01-07' }),
    gasto('nuevo', { proveedor: '', concepto: 'Otro', fecha: 'fecha-invalida' }),
    gasto('nuevo', { proveedor: 'Desconocido', base: 37 }),
  ];
  for (const nuevo of nuevos) {
    const u = empresa();
    await sembrar(u, 'gastos', historico);
    const esperado = D.posiblesDuplicados(nuevo, await R.leer(u, 'gastos'));
    const anterior = await R.leerUno(u, 'gastos', nuevo.id);
    const { resultado, cmds } = await registrar(() => G.crearGasto(u, nuevo));
    assert.deepEqual(resultado.duplicados || [], esperado);
    if (esperado.length) assert.deepEqual(await R.leerUno(u, 'gastos', nuevo.id), anterior);
    if (!nuevo.archivo?.huella) {
      sinHistorico(cmds, u, 'gastos');
      assert.ok(!leidos(cmds, u, 'gastos').some((id) => id.startsWith('irrelevante-')));
    }
  }
});

test('E01: confirmar duplicados conserva duplicadoRevisado y guarda el gasto', async () => {
  const u = empresa();
  await sembrar(u, 'gastos', [gasto('anterior')]);
  const nuevo = gasto('nuevo');
  const esperado = D.posiblesDuplicados(nuevo, await R.leer(u, 'gastos'));
  const resultado = await G.crearGasto(u, nuevo, { duplicadoConfirmado: true });
  assert.deepEqual(resultado.gasto, { ...nuevo, duplicadoRevisado: esperado.map((d) => d.id) });
  assert.deepEqual(await R.leerUno(u, 'gastos', nuevo.id), resultado.gasto);
});

test('E01: un adjunto repetido de hace años se detecta como duplicado sin leer el histórico', async () => {
  const u = empresa(); contexto.u = u;
  await sembrar(u, 'gastos', [gasto('viejo', { proveedor: 'Otro', fecha: '2019-01-01', archivo: { huella: 'misma' } })]);
  const S = await import('../lib/gastosServidor.js');
  const r = await S.crearGasto(u, gasto('nuevo', { archivo: { huella: 'misma' } }));
  assert.equal(r.duplicados?.length, 1);
});
