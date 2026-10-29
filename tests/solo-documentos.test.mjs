// Clientes «solo documentos» (lib/documentos.js, lib/documentosServidor.js, lib/panelDocumentos.js) con el código real y
// Upstash en memoria, sin puertos: alta por el despacho, aislamiento entre despachos, subida y lectura con IA (falsa),
// clasificación gasto/ingreso, avisos, tope de páginas, solo lectura, exportación del trimestre y paso a Fisquo completo.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { crearBase } from './apoyo/upstash-mem.mjs';
import { almacenMemoria, ponerAlmacen } from '../lib/justificantes.js';
import { aContabilidad, avisosDe, clasificar, delTrimestre, documentoDeLectura, limpiarDatos, resumen } from '../lib/documentos.js';
import { limpiarTicket, limpiarDocumento, promptDocumento } from '../lib/ticket.js';
import { leerZip } from '../lib/zip.js';

const base = crearBase();
const fetchOriginal = globalThis.fetch;
const variables = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'LIMITES', 'ANTHROPIC_API_KEY', 'ANTHROPIC_URL', 'RESEND_API_KEY'];
const env = Object.fromEntries(variables.map((k) => [k, process.env[k]]));
const IA = [];
let lecturas = 0;
let R, A, S, P, D;

before(async () => {
  process.env.KV_REST_API_URL = 'http://redis-solo-documentos.test';
  process.env.KV_REST_API_TOKEN = 'pruebas';
  process.env.LIMITES = 'off';
  process.env.ANTHROPIC_API_KEY = 'pruebas';
  process.env.ANTHROPIC_URL = 'http://ia-solo-documentos.test/v1/messages';
  delete process.env.RESEND_API_KEY;
  ponerAlmacen(almacenMemoria());
  globalThis.fetch = async (url, op) => {
    const u = String(url);
    if (u.startsWith(process.env.ANTHROPIC_URL)) {
      if (u.endsWith('/count_tokens')) return Response.json({ input_tokens: 1500 });
      lecturas++;
      const datos = IA.shift() || { proveedor: 'Sin datos', fecha: '2026-10-10', base: 10, ivaPct: 21, total: 12.1 };
      return Response.json({ model: 'claude-haiku-5-5', usage: { input_tokens: 1500, output_tokens: 300 }, content: [{ type: 'text', text: JSON.stringify(datos) }] });
    }
    if (!u.startsWith(process.env.KV_REST_API_URL)) throw new Error(`Llamada externa inesperada: ${u}`);
    const j = JSON.parse(op.body);
    const b64 = (v) => (typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v);
    const uno = (cmd) => { const result = base.run(cmd); return { result: new Headers(op.headers).get('upstash-encoding') === 'base64' ? b64(result) : result }; };
    return Response.json(Array.isArray(j[0]) ? j.map(uno) : uno(j));
  };
  [R, A, S, P, D] = await Promise.all([import('../lib/redis.js'), import('../lib/auth.js'), import('../lib/documentosServidor.js'), import('../lib/panelDocumentos.js'), import('../lib/despachos.js')]);
  const despacho = (id, titular, extra = {}) => ({ id, nombre: `Gestoría ${id}`, codigo: `COD-${id}`, empresa: `emp-${id}`, miembros: { [titular]: { rol: 'titular', desde: '2026-10-01' } }, soloAsignados: false, ...extra });
  await R.redis.hset('despachos', { d1: despacho('d1', 'g1', { panel: { activo: true, estado: 'trialing', suscripcion: 'sub_panel', cliente: 'cus_1' }, cobro: { activo: true, estado: 'active', suscripcion: 'sub_lic', cliente: 'cus_1' } }), d2: despacho('d2', 'g2', { panel: { activo: true, estado: 'active' } }) });
  await R.redis.hset('usuarios', { g1: { id: 'g1', nombre: 'Ana', email: 'ana@gestoria.test', despacho: 'd1', empresa: 'emp-d1', rol: 'admin', pass: 'x' }, g2: { id: 'g2', nombre: 'Berta', email: 'berta@otra.test', despacho: 'd2', empresa: 'emp-d2', rol: 'admin', pass: 'x' } });
  await R.redis.hset('emails', { 'ana@gestoria.test': 'g1', 'berta@otra.test': 'g2' });
  await R.redis.hset('empresas', { 'emp-d1': { id: 'emp-d1', nombre: 'Gestoría d1', emisor: {} }, 'emp-d2': { id: 'emp-d2', nombre: 'Gestoría d2', emisor: {} } });
});
after(() => {
  globalThis.fetch = fetchOriginal;
  ponerAlmacen(undefined);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});

const jpg = (n) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from(`foto-${n}-${Math.random()}`)]);
const esperar = async (fn, ms = 5000) => {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > fin) throw new Error('No ha llegado a tiempo');
    await new Promise((ok) => setTimeout(ok, 30));
  }
};
const NIF = '12345678Z';
let cliente, usuario;

test('el despacho da de alta un cliente «solo documentos» con su invitación y su buzón', async () => {
  const d = await D.despachoDe('d1');
  const r = await S.altaSoloDocumentos(d, { id: 'g1', nombre: 'Ana' }, { nombre: 'Bar Pepe', nif: NIF.toLowerCase(), email: 'Pepe@Bar.test', contacto: 'Pepe', tipo: 'autonomo' });
  assert.ok(!r.error, r.error);
  cliente = r.empresa; usuario = r.usuario;
  assert.equal(cliente.emisor.nif, NIF);
  assert.deepEqual({ despacho: cliente.documentos.despacho, usuario: cliente.documentos.usuario }, { despacho: 'd1', usuario: usuario.id });
  assert.equal(cliente.despachoCliente.id, 'd1');
  assert.equal(cliente.despachoCliente.pendiente, undefined, 'ya aceptado: lo dio de alta el despacho');
  assert.ok((await D.clientesDe('d1')).includes(cliente.id));
  assert.deepEqual({ rol: usuario.rol, permisos: usuario.permisos, pass: usuario.pass }, { rol: 'miembro', permisos: [], pass: undefined });
  assert.equal(await R.redis.hget('invitaciones', r.codigo), usuario.id);
  assert.ok(cliente.buzon?.alias, 'tiene su dirección para reenviar facturas');
  assert.deepEqual(cliente.buzon.remitentes, ['pepe@bar.test']);
  assert.equal(await P.soloDocumentosDe(d), 1);
  // Un email que ya tiene cuenta no se pisa.
  assert.equal((await S.altaSoloDocumentos(d, { id: 'g1', nombre: 'Ana' }, { nombre: 'Otro', email: 'ana@gestoria.test' })).status, 409);
});

test('datos aislados: otra gestoría no lo ve y su gestoría no puede entrar en él como en un cliente de Fisquo', async () => {
  const [d1, d2, e] = await Promise.all([D.despachoDe('d1'), D.despachoDe('d2'), R.redis.hget('empresas', cliente.id)]);
  assert.equal(D.puedeVerCliente(d1, 'g1', e), true);
  assert.equal(D.puedeVerCliente(d2, 'g2', e), false);
  assert.equal(D.puedeVerCliente(d1, 'g2', e), false);
  assert.equal(await D.accesoDespacho({ id: 'g2', despacho: 'd2' }, e), null);
  assert.deepEqual((await D.clientesVisibles(d2, 'g2')).map((x) => x.id), []);
  // La gestoría, con la cookie «e» del cliente: sigue en su empresa (sin viaDespacho), no en la del cliente.
  const g = await A.conEmpresa(await R.redis.hget('usuarios', 'g1'), cliente.id);
  assert.equal(g.viaDespacho, undefined);
  assert.equal(g.empresa, 'emp-d1');
  // El cliente: su empresa con la marca, y ninguna otra aunque la pida.
  const u = await A.conEmpresa(await R.redis.hget('usuarios', usuario.id), 'emp-d2');
  assert.equal(u.empresa, cliente.id);
  assert.equal(u.documentos.despacho, 'd1');
  const { soloDocumentos } = await import('../lib/perfilDocumentos.js');
  assert.equal(soloDocumentos(u), true);
});

test('sube fotos, la IA las lee y las clasifica como gasto o venta, con sus avisos y el tope de páginas', async () => {
  const u = await A.conEmpresa(await R.redis.hget('usuarios', usuario.id));
  IA.push(
    // Una venta: la emite el propio cliente.
    { proveedor: 'Bar Pepe', nif: NIF, emisor: 'Bar Pepe', emisorNif: `ES${NIF}`, receptor: 'Eventos Sol SL', receptorNif: 'B12345674', sentido: 'venta', legible: true, numero: 'F-12', fecha: '2026-10-05', concepto: 'Catering', base: 1000, ivaPct: 10, total: 1100, desglose: [{ ivaPct: 10, base: 1000, cuota: 100 }], irpf: null, irpfPct: 0 },
    // Un gasto: se lo hacen al cliente (aunque la IA diga «venta», manda el NIF).
    { proveedor: 'Makro', nif: 'A28647451', emisor: 'Makro', emisorNif: 'A28647451', receptor: 'Bar Pepe', receptorNif: NIF, sentido: 'venta', legible: true, numero: 'M-77', fecha: '2026-10-07', concepto: 'Bebidas', base: 200, ivaPct: 21, total: 242, desglose: [{ ivaPct: 21, base: 200, cuota: 42 }], irpf: null, irpfPct: 0 },
    // El mismo gasto otra vez (otra foto): duplicado.
    { proveedor: 'Makro', nif: 'A28647451', emisor: 'Makro', emisorNif: 'A28647451', receptorNif: NIF, legible: true, numero: 'M-077', fecha: '2026-10-07', base: 200, ivaPct: 21, total: 242 },
    // Ticket borroso y sin NIF.
    { proveedor: 'Gasolinera', nif: '', emisor: 'Gasolinera', emisorNif: '', legible: false, fecha: '2026-10-09', base: null, ivaPct: 21, total: null },
  );
  for (let i = 0; i < 4; i++) {
    const r = await S.recibirDocumento(u, jpg(i), { nombre: `ticket-${i}.jpg`, por: u.id });
    assert.ok(r.doc && !r.error, r.error);
    await esperar(async () => (await R.leerUno(u, 'documentos', r.doc.id))?.estado !== 'leyendo');
  }
  const bytes = jpg(9);
  assert.ok((await S.recibirDocumento(u, bytes, { nombre: 'a.jpg' })).doc);
  await esperar(async () => !(await R.leer(u, 'documentos')).some((d) => d.estado === 'leyendo'));
  assert.equal((await S.recibirDocumento(u, bytes, { nombre: 'a-otra-vez.jpg' })).repetido, true, 'el mismo archivo no entra dos veces');
  assert.equal((await S.recibirDocumento(u, new TextEncoder().encode('<xml/>'), { nombre: 'f.xml' })).status, 400);

  const docs = await S.documentosDe(u);
  const por = (n) => docs.find((d) => d.nombre === n);
  assert.equal(por('ticket-0.jpg').tipo, 'ingreso');
  assert.deepEqual({ tercero: por('ticket-0.jpg').datos.tercero, nif: por('ticket-0.jpg').datos.nif, categoria: por('ticket-0.jpg').datos.categoria, cuota: por('ticket-0.jpg').datos.cuota }, { tercero: 'Eventos Sol SL', nif: 'B12345674', categoria: '705', cuota: 100 });
  assert.equal(por('ticket-1.jpg').tipo, 'gasto');
  assert.equal(por('ticket-1.jpg').datos.nif, 'A28647451');
  assert.ok(por('ticket-1.jpg').avisos.includes('duplicado') && por('ticket-2.jpg').avisos.includes('duplicado'));
  assert.deepEqual(por('ticket-3.jpg').avisos.filter((a) => ['ilegible', 'sin-nif', 'sin-importe'].includes(a)).sort(), ['ilegible', 'sin-importe', 'sin-nif']);
  assert.deepEqual(por('ticket-0.jpg').avisos, []);
  assert.equal(lecturas, 5, 'una lectura por documento, ninguna repetida');
  const { cupoEscaneos } = await import('../lib/cuotasIA.js');
  const cupo = await cupoEscaneos(u);
  assert.deepEqual({ limite: cupo.limite, usadas: cupo.usadas }, { limite: 60, usadas: 5 });
});

test('la gestoría corrige, revisa y exporta el trimestre en el formato de su programa', async () => {
  const [d, e] = await Promise.all([D.despachoDe('d1'), R.redis.hget('empresas', cliente.id)]);
  const { contextoCliente } = await import('../lib/panelDespacho.js');
  const ctx = contextoCliente(await R.redis.hget('usuarios', 'g1'), d, e);
  const quien = { id: 'g1', nombre: 'Ana' };
  let docs = await S.documentosDe(ctx);
  const venta = docs.find((x) => x.nombre === 'ticket-0.jpg'), gasto = docs.find((x) => x.nombre === 'ticket-1.jpg'), dup = docs.find((x) => x.nombre === 'ticket-2.jpg');
  const malo = await S.corregir(ctx, gasto.id, { base: 'abc' }, quien);
  assert.ok(malo.errores?.base);
  assert.ok((await S.corregir(ctx, gasto.id, { concepto: 'Bebidas y hielo', base: '210,50' }, quien)).doc);
  assert.deepEqual((await R.leerUno(ctx, 'documentos', gasto.id)).datos.cuota, 44.21);
  for (const x of [venta, gasto]) assert.ok((await S.marcarRevisado(ctx, x.id, quien)).doc);
  assert.ok((await S.descartar(ctx, dup.id)).ok);
  docs = await S.documentosDe(ctx);
  assert.equal(docs.find((x) => x.id === gasto.id).avisos.includes('duplicado'), false, 'quitado el repetido, ya no hay aviso');

  const a3 = S.diarioDocumentos(ctx, docs, { anio: 2026, t: 4, formato: 'a3', fecha: '2026-10-29' });
  assert.equal(a3.n, 2);
  assert.equal(a3.nombre, 'SUENLACE.DAT');
  assert.match(a3.contenido, /B12345674/);
  assert.match(a3.contenido, /A28647451/);
  assert.doesNotMatch(a3.contenido, /Regularizaci|Cierre/i, 'un trimestre suelto, sin cierre ni apertura');
  const cp = S.diarioDocumentos(ctx, docs, { anio: 2026, t: 4, formato: 'contaplus', fecha: '2026-10-29' });
  assert.ok(Object.keys(leerZip(cp.contenido)).includes('XDiario.txt'));
  assert.equal(S.diarioDocumentos(ctx, docs, { anio: 2026, t: 3, formato: 'a3', fecha: '2026-10-29' }).n, 0, 'otro trimestre, nada');
});

test('si el despacho deja de pagar, solo lectura: no entra nada nuevo', async () => {
  const e = await R.redis.hget('empresas', cliente.id);
  assert.equal(await S.abiertoPara(e), true);
  await D.cambiarDespacho('d1', async (d) => ({ despacho: { ...d, panel: { ...d.panel, activo: false, estado: 'canceled' } } }));
  assert.equal(await S.abiertoPara(e), false);
  // El aviso del buzón tampoco lo guarda.
  const { recibirCorreo } = await import('../lib/buzonEntrante.js');
  assert.deepEqual(await recibirCorreo({ para: `${e.buzon.alias}@fisqal.com`, emailId: 'x' }), { ignorado: 'panel en pausa' });
  await D.cambiarDespacho('d1', async (d) => ({ despacho: { ...d, panel: { ...d.panel, activo: true, estado: 'active' } } }));
  assert.equal(await S.abiertoPara(e), true);
});

test('la suscripción del panel no pisa la de las licencias del mismo despacho', async () => {
  const sub = { id: 'sub_panel', status: 'past_due', customer: 'cus_1', metadata: { despacho: 'd1', tipo: 'panel' }, items: { data: [{ id: 'si_1', price: { id: 'price_1', lookup_key: P.claveTramo(1) } }] } };
  assert.equal(P.esPanel(sub), true);
  assert.equal(P.esPanel({ ...sub, metadata: { despacho: 'd1' } }), false);
  const panel = await P.aplicarSuscripcionPanel(sub);
  assert.deepEqual({ activo: panel.activo, tramo: panel.tramo, estado: panel.estado }, { activo: true, tramo: 1, estado: 'past_due' });
  const d = await D.despachoDe('d1');
  assert.deepEqual(d.cobro, { activo: true, estado: 'active', suscripcion: 'sub_lic', cliente: 'cus_1' });
});

test('al pasar a Fisquo completo deja de contar, conserva lo subido y pasa a administrar su empresa', async () => {
  const antes = await R.redis.hlen(`documentos:${cliente.id}`);
  const r = await S.pasarACompleto(cliente.id, 'd2');
  assert.equal(r.status, 404, 'otro despacho no puede');
  assert.ok(!(await S.pasarACompleto(cliente.id, 'd1')).error);
  const e = await R.redis.hget('empresas', cliente.id);
  assert.equal(e.documentos, undefined);
  assert.equal(e.despachoCliente.id, 'd1');
  assert.equal(e.despachoCliente.soloDocumentos, undefined);
  assert.equal(e.pendiente, true);
  assert.equal(e.plan.nombre, 'Plus');
  assert.ok(e.plan.hasta);
  assert.ok(e.documentosAntes?.desde);
  assert.equal(await R.redis.hlen(`documentos:${cliente.id}`), antes, 'no pierde lo que subió');
  assert.equal(await P.soloDocumentosDe(await D.despachoDe('d1')), 0);
  const u = await A.conEmpresa(await R.redis.hget('usuarios', usuario.id));
  assert.equal(u.rol, 'admin');
  const { soloDocumentos } = await import('../lib/perfilDocumentos.js');
  assert.equal(soloDocumentos(u), false);
  assert.equal(await S.abiertoPara(e), false, 'ya no sube a /documentos: lo hace desde Gastos');
});

test('modelo: clasificar, avisos, correcciones, trimestres y paso a la contabilidad', () => {
  const empresa = { emisor: { nif: NIF } };
  assert.equal(clasificar({ emisorNif: NIF, receptorNif: 'B1' }, empresa), 'ingreso');
  assert.equal(clasificar({ emisorNif: 'B1', receptorNif: ` es-${NIF}` }, empresa), 'gasto');
  assert.equal(clasificar({ sentido: 'venta' }, { emisor: {} }), 'ingreso');
  assert.equal(clasificar({}, empresa), 'gasto');
  const leido = documentoDeLectura(limpiarTicket({ proveedor: 'Taller', nif: 'B99', fecha: '2026-11-02', base: 100, ivaPct: 21, irpf: 15, irpfPct: 15, total: 106 }, '2026-12-31'), limpiarDocumento({ emisor: 'Taller', emisorNif: 'B99', total: 106 }), empresa);
  assert.deepEqual({ tipo: leido.tipo, irpf: leido.datos.irpf, irpfPct: leido.datos.irpfPct, total: leido.datos.total, categoria: leido.datos.categoria }, { tipo: 'gasto', irpf: 15, irpfPct: 15, total: 106, categoria: '622' });
  const doc = { id: 'd1', estado: 'revisar', tipo: 'gasto', ...leido };
  assert.deepEqual(avisosDe(doc, [doc]), []);
  assert.deepEqual(limpiarDatos({ ivaPct: 7 }).errores, { ivaPct: 'Tipo de IVA no válido' });
  assert.deepEqual(limpiarDatos({ base: '50', ivaPct: 10 }, { irpfPct: 0 }).datos, { irpfPct: 0, base: 50, ivaPct: 10, cuota: 5, irpf: 0, total: 55 });
  assert.equal(delTrimestre([doc, { ...doc, id: 'd2', datos: { fecha: '2026-09-30' } }], 2026, 4).length, 1);
  assert.equal(resumen([doc]).baseGastos, 100);
  const { facturas, gastos } = aContabilidad([{ ...doc, tipo: 'ingreso', datos: { ...doc.datos, numero: 'V-1', desglose: [{ ivaPct: 21, base: 60 }, { ivaPct: 10, base: 40 }] } }, doc]);
  assert.deepEqual({ numero: facturas[0].importada, nif: facturas[0].cliente.nif, porTipo: facturas[0].porTipo.length }, { numero: 'V-1', nif: 'B99', porTipo: 2 });
  assert.deepEqual({ proveedorNif: gastos[0].proveedorNif, categoria: gastos[0].categoria, irpfPct: gastos[0].irpfPct }, { proveedorNif: 'B99', categoria: '622', irpfPct: 15 });
  assert.match(promptDocumento({ nombre: 'Bar Pepe', nif: NIF }), /emisorNif.*receptorNif.*legible/s);
  assert.match(promptDocumento({ nombre: 'Bar Pepe', nif: NIF }), /Bar Pepe» con NIF 12345678Z/);
});
