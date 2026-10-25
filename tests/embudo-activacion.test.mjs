// Embudo de activación del panel de administración: alta → primera factura → primer gasto → banco → primer modelo presentado.
// Primero la cuenta con datos de ejemplo (lib/embudo.js) y después el lector barato contra el Redis simulado
// (lib/embudoServidor.js): sin leer documentos y sin volver a mirar lo que ya se alcanzó.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { PASOS, VENTANAS, calcularEmbudo, mediana, modeloPresentado, textoDias } from '../lib/embudo.js';

const HOY = new Date('2026-10-26T10:00:00Z');
const fila = (id, creada, extra = {}) => ({ id, creada, registrada: true, regalo: false, ...extra });
const ventana = (r, id) => r.find((v) => v.id === id);
const paso = (v, id) => v.pasos.find((p) => p.id === id);

test('la mediana: pares, impares y vacío', () => {
  assert.equal(mediana([]), null);
  assert.equal(mediana([5]), 5);
  assert.equal(mediana([9, 1, 3]), 3);
  assert.equal(mediana([1, 2, 3, 10]), 2.5);
  assert.equal(mediana([NaN, 4]), 4);
});

test('los días se escriben en castellano', () => {
  assert.equal(textoDias(null), '—');
  assert.equal(textoDias(0), 'el mismo día');
  assert.equal(textoDias(1), '1 día');
  assert.equal(textoDias(3), '3 días');
  assert.equal(textoDias(2.5), '2,5 días');
});

test('un modelo presentado: cualquier marca de la empresa y el día de la primera', () => {
  assert.deepEqual(modeloPresentado({}), { hecho: false, fecha: '' });
  assert.deepEqual(modeloPresentado({ pres303: { 2026: { 1: false } } }), { hecho: false, fecha: '' }, 'una marca quitada no cuenta');
  assert.deepEqual(modeloPresentado({ pres303: { 2026: { 2: true } }, pagadosHacienda: { '2026-2-303': { fecha: '2026-07-10', en: '2026-07-10T09:00:00.000Z' } } }), { hecho: true, fecha: '2026-07-10' });
  // El 130 a cero cuenta como presentado pero no guarda el día; otra marca con día sí lo da.
  assert.deepEqual(modeloPresentado({ pagos130: { 2026: { 1: 0 } } }), { hecho: true, fecha: '' });
  assert.equal(modeloPresentado({ pres111: { 2026: { 1: true } }, pagadosHacienda: { '2026-3-111': { en: '2026-10-01T00:00:00Z' }, '2026-1-111': { en: '2026-04-12T00:00:00Z' } } }).fecha, '2026-04-12', 'la más antigua');
  assert.equal(modeloPresentado({ pres369: { 2026: { 1: 'devolucion' } } }).hecho, false, 'la devolución es del 303');
  assert.equal(modeloPresentado({ pres303: { 2026: { 4: 'devolucion' } } }).hecho, true);
  assert.equal(modeloPresentado({ pagos202: { 2026: { 1: 120 } } }).hecho, true);
});

test('el embudo: pasos acumulados, porcentaje sobre el anterior y mediana de días', () => {
  const empresas = [
    fila('a', '2026-10-20'), // 6 días de vida: factura el mismo día, gasto a los 2, banco a los 4 y modelo a los 5
    fila('b', '2026-10-10'), // factura a los 3 días y nada más
    fila('c', '2026-10-01'), // sin nada
    fila('d', '2026-08-01'), // de las de 90 días: factura a los 10 y gasto a los 12
    fila('e', '2026-03-01'), // antigua: todo, con el 130 a cero (sin día)
    fila('f', '2026-10-05'), // banco sin factura: no cuenta en el banco, que va después de la factura
    fila('g', '2026-10-24', { regalo: true }), // Fundador regalado: fuera
    fila('h', '2026-10-24', { registrada: false }), // cuenta anterior a los planes: fuera
  ];
  const hitos = {
    a: { factura: '2026-10-20', gasto: '2026-10-22', banco: '2026-10-24', modelo: '2026-10-25' },
    b: { factura: '2026-10-13' },
    d: { factura: '2026-08-11', gasto: '2026-08-13' },
    e: { factura: '2026-03-02', gasto: '2026-03-05', banco: '2026-03-20', modelo: '' },
    f: { banco: '2026-10-06' },
    g: { factura: '2026-10-25' },
  };
  const r = calcularEmbudo({ empresas, hitos, hoy: HOY });
  assert.deepEqual(r.map((v) => v.id), VENTANAS.map((v) => v.id));

  const todas = ventana(r, 'todas');
  assert.equal(todas.altas, 6);
  assert.deepEqual(todas.pasos.map((p) => [p.id, p.n]), [['alta', 6], ['factura', 4], ['gasto', 3], ['banco', 2], ['modelo', 2]]);
  assert.deepEqual(todas.pasos.map((p) => p.pctPrevio), [null, 67, 75, 67, 100]);
  assert.deepEqual(todas.pasos.map((p) => p.pctAltas), [100, 67, 50, 33, 33]);
  // Factura: a 0, 3, 10 y 1 días → mediana 2; gasto: 2, 12 y 4 → 4; banco: 4 y 19 → 11,5; modelo: solo a (5 días), e sin día.
  assert.equal(paso(todas, 'factura').mediana, 2);
  assert.equal(paso(todas, 'gasto').mediana, 4);
  assert.equal(paso(todas, 'banco').mediana, 11.5);
  assert.equal(paso(todas, 'modelo').mediana, 5);
  assert.equal(paso(todas, 'modelo').conDia, 1, 'el modelo sin día cuenta en el embudo, no en la mediana');

  const d90 = ventana(r, '90');
  assert.equal(d90.altas, 5, 'e (marzo) queda fuera de los 90 días');
  assert.deepEqual(d90.pasos.map((p) => p.n), [5, 3, 2, 1, 1]);
  const d30 = ventana(r, '30');
  assert.equal(d30.altas, 4, 'a, b, c y f; d es de agosto');
  assert.deepEqual(d30.pasos.map((p) => p.n), [4, 2, 1, 1, 1]);
  assert.equal(paso(d30, 'factura').pctPrevio, 50);
  assert.equal(paso(d30, 'factura').mediana, 1.5, 'a a 0 días y b a 3');
});

test('el embudo: un hito anterior al alta cuenta cero días y sin altas no hay porcentajes', () => {
  const r = calcularEmbudo({ empresas: [fila('x', '2026-10-20')], hitos: { x: { factura: '2026-01-15' } }, hoy: HOY });
  assert.equal(paso(ventana(r, 'todas'), 'factura').mediana, 0);
  const vacio = calcularEmbudo({ empresas: [], hitos: {}, hoy: HOY });
  for (const v of vacio) {
    assert.equal(v.altas, 0);
    assert.deepEqual(v.pasos.map((p) => [p.n, p.pctPrevio, p.pctAltas, p.mediana]), PASOS.map(() => [0, null, null, null]));
  }
});

// ---------- Lectura barata contra el Redis simulado ----------
let srv, R, F, E;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [R, F, E] = await Promise.all([import('../lib/redis.js'), import('../lib/fichas.js'), import('../lib/embudoServidor.js')]);
});
after(() => srv.cerrar());

async function registrar(fn) {
  const cmds = [];
  srv.ganchos.antes = async (cuerpo) => { const j = JSON.parse(cuerpo || 'null'); for (const c of Array.isArray(j?.[0]) ? j : [j]) if (c) cmds.push(c); };
  try { await fn(); } finally { srv.ganchos.antes = null; }
  return cmds;
}
const factura = (i, fecha) => ({ id: `f${i}`, numero: i, anio: 2026, fecha, cliente: { nombre: 'Ana' }, concepto: 'Trabajo', base: 100, ivaPct: 21, irpfPct: 0, cobrada: true });

test('los hitos salen de contadores e índices: no se leen documentos y lo alcanzado no se vuelve a mirar', async () => {
  const filas = ['ana', 'beto', 'cleo'].map((id) => fila(id, '2026-10-01'));
  const empresas = {
    ana: { id: 'ana', pres303: { 2026: { 3: true } }, pagadosHacienda: { '2026-3-303': { en: '2026-10-20T08:00:00Z' } } },
    beto: { id: 'beto' }, cleo: { id: 'cleo' },
  };
  const u = (id) => ({ id: `u-${id}`, empresa: id });
  // Ana: dos facturas (la más antigua, del 5 de octubre), un gasto y un extracto subido. Beto: solo una factura. Cleo: nada.
  await R.redis.hset(R.clave(u('ana'), 'facturas'), { f1: factura(1, '2026-10-12'), f2: factura(2, '2026-10-05') });
  await R.redis.hset(R.clave(u('ana'), 'gastos'), { g1: { id: 'g1', fecha: '2026-10-08', proveedor: 'Papelería', concepto: 'Papel', base: 10, ivaPct: 21 } });
  await R.redis.hset(R.clave(u('ana'), 'bancos'), { b1: { id: 'b1', origen: 'extracto', subido: '2026-10-09' } });
  await R.redis.hset(R.clave(u('beto'), 'facturas'), { f1: factura(1, '2026-10-03') });

  let hitos;
  const cmds = await registrar(async () => { hitos = await E.hitosDe({ filas, empresas, ultima: {}, hoy: HOY }); });
  assert.deepEqual(hitos.ana, { factura: '2026-10-05', gasto: '2026-10-08', banco: '2026-10-09', modelo: '2026-10-20' });
  assert.deepEqual(hitos.beto, { factura: '2026-10-03' });
  assert.deepEqual(hitos.cleo, {});
  assert.ok(!cmds.some((c) => /^(hget|hmget)$/i.test(c[0]) && /^cuentas:(facturas|gastos):/.test(String(c[1]))), 'ningún documento leído');
  assert.ok(!cmds.some((c) => /^hgetall$/i.test(c[0]) && /^cuentas:(facturas|gastos):/.test(String(c[1]))), 'ningún hash de documentos entero');
  assert.ok(cmds.length <= 25, `pocos comandos para 3 empresas (${cmds.length})`);

  // Segunda lectura sin actividad nueva: solo se lee la caché (un comando), ni Ana, que ya lo tiene todo, ni Beto y Cleo.
  const segunda = await registrar(async () => { hitos = await E.hitosDe({ filas, empresas, ultima: {}, hoy: HOY }); });
  assert.equal(segunda.length, 1);
  assert.deepEqual(hitos.ana, { factura: '2026-10-05', gasto: '2026-10-08', banco: '2026-10-09', modelo: '2026-10-20' });
});

test('solo se vuelve a mirar lo que falta en las empresas con actividad desde la última vez', async () => {
  const filas = [fila('dora', '2026-10-01')];
  const u = { id: 'u-dora', empresa: 'dora' };
  const hoy = new Date('2026-10-26T10:00:00Z');
  let h = await E.hitosDe({ filas, empresas: { dora: { id: 'dora' } }, ultima: {}, hoy });
  assert.deepEqual(h.dora, {});
  // Llega su primera factura, pero nadie ha entrado desde la última comprobación (26-10): sigue sin verse.
  await R.redis.hset(R.clave(u, 'facturas'), { f1: factura(1, '2026-10-27') });
  h = await E.hitosDe({ filas, empresas: { dora: { id: 'dora' } }, ultima: { dora: '2026-10-25' }, hoy: new Date('2026-10-27T09:00:00Z') });
  assert.deepEqual(h.dora, {});
  // Con actividad ese día, se mira y se guarda.
  h = await E.hitosDe({ filas, empresas: { dora: { id: 'dora' } }, ultima: { dora: '2026-10-27' }, hoy: new Date('2026-10-27T09:00:00Z') });
  assert.deepEqual(h.dora, { factura: '2026-10-27' });
  const guardado = await R.redis.hget('embudo', 'dora');
  assert.equal(guardado.factura, '2026-10-27');
  assert.equal(guardado.v, '2026-10-27');
  // Aunque la borre, el hito sigue alcanzado.
  await R.redis.hdel(R.clave(u, 'facturas'), 'f1');
  h = await E.hitosDe({ filas, empresas: { dora: { id: 'dora' } }, ultima: { dora: '2026-10-28' }, hoy: new Date('2026-10-28T09:00:00Z') });
  assert.equal(h.dora.factura, '2026-10-27');
});

test('embudoDe junta las dos mitades y no rompe el panel si la base falla', async () => {
  const filas = [fila('eva', '2026-10-20')];
  const r = await E.embudoDe({ filas, empresas: { eva: { id: 'eva' } }, ultima: {}, hoy: HOY });
  assert.equal(ventana(r, 'todas').altas, 1);
  const rota = await E.embudoDe({ filas: null, empresas: {}, ultima: {}, hoy: HOY });
  assert.equal(rota, null);
});
