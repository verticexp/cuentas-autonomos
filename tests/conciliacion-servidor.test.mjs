// Sigue el patrón de conciliacion-parcial: Redis real de la app contra Upstash simulado por HTTP.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, R, B, POST;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, B] = await Promise.all([import('../lib/redis.js'), import('../lib/bancoServidor.js')]);
  POST = (await cargarRuta('../app/api/banco/route.js')).POST;
});
after(async () => { if (srv) await srv.cerrar(); delete globalThis.__conciliacionApi; delete globalThis.__conciliacionDobles; });

// Aísla solo la autenticación HTTP: las rutas, permisos, índices y operaciones bancarias son los de producción.
const modulo = (codigo) => `data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`;
async function cargarRuta(ruta, dobles = {}) {
  const api = modulo(`export const usuarioApi = async () => ({ u: globalThis.__conciliacionApi });
    export const cuerpo = (req) => req.json();
    export const error = (error, status = 400) => Response.json({error}, {status});`);
  const codigo = (await readFile(new URL(ruta, import.meta.url), 'utf8')).replace(/(['"])@\/lib\/([^'"]+)\1/g,
    (_, _comillas, nombre) => JSON.stringify(dobles[nombre] || (nombre === 'api' ? api : new URL(`../lib/${nombre}.js`, import.meta.url).href)));
  return import(modulo(codigo));
}
let n = 0;
const empresa = (extra = {}) => ({ id: `u${++n}`, empresa: `srv${n}`, rol: 'admin',
  actividades: [{ id: 'servicios', nombre: 'Servicios', ivaPct: 0 }], ...extra });
const factura = (extra = {}) => ({ id: 'f', importada: 'F2026-001', numero: 1, anio: 2026,
  fecha: '2026-06-15', actividad: 'servicios', cliente: { nombre: 'Hotel Mirador' },
  concepto: 'Servicio', base: 100, ivaPct: 0, irpfPct: 0, cobrada: false, ...extra });
const gasto = (extra = {}) => ({ id: 'g', numero: 'G2026-001', fecha: '2026-06-15', actividad: 'servicios',
  proveedor: 'Ferretería Mirador', concepto: 'Material', base: 100, ivaPct: 0, pendiente: true, ...extra });
const movimiento = (extra = {}) => ({ id: 'm', fecha: '2026-06-17', importe: 100, concepto: 'F2026-001', cuenta: 'c', estado: 'pendiente', ...extra });
const leer = (u, col, id) => R.leerUno(u, col, id);
async function sembrar(u, { facturas = [], gastos = [], movs = [] }) {
  for (const [col, lista] of [['facturas', facturas], ['gastos', gastos], ['banco', movs]]) {
    if (lista.length) await R.redis.hset(R.clave(u, col), Object.fromEntries(lista.map((x) => [x.id, x])));
  }
}
async function seguras(u, b) {
  globalThis.__conciliacionApi = u;
  const res = await POST(new Request('http://localhost/api/banco', { method: 'POST', body: JSON.stringify({ accion: 'seguras', ...b }) }));
  return { status: res.status, ...(await res.json()) };
}

// Detecta el script de índices que contiene gasto + movimiento en una misma transacción.
const comandos = (body) => { const j = JSON.parse(body); return Array.isArray(j[0]) ? j : [j]; };
const operaciones = (body) => comandos(body).flatMap((cmd) =>
  String(cmd[0]).toLowerCase() === 'eval' && cmd[3]?.startsWith('[') ? JSON.parse(cmd[3]) : []);

test('1/2: deshacer restaura pendiente y pagado y escribe gasto + movimiento juntos', async () => {
  for (const extra of [{ pendiente: true, pagado: '2026-05-01' }, { pendiente: false, pagado: '2026-05-02' }, { pendiente: undefined, pagado: undefined }]) {
    const u = empresa();
    await sembrar(u, { gastos: [gasto(extra)], movs: [movimiento({ importe: -100 })] });
    assert.equal((await B.emparejar(u, 'm', 'gasto', 'g')).ok, true);
    const m = await leer(u, 'banco', 'm');
    assert.equal(m.antes.pagado, extra.pagado);
    let conjunta = false;
    srv.ganchos.antes = async (body) => {
      const ops = operaciones(body);
      if (ops.some((op) => op[0] === '_g' && op[1] === `cuentas:gastos:${u.empresa}`)
        && ops.some((op) => op[0] === 'hset' && op[1] === `cuentas:banco:${u.empresa}`)) conjunta = true;
    };
    try { assert.equal((await B.deshacer(u, 'm')).ok, true); } finally { srv.ganchos.antes = null; }
    assert.equal(conjunta, true);
    const g = await leer(u, 'gastos', 'g');
    assert.equal(g.pendiente, extra.pendiente);
    assert.equal(g.pagado, extra.pagado);
    assert.equal(g.banco, undefined);
    assert.equal((await leer(u, 'banco', 'm')).estado, 'pendiente');
  }
});

test('1: carrera determinista: deshacer bloquea el gasto frente a otro emparejamiento', async () => {
  const u = empresa();
  await sembrar(u, { gastos: [gasto({ pagado: '2026-05-01' })], movs: [movimiento({ importe: -100 }), movimiento({ id: 'otro', importe: -100 })] });
  assert.equal((await B.emparejar(u, 'm', 'gasto', 'g')).ok, true);
  let liberar, avisar;
  const pausa = new Promise((r) => { liberar = r; });
  const leido = new Promise((r) => { avisar = r; });
  srv.ganchos.antes = async (body) => {
    if (comandos(body).some((cmd) => String(cmd[0]).toLowerCase() === 'hget' && cmd[1] === `cuentas:gastos:${u.empresa}` && cmd[2] === 'g')) {
      avisar(); await pausa;
    }
  };
  const deshaciendo = B.deshacer(u, 'm');
  let timer;
  try {
    await Promise.race([leido, new Promise((_, rechazar) => { timer = setTimeout(() => rechazar(new Error('No se alcanzó la lectura del gasto')), 5000); })]);
    const r = await B.emparejar(u, 'otro', 'gasto', 'g');
    assert.equal(r.status, 409);
  } finally { clearTimeout(timer); srv.ganchos.antes = null; liberar(); await deshaciendo; }
  assert.equal((await leer(u, 'gastos', 'g')).pagado, '2026-05-01');
  assert.equal((await B.emparejar(u, 'otro', 'gasto', 'g')).ok, true);
  assert.equal((await leer(u, 'gastos', 'g')).banco, 'otro');
});

test('1: si falla la transacción de deshacer, conserva ambas parejas', async () => {
  const u = empresa();
  await sembrar(u, { gastos: [gasto()], movs: [movimiento({ importe: -100 })] });
  await B.emparejar(u, 'm', 'gasto', 'g');
  const original = R.redis.multi;
  R.redis.multi = () => {
    const tx = original();
    tx.exec = async () => { throw new Error('corte simulado'); };
    return tx;
  };
  try { await assert.rejects(B.deshacer(u, 'm'), /corte simulado/); } finally { R.redis.multi = original; }
  assert.equal((await leer(u, 'gastos', 'g')).banco, 'm');
  assert.equal((await leer(u, 'banco', 'm')).estado, 'emparejado');
});

test('3: solo enlace conserva byte a byte el cobro externo al emparejar y deshacer', async () => {
  for (const extra of [
    { cobrada: true, cobro: { metodo: 'remesa', importe: 100, fecha: '2026-06-16' } },
    { cobrada: true, cobro: { metodo: 'stripe', importe: 100 }, pagos: [{ metodo: 'stripe', importe: 100, fecha: '2026-06-16' }] },
    { pagos: [{ metodo: 'tarjeta', importe: 40 }, { metodo: 'tarjeta', importe: 60 }] },
    { cobrada: true },
  ]) {
    const u = empresa();
    await sembrar(u, { facturas: [factura(extra)], movs: [movimiento(), movimiento({ id: 'otro' })] });
    const antes = await leer(u, 'facturas', 'f');
    assert.equal((await B.emparejar(u, 'm', 'factura', 'f', { auto: true })).ok, true);
    assert.deepEqual(await leer(u, 'facturas', 'f'), antes);
    assert.deepEqual((await leer(u, 'banco', 'm')).enlace, { tipo: 'factura', id: 'f', yaCobrada: true });
    assert.match((await B.emparejar(u, 'otro', 'factura', 'f')).error, /enlazada/);
    assert.equal((await B.deshacer(u, 'm')).ok, true);
    assert.deepEqual(await leer(u, 'facturas', 'f'), antes);
    const m = await leer(u, 'banco', 'm');
    assert.deepEqual([m.estado, m.enlace, m.auto], ['pendiente', undefined, undefined]);
    assert.equal((await B.deshacer(u, 'm')).ok, true);
  }
});

test('3/6: solo enlace usa cobro.importe; tolerancia de un céntimo y error claro al exceder', async () => {
  for (const importe of [89.99, 90, 90.01, 90.02, 89.98]) {
    const u = empresa();
    await sembrar(u, { facturas: [factura({ cobrada: true, cobro: { metodo: 'stripe', importe: 90 } })], movs: [movimiento({ importe })] });
    const antes = await leer(u, 'facturas', 'f');
    const r = await B.emparejar(u, 'm', 'factura', 'f');
    if (importe >= 89.99 && importe <= 90.01) assert.equal(r.ok, true, r.error);
    else { assert.match(r.error, importe > 90 ? /supera el importe ya cobrado/ : /no coincide/); assert.equal((await leer(u, 'banco', 'm')).estado, 'pendiente'); }
    assert.deepEqual(await leer(u, 'facturas', 'f'), antes);
  }
});

test('3: candidatos incluye cobradas en ±45 días, excluye vínculos y conserva pendientes antiguos', async () => {
  const u = empresa();
  const cobro = { cobrada: true, cobro: { metodo: 'remesa', importe: 100 } };
  await sembrar(u, { facturas: [
    factura({ id: 'antigua', fecha: '2020-01-01' }), factura({ id: 'menos45', fecha: '2026-05-03', ...cobro }),
    factura({ id: 'mas45', fecha: '2026-08-01', ...cobro }), factura({ id: 'fuera', fecha: '2026-08-02', ...cobro }),
    factura({ id: 'bancaria', ...cobro, cobro: { metodo: 'banco', banco: 'x', importe: 100 } }), factura({ id: 'enlazada', ...cobro }),
  ], movs: [movimiento(), movimiento({ id: 'x', estado: 'emparejado', enlace: { tipo: 'factura', id: 'enlazada', yaCobrada: true } })] });
  const { facturas } = await B.candidatosConciliacion(u, await R.leer(u, 'banco'));
  assert.deepEqual(facturas.map((f) => f.id).sort(), ['antigua', 'mas45', 'menos45']);
});

test('4: seguras con ids confirma solo esos y devuelve cada rechazo; ids repetidos se deduplican', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura(), factura({ id: 'f2', importada: 'F2026-002', base: 200 })],
    movs: [movimiento(), movimiento({ id: 'm2', concepto: 'F2026-002', importe: 200 }), movimiento({ id: 'incierto', concepto: 'Transferencia', importe: 9 })] });
  const r = await seguras(u, { ids: ['m', 'm', 'incierto', 'no-existe'] });
  assert.deepEqual([r.status, r.ok, r.hechos], [200, true, 1]);
  assert.deepEqual(r.rechazados.map((x) => x.id), ['incierto', 'no-existe']);
  assert.ok(r.rechazados.every((x) => x.error));
  assert.equal((await leer(u, 'banco', 'm2')).estado, 'pendiente');
  const repetir = await seguras(u, { ids: ['m'] });
  assert.equal(repetir.hechos, 0);
  assert.equal(repetir.rechazados[0].id, 'm');
});

test('4: valida ids y el comportamiento sin ids está limitado a los primeros 150 pendientes', async () => {
  const u = empresa();
  for (const ids of ['m', [null], [''], Array(201).fill('m')]) assert.equal((await seguras(u, { ids })).status, 400);
  assert.equal((await seguras(u, { ids: [] })).hechos, 0);
  const facturas = [], movs = [];
  for (let i = 1; i <= 151; i++) {
    facturas.push(factura({ id: `f${i}`, importada: `TEST-${i}`, base: i }));
    movs.push(movimiento({ id: `m${i}`, concepto: `TEST-${i}`, importe: i }));
  }
  await sembrar(u, { facturas, movs });
  assert.equal((await seguras(u, {})).hechos, 150);
  assert.equal((await leer(u, 'banco', 'm151')).estado, 'pendiente');
});

test('4: seguras refleja falta de permiso y errores individuales sin cortar el lote', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura(), factura({ id: 'f2', importada: 'F2026-002', base: 200 })],
    movs: [movimiento(), movimiento({ id: 'm2', importe: 200, concepto: 'F2026-002' })] });
  const denegado = await seguras({ ...u, rol: 'lector' }, { ids: ['m'] });
  assert.equal(denegado.hechos, 0);
  assert.match(denegado.rechazados[0].error, /permiso/);
  await R.redis.set(`cerrojo:${R.clave(u, 'banco-m')}`, 'ocupado', { ex: 20 });
  const r = await seguras(u, { ids: ['m', 'm2'] });
  assert.equal(r.hechos, 1);
  assert.equal(r.rechazados[0].id, 'm');
  await R.redis.del(`cerrojo:${R.clave(u, 'banco-m')}`);
});

test('5: automática: factura con número y gasto con proveedor; omite ambigüedad, ausencia de identidad y permiso insuficiente', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura(), factura({ id: 'f2', importada: 'OTRA-2', base: 300 }), factura({ id: 'f3', importada: 'OTRA-3', base: 300 }),
    factura({ id: 'f4', importada: 'OTRA-4', base: 400 }), factura({ id: 'f5', importada: 'OTRA-5', base: 500 })],
    gastos: [gasto({ base: 200 })], movs: [movimiento(), movimiento({ id: 'cargo', importe: -200, concepto: 'Ferretería Mirador' }),
      movimiento({ id: 'ambiguo', importe: 300, concepto: 'Hotel Mirador' }), movimiento({ id: 'sin-identidad', importe: 400, concepto: 'Transferencia' }),
      movimiento({ id: 'solo-nombre', importe: 500, concepto: 'Hotel Mirador' })] });
  assert.deepEqual(await B.autoconciliar({ ...u, rol: 'lector' }), { hechos: 0, rechazados: [] });
  assert.deepEqual(await B.autoconciliar(u), { hechos: 2, rechazados: [] });
  for (const id of ['m', 'cargo']) assert.equal((await leer(u, 'banco', id)).auto, true);
  for (const id of ['ambiguo', 'sin-identidad', 'solo-nombre']) assert.equal((await leer(u, 'banco', id)).estado, 'pendiente');
  assert.deepEqual(await B.autoconciliar(u), { hechos: 0, rechazados: [] });
  await B.deshacer(u, 'm'); await B.deshacer(u, 'cargo');
  assert.equal((await leer(u, 'banco', 'm')).auto, undefined);
  assert.equal((await leer(u, 'banco', 'm')).autoDescartada, true);
  assert.deepEqual(await B.autoconciliar(u), { hechos: 0, rechazados: [] });
  // El descarte automático sigue permitiendo confirmar a mano.
  assert.equal((await B.emparejar(u, 'm', 'factura', 'f')).ok, true);
});

test('5: automática devuelve rechazos individuales, continúa y nunca intenta más de 200', async () => {
  const u = empresa(), facturas = [], movs = [];
  for (let i = 1; i <= 202; i++) {
    facturas.push(factura({ id: `f${i}`, importada: `AUTO-${i}`, base: i }));
    movs.push(movimiento({ id: `m${i}`, concepto: `AUTO-${i}`, importe: i }));
  }
  await sembrar(u, { facturas, movs });
  await R.redis.set(`cerrojo:${R.clave(u, 'banco-m1')}`, 'ocupado', { ex: 20 });
  const r = await B.autoconciliar(u);
  assert.equal(r.hechos, 199);
  assert.deepEqual(r.rechazados.map((x) => x.id), ['m1']);
  assert.equal((await leer(u, 'banco', 'm201')).estado, 'pendiente');
  await R.redis.del(`cerrojo:${R.clave(u, 'banco-m1')}`);
  assert.equal((await B.autoconciliar(u)).hechos, 3);
  assert.deepEqual(await B.autoconciliar(u), { hechos: 0, rechazados: [] });
});

test('6: confirmar y sugerir comparten céntimos; una factura pendiente nunca admite sobrecobro', async () => {
  for (const importe of [99.989999999, 100, 100.010000001, 100.02]) {
    const u = empresa();
    await sembrar(u, { gastos: [gasto()], movs: [movimiento({ importe: -importe })] });
    const r = await B.emparejar(u, 'm', 'gasto', 'g');
    assert.equal(Boolean(r.ok), importe < 100.02);
  }
  const u = empresa();
  await sembrar(u, { facturas: [factura()], movs: [movimiento({ importe: 100.01 })] });
  assert.match((await B.emparejar(u, 'm', 'factura', 'f')).error, /supera lo que falta/);
});

test('4/5: una sugerencia que cambia entre la lectura del lote y el cerrojo se rechaza', async () => {
  for (const modo of ['seguras', 'auto']) {
    const u = empresa();
    await sembrar(u, { facturas: [factura()], movs: [movimiento()] });
    let cambiado = false;
    srv.ganchos.antes = async (body) => {
      // El lote ya se calculó. Al tomar su cerrojo de movimiento, entra un pago por otra vía.
      if (!cambiado && comandos(body).some((cmd) => String(cmd[0]).toLowerCase() === 'set' && cmd[1] === `cuentas:cerrojo:banco-m:${u.empresa}`)) {
        cambiado = true;
        // Dentro del gancho no se espera otra petición del mismo autopipeline. Se cambia la copia que leerá el cerrojo.
        srv.base.run(['hset', `cuentas:facturas:${u.empresa}`, 'f', JSON.stringify(factura({ pagos: [{ metodo: 'stripe', importe: 40 }] }))]);
      }
    };
    try {
      const r = modo === 'seguras' ? await seguras(u, { ids: ['m'] }) : await B.autoconciliar(u);
      assert.equal(r.hechos, 0);
      assert.equal(r.rechazados[0].id, 'm');
      assert.equal((await leer(u, 'facturas', 'f')).pagos.length, 1);
      assert.equal((await leer(u, 'banco', 'm')).estado, 'pendiente');
    } finally { srv.ganchos.antes = null; }
  }
});

test('5: importar devuelve auto, concilia lo importado y conserva la importación si la automática falla', async () => {
  const servidor = new URL('../lib/bancoServidor.js', import.meta.url).href;
  const ruta = (await cargarRuta('../app/api/banco/importar/route.js', {
    hoja: modulo(`export const leerHoja = () => globalThis.__conciliacionDobles.filas;`),
    limite: modulo(`export const MUCHOS = 'Muchos'; export const pasado = async () => false;`),
    ticket: modulo(`export const iaLista = () => false; export const leerExtracto = async () => ({});`),
    bancoServidor: modulo(`import * as B from ${JSON.stringify(servidor)};
      export const guardarMovimientos = B.guardarMovimientos; export const actualizarSaldo = B.actualizarSaldo;
      export const autoconciliar = (u) => { if (globalThis.__conciliacionDobles.fallar) throw new Error('fallo automático'); return B.autoconciliar(u); };`),
  })).POST;
  for (const fallar of [false, true]) {
    const u = empresa();
    globalThis.__conciliacionApi = u;
    globalThis.__conciliacionDobles = { fallar, filas: [['Fecha', 'Importe', 'Concepto'], ['17/06/2026', 100, 'F2026-001']] };
    await sembrar(u, { facturas: [factura()] });
    const pedir = () => { const form = new FormData(); form.set('archivo', new Blob(['extracto csv']), 'extracto.csv'); return ruta(new Request('http://localhost/api/banco/importar', { method: 'POST', body: form })); };
    const res = await pedir();
    const r = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual([r.nuevos, r.auto], [1, fallar ? 0 : 1]);
    assert.equal((await R.leer(u, 'banco'))[0].estado, fallar ? 'pendiente' : 'emparejado');
    assert.equal((await (await pedir()).json()).auto, 0);
  }
});

test('5: sincronizar devuelve auto y no pierde movimientos si falla autoconciliar; la ruta lo propaga', async () => {
  // Se sustituye solo el proveedor externo para ejercitar sincronizar sin red ni credenciales bancarias.
  const banco = modulo(`export const saldos = async () => [{balance_type:'CLAV', transaction_amount: {amount:'100'}}];
    export const movimientos = async () => [{entry_reference:'ref', booking_date:'2026-06-17', credit_debit_indicator:'CRDT',
      transaction_amount:{amount:'100'}, remittance_information:'F2026-001'}];`);
  const codigo = (await readFile(new URL('../lib/bancoServidor.js', import.meta.url), 'utf8'))
    .replace(/(['"])\.\/([^'"]+)\1/g, (_, _c, nombre) => JSON.stringify(nombre === 'enableBanking.js' ? banco : new URL(`../lib/${nombre}`, import.meta.url).href))
    .replace('export async function autoconciliar(u) {', "export async function autoconciliar(u) { if (globalThis.__conciliacionDobles.fallar) throw new Error('fallo automático');");
  const moduloServidor = modulo(codigo);
  const S = await import(moduloServidor);
  const ruta = (await cargarRuta('../app/api/banco/sincronizar/route.js', {
    bancoServidor: moduloServidor, limite: modulo(`export const MUCHOS = 'Muchos'; export const pasado = async () => false;`),
  })).POST;
  for (const fallar of [false, true]) {
    const u = empresa();
    globalThis.__conciliacionApi = u;
    globalThis.__conciliacionDobles = { fallar };
    await sembrar(u, { facturas: [factura()] });
    await R.guardar(u, 'bancos', { id: 'c', uid: 'uid', origen: 'enable' });
    const res = await ruta(new Request('http://localhost/api/banco/sincronizar', { method: 'POST', body: JSON.stringify({ forzar: true }) }));
    const r = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual([r.nuevos, r.auto], [1, fallar ? 0 : 1]);
    assert.equal((await R.leer(u, 'banco'))[0].estado, fallar ? 'pendiente' : 'emparejado');
    assert.deepEqual(await S.sincronizar(u, { forzar: true }), { nuevos: 0, auto: 0 });
  }
});

test('3: liquidación de un pago externo parcial se enlaza sin duplicar el pago y sin alterar el saldo pendiente', async () => {
  const u = empresa();
  await sembrar(u, { facturas: [factura({ base: 121, pagos: [{ metodo: 'stripe', importe: 50 }] })], movs: [movimiento({ importe: 50 })] });
  const antes = await leer(u, 'facturas', 'f');
  assert.equal((await B.emparejar(u, 'm', 'factura', 'f')).ok, true);
  assert.equal((await leer(u, 'banco', 'm')).enlace.yaCobrada, true);
  assert.deepEqual(await leer(u, 'facturas', 'f'), antes);
  assert.equal((await B.deshacer(u, 'm')).ok, true);
  assert.deepEqual(await leer(u, 'facturas', 'f'), antes);
});

test('4/5: un error lanzado por un movimiento se devuelve y el siguiente se concilia', async () => {
  for (const modo of ['seguras', 'auto']) {
    const u = empresa();
    await sembrar(u, { facturas: [factura(), factura({ id: 'f2', importada: 'F2026-002', base: 200 })],
      movs: [movimiento(), movimiento({ id: 'm2', concepto: 'F2026-002', importe: 200 })] });
    const original = R.redis.multi;
    let fallar = true;
    R.redis.multi = () => {
      const tx = original(), exec = tx.exec;
      tx.exec = async () => { if (fallar) { fallar = false; throw new Error('corte individual'); } return exec(); };
      return tx;
    };
    try {
      const r = modo === 'seguras' ? await seguras(u, { ids: ['m', 'm2'] }) : await B.autoconciliar(u);
      assert.equal(r.hechos, 1);
      assert.deepEqual(r.rechazados, [{ id: 'm', error: 'corte individual' }]);
      assert.equal((await leer(u, 'banco', 'm')).estado, 'pendiente');
      assert.equal((await leer(u, 'banco', 'm2')).estado, 'emparejado');
    } finally { R.redis.multi = original; }
  }
});
