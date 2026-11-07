// Medición ejecutable sin red, SDK ni puertos. La lógica de aplicación y el envoltorio
// Redis son reales; solo el transporte del SDK se sustituye por el simulador en proceso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { base, medir, instalarFetchLocal } from './apoyo/redis-local-enero.mjs';

const raiz = new URL('../', import.meta.url);
const antes = new URL('./apoyo/enero-antes/', import.meta.url);
let conSdk = false;
try { import.meta.resolve('@upstash/redis'); conSdk = true; } catch {}
const restaurarFetch = instalarFetchLocal();
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === '@upstash/redis' && !conSdk) return { url: new URL('./apoyo/redis-local-enero.mjs', import.meta.url).href, shortCircuit: true };
    if (ctx.parentURL?.startsWith(antes.href) && spec.startsWith('./') && spec !== './datosImpuestos.js') {
      return next(new URL(`lib/${spec.slice(2)}`, raiz).href, ctx);
    }
    return next(spec, ctx);
  },
});
// Valores ficticios: nunca se consultan credenciales ni servicios externos.
process.env.KV_REST_API_URL = 'https://redis-enero.invalid';
process.env.KV_REST_API_TOKEN = 'solo-simulador';
const R = await import('../lib/redis.js');
const I = await import('../lib/indices.js');
const D = await import('../lib/datosImpuestos.js');
const DA = await import('./apoyo/enero-antes/datosImpuestos.js');
const PC = await import('../lib/panelCache.js');
const PA = await import('./apoyo/enero-antes/panelCache.js');
const F = await import('../lib/fichas.js');

const limpiarPanel = () => { for (const k of base.db.keys()) if (k.startsWith('cuentas:panel:')) base.db.delete(k); };
const preparar = async (u, frio) => {
  I.olvidarIndices();
  if (!frio) { await I.asegurar(u, 'facturas'); await I.asegurar(u, 'gastos'); }
};
async function comparar(u, fnAntes, fnAhora, frio = false) {
  await preparar(u, frio); limpiarPanel();
  const a = await medir(fnAntes);
  await preparar(u, frio); limpiarPanel();
  const b = await medir(fnAhora);
  assert.deepEqual(b.datos, a.datos, 'se conservan datos, orden e importes');
  assert.ok(b.n <= a.n, `no aumenta el consumo: ${b.n} > ${a.n}`);
  return { antes: a.n, despues: b.n };
}
const usuario = (empresa, fiscal = {}) => ({ id: empresa, empresa, rol: 'admin', plan: 'pro', fiscal: { tipo: 'autonomo', ...fiscal }, actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '' }], emisor: { plazo: 30 } });
async function sembrar(u, total, { concentrado = false, vacio = false } = {}) {
  const n = vacio ? 0 : total / 2;
  // Se guarda por la misma ruta que la app (script atómico e índices), en lotes.
  for (const col of ['facturas', 'gastos']) {
    for (let ini = 0; ini < n; ini += 200) {
      const docs = Object.fromEntries(Array.from({ length: Math.min(200, n - ini) }, (_, j) => {
        const i = ini + j, y = concentrado ? 2026 : 2022 + i % 6;
        const d = { id: `${col}-${i}`, fecha: `${y}-${y === 2027 ? '01' : '12'}-${String(1 + i % (y === 2027 ? 15 : 28)).padStart(2, '0')}`, actividad: 'servicios', concepto: 'Ensayo ficticio', base: col === 'facturas' ? 100 : 20, ivaPct: 21, irpfPct: col === 'facturas' ? 15 : 0,
          ...(col === 'facturas' ? { numero: i + 1, anio: y, cliente: { nombre: 'Cliente ficticio' }, cobrada: i % 3 === 0 } : { proveedor: 'Proveedor ficticio', pendiente: i % 3 === 0 }),
        };
        return [d.id, d];
      }));
      await R.redis.hset(R.clave(u, col), docs);
    }
    // Datos ya indexados: se publica la versión tras verificar que documento e índice cuadran.
    assert.equal(await R.redis.hlen(R.clave(u, col)), await R.redis.zcard(F.claves(col, u.empresa).ix));
    await R.redis.set(F.claves(col, u.empresa).ixv, F.VERSION_INDICE);
  }
}
const variosAntes = async (u, ys) => Object.fromEntries(await Promise.all(ys.map(async (y) => [y, await DA.datosImpuestos(u, y)])));
const { lecturas } = await import('./apoyo/lecturas-enero.mjs');
// El informe se escribe solo al pedirlo explícitamente, no en cada npm test.
const informe = { fecha: new Date().toISOString().slice(0, 10), fechaSimulada: '2027-01-15', baseAnterior: '82d664a6de33560fa71a5d6b01870b4032b4d753', transporte: conSdk ? 'SDK real con fetch local; sin red' : 'simulador en proceso; SDK sustituido; sin HTTP', fuentes: {}, escenarios: [] };
test('Enero: medición antes/después, lotes, años y conservación fiscal', async (t) => {
  t.after(restaurarFetch);
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2027-01-15T12:00:00Z') });
  for (const [archivo, hash] of [
    ['datosImpuestos.js', '6ff6af0368fddd17b49b008a61cefcab49f0b99212011405742dca42772c2e8d'], ['panelCache.js', 'c75e87f3142cf9eea54f4bbdc048f56d807c87a7c73a005cac035f7a8e669ff7'],
  ]) assert.equal(createHash('sha256').update(await readFile(new URL(archivo, antes))).digest('hex'), hash, 'baseline congelada');
  const fuenteModelos = await readFile(new URL('app/modelos/page.js', raiz), 'utf8');
  assert.ok(fuenteModelos.includes("datosImpuestos(u, anio), leer(u, 'nominas'), leer(u, 'empleados'), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes'), leer(u, 'asientos'), leer(u, 'capital')"));
  for (const archivo of ['lib/datosImpuestos.js', 'lib/indices.js', 'lib/panelCache.js', 'app/page.js', 'app/modelos/page.js', 'app/facturas/page.js', 'app/gastos/page.js']) {
    informe.fuentes[archivo] = createHash('sha256').update(await readFile(new URL(archivo, raiz))).digest('hex');
  }
  for (const total of [0, 40, 5000, 20000]) {
    const u = usuario(`enero-${total}`);
    await sembrar(u, total, { vacio: total === 0 });
    const lAntes = await lecturas(u, PA.panelDe, DA.datosImpuestos);
    const lAhora = await lecturas(u, PC.panelDe, D.datosImpuestos);
    const fila = { documentos: total, modelosPorAnio: {}, modelosPorAnioFrio: {} };
    for (const y of [2022, 2023, 2024, 2025, 2026, 2027, 2028]) {
      fila.modelosPorAnio[y] = await comparar(u, () => DA.datosImpuestos(u, y), () => D.datosImpuestos(u, y));
      fila.modelosPorAnioFrio[y] = await comparar(u, () => DA.datosImpuestos(u, y), () => D.datosImpuestos(u, y), true);
    }
    fila.fiscalVarios = await comparar(u, () => variosAntes(u, [2027, 2026, 2023]), () => D.datosImpuestosVarios(u, [2027, 2026, 2023]));
    fila.resumen = await comparar(u, lAntes.resumen, lAhora.resumen);
    fila.resumenFrio = await comparar(u, lAntes.resumen, lAhora.resumen, true);
    // El panel ya existe: comprueba que no se leen documentos fiscales.
    limpiarPanel();
    await lAntes.resumen();
    const repetidoAntes = await medir(lAntes.resumen);
    limpiarPanel();
    await lAhora.resumen();
    const repetido = await medir(lAhora.resumen);
    assert.deepEqual(repetido.datos, repetidoAntes.datos);
    assert.equal(repetido.comandos.filter((c) => ['hmget', 'hgetall'].includes(c[0]) && /^cuentas:(facturas|gastos):/.test(c[1])).length, 0);
    fila.resumenRepetido = { antes: repetidoAntes.n, despues: repetido.n };
    fila.modelos = await comparar(u, lAntes.modelos, lAhora.modelos);
    await preparar(u, false);
    fila.facturas = (await medir(lAhora.facturas)).n;
    fila.gastos = (await medir(lAhora.gastos)).n;
    // Perfil fijo: una apertura de Resumen calculado, tres repetidas, dos Modelos
    // del ejercicio cerrado y dos aperturas de cada lista. No es telemetría real.
    fila.dia = Object.fromEntries(['antes', 'despues'].map((v) => [v, fila.resumen[v] + 3 * fila.resumenRepetido[v] + 2 * fila.modelos[v] + 2 * fila.facturas + 2 * fila.gastos]));
    fila.enero = Object.fromEntries([100, 500, 1000].map((activos) => [activos, Object.fromEntries(['antes', 'despues'].map((v) => [v, Math.ceil(31 * activos * fila.dia[v] * 1.5)]))]));
    informe.escenarios.push(fila);
  }
  // Una distribución que llenaba 5 lotes separados en el primer intento.
  // Incluye el borde de HMGET (499/500/501) y una empresa con todo en un año.
  for (const n of [499, 500, 501, 1001]) {
    const u = usuario(`bordes-${n}`);
    await sembrar(u, n * 2, { concentrado: true });
    for (const y of [2026, 2027]) await comparar(u, () => DA.datosImpuestos(u, y), () => D.datosImpuestos(u, y), true);
    await comparar(u, () => variosAntes(u, [2027, 2026]), () => D.datosImpuestosVarios(u, [2027, 2026]));
    const juntos = await medir(() => I.leerAnios(u, 'facturas', [2026, 2026, 2027]));
    assert.equal(juntos.datos.length, n);
    assert.equal(juntos.comandos.filter((c) => c[0] === 'hmget').length, Math.ceil(n / 500), 'llena lotes sin duplicar documentos');
  }
  // Histórico íntegro en inventario e IGIC; las dos rutas dan exactamente lo mismo.
  for (const fiscal of [{ inventario: true }, { territorio: 'canarias' }]) {
    const u = usuario(`especial-${JSON.stringify(fiscal)}`, fiscal);
    await sembrar(u, 40);
    await comparar(u, () => DA.datosImpuestos(u, 2026), () => D.datosImpuestos(u, 2026), true);
    await comparar(u, () => variosAntes(u, [2027, 2026]), () => D.datosImpuestosVarios(u, [2027, 2026]));
  }
  const u = usuario('rectificativas');
  await sembrar(u, 40);
  for (const f of [
    { id: 'posterior', fecha: '2027-01-02', rectifica: 'facturas-4', base: -10 },
    { id: 'normal-posterior', fecha: '2027-01-03', base: 900 },
    { id: 'antigua', fecha: '2010-01-01', base: 30 },
  ]) await R.guardar(u, 'facturas', { ...f, cliente: { nombre: 'Cliente ficticio' }, ivaPct: 21, actividad: 'servicios' });
  await R.guardar(u, 'gastos', { id: 'inversion-antigua', fecha: '2010-01-01', inversion: true, base: 5000, ivaPct: 21 });
  await R.guardar(u, 'gastos', { id: 'retencion-pagada', fecha: '2025-12-10', base: 100, irpfPct: 15, pagos: [{ fecha: '2026-01-10', importe: 106 }] });
  const d = await comparar(u, () => DA.datosImpuestos(u, 2026), () => D.datosImpuestos(u, 2026), true);
  const actual = await D.datosImpuestos(u, 2026);
  assert.ok(actual.facturas.some((f) => f.id === 'posterior'));
  assert.ok(!actual.facturas.some((f) => ['normal-posterior', 'antigua'].includes(f.id)));
  assert.ok(actual.gastos.some((g) => g.id === 'inversion-antigua'));
  assert.ok(actual.gastos.some((g) => g.id === 'retencion-pagada'));
  const compartidas = await medir(() => D.datosImpuestosVarios(u, [2027, 2026, 2026]));
  assert.equal(compartidas.comandos.filter((c) => c[0] === 'hgetall' && c[1] === `cuentas:gastos:${u.empresa}`).length, 1);
  const op = { anio: 2027, hoy: '2027-01-15' };
  const p = await PC.panelDe(u, op);
  await R.guardar(u, 'facturas', { id: 'enero-nueva', fecha: '2027-01-10', cliente: { nombre: 'Cliente ficticio' }, actividad: 'servicios', base: 200, ivaPct: 21 });
  assert.notEqual((await PC.panelDe(u, op)).P.facturado, p.P.facturado);
  const p2 = await PC.panelDe(u, op);
  await R.guardar(u, 'gastos', { id: 'gasto-nuevo', fecha: '2027-01-10', actividad: 'servicios', concepto: 'Ensayo', base: 100, ivaPct: 21 });
  assert.notEqual((await PC.panelDe(u, op)).P.gastado, p2.P.gastado);
  const p3 = await PC.panelDe(u, op);
  const lAhora = await lecturas(u, PC.panelDe, D.datosImpuestos);
  const paralelos = await medir(() => Promise.all(Array.from({ length: 200 }, lAhora.resumen)));
  assert.equal(paralelos.n, 200 * 11);
  assert.ok(paralelos.datos.every((r) => r.P.facturado === p3.P.facturado && r.P.gastado === p3.P.gastado));
  informe.lectoresParalelos = { lectores: 200, comandos: paralelos.n, errores: 0, alcance: 'Resumen ya calculado, misma empresa, simulador en proceso; no mide RPS del proveedor' };
  const otra = usuario('otra-empresa');
  await sembrar(otra, 0, { vacio: true });
  assert.equal((await D.datosImpuestos(otra, 2026)).facturas.length, 0);
  assert.deepEqual(await D.datosImpuestosVarios(u, []), {});
  informe.rectificativas = d;
  console.log('medicionEnero ' + JSON.stringify(informe));
  if (process.env.INFORME_ENERO) await writeFile(new URL('docs/consumo-enero-medicion.json', raiz), JSON.stringify(informe, null, 2) + '\n');
});
