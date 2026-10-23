import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { crearBase } from './apoyo/upstash-mem.mjs';

// Cliente Upstash y persistencia reales, con transporte REST en memoria y sin puertos.
const base = crearBase();
const fetchOriginal = globalThis.fetch;
const entorno = { KV_REST_API_URL: process.env.KV_REST_API_URL, KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN };
process.env.KV_REST_API_URL = 'https://despachos.test';
process.env.KV_REST_API_TOKEN = 'solo-pruebas';
globalThis.fetch = async (url, opciones) => {
  if (new URL(String(url)).origin !== 'https://despachos.test') throw new Error('Petición inesperada: ' + String(url));
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

// Solo se aísla la entrega de eventos; las escrituras, índices y cerrojos son reales.
const hooks = registerHooks({
  resolve(spec, context, next) {
    if (spec === './eventos.js' && context.parentURL === new URL('../lib/gastosServidor.js', import.meta.url).href) {
      return { url: 'data:text/javascript,export const avisarEvento = async () => {};', shortCircuit: true };
    }
    return next(spec, context);
  },
});
after(() => {
  hooks.deregister();
  globalThis.fetch = fetchOriginal;
  for (const [k, v] of Object.entries(entorno)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
beforeEach(() => base.run(['flushdb']));

const { redis, guardar, leerUno } = await import('../lib/redis.js');
const D = await import('../lib/despachos.js');
const C = await import('../lib/cierres.js');
const L = await import('../lib/licencias.js');
const G = await import('../lib/gastosServidor.js');
const M = await import('../lib/comentariosDespacho.js');

const u = { id: 'u1', empresa: 'e1', rol: 'admin' };
const quien = { id: 'titular', nombre: 'Ana', despachoNombre: 'Asesoría Norte' };
const HOY = '2026-04-01';
const gasto = (id = 'g1', datos = {}) => ({ id, fecha: '2026-02-15', concepto: 'Material', proveedor: 'Proveedor', base: 100, ivaPct: 21, pendiente: true, ...datos });
async function empresa(id = 'e1', datos = {}) {
  const e = { id, nombre: 'Cliente ' + id, ...datos };
  await redis.hset('empresas', { [id]: e });
  return e;
}
async function despacho(datos = {}) {
  const r = await D.crearDespacho({ nombre: 'Asesoría Norte', codigo: 'NORTE', titular: 'titular', empresa: 'propia', ...datos });
  assert.ok(r.despacho, JSON.stringify(r));
  return r.despacho;
}
async function cliente(datos = {}) {
  const d = await despacho();
  await empresa('e1', datos);
  const r = await D.unirCliente('e1', d);
  assert.ok(r.empresa, JSON.stringify(r));
  return d;
}
async function gastoCerrado() {
  const g = gasto();
  await guardar(u, 'gastos', g);
  const r = await C.cerrarTrimestre(u, 2026, 1, quien);
  assert.ok(r.cierre);
  return g;
}
function error(r, patron, status) {
  assert.match(r.error, patron);
  if (status !== undefined) assert.equal(r.status, status);
}

test('despachos: crea, normaliza y busca el código; un duplicado conserva el original', async () => {
  const d = await despacho({ codigo: ' norte ', nif: ' b12345674 ', email: ' ANA@EXAMPLE.COM ' });
  assert.equal(d.codigo, 'NORTE');
  assert.equal(d.nif, 'B12345674');
  assert.equal(d.email, 'ana@example.com');
  assert.equal(d.miembros.titular.rol, 'titular');
  assert.equal(d.soloAsignados, false);
  assert.deepEqual(await D.despachoPorCodigo(' norte '), d);
  error(await D.crearDespacho({ nombre: 'Otra', codigo: 'NORTE', titular: 'otro', empresa: 'otra' }), /código.*otro despacho/);
  assert.deepEqual(await D.despachoPorCodigo('NORTE'), d);
  assert.equal((await D.listarDespachos()).length, 1);
  assert.equal(await D.despachoPorCodigo('AUSENTE'), null);
  assert.equal(await D.despachoPorCodigo('no válido'), null);
});

test('despachos: unirCliente guarda vínculo y conjunto; repetir es idempotente', async () => {
  const d = await despacho();
  await empresa();
  const { empresa: e } = await D.unirCliente('e1', d.id, 'codigo');
  assert.equal(e.despachoCliente.id, d.id);
  assert.equal(e.despachoCliente.nombre, d.nombre);
  assert.equal(e.despachoCliente.por, 'codigo');
  assert.ok(Number.isFinite(Date.parse(e.despachoCliente.desde)));
  assert.deepEqual(await redis.hget('empresas', 'e1'), e);
  assert.deepEqual(await redis.smembers('despacho-clientes:' + d.id), ['e1']);
  assert.deepEqual(await D.unirCliente('e1', d), { empresa: e, ya: true });
  assert.equal(await redis.scard('despacho-clientes:' + d.id), 1);
});

test('despachos: rechaza otro despacho, empresa propia, baja o inexistente sin añadir vínculos', async () => {
  const d = await cliente();
  const otro = await despacho({ codigo: 'OTRO', titular: 'otro', empresa: 'propia-otra' });
  const antes = await redis.hget('empresas', 'e1');
  error(await D.unirCliente('e1', otro), /Ya tienes como gestoría/, 409);
  await empresa('propia');
  error(await D.unirCliente('propia', d), /propio despacho/);
  await empresa('baja', { baja: true });
  error(await D.unirCliente('baja', d), /empresa ya no existe/, 404);
  error(await D.unirCliente('ausente', d), /empresa ya no existe/, 404);
  error(await D.unirCliente('e1', 'ausente'), /despacho ya no existe/, 404);
  assert.deepEqual(await redis.hget('empresas', 'e1'), antes);
  assert.deepEqual(await D.clientesDe(d.id), ['e1']);
  assert.deepEqual(await D.clientesDe(otro.id), []);
  assert.equal((await redis.hget('empresas', 'propia')).despachoCliente, undefined);
});

test('despachos: separarCliente elimina vínculo y conjunto y ajustar retira el plan incluido', async () => {
  const d = await cliente({ plan: { tipo: 'aut', nombre: 'Pro', hasta: '2026-04-10' } });
  await L.incluirLicencia('e1', d, HOY);
  const antes = await redis.hget('empresas', 'e1');
  const r = await D.separarCliente('e1', d.id, {
    ajustar: (sin, original) => {
      assert.deepEqual(original, antes);
      assert.equal(sin.despachoCliente, undefined);
      return { ...sin, plan: L.planSinLicencia(original.plan, HOY) };
    },
  });
  assert.deepEqual(r.antes, antes);
  assert.equal(r.empresa.despachoCliente, undefined);
  assert.equal(r.empresa.plan.porDespacho, undefined);
  assert.equal(r.empresa.plan.pagado, false);
  assert.equal(r.empresa.plan.hasta, '2026-04-30');
  assert.deepEqual(await redis.hget('empresas', 'e1'), r.empresa);
  assert.deepEqual(await D.clientesDe(d.id), []);
  error(await D.separarCliente('e1', d.id), /no es cliente/, 404);
});

test('despachos: separar sin ajustar conserva el plan; otro despacho no puede separar al cliente', async () => {
  const d = await cliente({ plan: { nombre: 'Pro', pagado: true } });
  const antes = await redis.hget('empresas', 'e1');
  error(await D.separarCliente('e1', 'ajeno'), /no es cliente/, 404);
  assert.deepEqual(await redis.hget('empresas', 'e1'), antes);
  assert.deepEqual(await D.clientesDe(d.id), ['e1']);
  const r = await D.separarCliente('e1');
  assert.deepEqual(r.empresa.plan, antes.plan);
  assert.equal(r.empresa.despachoCliente, undefined);
  assert.deepEqual(await D.clientesDe(d.id), []);
});

test('despachos: permisos de titular y gestor, soloAsignados, ajenos y bajas', () => {
  const d = { id: 'd1', miembros: { titular: { rol: 'titular' }, gestor: { rol: 'gestor' }, otroGestor: { rol: 'gestor' } }, soloAsignados: false };
  const e = { id: 'e1', despachoCliente: { id: 'd1', gestor: 'gestor' } };
  assert.equal(D.puedeVerCliente(d, 'titular', e), true);
  assert.equal(D.puedeVerCliente(d, 'gestor', e), true);
  assert.equal(D.puedeVerCliente(d, 'otroGestor', e), true);
  const restringido = { ...d, soloAsignados: true };
  assert.equal(D.puedeVerCliente(restringido, 'titular', e), true);
  assert.equal(D.puedeVerCliente(restringido, 'gestor', e), true);
  assert.equal(D.puedeVerCliente(restringido, 'otroGestor', e), false);
  assert.equal(D.puedeVerCliente(restringido, 'gestor', { ...e, despachoCliente: { id: 'd1' } }), false);
  for (const persona of ['titular', 'gestor']) {
    assert.equal(D.puedeVerCliente(d, persona, { ...e, baja: true }), false);
    assert.equal(D.puedeVerCliente(d, persona, { ...e, despachoCliente: { id: 'ajeno' } }), false);
    assert.equal(D.puedeVerCliente(d, persona, null), false);
    assert.equal(D.puedeVerCliente(d, persona, { id: 'sin-vinculo' }), false);
  }
  assert.equal(D.puedeVerCliente(d, 'intruso', e), false);
  assert.equal(D.puedeVerCliente({ ...d, id: 'ajeno' }, 'titular', e), false);
});

test('despachos: clientesVisibles filtra cartera, bajas, referencias ajenas e inexistentes', async () => {
  const d = await despacho();
  d.miembros.gestor = { rol: 'gestor' };
  for (const [id, gestor] of [['e1', 'gestor'], ['e2', 'otro'], ['e3', undefined]]) {
    await empresa(id);
    await D.unirCliente(id, d);
    await D.cambiarVinculo(id, d.id, (v) => ({ vinculo: { ...v, gestor } }));
  }
  await empresa('baja', { baja: true, despachoCliente: { id: d.id } });
  await empresa('ajena', { despachoCliente: { id: 'otro-despacho' } });
  await redis.sadd('despacho-clientes:' + d.id, 'baja', 'ajena', 'ausente');
  const visibles = await D.clientesVisibles(d, 'gestor');
  assert.deepEqual(visibles.map((x) => x.id).sort(), ['e1', 'e2', 'e3']);
  assert.deepEqual(visibles.find((x) => x.id === 'e1').empresa, await redis.hget('empresas', 'e1'));
  d.soloAsignados = true;
  assert.deepEqual((await D.clientesVisibles(d, 'gestor')).map((x) => x.id), ['e1']);
  assert.deepEqual((await D.clientesVisibles(d, 'titular')).map((x) => x.id).sort(), ['e1', 'e2', 'e3']);
  assert.deepEqual(await D.clientesVisibles(d, 'intruso'), []);
  assert.deepEqual(await D.clientesVisibles({ ...d, id: 'vacio' }, 'titular'), []);
});

test('despachos: cambiarVinculo actualiza gestor y plan; errores no escriben', async () => {
  const d = await cliente();
  const antes = await redis.hget('empresas', 'e1');
  const plan = { nombre: 'Pro', pagado: true };
  const r = await D.cambiarVinculo('e1', d.id, (v, e) => {
    assert.deepEqual(e, antes);
    return { vinculo: { ...v, gestor: 'gestor' }, plan };
  });
  assert.deepEqual(r.antes, antes);
  assert.deepEqual(r.empresa.despachoCliente, { ...antes.despachoCliente, gestor: 'gestor' });
  assert.deepEqual(r.empresa.plan, plan);
  assert.deepEqual(await redis.hget('empresas', 'e1'), r.empresa);
  error(await D.cambiarVinculo('e1', d.id, () => ({ error: 'No permitido', status: 409 })), /No permitido/, 409);
  error(await D.cambiarVinculo('e1', 'ajeno', () => assert.fail('No debe ejecutar el cambio')), /no es cliente/, 404);
  assert.deepEqual(await redis.hget('empresas', 'e1'), r.empresa);
});

test('despachos: registrarEntrada apunta una vez al día por persona y empresa', async () => {
  await Promise.all(Array.from({ length: 4 }, () => D.registrarEntrada('e1', quien, '2026-04-01')));
  let accesos = await D.leerAccesos('e1');
  assert.equal(accesos.length, 1);
  assert.equal(accesos[0].accion, 'Entró en tus cuentas');
  assert.equal(accesos[0].quien, quien.id);
  assert.equal(accesos[0].despacho, quien.despachoNombre);
  await D.registrarEntrada('e1', quien, '2026-04-02');
  await D.registrarEntrada('e1', { ...quien, id: 'gestor' }, '2026-04-01');
  await D.registrarEntrada('e2', quien, '2026-04-01');
  await D.registrarEntrada('e1', {}, '2026-04-01');
  accesos = await D.leerAccesos('e1');
  assert.equal(accesos.length, 3);
  assert.equal((await D.leerAccesos('e2')).length, 1);
});

test('cierres: huellaTrimestre sigue altas y cambios de gasto solo dentro del trimestre', async () => {
  const vacia = await C.huellaTrimestre(u, 2026, 1);
  assert.equal(vacia.gastos, 0);
  assert.equal(vacia.facturas, 0);
  await guardar(u, 'gastos', gasto());
  const alta = await C.huellaTrimestre(u, 2026, 1);
  assert.notEqual(alta.huella, vacia.huella);
  assert.equal(alta.gastos, 1);
  await guardar(u, 'gastos', gasto('g1', { base: 200 }));
  const cambio = await C.huellaTrimestre(u, 2026, 1);
  assert.notEqual(cambio.huella, alta.huella);
  assert.equal(cambio.gastos, 1);
  await guardar(u, 'gastos', gasto('g2', { fecha: '2026-04-01' }));
  assert.deepEqual(await C.huellaTrimestre(u, 2026, 1), cambio);
  await guardar(u, 'gastos', gasto('g2', { fecha: '2026-04-01', base: 999 }));
  assert.deepEqual(await C.huellaTrimestre(u, 2026, 1), cambio);
  await guardar(u, 'gastos', gasto('g1', { fecha: '2026-04-01', base: 200 }));
  assert.deepEqual(await C.huellaTrimestre(u, 2026, 1), vacia);
});

test('cierres: fechaEnCierre identifica trimestre, gestoría y fechas abiertas', () => {
  const cierres = { '2026-1': { fecha: '2026-04-03T12:00:00Z', despacho: 'Asesoría Norte' } };
  for (const fecha of ['2026-01-01', '2026-02-15', '2026-03-31']) {
    const mensaje = C.fechaEnCierre(cierres, fecha);
    assert.match(mensaje, /1T 2026 está cerrado/);
    assert.match(mensaje, /Asesoría Norte/);
    assert.match(mensaje, /reabran/);
  }
  assert.match(C.fechaEnCierre(cierres, '2026-04-01', '2026-03-31'), /1T 2026/);
  assert.equal(C.fechaEnCierre(cierres, '', null, '2026-04-01', '2025-03-31'), null);
});

test('cierres: cerrar, comprobar, detectar cambios posteriores y reabrir por empresa', async () => {
  await guardar(u, 'gastos', gasto());
  assert.equal(await C.comprobarCierre(u, '2026-02-15'), null);
  const { cierre } = await C.cerrarTrimestre(u, 2026, 1, quien);
  assert.deepEqual(cierre.por, { id: quien.id, nombre: quien.nombre });
  assert.equal(cierre.despacho, quien.despachoNombre);
  assert.deepEqual((await C.cierresDe(u))['2026-1'], cierre);
  assert.equal((await C.estadoCierre(u, 2026, 1)).cambios, false);
  assert.match(await C.comprobarCierre(u, '2026-03-31'), /1T 2026/);
  assert.equal(await C.comprobarCierre(u, '2026-04-01'), null);
  assert.equal(await C.comprobarCierre(u, null, ''), null);
  assert.equal(await C.comprobarCierre({ ...u, empresa: 'e2' }, '2026-02-15'), null);
  // Una escritura directa simula importación por otro camino tras el cierre.
  await guardar(u, 'gastos', gasto('g2'));
  const estado = await C.estadoCierre(u, 2026, 1);
  assert.equal(estado.cambios, true);
  assert.equal(estado.ahora.gastos, 2);
  assert.deepEqual(await C.reabrirTrimestre(u, 2026, 1), { ok: true });
  assert.deepEqual(await C.cierresDe(u), {});
  assert.equal(await C.estadoCierre(u, 2026, 1), null);
  assert.equal(await C.comprobarCierre(u, '2026-02-15'), null);
});

test('cierres: rechaza periodos inválidos sin guardar cierres', async () => {
  for (const [anio, t] of [[1999, 1], [2101, 1], [2026, 0], [2026, 5], ['2026', 1], [2026, 1.5]]) {
    error(await C.cerrarTrimestre(u, anio, t, quien), /Trimestre no válido/);
    error(await C.reabrirTrimestre(u, anio, t), /Trimestre no válido/);
  }
  assert.deepEqual(await C.cierresDe(u), {});
});

test('gastos con cierre: crear dentro del trimestre se rechaza sin persistir', async () => {
  await gastoCerrado();
  const huella = await C.huellaTrimestre(u, 2026, 1);
  error(await G.crearGasto(u, gasto('nuevo', { fecha: '2026-03-31' })), /1T 2026 está cerrado/);
  assert.equal(await leerUno(u, 'gastos', 'nuevo'), null);
  assert.deepEqual(await C.huellaTrimestre(u, 2026, 1), huella);
});

test('gastos con cierre: editar base o mover la fecha fuera del cierre devuelve 409', async () => {
  const antes = await gastoCerrado();
  for (const cambios of [{ base: 200 }, { fecha: '2026-04-01' }]) {
    error(await G.editarGasto(u, 'g1', (g) => ({ gasto: { ...g, ...cambios } })), /1T 2026 está cerrado/, 409);
    assert.deepEqual(await leerUno(u, 'gastos', 'g1'), antes);
  }
  assert.equal((await C.estadoCierre(u, 2026, 1)).cambios, false);
});

test('gastos con cierre: adjuntar archivo o marcar pagado se permite sin alterar huella', async () => {
  await gastoCerrado();
  const huella = await C.huellaTrimestre(u, 2026, 1);
  const archivo = { nombre: 'ticket.pdf', url: 'https://archivos.test/ticket.pdf', huella: 'ticket-1' };
  const adjunto = await G.editarGasto(u, 'g1', (g) => ({ gasto: { ...g, archivo } }));
  assert.equal(adjunto.error, undefined);
  assert.deepEqual((await leerUno(u, 'gastos', 'g1')).archivo, archivo);
  const pago = await G.editarGasto(u, 'g1', (g) => ({ gasto: { ...g, pendiente: false, pagado: '2026-04-01' } }));
  assert.equal(pago.error, undefined);
  const guardado = await leerUno(u, 'gastos', 'g1');
  assert.equal(guardado.pendiente, false);
  assert.equal(guardado.pagado, '2026-04-01');
  assert.deepEqual(guardado.archivo, archivo);
  assert.deepEqual(await C.huellaTrimestre(u, 2026, 1), huella);
  assert.equal((await C.estadoCierre(u, 2026, 1)).cambios, false);
});

test('gastos con cierre: borrar devuelve 409 y conserva gasto y huella', async () => {
  const antes = await gastoCerrado();
  const huella = await C.huellaTrimestre(u, 2026, 1);
  error(await G.borrarGasto(u, 'g1'), /1T 2026 está cerrado/, 409);
  assert.deepEqual(await leerUno(u, 'gastos', 'g1'), antes);
  assert.deepEqual(await C.huellaTrimestre(u, 2026, 1), huella);
});

test('gastos con cierre: fuera del trimestre permite crear, editar y borrar; impide moverlo al cerrado', async () => {
  await gastoCerrado();
  const g = gasto('abierto', { fecha: '2026-04-01', proveedor: 'Otro proveedor' });
  assert.deepEqual(await G.crearGasto(u, g), { gasto: g });
  assert.deepEqual(await leerUno(u, 'gastos', g.id), g);
  error(await G.editarGasto(u, g.id, (antes) => ({ gasto: { ...antes, fecha: '2026-03-31' } })), /1T 2026 está cerrado/, 409);
  assert.deepEqual(await leerUno(u, 'gastos', g.id), g);
  const editado = { ...g, base: 250 };
  const r = await G.editarGasto(u, g.id, () => ({ gasto: editado }));
  assert.deepEqual(r, { antes: g, gasto: editado });
  assert.deepEqual(await leerUno(u, 'gastos', g.id), editado);
  assert.deepEqual(await G.borrarGasto(u, g.id), { antes: editado });
  assert.equal(await leerUno(u, 'gastos', g.id), null);
  assert.equal((await C.huellaTrimestre(u, 2026, 2)).gastos, 0);
  assert.equal((await C.estadoCierre(u, 2026, 1)).cambios, false);
});

test('gastos con cierre: reabrir permite otra vez editar, crear y borrar dentro del trimestre', async () => {
  await gastoCerrado();
  await C.reabrirTrimestre(u, 2026, 1);
  const editado = await G.editarGasto(u, 'g1', (g) => ({ gasto: { ...g, base: 300 } }));
  assert.equal(editado.gasto.base, 300);
  const nuevo = gasto('nuevo', { fecha: '2026-03-20', proveedor: 'Nuevo proveedor' });
  assert.deepEqual(await G.crearGasto(u, nuevo), { gasto: nuevo });
  assert.deepEqual(await G.borrarGasto(u, 'g1'), { antes: editado.gasto });
  assert.equal(await leerUno(u, 'gastos', 'g1'), null);
});

test('licencias: precioUnidad aplica los límites de cada tramo en ambos tipos', () => {
  for (const [n, aut, pym] of [[1, 700, 2000], [24, 700, 2000], [25, 600, 1800], [99, 600, 1800], [100, 500, 1600], [2000, 500, 1600]]) {
    assert.equal(L.precioUnidad('aut', n), aut);
    assert.equal(L.precioUnidad('pym', n), pym);
  }
});

test('licencias: cuentaLicencias distingue los 90 días gratis y suma facturables e importes', () => {
  assert.equal(L.DIAS_GRATIS, 90);
  const licencia = (desde, tipo = 'autonomo') => ({ fiscal: { tipo }, despachoCliente: { licencia: { desde } } });
  // El 31 de marzo es el día 89 desde el 1 de enero; el 1 de abril, día 90, ya cuenta.
  const lista = [licencia('2026-01-01'), licencia('2026-01-02'), licencia('2026-01-01', 'sociedad'), licencia('2026-01-02', 'sociedad'), {}, null];
  const antes = L.cuentaLicencias(lista, '2026-03-31');
  assert.equal(antes.importe, 0);
  assert.equal(antes.aut.gratis, 2);
  assert.equal(antes.pym.gratis, 2);
  const cuenta = L.cuentaLicencias(lista, HOY);
  assert.deepEqual(cuenta.aut, { total: 2, gratis: 1, facturables: 1, precio: 700, importe: 700 });
  assert.deepEqual(cuenta.pym, { total: 2, gratis: 1, facturables: 1, precio: 2000, importe: 2000 });
  assert.equal(cuenta.importe, 2700);
  assert.equal(L.cuentaLicencias([], HOY).importe, 0);
});

test('licencias: el tramo depende de las facturables y se aplica a todas las unidades', () => {
  for (const tipo of ['aut', 'pym']) {
    const e = (desde) => ({ fiscal: { tipo: tipo === 'pym' ? 'sociedad' : 'autonomo' }, despachoCliente: { licencia: { desde } } });
    for (const [n, precio] of [[24, tipo === 'aut' ? 700 : 2000], [25, tipo === 'aut' ? 600 : 1800], [100, tipo === 'aut' ? 500 : 1600]]) {
      const lista = [...Array.from({ length: n }, () => e('2026-01-01')), e(HOY)];
      const cuenta = L.cuentaLicencias(lista, HOY);
      assert.deepEqual(cuenta[tipo], { total: n + 1, gratis: 1, facturables: n, precio, importe: n * precio });
      assert.equal(cuenta.importe, n * precio);
    }
  }
});

test('licencias: planConLicencia activa Pro sin suscripción y planSinLicencia concede hoy + 29 días', () => {
  const d = { id: 'd1', nombre: 'Asesoría Norte' };
  const antes = { tipo: 'aut', nombre: 'Básico', pagado: false, periodo: 'anio', suscripcion: 'sub_anterior', estado: 'canceled', hasta: '2026-03-01', descuento: 20, personalizado: true };
  const copia = structuredClone(antes);
  const con = L.planConLicencia(antes, 'pym', d, HOY);
  assert.equal(con.tipo, 'pym');
  assert.equal(con.nombre, 'Pro');
  assert.equal(con.periodo, 'mes');
  assert.equal(con.pagado, true);
  assert.deepEqual(con.porDespacho, { id: 'd1', nombre: d.nombre, desde: HOY });
  for (const k of ['suscripcion', 'estado', 'hasta', 'descuento']) assert.equal(Object.hasOwn(con, k), false);
  const sin = L.planSinLicencia(con, HOY);
  assert.equal(sin.pagado, false);
  assert.equal(sin.hasta, '2026-04-30');
  assert.equal(sin.nombre, 'Pro');
  assert.equal(sin.tipo, 'pym');
  assert.equal(sin.porDespacho, undefined);
  assert.equal(con.pagado, true);
  assert.deepEqual(antes, copia);
  assert.deepEqual(L.planSinLicencia({ ...con }, '2026-12-20').hasta, '2027-01-18');
  assert.equal(L.planSinLicencia(antes, HOY), antes);
  assert.equal(L.planConLicencia(undefined, 'aut', d, HOY).pagado, true);
});

test('licencias: pagaSuPlan exige pago, suscripción viva y ausencia de despacho', () => {
  const plan = { pagado: true, suscripcion: 'sub_1' };
  for (const estado of ['active', 'trialing', 'past_due']) assert.equal(L.pagaSuPlan({ ...plan, estado }), true);
  for (const p of [null, {}, { ...plan, estado: 'canceled' }, { ...plan, estado: 'incomplete' }, { ...plan, estado: 'active', pagado: false }, { pagado: true, estado: 'active' }, { ...plan, estado: 'active', porDespacho: { id: 'd1' } }]) {
    assert.equal(L.pagaSuPlan(p), false);
  }
});

test('licencias: incluir rechaza tarjeta activa o fundador y conserva empresa y vínculo', async () => {
  const d = await despacho();
  for (const [id, plan, patron] of [
    ['tarjeta', { pagado: true, suscripcion: 'sub_1', estado: 'active' }, /paga su plan con tarjeta/],
    ['fundador', { fundador: true }, /ya tiene Fisquo gratis/],
  ]) {
    await empresa(id, { plan });
    await D.unirCliente(id, d);
    const antes = await redis.hget('empresas', id);
    error(await L.incluirLicencia(id, d, HOY), patron, 409);
    assert.deepEqual(await redis.hget('empresas', id), antes);
  }
});

test('licencias: incluir y quitar actualizan vínculo y plan, son idempotentes y rechazan ajenos', async () => {
  const d = await cliente({ plan: { tipo: 'aut', nombre: 'Básico', pagado: false } });
  const r = await L.incluirLicencia('e1', d, HOY);
  assert.deepEqual(r.empresa.despachoCliente.licencia, { desde: HOY });
  assert.equal(r.empresa.plan.pagado, true);
  assert.equal(r.empresa.plan.nombre, 'Pro');
  assert.equal(r.empresa.plan.porDespacho.id, d.id);
  assert.equal(r.empresa.plan.suscripcion, undefined);
  assert.deepEqual(await redis.hget('empresas', 'e1'), r.empresa);
  assert.deepEqual((await L.incluirLicencia('e1', d, '2026-04-02')).empresa, r.empresa);
  error(await L.quitarLicencia('e1', 'ajeno', HOY), /no es cliente/, 404);
  const sin = await L.quitarLicencia('e1', d.id, HOY);
  assert.equal(sin.empresa.despachoCliente.id, d.id);
  assert.equal(sin.empresa.despachoCliente.licencia, undefined);
  assert.equal(sin.empresa.plan.porDespacho, undefined);
  assert.equal(sin.empresa.plan.pagado, false);
  assert.equal(sin.empresa.plan.hasta, '2026-04-30');
  assert.deepEqual(await redis.hget('empresas', 'e1'), sin.empresa);
  assert.deepEqual((await L.quitarLicencia('e1', d.id, '2026-04-02')).empresa, sin.empresa);
  error(await L.incluirLicencia('e1', { id: 'ajeno' }, HOY), /no es cliente/, 404);
  assert.deepEqual(await D.clientesDe(d.id), ['e1']);
});

test('comentarios: valida texto, periodo, lado y documento sin guardar los rechazos', async () => {
  const datos = { anio: 2026, t: 1, texto: 'Falta el ticket' };
  for (const [lado, cambios, patron] of [
    ['despacho', { texto: '   ' }, /Escribe el comentario/],
    ['despacho', { t: 5 }, /Trimestre no válido/],
    ['despacho', { anio: '2026' }, /Trimestre no válido/],
    ['intruso', {}, /Quién comenta no es válido/],
    ['despacho', { doc: { tipo: 'otro', id: 'g1' } }, /Documento no válido/],
    ['despacho', { doc: { tipo: 'gasto', id: '' } }, /Documento no válido/],
  ]) error(await M.comentar('e1', quien, lado, { ...datos, ...cambios }), patron);
  assert.deepEqual(await M.comentariosDe('e1'), []);
  const { comentario: c } = await M.comentar('e1', quien, 'despacho', { ...datos, texto: '  Falta el ticket  ', doc: { tipo: 'gasto', id: 'g1', texto: 'Material' } });
  assert.equal(c.resuelto, false);
  assert.equal(c.anio, 2026);
  assert.equal(c.t, 1);
  assert.deepEqual(c.doc, { tipo: 'gasto', id: 'g1', texto: 'Material' });
  assert.equal(c.hilo.length, 1);
  assert.equal(c.hilo[0].texto, 'Falta el ticket');
  assert.equal(c.hilo[0].quien, quien.id);
  assert.equal(c.hilo[0].lado, 'despacho');
  assert.ok(Number.isFinite(Date.parse(c.hilo[0].fecha)));
  assert.deepEqual(await M.comentariosDe('e1', { anio: 2026, t: 1 }), [c]);
  assert.deepEqual(await M.comentariosDe('e1', { anio: 2026, t: 2 }), []);
  assert.deepEqual(await M.comentariosDe('e2'), []);
});

test('comentarios: resolver conserva hilo y responder lo amplía y reabre', async () => {
  const { comentario: c } = await M.comentar('e1', quien, 'despacho', { anio: 2026, t: 1, texto: '¿Ticket?' });
  const resuelto = (await M.responder('e1', c.id, quien, 'despacho', { resuelto: true })).comentario;
  assert.equal(resuelto.resuelto, true);
  assert.deepEqual(resuelto.hilo, c.hilo);
  assert.deepEqual(await M.comentariosDe('e1'), [resuelto]);
  const respuesta = (await M.responder('e1', c.id, u, 'cliente', { texto: '  Ya está adjunto  ' })).comentario;
  assert.equal(respuesta.resuelto, false);
  assert.equal(respuesta.hilo.length, 2);
  assert.deepEqual(respuesta.hilo[0], c.hilo[0]);
  assert.equal(respuesta.hilo[1].texto, 'Ya está adjunto');
  assert.equal(respuesta.hilo[1].lado, 'cliente');
  assert.equal(respuesta.hilo[1].quien, u.id);
  assert.deepEqual(await M.comentariosDe('e1'), [respuesta]);
  const final = (await M.responder('e1', c.id, quien, 'despacho', { texto: 'Revisado', resuelto: true })).comentario;
  assert.equal(final.resuelto, true);
  assert.equal(final.hilo.length, 3);
  const abierto = (await M.responder('e1', c.id, quien, 'despacho', { resuelto: false })).comentario;
  assert.equal(abierto.resuelto, false);
  assert.deepEqual(abierto.hilo, final.hilo);
});

test('comentarios: respuestas inválidas y ajenas no alteran el hilo', async () => {
  const { comentario: c } = await M.comentar('e1', quien, 'despacho', { anio: 2026, t: 1, texto: 'Consulta' });
  error(await M.responder('e1', c.id, u, 'cliente', { texto: ' ' }), /Escribe la respuesta/);
  error(await M.responder('e1', c.id, u, 'intruso', { texto: 'No' }), /Quién comenta no es válido/);
  error(await M.responder('e1', 'ausente', u, 'cliente', { texto: 'No' }), /ya no existe/, 404);
  error(await M.responder('e2', c.id, u, 'cliente', { texto: 'No' }), /ya no existe/, 404);
  assert.deepEqual(await M.comentariosDe('e1'), [c]);
});

test('comentarios: pendientesDe cuenta solo abiertos cuyo último mensaje viene del otro lado', async () => {
  const { comentario: despacho } = await M.comentar('e1', quien, 'despacho', { anio: 2026, t: 1, texto: 'Consulta' });
  const { comentario: cliente } = await M.comentar('e1', u, 'cliente', { anio: 2026, t: 1, texto: 'Pregunta' });
  assert.equal(M.pendientesDe(await M.comentariosDe('e1'), 'cliente'), 1);
  assert.equal(M.pendientesDe(await M.comentariosDe('e1'), 'despacho'), 1);
  await M.responder('e1', despacho.id, u, 'cliente', { texto: 'Respuesta' });
  assert.equal(M.pendientesDe(await M.comentariosDe('e1'), 'cliente'), 0);
  assert.equal(M.pendientesDe(await M.comentariosDe('e1'), 'despacho'), 2);
  await M.responder('e1', cliente.id, quien, 'despacho', { resuelto: true });
  const lista = await M.comentariosDe('e1');
  assert.equal(M.pendientesDe(lista, 'despacho'), 1);
  assert.equal(lista.at(-1).id, cliente.id);
  assert.equal(M.pendientesDe([], 'cliente'), 0);
});

test('licencias: sin plan (cuentas de antes) no se incluye; quitarla no acorta la prueba que tenía', async () => {
  const d = await cliente();
  error(await L.incluirLicencia('e1', d, HOY), /gratis/, 409);
  const conPrueba = L.planConLicencia({ tipo: 'aut', nombre: 'Pro', hasta: '2026-06-29' }, 'aut', d, HOY);
  assert.equal(conPrueba.porDespacho.hastaPrueba, '2026-06-29');
  assert.equal(L.planSinLicencia(conPrueba, HOY).hasta, '2026-06-29');
  const corta = L.planConLicencia({ tipo: 'aut', nombre: 'Pro', hasta: '2026-04-05' }, 'aut', d, HOY);
  assert.equal(L.planSinLicencia(corta, HOY).hasta, '2026-04-30');
  const pagaba = L.planConLicencia({ tipo: 'aut', nombre: 'Pro', pagado: true, hasta: '2026-09-01' }, 'aut', d, HOY);
  assert.equal(pagaba.porDespacho.hastaPrueba, undefined);
});

test('despachos: el despacho de demostración no admite clientes de verdad', async () => {
  const d = await despacho();
  await empresa('e1');
  error(await D.unirCliente('e1', { ...d, demo: true }), /demostración/, 409);
  assert.equal((await redis.hget('empresas', 'e1')).despachoCliente, undefined);
  assert.deepEqual(await D.clientesDe(d.id), []);
});

test('mensajes: la conversación general se crea una vez, las preguntas sobre documentos van aparte y se cuentan los no leídos', async () => {
  error(await M.escribir('e1', quien, 'despacho', { texto: '   ' }), /Escribe el mensaje/);
  // Cada mensaje en su milisegundo: el orden del chat es el de la hora (dos en el mismo instante empatarían).
  const pausa = () => new Promise((ok) => setTimeout(ok, 3));
  const a = await M.escribir('e1', quien, 'despacho', { texto: 'Hola, ¿todo bien?' });
  await pausa();
  assert.equal(a.comentario.id, M.GENERAL);
  const b = await M.escribir('e1', u, 'cliente', { texto: 'Sí, gracias' });
  await pausa();
  assert.equal(b.comentario.id, M.GENERAL);
  assert.equal(b.comentario.hilo.length, 2);
  const doc = await M.escribir('e1', quien, 'despacho', { texto: '¿Y este ticket?', doc: { tipo: 'gasto', id: 'g1', texto: 'Gasto del 03/02/2026 · Bar', fecha: '2026-02-03' } });
  assert.notEqual(doc.comentario.id, M.GENERAL);
  assert.deepEqual([doc.comentario.anio, doc.comentario.t], [2026, 1]);
  await pausa();
  const r = await M.escribir('e1', u, 'cliente', { texto: 'Lo subo hoy', hilo: doc.comentario.id });
  assert.equal(r.comentario.hilo.length, 2);
  const hilos = await M.comentariosDe('e1');
  const mensajes = M.mensajesDe(hilos);
  assert.deepEqual(mensajes.map((m) => m.texto), ['Hola, ¿todo bien?', 'Sí, gracias', '¿Y este ticket?', 'Lo subo hoy']);
  assert.ok(mensajes[2].primero && mensajes[2].doc && !mensajes[3].primero);
  // Sin marcar nada: el despacho tiene 2 del cliente sin leer y el cliente 2 del despacho.
  assert.equal(M.noLeidos(hilos, await M.leidoDe('e1'), 'despacho'), 2);
  assert.equal(M.noLeidos(hilos, await M.leidoDe('e1'), 'cliente'), 2);
  await M.marcarLeido('e1', 'despacho');
  assert.equal(M.noLeidos(hilos, await M.leidoDe('e1'), 'despacho'), 0);
  assert.equal(M.noLeidos(hilos, await M.leidoDe('e1'), 'cliente'), 2);
});
