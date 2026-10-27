// Reglas de conciliación del banco (lib/reglasBanco.js, lib/bancoServidor.js, app/api/banco/reglas): qué encaja, cómo se
// guardan, y que una regla nunca empareje dos veces ni pise una conciliación hecha. El servidor, contra Upstash simulado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { esAutomatica, sugerencias } from '../lib/banco.js';
import { MAX_REGLAS, aplicarReglas, conReglas, encaja, limpiarRegla, ordenar, permisosDeRegla, proveedorCoincide, reglaDesde, resumenRegla, sugerirContiene } from '../lib/reglasBanco.js';

const regla = (x = {}) => ({ id: 'r1', contiene: 'iberdrola', signo: 'cargo', accion: 'gasto', proveedor: 'Iberdrola', creada: '2026-01-01T00:00:00Z', ...x });
const mov = (x = {}) => ({ id: 'm', fecha: '2026-06-17', importe: -121, concepto: 'RECIBO IBERDROLA CLIENTES', estado: 'pendiente', ...x });
const gastoIber = (x = {}) => ({ id: 'g', numero: 'P2026-01', fecha: '2026-06-15', proveedor: 'Iberdrola', concepto: 'Luz', base: 121, ivaPct: 0, pendiente: true, ...x });

// ---------- Validación ----------
test('limpiarRegla: lo que se escribe se limpia y lo que no vale da su error', () => {
  assert.match(limpiarRegla({ contiene: 'ab', accion: 'ignorar' }).error, /3 letras/);
  assert.match(limpiarRegla({ contiene: '   ', accion: 'ignorar' }).error, /concepto/);
  for (const accion of [undefined, 'borrar', 'constructor', '__proto__']) assert.match(limpiarRegla({ contiene: 'traspaso', accion }).error, /qué hacer/);
  assert.deepEqual(limpiarRegla({ contiene: '  TRASPASO   entre cuentas ', accion: 'ignorar', signo: 'x', min: '10,5', max: '1.000', proveedor: 'No', categoria: '628' }).regla,
    { contiene: 'TRASPASO entre cuentas', signo: 'ambos', accion: 'ignorar', min: 10.5, max: 1000 });
  assert.deepEqual(limpiarRegla({ contiene: 'comisión', accion: 'ignorar', signo: 'cargo', min: 0, max: 25 }).regla, { contiene: 'comisión', signo: 'cargo', accion: 'ignorar', min: 0, max: 25 });
  assert.match(limpiarRegla({ contiene: 'x', accion: 'ignorar' }).error, /3 letras/);
});

test('limpiarRegla: importes, gasto y proveedor', () => {
  assert.match(limpiarRegla({ contiene: 'traspaso', accion: 'ignorar', min: '50', max: '10' }).error, /desde/);
  for (const malo of ['abc', '-5', '1,234,5', '1e3', '1.2345', Infinity, NaN, -1]) assert.match(limpiarRegla({ contiene: 'traspaso', accion: 'ignorar', min: malo }).error, /números/, String(malo));
  assert.match(limpiarRegla({ contiene: 'iberdrola', accion: 'gasto' }).error, /proveedor/);
  assert.match(limpiarRegla({ contiene: 'iberdrola', accion: 'gasto', proveedor: 'SL' }).error, /3 letras/);
  assert.match(limpiarRegla({ contiene: 'iberdrola', accion: 'gasto', proveedor: 'Iberdrola', signo: 'abono' }).error, /cargo/);
  assert.match(limpiarRegla({ contiene: 'iberdrola', accion: 'gasto', proveedor: 'Iberdrola', categoria: '999' }).error, /categoría/);
  assert.deepEqual(limpiarRegla({ contiene: 'iberdrola', accion: 'gasto', proveedor: ' Iberdrola ', categoria: '628' }).regla, { contiene: 'iberdrola', signo: 'cargo', accion: 'gasto', proveedor: 'Iberdrola', categoria: '628' });
  assert.equal('categoria' in limpiarRegla({ contiene: 'iberdrola', accion: 'gasto', proveedor: 'Iberdrola', categoria: '' }).regla, false);
  assert.deepEqual(limpiarRegla({ contiene: 'x'.repeat(200), accion: 'ignorar' }).regla.contiene.length, 80);
});

test('permisosDeRegla: gastar para los cargos, facturar para los abonos', () => {
  assert.deepEqual(permisosDeRegla(regla()), ['gastar']);
  assert.deepEqual(permisosDeRegla({ accion: 'ignorar', signo: 'cargo' }), ['gastar']);
  assert.deepEqual(permisosDeRegla({ accion: 'ignorar', signo: 'abono' }), ['facturar']);
  assert.deepEqual(permisosDeRegla({ accion: 'ignorar', signo: 'ambos' }), ['gastar', 'facturar']);
});

// ---------- Cuándo encaja ----------
test('encaja: texto sin mayúsculas ni tildes, todas las palabras, concepto o contraparte', () => {
  assert.equal(encaja(regla(), mov()), true);
  assert.equal(encaja(regla({ contiene: 'IBÉRDROLA' }), mov({ concepto: 'recibo iberdrola' })), true);
  assert.equal(encaja(regla({ contiene: 'iberdrola luz' }), mov()), false);
  assert.equal(encaja(regla({ contiene: 'luz iberdrola' }), mov({ concepto: 'Iberdrola: recibo de la luz' })), true);
  assert.equal(encaja(regla(), mov({ concepto: 'RECIBO 4455', contraparte: 'Iberdrola Clientes SAU' })), true);
  assert.equal(encaja(regla(), mov({ concepto: 'RECIBO ENDESA' })), false);
  assert.equal(encaja(regla({ contiene: '' }), mov()), false);
});

test('encaja: cargo o abono y rango de importe, al céntimo', () => {
  const ignorar = (x) => regla({ accion: 'ignorar', signo: 'ambos', ...x });
  assert.equal(encaja(ignorar({ signo: 'cargo' }), mov({ importe: 50 })), false);
  assert.equal(encaja(ignorar({ signo: 'abono' }), mov({ importe: -50 })), false);
  assert.equal(encaja(ignorar({ signo: 'abono' }), mov({ importe: 50 })), true);
  assert.equal(encaja(ignorar(), mov({ importe: 50 })) && encaja(ignorar(), mov({ importe: -50 })), true);
  // Una regla de gasto es siempre de cargos.
  assert.equal(encaja(regla({ signo: 'ambos' }), mov({ importe: 121 })), false);
  const rango = ignorar({ min: 100, max: 121 });
  for (const [importe, esperado] of [[-121, true], [-121.01, false], [-100, true], [-99.99, false], [121, true], [110.5, true]]) assert.equal(encaja(rango, mov({ importe })), esperado, String(importe));
  assert.equal(encaja(ignorar({ min: 100 }), mov({ importe: -5000 })), true);
  assert.equal(encaja(ignorar({ max: 100 }), mov({ importe: -100.01 })), false);
  // Los céntimos de coma flotante no cuelan ni dejan fuera un importe exacto.
  assert.equal(encaja(ignorar({ min: 0.3, max: 0.3 }), mov({ importe: -0.1 - 0.2 })), true);
});

test('encaja: solo movimientos pendientes que nadie ha devuelto a pendiente a mano', () => {
  assert.equal(encaja(regla(), mov({ estado: undefined })), true);
  for (const x of [{ estado: 'emparejado' }, { estado: 'ignorado' }]) for (const r of [regla(), regla({ accion: 'ignorar', signo: 'ambos' })]) assert.equal(encaja(r, mov(x)), false, JSON.stringify(x));
  // Devuelto a pendiente a mano: la regla de ignorar no lo aparta; la de gasto sigue dando su proveedor (se confirma a mano).
  assert.equal(encaja(regla({ accion: 'ignorar', signo: 'ambos' }), mov({ autoDescartada: true })), false);
  assert.equal(encaja(regla(), mov({ autoDescartada: true })), true);
  assert.equal(encaja(regla(), mov({ importe: 0 })), false);
  assert.equal(encaja(null, mov()), false);
});

// ---------- Cuál gana y nunca dos ----------
test('aplicarReglas: la más concreta gana, a igualdad la más antigua, y cada movimiento tiene una sola', () => {
  const amplia = regla({ id: 'a', contiene: 'iberdrola', accion: 'ignorar', signo: 'ambos', creada: '2026-01-01T00:00:00Z' });
  const concreta = regla({ id: 'b', contiene: 'iberdrola luz', creada: '2026-03-01T00:00:00Z' });
  const conImporte = regla({ id: 'c', contiene: 'iberdrola', min: 100, max: 200, creada: '2026-04-01T00:00:00Z' });
  const m = mov({ concepto: 'IBERDROLA LUZ' });
  let r = aplicarReglas([m], [amplia, concreta]);
  assert.deepEqual([r.gasto.get('m')?.id, r.ignorar.size], ['b', 0]);
  r = aplicarReglas([mov({ concepto: 'IBERDROLA GAS' })], [amplia, concreta]);
  assert.deepEqual([r.ignorar.get('m')?.id, r.gasto.size], ['a', 0]);
  // Con rango de importe pesa más que el texto más largo de una sin rango.
  assert.equal(aplicarReglas([m], [concreta, conImporte]).gasto.get('m').id, 'c');
  assert.equal(aplicarReglas([mov({ importe: -50, concepto: 'IBERDROLA LUZ' })], [concreta, conImporte]).gasto.get('m').id, 'b');
  // Empate: la que se creó antes, en cualquier orden de entrada.
  const gemela = regla({ id: 'z', creada: '2025-12-01T00:00:00Z' });
  for (const lista of [[regla(), gemela], [gemela, regla()]]) assert.equal(aplicarReglas([mov()], lista).gasto.get('m').id, 'z');
  assert.deepEqual(ordenar([regla({ id: 'x', accion: 'otra' }), { contiene: 'sin id', accion: 'ignorar' }, regla()]).map((x) => x.id), ['r1']);
  assert.equal(aplicarReglas([], null).gasto.size + aplicarReglas(null, []).ignorar.size, 0);
});

// ---------- La sugerencia segura (lib/banco.js) ----------
test('una regla de gasto da el proveedor al cargo: la sugerencia pasa a ser segura y automática con el mismo importe', () => {
  const m = mov({ concepto: 'REC 99 SUMINISTRO' });
  const g = gastoIber();
  const sin = sugerencias([m], [], [g])[m.id];
  assert.equal(sin.id, 'g');
  assert.equal(sin.segura, false);
  const r = regla({ contiene: 'suministro' });
  const con = sugerencias(conReglas([m], [r]), [], [g])[m.id];
  assert.deepEqual([con.id, con.segura, con.porNombre], ['g', true, true]);
  assert.equal(esAutomatica(con, m), true);
  // El movimiento que se guarda y se enseña es el de siempre: solo el cálculo lo ve con el proveedor.
  assert.equal(m.contraparte, undefined);
});

test('una regla no fuerza ninguna pareja: otro proveedor, otro importe, fuera del rango o ya resuelto, nada', () => {
  const m = mov({ concepto: 'REC 99 SUMINISTRO' });
  const r = regla({ contiene: 'suministro' });
  const segura = (movs, reglas, gastos = [gastoIber()]) => sugerencias(conReglas(movs, reglas), [], gastos)[movs[0].id]?.segura;
  assert.equal(segura([m], [regla({ contiene: 'suministro', proveedor: 'Endesa' })]), false);
  assert.equal(segura([m], [regla({ contiene: 'otra cosa' })]), false);
  assert.equal(segura([m], [{ ...r, min: 200 }]), false);
  assert.equal(sugerencias(conReglas([m], [r]), [], [gastoIber({ base: 100 })])[m.id], undefined);
  const hecho = mov({ concepto: 'REC 99 SUMINISTRO', estado: 'emparejado' });
  assert.equal(conReglas([hecho], [r])[0], hecho);
  // Devuelto a pendiente a mano: se sugiere con seguridad para confirmar, pero nunca se concilia solo.
  const descartado = mov({ concepto: 'REC 99 SUMINISTRO', autoDescartada: true });
  const sd = sugerencias(conReglas([descartado], [r]), [], [gastoIber()])[descartado.id];
  assert.deepEqual([sd.segura, esAutomatica(sd, descartado)], [true, false]);
  assert.equal(conReglas([m], [])[0], m);
});

test('dos movimientos iguales con una regla y un solo gasto: ninguno es seguro (nunca el mismo gasto dos veces)', () => {
  const uno = mov({ id: 'uno', concepto: 'REC 1 SUMINISTRO' }), dos = mov({ id: 'dos', concepto: 'REC 2 SUMINISTRO' });
  const s = sugerencias(conReglas([uno, dos], [regla({ contiene: 'suministro' })]), [], [gastoIber()]);
  assert.deepEqual([s.uno.segura, s.dos.segura], [false, false]);
  assert.equal(s.uno.motivo, 'conflicto');
  assert.equal([uno, dos].filter((m) => esAutomatica(s[m.id], m)).length, 0);
});

test('proveedorCoincide, resumenRegla y lo que se propone al crear una regla desde un movimiento', () => {
  assert.equal(proveedorCoincide(regla(), { proveedor: 'IBERDROLA Clientes S.A.U.' }), true);
  assert.equal(proveedorCoincide(regla({ proveedor: 'Iberdrola Clientes' }), { proveedor: 'Iberdrola' }), true);
  assert.equal(proveedorCoincide(regla(), { proveedor: 'Endesa' }), false);
  assert.equal(proveedorCoincide(regla(), {}), false);
  assert.deepEqual(resumenRegla(regla({ categoria: '628', min: 50, max: 200 })), { cuando: 'Si un cargo contiene «iberdrola», de 50 € a 200 €', entonces: 'es un gasto de Iberdrola (Suministros (luz, agua, teléfono, combustible))' });
  assert.deepEqual(resumenRegla(regla({ accion: 'ignorar', signo: 'ambos', contiene: 'traspaso', proveedor: undefined }), (n) => `${n}€`), { cuando: 'Si un movimiento contiene «traspaso»', entonces: 'se ignora' });
  assert.equal(sugerirContiene({ concepto: 'Recibo publicidad en instagram y google' }), 'publicidad instagram');
  assert.equal(sugerirContiene({ concepto: 'x', contraparte: 'Transportes Ràpid S.L.' }), 'transportes rapid');
  assert.equal(sugerirContiene({ concepto: 'TRASPASO 12345' }), 'traspaso');
  assert.equal(sugerirContiene({ concepto: 'Recibo 123' }), 'recibo');
  assert.deepEqual(reglaDesde({ concepto: 'Recibo Iberdrola', contraparte: 'Iberdrola', importe: -80 }, 'gasto'), { contiene: 'iberdrola', signo: 'cargo', accion: 'gasto', proveedor: 'Iberdrola', categoria: '', min: '', max: '' });
  assert.equal(reglaDesde({ concepto: 'Traspaso a Sabadell', importe: -500 }, 'traspaso').accion, 'ignorar');
  const abono = reglaDesde({ concepto: 'Bizum recibido', importe: 20 }, 'ingreso');
  assert.deepEqual([abono.accion, abono.signo, abono.proveedor], ['ignorar', 'abono', '']);
  // Lo que propone el formulario es siempre una regla válida.
  assert.ok(limpiarRegla(reglaDesde({ concepto: 'Recibo Iberdrola', contraparte: 'Iberdrola', importe: -80 }, 'gasto')).regla);
});

// ---------- Servidor ----------
let srv, R, B, POST, RUTA;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, B] = await Promise.all([import('../lib/redis.js'), import('../lib/bancoServidor.js')]);
  POST = (await cargarRuta('../app/api/banco/route.js')).POST;
  RUTA = await cargarRuta('../app/api/banco/reglas/route.js', { auditoria: modulo('export const auditar = async () => {};') });
});
after(async () => { if (srv) await srv.cerrar(); delete globalThis.__reglasApi; });

// Solo la autenticación HTTP se sustituye: rutas, permisos, índices y operaciones bancarias son los de producción.
const modulo = (codigo) => `data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`;
async function cargarRuta(ruta, dobles = {}) {
  const api = modulo(`export const usuarioApi = async () => ({ u: globalThis.__reglasApi });
    export const cuerpo = (req) => req.json().catch(() => ({}));
    export const error = (error, status = 400) => Response.json({error}, {status});`);
  const codigo = (await readFile(new URL(ruta, import.meta.url), 'utf8')).replace(/(['"])@\/lib\/([^'"]+)\1/g,
    (_, _comillas, nombre) => JSON.stringify(dobles[nombre] || (nombre === 'api' ? api : new URL(`../lib/${nombre}.js`, import.meta.url).href)));
  return import(modulo(codigo));
}
let n = 0;
const empresa = (extra = {}) => ({ id: `u${++n}`, empresa: `reg${n}`, rol: 'admin', actividades: [{ id: 'servicios', nombre: 'Servicios', ivaPct: 0 }], ...extra });
const miembro = (permisos) => empresa({ rol: 'miembro', permisos, pv: 2 });
const leer = (u, col, id) => R.leerUno(u, col, id);
const reglasDe = async (u) => Object.values((await R.redis.hgetall(R.clave(u, 'bancoReglas'))) || {});
async function sembrar(u, { facturas = [], gastos = [], movs = [], reglas = [] }) {
  for (const [col, lista] of [['facturas', facturas], ['gastos', gastos], ['banco', movs], ['bancoReglas', reglas]]) {
    if (lista.length) await R.redis.hset(R.clave(u, col), Object.fromEntries(lista.map((x) => [x.id, x])));
  }
}
const movBD = (x = {}) => ({ id: 'm', fecha: '2026-06-17', importe: -121, concepto: 'REC 99 SUMINISTRO', cuenta: 'c', estado: 'pendiente', ...x });
const gastoBD = (x = {}) => gastoIber({ actividad: 'servicios', ...x });
const post = async (u, cuerpo) => {
  globalThis.__reglasApi = u;
  const res = await POST(new Request('http://localhost/api/banco', { method: 'POST', body: JSON.stringify(cuerpo) }));
  return { status: res.status, ...(await res.json()) };
};
const rutaReglas = async (u, metodo, cuerpo, consulta = '') => {
  globalThis.__reglasApi = u;
  const res = await RUTA[metodo](new Request(`http://localhost/api/banco/reglas${consulta}`, { method: metodo, ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}) }));
  return { status: res.status, ...(await res.json()) };
};

test('crear, editar y borrar: se guardan por empresa en bancoReglas y mandan los permisos de emparejar e ignorar', async () => {
  const u = empresa(), otra = empresa();
  const c = await B.crearRegla(u, { contiene: ' Iberdrola ', accion: 'gasto', proveedor: 'Iberdrola', categoria: '628' });
  assert.equal(c.ok, true);
  assert.match(c.regla.id, /^rg-[0-9a-f-]{12}$/);
  assert.deepEqual(await reglasDe(u), [c.regla]);
  assert.deepEqual(await reglasDe(otra), []);
  assert.equal((await B.leerReglas(u)).length, 1);
  assert.equal(c.regla.por, u.id);
  const e = await B.editarRegla(u, c.regla.id, { contiene: 'iberdrola luz', accion: 'ignorar', signo: 'ambos' });
  assert.equal(e.ok, true);
  assert.deepEqual([e.regla.id, e.regla.creada, e.regla.contiene, e.regla.accion, 'proveedor' in e.regla], [c.regla.id, c.regla.creada, 'iberdrola luz', 'ignorar', false]);
  assert.equal((await B.editarRegla(u, 'rg-no', { contiene: 'abc', accion: 'ignorar' })).status, 404);
  assert.match((await B.crearRegla(u, { contiene: 'a', accion: 'ignorar' })).error, /3 letras/);
  assert.equal((await B.borrarRegla(u, c.regla.id)).ok, true);
  assert.deepEqual(await reglasDe(u), []);
  assert.equal((await B.borrarRegla(u, c.regla.id)).ok, true);

  // gastar: sus cargos. facturar: sus abonos. Para los dos, los dos.
  const gasta = miembro(['gastar']), factura = miembro(['facturar']);
  assert.equal((await B.crearRegla(gasta, { contiene: 'iberdrola', accion: 'gasto', proveedor: 'Iberdrola' })).ok, true);
  assert.equal((await B.crearRegla(gasta, { contiene: 'comision', accion: 'ignorar', signo: 'cargo' })).ok, true);
  for (const b of [{ contiene: 'bizum', accion: 'ignorar', signo: 'abono' }, { contiene: 'traspaso', accion: 'ignorar' }]) assert.equal((await B.crearRegla(gasta, b)).status, 403);
  assert.equal((await B.crearRegla(factura, { contiene: 'bizum', accion: 'ignorar', signo: 'abono' })).ok, true);
  assert.equal((await B.crearRegla(factura, { contiene: 'iberdrola', accion: 'gasto', proveedor: 'Iberdrola' })).status, 403);
  assert.equal((await B.crearRegla(miembro(['facturas', 'gastos']), { contiene: 'bizum', accion: 'ignorar', signo: 'abono' })).status, 403);
  // Editar o borrar: hay que poder con lo que cubría y con lo que cubrirá.
  const traspaso = (await B.crearRegla(u, { contiene: 'traspaso', accion: 'ignorar' })).regla;
  const ajena = { ...gasta, empresa: u.empresa };
  assert.equal((await B.borrarRegla(ajena, traspaso.id)).status, 403);
  assert.equal((await B.editarRegla(ajena, traspaso.id, { contiene: 'traspaso', accion: 'ignorar', signo: 'cargo' })).status, 403);
  const cargos = (await B.crearRegla(u, { contiene: 'comision', accion: 'ignorar', signo: 'cargo' })).regla;
  assert.equal((await B.editarRegla(ajena, cargos.id, { contiene: 'comision', accion: 'ignorar', signo: 'abono' })).status, 403);
  assert.equal((await B.editarRegla(ajena, cargos.id, { contiene: 'comision bancaria', accion: 'ignorar', signo: 'cargo' })).ok, true);
  assert.equal((await B.borrarRegla(ajena, cargos.id)).ok, true);
  assert.equal((await reglasDe(u)).length, 1);
});

test('límite de reglas por empresa', async () => {
  const u = empresa();
  await sembrar(u, { reglas: Array.from({ length: MAX_REGLAS }, (_, i) => ({ id: `rg-${i}`, contiene: `texto ${i}`, signo: 'ambos', accion: 'ignorar' })) });
  assert.match((await B.crearRegla(u, { contiene: 'una más', accion: 'ignorar' })).error, /100 reglas/);
  assert.equal((await B.borrarRegla(u, 'rg-0')).ok, true);
  assert.equal((await B.crearRegla(u, { contiene: 'una más', accion: 'ignorar' })).ok, true);
});

test('la ruta de reglas: crea, edita, borra, valida y exige permiso', async () => {
  const u = empresa();
  const c = await rutaReglas(u, 'POST', { contiene: 'iberdrola', accion: 'gasto', proveedor: 'Iberdrola', min: '100', max: '200,50' });
  assert.equal(c.status, 200);
  assert.deepEqual([c.regla.min, c.regla.max], [100, 200.5]);
  assert.equal((await rutaReglas(u, 'POST', { contiene: 'a', accion: 'ignorar' })).status, 400);
  assert.equal((await rutaReglas(u, 'POST', 'esto no es un objeto')).status, 400);
  const p = await rutaReglas(u, 'PATCH', { id: c.regla.id, contiene: 'iberdrola luz', accion: 'ignorar' });
  assert.deepEqual([p.status, p.regla.contiene, p.regla.creada], [200, 'iberdrola luz', c.regla.creada]);
  assert.equal((await rutaReglas(u, 'PATCH', { contiene: 'iberdrola luz', accion: 'ignorar' })).status, 400);
  assert.equal((await rutaReglas(u, 'PATCH', { id: 'rg-no', contiene: 'iberdrola luz', accion: 'ignorar' })).status, 404);
  const sin = miembro(['resumen', 'facturas', 'gastos']);
  assert.equal((await rutaReglas({ ...sin, empresa: u.empresa }, 'DELETE', null, `?id=${p.regla.id}`)).status, 403);
  assert.equal((await rutaReglas(u, 'DELETE', null)).status, 400);
  assert.equal((await rutaReglas(u, 'DELETE', null, `?id=${p.regla.id}`)).status, 200);
  assert.deepEqual(await reglasDe(u), []);
});

test('automática: la regla de gasto empareja el cargo con el gasto de su proveedor, pone la categoría que falta y deshacer lo deja como estaba', async () => {
  const u = empresa();
  await sembrar(u, { gastos: [gastoBD()], movs: [movBD()], reglas: [regla({ contiene: 'suministro', categoria: '628' })] });
  const antes = await leer(u, 'gastos', 'g');
  const r = await B.autoconciliar(u);
  assert.deepEqual([r.hechos, r.rechazados.length], [1, 0]);
  const m = await leer(u, 'banco', 'm');
  assert.deepEqual([m.estado, m.auto, m.regla, m.enlace], ['emparejado', true, 'r1', { tipo: 'gasto', id: 'g' }]);
  const g = await leer(u, 'gastos', 'g');
  assert.deepEqual([g.banco, g.categoria, g.pendiente], ['m', '628', undefined]);
  assert.equal((await B.deshacer(u, 'm')).ok, true);
  const libre = await leer(u, 'banco', 'm');
  assert.deepEqual([libre.estado, libre.regla, libre.auto, libre.autoDescartada], ['pendiente', undefined, undefined, true]);
  const g2 = await leer(u, 'gastos', 'g');
  assert.deepEqual([g2.banco, g2.categoria, g2.pendiente], [undefined, undefined, true]);
  assert.equal(g2.pagado, antes.pagado);
  // Devuelto a pendiente a mano: la regla ya no lo vuelve a emparejar sola.
  assert.deepEqual([(await B.autoconciliar(u)).hechos, (await leer(u, 'banco', 'm')).estado], [0, 'pendiente']);
});

test('la categoría de la regla no pisa la del gasto ni se pone a un gasto de otro proveedor', async () => {
  const u = empresa();
  await sembrar(u, { gastos: [gastoBD({ categoria: '625' })], movs: [movBD()], reglas: [regla({ contiene: 'suministro', categoria: '628' })] });
  assert.equal((await B.autoconciliar(u)).hechos, 1);
  assert.equal((await leer(u, 'gastos', 'g')).categoria, '625');
  await B.deshacer(u, 'm');
  assert.equal((await leer(u, 'gastos', 'g')).categoria, '625');
  // Emparejado a mano con un gasto de otro proveedor: queda anotado sin regla y sin categoría de la regla.
  const v = empresa();
  await sembrar(v, { gastos: [gastoBD({ proveedor: 'Ferretería Sol' })], movs: [movBD()], reglas: [regla({ contiene: 'suministro', categoria: '628' })] });
  assert.equal((await B.emparejar(v, 'm', 'gasto', 'g')).ok, true);
  const m = await leer(v, 'banco', 'm');
  assert.deepEqual([m.regla, m.auto, (await leer(v, 'gastos', 'g')).categoria], [undefined, undefined, undefined]);
  // Si el gasto es del proveedor de la regla y se confirma a mano, la regla queda anotada pero no es automático.
  const w = empresa();
  await sembrar(w, { gastos: [gastoBD()], movs: [movBD()], reglas: [regla({ contiene: 'suministro', categoria: '628' })] });
  assert.equal((await B.emparejar(w, 'm', 'gasto', 'g')).ok, true);
  const hecho = await leer(w, 'banco', 'm');
  assert.deepEqual([hecho.regla, hecho.auto, (await leer(w, 'gastos', 'g')).categoria], ['r1', undefined, '628']);
});

test('una regla nunca empareja dos veces: dos cargos iguales, un gasto ya cogido y emparejamientos a la vez', async () => {
  // Dos cargos iguales y un gasto: ninguno es seguro, la regla no elige por su cuenta.
  const u = empresa();
  await sembrar(u, { gastos: [gastoBD()], movs: [movBD({ id: 'a' }), movBD({ id: 'b', concepto: 'REC 100 SUMINISTRO' })], reglas: [regla({ contiene: 'suministro' })] });
  assert.equal((await B.autoconciliar(u)).hechos, 0);
  assert.equal((await leer(u, 'gastos', 'g')).banco, undefined);
  // Un gasto ya emparejado con otro movimiento no vuelve a ofrecerse ni a emparejarse.
  const v = empresa();
  await sembrar(v, { gastos: [gastoBD({ banco: 'otro', pendiente: undefined, pagado: '2026-06-16' })], movs: [movBD(), movBD({ id: 'otro', concepto: 'REC 1 IBERDROLA', estado: 'emparejado', enlace: { tipo: 'gasto', id: 'g' } })], reglas: [regla({ contiene: 'suministro' })] });
  assert.equal((await B.autoconciliar(v)).hechos, 0);
  assert.deepEqual([(await leer(v, 'banco', 'm')).estado, (await leer(v, 'gastos', 'g')).banco], ['pendiente', 'otro']);
  assert.match((await B.emparejar(v, 'm', 'gasto', 'g', { auto: true })).error, /ya está emparejado|sugerencia segura/);
  // Dos emparejamientos automáticos a la vez del mismo gasto: solo uno gana.
  const w = empresa();
  await sembrar(w, { gastos: [gastoBD()], movs: [movBD({ id: 'a' }), movBD({ id: 'b', concepto: 'REC 100 SUMINISTRO' })], reglas: [regla({ contiene: 'suministro' })] });
  const reglas = await B.leerReglas(w);
  const rs = await Promise.all(['a', 'b'].map((id) => B.emparejar(w, id, 'gasto', 'g', { reglas }).then((r) => r, (e) => ({ error: e.message }))));
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.equal([(await leer(w, 'banco', 'a')).estado, (await leer(w, 'banco', 'b')).estado].filter((e) => e === 'emparejado').length, 1);
});

test('automática: la regla de ignorar aparta el movimiento, no toca lo resuelto ni lo devuelto a pendiente y deja las parejas seguras', async () => {
  const u = empresa();
  const ignorar = regla({ id: 'r2', contiene: 'traspaso', accion: 'ignorar', signo: 'ambos', proveedor: undefined });
  await sembrar(u, {
    reglas: [ignorar],
    facturas: [{ id: 'f', importada: 'F2026-001', numero: 1, anio: 2026, fecha: '2026-06-15', actividad: 'servicios', cliente: { nombre: 'Hotel Mirador' }, concepto: 'Servicio', base: 100, ivaPct: 0, irpfPct: 0, cobrada: false }],
    movs: [
      movBD({ id: 'p1', concepto: 'TRASPASO A SABADELL', importe: -500 }),
      movBD({ id: 'p2', concepto: 'TRASPASO DESDE CAIXA', importe: 300 }),
      movBD({ id: 'hecho', concepto: 'TRASPASO PROPIO', estado: 'emparejado', enlace: { tipo: 'auto', id: 'hacienda' } }),
      movBD({ id: 'ya', concepto: 'TRASPASO IGNORADO', estado: 'ignorado' }),
      movBD({ id: 'devuelto', concepto: 'TRASPASO DEVUELTO', autoDescartada: true }),
      movBD({ id: 'factura', concepto: 'F2026-001 TRASPASO', importe: 100 }),
    ],
  });
  const r = await B.autoconciliar(u);
  assert.equal(r.rechazados.length, 0);
  for (const id of ['p1', 'p2']) {
    const m = await leer(u, 'banco', id);
    assert.deepEqual([m.estado, m.auto, m.regla], ['ignorado', true, 'r2'], id);
  }
  assert.deepEqual((await leer(u, 'banco', 'hecho')).enlace, { tipo: 'auto', id: 'hacienda' });
  assert.equal((await leer(u, 'banco', 'hecho')).regla, undefined);
  assert.deepEqual([(await leer(u, 'banco', 'ya')).regla, (await leer(u, 'banco', 'ya')).auto], [undefined, undefined]);
  assert.equal((await leer(u, 'banco', 'devuelto')).estado, 'pendiente');
  assert.equal((await leer(u, 'banco', 'devuelto')).regla, undefined);
  // La factura que casa con seguridad se cobra con su movimiento; la regla no se lo quita.
  const f = await leer(u, 'banco', 'factura');
  assert.deepEqual([f.estado, f.enlace.tipo, f.regla], ['emparejado', 'factura', undefined]);
  // Recuperarlo (Ignorados › Recuperar) lo deja pendiente y la regla ya no lo aparta otra vez.
  assert.equal((await B.deshacer(u, 'p1')).ok, true);
  const p1 = await leer(u, 'banco', 'p1');
  assert.deepEqual([p1.estado, p1.regla, p1.auto, p1.autoDescartada], ['pendiente', undefined, undefined, true]);
  assert.equal((await B.autoconciliar(u)).hechos, 0);
  assert.equal((await leer(u, 'banco', 'p1')).estado, 'pendiente');
  // Con la regla, a mano: lo que la persona devolvió a pendiente no se aparta por regla; lo resuelto, nunca.
  assert.match((await B.ignorar(u, 'p1', { regla: 'r2' })).error, /ya no encaja/);
  assert.match((await B.ignorar(u, 'devuelto', { regla: 'r2' })).error, /ya no encaja/);
  assert.equal((await leer(u, 'banco', 'devuelto')).estado, 'pendiente');
  assert.match((await B.ignorar(u, 'hecho', { regla: 'r2' })).error, /deshaz el emparejamiento/);
  assert.match((await B.ignorar(u, 'factura', { regla: 'r2' })).error, /deshaz/);
  // Un movimiento al que la regla sí le toca, confirmado a mano: queda con la regla anotada pero no como automático.
  const v = empresa();
  await sembrar(v, { reglas: [ignorar], movs: [movBD({ id: 'mm', concepto: 'TRASPASO A OTRA CUENTA', importe: -80 })] });
  assert.equal((await B.ignorar(v, 'mm', { regla: 'r2' })).ok, true);
  const mm = await leer(v, 'banco', 'mm');
  assert.deepEqual([mm.estado, mm.regla, mm.auto], ['ignorado', 'r2', undefined]);
  assert.match((await B.ignorar(v, 'mm', { regla: 'r2' })).error, /ya no está pendiente/);
  const w = empresa();
  await sembrar(w, { movs: [movBD({ concepto: 'RECIBO LUZ' })], reglas: [ignorar] });
  assert.match((await B.ignorar(w, 'm', { regla: 'r2' })).error, /ya no encaja/);
  assert.match((await B.ignorar(w, 'm', { regla: 'rg-borrada' })).error, /ya no encaja/);
  assert.equal((await B.ignorar(w, 'm')).ok, true);
});

test('automática: cada persona aparta solo lo que podría ignorar a mano (gastar para cargos, facturar para abonos)', async () => {
  const u = miembro(['resumen', 'facturas', 'gastos', 'gastar']);
  await sembrar(u, {
    reglas: [regla({ id: 'r2', contiene: 'traspaso', accion: 'ignorar', signo: 'ambos', proveedor: undefined })],
    movs: [movBD({ id: 'cargo', concepto: 'TRASPASO A', importe: -50 }), movBD({ id: 'abono', concepto: 'TRASPASO DE', importe: 50 })],
  });
  assert.deepEqual([(await B.autoconciliar(u)).hechos, (await B.autoconciliar(u)).rechazados.length], [1, 0]);
  assert.deepEqual([(await leer(u, 'banco', 'cargo')).estado, (await leer(u, 'banco', 'abono')).estado], ['ignorado', 'pendiente']);
});

test('«Confirmar las seguras» también aparta lo que manda una regla de ignorar, y respeta los permisos', async () => {
  const u = empresa();
  await sembrar(u, {
    reglas: [regla({ id: 'r2', contiene: 'traspaso', accion: 'ignorar', signo: 'ambos', proveedor: undefined })],
    gastos: [gastoBD({ id: 'g2', proveedor: 'Dudoso Servicios', base: 33 })],
    movs: [movBD({ id: 'a', concepto: 'TRASPASO A', importe: -50 }), movBD({ id: 'b', concepto: 'RECIBO CUALQUIERA', importe: -33 })],
  });
  const r = await post(u, { accion: 'seguras', ids: ['a', 'b', 'no-existe'] });
  assert.deepEqual([r.status, r.hechos, r.rechazados.map((x) => x.id)], [200, 1, ['b', 'no-existe']]);
  const a = await leer(u, 'banco', 'a');
  assert.deepEqual([a.estado, a.regla, a.auto], ['ignorado', 'r2', undefined]);
  assert.equal((await leer(u, 'banco', 'b')).estado, 'pendiente');
  // Sin «facturar», un abono que manda ignorar una regla no se aparta.
  const v = miembro(['resumen', 'facturas', 'gastos', 'gastar']);
  await sembrar(v, { reglas: [regla({ id: 'r2', contiene: 'traspaso', accion: 'ignorar', signo: 'ambos', proveedor: undefined })], movs: [movBD({ id: 'abono', concepto: 'TRASPASO DE', importe: 50 })] });
  const x = await post(v, { accion: 'seguras', ids: ['abono'] });
  assert.deepEqual([x.hechos, x.rechazados[0].error], [0, 'No tienes permiso para conciliar este movimiento']);
  // Ignorar a mano con una regla que ya no encaja da error 400, como cualquier otro.
  const y = await post(u, { accion: 'ignorar', id: 'b', regla: 'r2' });
  assert.deepEqual([y.status, y.error], [400, 'Esa regla ya no encaja con este movimiento']);
  assert.equal((await post(u, { accion: 'ignorar', id: 'b' })).status, 200);
});

test('las reglas se exportan, se borran con la cuenta y con la baja de la empresa', async () => {
  assert.ok(R.DATOS.includes('bancoReglas'));
  for (const archivo of ['lib/baja.js', 'app/api/exportar/todo/route.js']) {
    const fuente = await readFile(new URL(`../${archivo}`, import.meta.url), 'utf8');
    assert.match(fuente, /'bancoReglas'/, archivo);
  }
  assert.match(await readFile(new URL('../lib/baja.js', import.meta.url), 'utf8'), /BORRAR_YA = \[[^\]]*'bancoReglas'/);
  assert.match(await readFile(new URL('../app/api/exportar/todo/route.js', import.meta.url), 'utf8'), /LISTAS = \[[^\]]*'bancoReglas'/);
  const u = empresa();
  await sembrar(u, { reglas: [regla()] });
  await R.redis.del(...R.DATOS.map((nombre) => R.clave(u, nombre)));
  assert.deepEqual(await reglasDe(u), []);
});
