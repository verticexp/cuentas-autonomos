import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import './apoyo/cargador.mjs';
import { Redis } from '@upstash/redis';
import { arrancar, crearBase } from './apoyo/upstash-mem.mjs';
import { hacerCopia, cifrar, descifrar, verificarCopia, restaurar, copiaDeDatos, seleccionarDatos } from '../lib/copias.js';
import { conMembresia, membresias } from '../lib/membresias.js';

const clave = randomBytes(32).toString('base64');
const hash = (v) => Array.isArray(v) ? Object.fromEntries(Array.from({ length: v.length / 2 }, (_, i) => [v[2 * i], v[2 * i + 1]])) : v;
const f = (id, numero) => JSON.stringify({ id, numero, anio: 2026, emisor: { nombre: 'Prueba' }, verifactu: { huella: `h${numero}` } });
// El mismo simulador, sin transporte HTTP: reproduce las lecturas y MULTI/EXEC atómico.
function memoria() {
  const base = crearBase();
  const comando = (m, args) => [m, ...args.flatMap((a) => a && typeof a === 'object' ? Object.entries(a).flat() : [a])];
  return new Proxy({}, { get(_, m) {
    if (m === 'multi') return () => {
      const comandos = [];
      const transaccion = new Proxy({}, { get(_, n) {
        if (n === 'exec') return async () => comandos.map((c) => base.run(c));
        return (...args) => { comandos.push(comando(n, args)); return transaccion; };
      } });
      return transaccion;
    };
    return async (...args) => {
      const resultado = base.run(comando(m, args));
      return m === 'hgetall' ? hash(resultado) : resultado;
    };
  } });
}
async function bases(t) {
  const origen = await arrancar(), destino = await arrancar();
  t.after(async () => { await origen.cerrar(); await destino.cerrar(); });
  const cliente = (s) => new Redis({ url: s.url, token: 'pruebas', automaticDeserialization: false });
  return { origen, destino, a: cliente(origen), b: cliente(destino) };
}
async function sembrar(r, id = 'e1') {
  await r.hset('cuentas:empresas', { [id]: JSON.stringify({ id, nombre: `Empresa ${id}` }) });
  await r.hset('cuentas:usuarios', { [`u-${id}`]: JSON.stringify({ id: `u-${id}`, empresa: id, membresias: [{ empresa: id, rol: 'admin' }] }) });
  await r.hset('cuentas:emails', { [`${id}@ejemplo.test`]: `u-${id}` });
  await r.hset(`cuentas:facturas:${id}`, { f1: f('f1', 1) });
  await r.hset(`cuentas:registros:${id}`, { r1: JSON.stringify({ factura: 'f1', Huella: 'h1', HuellaAnterior: '', NumSerieFactura: '2026/1' }) });
  await r.hset(`cuentas:numeracion:${id}`, { '-|2026': '1' });
  await r.set(`cuentas:verifactu:${id}`, 'h1');
  await r.hset(`cuentas:clientes:${id}`, { c: '{"nombre":"Cliente"}', literal: '001' });
  await r.sadd(`cuentas:etiquetas:${id}`, 'z', 'a', '001');
  await r.rpush(`cuentas:historial:${id}`, 'primero', 'segundo', 'primero');
  await r.set(`cuentas:nota:${id}`, '001');
  await r.set('cuentas:confirmar', '{"token":"temporal"}', { px: 120000 });
  await r.set('cuentas:sesion-secreta', 'no copiar');
  await r.set('cuentas:intentos:x', 'no copiar');
  await r.set('cuentas:desbloqueo:x', 'no copiar');
  await r.set('cuentas:cerrojo:x', 'no copiar');
  await r.set('otro:servicio', 'no copiar');
}
async function iguales(r, copia) {
  for (const [k, d] of Object.entries(copia.datos)) {
    assert.equal(await r.type(k), d.tipo, k);
    const v = d.tipo === 'hash' ? hash(await r.hgetall(k)) : d.tipo === 'set' ? (await r.smembers(k)).sort() : d.tipo === 'list' ? await r.lrange(k, 0, -1) : await r.get(k);
    assert.deepEqual(v, d.valor, k);
    const ttl = await r.pttl(k);
    if (d.caduca !== undefined) assert.ok(Math.abs(Date.now() + ttl - d.caduca) < 100, `caducidad ${k}`);
    else assert.equal(ttl, -1, k);
  }
}

test('F14: copia → cifrado → verificación → recuperación conserva tipos, strings y caducidades', async (t) => {
  const { a, b } = await bases(t);
  await sembrar(a);
  const copia = await hacerCopia(a);
  assert.equal(copia.version, 2);
  assert.deepEqual(copia.resumen.empresas, ['e1']);
  assert.deepEqual(copia.resumen.facturas, { e1: 1 });
  assert.deepEqual(copia.resumen.registros, { e1: 1 });
  assert.ok(!Object.keys(copia.datos).some((k) => /sesion|intentos|desbloqueo|cerrojo|otro:/.test(k)));
  const vuelta = descifrar(cifrar(copia, clave), clave);
  assert.deepEqual(vuelta, copia);
  assert.deepEqual(verificarCopia(vuelta), { ok: true, errores: [], avisos: [] });
  const informe = await restaurar(b, vuelta, { escribir: true });
  assert.equal(informe.nuevas, copia.resumen.claves);
  await iguales(b, copia);
});

test('F14: huella canónica, manipulación de datos/tag/IV y clave inválida', async (t) => {
  const { a } = await bases(t);
  await sembrar(a);
  const copia = await hacerCopia(a);
  const reordenada = { ...copia, datos: Object.fromEntries(Object.entries(copia.datos).reverse().map(([k, d]) => [k, { ...d, ...(d.tipo === 'hash' ? { valor: Object.fromEntries(Object.entries(d.valor).reverse()) } : {}) }])) };
  assert.equal(verificarCopia(reordenada).ok, true);
  for (const posicion of [12, 23, -1]) {
    const enc = cifrar(copia, clave);
    enc[posicion < 0 ? enc.length - 1 : posicion] ^= 1;
    assert.throws(() => descifrar(enc, clave), /manipulada|autenticación/);
  }
  assert.throws(() => descifrar(cifrar(copia, clave), randomBytes(32).toString('base64')), /incorrecta/);
  assert.throws(() => cifrar(copia, 'mal'), /32 bytes/);
  assert.throws(() => descifrar(Buffer.alloc(1), clave), /Formato/);
  const alterada = structuredClone(copia);
  alterada.datos['cuentas:nota:e1'].valor = 'cambiada';
  assert.equal(verificarCopia(alterada).ok, false);
  alterada.resumen.claves++;
  assert.ok(verificarCopia(alterada).errores.some((x) => /Resumen/.test(x)));
  alterada.datos['otra:clave'] = { tipo: 'string', valor: 'x' };
  assert.equal(verificarCopia(alterada).ok, false);
});

async function emitir(r, n) {
  await r.multi().hset('cuentas:facturas:e1', { [`f${n}`]: f(`f${n}`, n) })
    .hset('cuentas:registros:e1', { [`r${n}`]: JSON.stringify({ factura: `f${n}`, Huella: `h${n}`, HuellaAnterior: `h${n - 1}`, NumSerieFactura: `2026/${n}` }) })
    .hset('cuentas:numeracion:e1', { '-|2026': String(n) }).set('cuentas:verifactu:e1', `h${n}`).exec();
}

test('F14: una emisión entre lecturas obliga a repetir la empresa, incluyendo claves nuevas', async (t) => {
  const { a } = await bases(t);
  await sembrar(a);
  let lecturas = 0;
  const envuelto = new Proxy(a, { get(r, m) {
    if (m === 'hgetall') return async (k) => {
      const v = await r.hgetall(k);
      if (k === 'cuentas:facturas:e1' && ++lecturas === 1) {
        await emitir(r, 2);
        await r.set('cuentas:nueva:e1', 'creada durante copia');
      }
      return v;
    };
    return typeof r[m] === 'function' ? r[m].bind(r) : r[m];
  } });
  const copia = await hacerCopia(envuelto);
  assert.equal(lecturas, 6);
  assert.equal(copia.resumen.facturas.e1, 2);
  assert.equal(copia.datos['cuentas:nueva:e1'].valor, 'creada durante copia');
  assert.equal(copia.datos['cuentas:numeracion:e1'].valor['-|2026'], '2');
  assert.equal(verificarCopia(copia).ok, true);
  assert.equal(copia.resumen.inconsistentes, undefined);
});

test('F14: tras tres intentos inestables la copia falla explícitamente', async (t) => {
  const { a } = await bases(t);
  await sembrar(a);
  let lecturas = 0;
  const envuelto = new Proxy(a, { get(r, m) {
    if (m === 'hgetall') return async (k) => {
      const v = await r.hgetall(k);
      if (k === 'cuentas:facturas:e1') await emitir(r, ++lecturas + 1);
      return v;
    };
    return typeof r[m] === 'function' ? r[m].bind(r) : r[m];
  } });
  await assert.rejects(hacerCopia(envuelto), /copia estable.*e1.*3 intentos/);
  assert.equal(lecturas, 9);
});

test('N03: la copia de B selecciona un administrador con principal A creado con conMembresia y su correo', async () => {
  const a = memoria(), b = memoria();
  await sembrar(a, 'A');
  await sembrar(a, 'B');
  const usuario = conMembresia(conMembresia({ id: 'compartido', empresa: 'A' }, 'A', { rol: 'admin' }), 'B', { rol: 'admin' });
  await a.hset('cuentas:usuarios', { compartido: JSON.stringify(usuario) });
  await a.hset('cuentas:emails', { 'compartido@ejemplo.test': 'compartido', 'alias@ejemplo.test': 'compartido' });
  const copia = await hacerCopia(a);
  const seleccion = seleccionarDatos(copia, 'B');
  assert.deepEqual(JSON.parse(seleccion['cuentas:usuarios'].valor.compartido), usuario);
  assert.equal(seleccion['cuentas:emails'].valor['compartido@ejemplo.test'], 'compartido');
  assert.equal(seleccion['cuentas:emails'].valor['alias@ejemplo.test'], 'compartido');
  await restaurar(b, copia, { empresa: 'B', escribir: true });
  assert.deepEqual(JSON.parse(await b.hget('cuentas:usuarios', 'compartido')), usuario);
  assert.equal(await b.hget('cuentas:emails', 'compartido@ejemplo.test'), 'compartido');
});

test('N03: sobrescribir B preserva principal, roles, permisos y correos de las otras empresas del destino', async () => {
  const a = memoria(), b = memoria();
  await sembrar(a, 'B');
  const origen = conMembresia({ id: 'compartido', empresa: 'A', rol: 'admin' }, 'B', { rol: 'admin' });
  await a.hset('cuentas:usuarios', { compartido: JSON.stringify(origen) });
  await a.hset('cuentas:emails', { 'compartido@ejemplo.test': 'compartido' });
  const destino = conMembresia(conMembresia({ id: 'compartido', empresa: 'A', rol: 'miembro', permisos: ['clientes'] }, 'B', { rol: 'miembro', permisos: ['gastos'] }), 'C', { rol: 'admin' });
  const sobrante = conMembresia({ id: 'sobrante', empresa: 'B', rol: 'admin' }, 'C', { rol: 'miembro', permisos: ['facturas'] });
  await b.hset('cuentas:usuarios', { compartido: JSON.stringify(destino), sobrante: JSON.stringify(sobrante) });
  await b.hset('cuentas:emails', { 'alias-destino@ejemplo.test': 'compartido', 'sobrante@ejemplo.test': 'sobrante' });
  const copia = await hacerCopia(a);
  await restaurar(b, copia, { empresa: 'B', sobrescribir: true, escribir: true });
  const restaurado = JSON.parse(await b.hget('cuentas:usuarios', 'compartido'));
  assert.deepEqual(restaurado.empresas, { A: destino.empresas.A, B: origen.empresas.B, C: destino.empresas.C });
  assert.equal(restaurado.empresa, 'A');
  assert.equal(restaurado.rol, 'miembro');
  assert.deepEqual(restaurado.permisos, ['clientes']);
  assert.equal(await b.hget('cuentas:emails', 'alias-destino@ejemplo.test'), 'compartido');
  assert.equal(await b.hget('cuentas:emails', 'compartido@ejemplo.test'), 'compartido');
  const restante = JSON.parse(await b.hget('cuentas:usuarios', 'sobrante'));
  assert.deepEqual(membresias(restante), { C: sobrante.empresas.C });
  assert.equal(restante.empresa, 'C');
  assert.equal(await b.hget('cuentas:emails', 'sobrante@ejemplo.test'), 'sobrante');
});

test('N03: membresías antiguas en objeto y lista siguen seleccionándose y se conservan al fusionar', async () => {
  const b = memoria();
  const copia = copiaDeDatos({
    'cuentas:empresas': { tipo: 'hash', valor: { B: '{}' } },
    'cuentas:usuarios': { tipo: 'hash', valor: {
      objeto: JSON.stringify({ id: 'objeto', empresa: 'A', membresias: { B: { rol: 'admin' } } }),
      lista: JSON.stringify({ id: 'lista', empresa: 'A', membresias: [{ empresaId: 'B', rol: 'miembro', permisos: ['gastos'] }] }),
      cadena: JSON.stringify({ id: 'cadena', empresa: 'A', membresias: ['B'] }),
    } },
    'cuentas:emails': { tipo: 'hash', valor: { 'objeto@test': 'objeto', 'lista@test': 'lista', 'cadena@test': 'cadena' } },
  });
  assert.equal(Object.keys(seleccionarDatos(copia, 'B')['cuentas:usuarios'].valor).length, 3);
  await b.hset('cuentas:usuarios', { objeto: JSON.stringify({ id: 'objeto', empresa: 'C', membresias: { C: 'admin', D: { rol: 'miembro', permisos: ['clientes'] } } }) });
  await restaurar(b, copia, { empresa: 'B', sobrescribir: true, escribir: true });
  assert.deepEqual(JSON.parse(await b.hget('cuentas:usuarios', 'objeto')).empresas, {
    B: { rol: 'admin' }, C: { rol: 'admin' }, D: { rol: 'miembro', permisos: ['clientes'] },
  });
});

test('N04: conciliar atómicamente documentos existentes durante la lectura obliga a reintentar', async () => {
  const a = memoria();
  await sembrar(a);
  const pendiente = JSON.parse(f('f1', 1));
  const cobrada = { ...pendiente, cobrada: true, cobro: { fecha: '2026-03-01', banco: 'm1' } };
  await a.hset('cuentas:banco:e1', { m1: JSON.stringify({ id: 'm1', estado: 'pendiente', importe: 100 }) });
  let lecturasBanco = 0;
  const envuelto = new Proxy(a, { get(r, m) {
    if (m === 'hgetall') return async (k) => {
      const v = await r.hgetall(k);
      // La segunda lectura es la candidata: ya tiene m1 pendiente, después leerá f1 cobrada.
      if (k === 'cuentas:banco:e1' && ++lecturasBanco === 2) {
        await r.multi().hset('cuentas:banco:e1', { m1: JSON.stringify({ id: 'm1', estado: 'emparejado', enlace: { tipo: 'factura', id: 'f1' }, importe: 100 }) })
          .hset('cuentas:facturas:e1', { f1: JSON.stringify(cobrada) }).exec();
      }
      return v;
    };
    return typeof r[m] === 'function' ? r[m].bind(r) : r[m];
  } });
  const copia = await hacerCopia(envuelto);
  assert.equal(lecturasBanco, 6);
  assert.deepEqual(JSON.parse(copia.datos['cuentas:facturas:e1'].valor.f1), cobrada);
  assert.deepEqual(JSON.parse(copia.datos['cuentas:banco:e1'].valor.m1), { id: 'm1', estado: 'emparejado', enlace: { tipo: 'factura', id: 'f1' }, importe: 100 });
  assert.deepEqual(verificarCopia(copia), { ok: true, errores: [], avisos: [] });
});

test('N04: ediciones continuas sin cambiar tamaños, numeración ni cabeza fallan tras tres intentos', async () => {
  const a = memoria();
  await sembrar(a);
  let lecturas = 0;
  const envuelto = new Proxy(a, { get(r, m) {
    if (m === 'hgetall') return async (k) => {
      const v = await r.hgetall(k);
      if (k === 'cuentas:facturas:e1') await r.hset(k, { f1: JSON.stringify({ ...JSON.parse(f('f1', 1)), nota: String(++lecturas) }) });
      return v;
    };
    return typeof r[m] === 'function' ? r[m].bind(r) : r[m];
  } });
  await assert.rejects(hacerCopia(envuelto), /copia estable.*e1.*3 intentos/);
  assert.equal(lecturas, 9);
});

test('N04: también se compara la lectura guardada cuando el contenido vuelve al estado inicial', async () => {
  const a = memoria();
  await sembrar(a);
  const pendiente = JSON.stringify({ id: 'm1', estado: 'pendiente', importe: 100 });
  const conciliado = JSON.stringify({ id: 'm1', estado: 'emparejado', enlace: { tipo: 'factura', id: 'f1' }, importe: 100 });
  const cobrada = JSON.stringify({ ...JSON.parse(f('f1', 1)), cobrada: true, cobro: { fecha: '2026-03-01', banco: 'm1' } });
  await a.hset('cuentas:banco:e1', { m1: pendiente });
  let bancos = 0, facturas = 0;
  const envuelto = new Proxy(a, { get(r, m) {
    if (m === 'hgetall') return async (k) => {
      const v = await r.hgetall(k);
      if (k === 'cuentas:banco:e1' && ++bancos === 2) {
        await r.multi().hset(k, { m1: conciliado }).hset('cuentas:facturas:e1', { f1: cobrada }).exec();
      }
      if (k === 'cuentas:facturas:e1' && ++facturas === 2) {
        await r.multi().hset('cuentas:banco:e1', { m1: pendiente }).hset(k, { f1: f('f1', 1) }).exec();
      }
      return v;
    };
    return typeof r[m] === 'function' ? r[m].bind(r) : r[m];
  } });
  const copia = await hacerCopia(envuelto);
  assert.equal(bancos, 6);
  assert.equal(copia.datos['cuentas:banco:e1'].valor.m1, pendiente);
  assert.equal(copia.datos['cuentas:facturas:e1'].valor.f1, f('f1', 1));
  assert.equal(verificarCopia(copia).ok, true);
});

test('N04: verificarCopia rechaza factura cobrada con movimiento pendiente aun con huella válida', async () => {
  const a = memoria();
  await sembrar(a);
  const datos = (await hacerCopia(a)).datos;
  datos['cuentas:facturas:e1'].valor.f1 = JSON.stringify({ ...JSON.parse(f('f1', 1)), cobrada: true, cobro: { fecha: '2026-03-01', banco: 'm1' } });
  datos['cuentas:banco:e1'] = { tipo: 'hash', valor: { m1: JSON.stringify({ id: 'm1', estado: 'pendiente', importe: 100 }) } };
  const copia = copiaDeDatos(datos);
  const v = verificarCopia(copia);
  assert.equal(v.ok, false);
  assert.ok(v.errores.some((x) => /f1.*m1.*no conciliado/.test(x)));
  assert.ok(v.avisos.some((x) => /conciliacion-bancaria/.test(x)));
  assert.ok(!v.errores.some((x) => /Huella/.test(x)));
  assert.equal(verificarCopia({ fecha: copia.fecha, datos }).ok, false);
});

test('N04: verifica referencias bancarias inexistentes, ajenas, inversas y pagos de gastos', () => {
  const datos = {
    'cuentas:empresas': { tipo: 'hash', valor: { e1: '{}' } },
    'cuentas:facturas:e1': { tipo: 'hash', valor: { f1: JSON.stringify({ id: 'f1', cobrada: true, cobro: { fecha: '2026-03-01', banco: 'm1' } }) } },
    'cuentas:gastos:e1': { tipo: 'hash', valor: { g1: JSON.stringify({ id: 'g1', pagado: '2026-03-02', banco: 'm2' }) } },
    'cuentas:banco:e1': { tipo: 'hash', valor: {
      m1: JSON.stringify({ id: 'm1', estado: 'emparejado', enlace: { tipo: 'factura', id: 'f1' } }),
      m2: JSON.stringify({ id: 'm2', estado: 'emparejado', enlace: { tipo: 'gasto', id: 'g1' } }),
    } },
  };
  assert.equal(verificarCopia(copiaDeDatos(datos)).ok, true);
  const variantes = [
    (d) => { delete d['cuentas:banco:e1'].valor.m1; },
    (d) => { d['cuentas:banco:e1'].valor.m1 = JSON.stringify({ estado: 'emparejado', enlace: { tipo: 'factura', id: 'otra' } }); },
    (d) => { d['cuentas:facturas:e1'].valor.f1 = JSON.stringify({ id: 'f1', cobrada: true }); },
    (d) => { d['cuentas:facturas:e1'].valor.f1 = JSON.stringify({ id: 'f1', cobrada: false, cobro: { banco: 'm1' } }); },
    (d) => { d['cuentas:gastos:e1'].valor.g1 = JSON.stringify({ id: 'g1', pendiente: true, banco: 'm2' }); },
    (d) => { delete d['cuentas:gastos:e1'].valor.g1; },
  ];
  for (const cambiar of variantes) {
    const alterados = structuredClone(datos);
    cambiar(alterados);
    const v = verificarCopia(copiaDeDatos(alterados));
    assert.equal(v.ok, false);
    assert.ok(v.errores.some((x) => /conciliacion-bancaria/.test(x)));
  }
  const manual = structuredClone(datos);
  delete manual['cuentas:banco:e1'];
  manual['cuentas:facturas:e1'].valor.f1 = JSON.stringify({ id: 'f1', cobrada: true });
  manual['cuentas:gastos:e1'].valor.g1 = JSON.stringify({ id: 'g1', pagado: '2026-03-02' });
  assert.equal(verificarCopia(copiaDeDatos(manual)).ok, true);
});

test('N04: las copias antiguas marcadas como inestables mantienen el formato pero no verifican ok', () => {
  const copia = copiaDeDatos({ 'cuentas:empresas': { tipo: 'hash', valor: { e1: '{}' } } }, { inconsistentes: ['e1'] });
  const v = verificarCopia(copia);
  assert.equal(v.ok, false);
  assert.ok(v.avisos.some((x) => /cambios durante la copia/.test(x)));
});

test('F14: recuperar una empresa sustituye claves enteras y conserva la otra empresa y sus usuarios', async (t) => {
  const { a, b } = await bases(t);
  await sembrar(a, 'e1');
  await sembrar(a, 'e2');
  await a.hset('cuentas:usuarios', { invitado: JSON.stringify({ empresa: 'e2', membresias: { e1: 'lector', e2: 'admin' } }) });
  await a.hset('cuentas:emails', { 'invitado@ejemplo.test': 'invitado' });
  await sembrar(b, 'e1');
  await sembrar(b, 'e2');
  await b.hset('cuentas:clientes:e1', { sobra: 'debe desaparecer' });
  await b.set('cuentas:nota:e1', 'antigua', { px: 60000 });
  await b.rpush('cuentas:historial:e1', 'sobra');
  await b.sadd('cuentas:etiquetas:e1', 'sobra');
  await b.hset('cuentas:usuarios', { 'u-e2': JSON.stringify({ empresa: 'e2', nombre: 'Se conserva' }) });
  await b.hset('cuentas:empresas', { e2: '{"nombre":"Otra intacta"}' });
  await b.hset('cuentas:emails', { 'extra@ejemplo.test': 'u-e2' });
  await b.hset('cuentas:usuarios', { sobrante: JSON.stringify({ empresa: 'e1' }) });
  await b.hset('cuentas:emails', { 'sobrante@ejemplo.test': 'sobrante' });
  const antes = await hacerCopia(b), copia = await hacerCopia(a);
  const informe = await restaurar(b, copia, { empresa: 'e1', sobrescribir: true, escribir: true });
  assert.ok(informe.sobrescritas > 0);
  const despues = await hacerCopia(b);
  for (const [k, d] of Object.entries(antes.datos).filter(([k]) => k.endsWith(':e2'))) assert.deepEqual(despues.datos[k], d);
  assert.equal(await b.hget('cuentas:usuarios', 'u-e2'), antes.datos['cuentas:usuarios'].valor['u-e2']);
  assert.equal(await b.hget('cuentas:empresas', 'e2'), antes.datos['cuentas:empresas'].valor.e2);
  assert.equal(await b.hget('cuentas:emails', 'extra@ejemplo.test'), 'u-e2');
  assert.equal(await b.hget('cuentas:clientes:e1', 'sobra'), null);
  assert.equal(await b.pttl('cuentas:nota:e1'), -1);
  assert.deepEqual(await b.lrange('cuentas:historial:e1', 0, -1), copia.datos['cuentas:historial:e1'].valor);
  assert.deepEqual((await b.smembers('cuentas:etiquetas:e1')).sort(), copia.datos['cuentas:etiquetas:e1'].valor);
  assert.ok(await b.hget('cuentas:usuarios', 'invitado'));
  assert.equal(await b.hget('cuentas:usuarios', 'sobrante'), null);
  assert.equal(await b.hget('cuentas:emails', 'sobrante@ejemplo.test'), null);
  const vacia = await restaurar(b, copia, { empresa: 'no-existe', sobrescribir: true, escribir: true });
  assert.equal(vacia.claves.length, 0);
  assert.equal(await b.hget('cuentas:usuarios', 'u-e2'), antes.datos['cuentas:usuarios'].valor['u-e2']);
});

test('F14: simulación no ejecuta comandos de escritura; sin sobrescribir salta claves existentes', async (t) => {
  const { a, b } = await bases(t);
  await sembrar(a);
  await b.set('cuentas:nota:e1', 'destino');
  const antes = await b.scan('0');
  const copia = await hacerCopia(a);
  const protegido = new Proxy(b, { get(r, m) {
    if (['del', 'hdel', 'hset', 'set', 'rpush', 'sadd', 'pexpire'].includes(m)) return () => { assert.fail(`Escritura durante simulación: ${m}`); };
    return typeof r[m] === 'function' ? r[m].bind(r) : r[m];
  } });
  const sim = await restaurar(protegido, copia, { sobrescribir: true });
  assert.equal(sim.sobrescritas, 1);
  assert.deepEqual(await b.scan('0'), antes);
  const informe = await restaurar(b, copia, { escribir: true });
  assert.equal(informe.existen, 1);
  assert.equal(await b.get('cuentas:nota:e1'), 'destino');
});

test('F14: compatibilidad v1 con hashes planos y objetos; caducadas no se restauran', async (t) => {
  const { b } = await bases(t);
  const ahora = Date.now();
  const copia = { fecha: new Date(ahora).toISOString(), datos: {
    'cuentas:empresas': { tipo: 'hash', valor: ['e1', '{"id":"e1"}'] },
    'cuentas:clientes:e1': { tipo: 'hash', valor: { c: '{"nombre":"Cliente"}' } },
    'cuentas:vieja': { tipo: 'string', valor: 'caducada', caduca: ahora - 1 },
    'cuentas:viva': { tipo: 'string', valor: 'vive', caduca: ahora + 60000 },
  } };
  assert.equal(verificarCopia(copia).ok, true);
  const informe = await restaurar(b, copia, { escribir: true, ahora });
  assert.equal(informe.caducadas, 1);
  assert.equal(await b.get('cuentas:vieja'), null);
  assert.equal(await b.hget('cuentas:empresas', 'e1'), '{"id":"e1"}');
  assert.ok(await b.pttl('cuentas:viva') > 59000);
});

test('F14: instalación sin facturas, base vacía y protección del registro global', async (t) => {
  const { a, b } = await bases(t);
  assert.equal((await hacerCopia(a)).resumen.claves, 0);
  await a.hset('cuentas:empresas', { e1: '{"id":"e1"}' });
  const sinFacturas = await hacerCopia(a);
  assert.deepEqual(sinFacturas.resumen.facturas, { e1: 0 });
  assert.equal(verificarCopia(sinFacturas).ok, true);
  await restaurar(b, sinFacturas, { escribir: true });
  await a.del('cuentas:empresas');
  await a.hset('cuentas:clientes:e1', { c: '{}' });
  await assert.rejects(hacerCopia(a), /Falta.*empresas/);
});

test('F14: integridad distingue avisos de errores aunque la huella sea correcta', () => {
  const datos = {
    'cuentas:empresas': { tipo: 'hash', valor: { e1: '{}' } },
    'cuentas:facturas:e1': { tipo: 'hash', valor: { f: JSON.stringify({ id: 'f', numero: 2, anio: 2026 }) } },
    'cuentas:numeracion:e1': { tipo: 'hash', valor: { '-|2026': '1' } },
  };
  const v = verificarCopia(copiaDeDatos(datos));
  assert.equal(v.ok, true);
  assert.ok(v.avisos.some((x) => /sin-instantanea/.test(x)));
  assert.ok(v.avisos.some((x) => /contador-atrasado/.test(x)));
  datos['cuentas:facturas:e1'].valor.duplicada = JSON.stringify({ id: 'duplicada', numero: 2, anio: 2026 });
  assert.equal(verificarCopia(copiaDeDatos(datos)).ok, false);
});

function ejecutar(script, args, cwd, r, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [fileURLToPath(new URL(`../scripts/${script}.mjs`, import.meta.url)), ...args], {
      cwd, env: { ...process.env, KV_REST_API_URL: r.url, KV_REST_API_TOKEN: 'pruebas', COPIA_CLAVE: '', ...env },
    });
    let salida = '';
    p.stdout.on('data', (d) => { salida += d; });
    p.stderr.on('data', (d) => { salida += d; });
    p.on('error', reject);
    p.on('close', (codigo) => resolve({ codigo, salida }));
  });
}

test('F14: CLI exige cifrado, verifica antes de escribir y guarda recuperación previa cifrada', async (t) => {
  const { origen, destino, a, b } = await bases(t);
  const dir = await mkdtemp(join(tmpdir(), 'netto-copias-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await sembrar(a);
  await sembrar(b);
  await b.set('cuentas:nota:e1', 'antes');
  const falta = await ejecutar('copia', [], dir, origen);
  assert.notEqual(falta.codigo, 0, falta.salida);
  assert.match(falta.salida, /COPIA_CLAVE/);
  const generada = await ejecutar('copia', ['--sin-cifrar'], dir, origen, { COPIA_CLAVE: clave });
  assert.equal(generada.codigo, 0, generada.salida);
  assert.deepEqual((await readdir(dir)).sort(), ['copia-resumen.json', 'copia.json.enc']);
  const resumen = JSON.parse(await readFile(join(dir, 'copia-resumen.json'), 'utf8'));
  assert.deepEqual(Object.keys(resumen).sort(), ['fecha', 'huella', 'resumen', 'version']);
  const noClave = await ejecutar('restaura', ['copia.json.enc', '--sobrescribir', '--escribir'], dir, destino);
  assert.notEqual(noClave.codigo, 0);
  assert.equal(await b.get('cuentas:nota:e1'), 'antes');
  const simulacion = await ejecutar('restaura', ['copia.json.enc', '--empresa=e1', '--sobrescribir'], dir, destino, { COPIA_CLAVE: clave });
  assert.equal(simulacion.codigo, 0, simulacion.salida);
  assert.equal(await b.get('cuentas:nota:e1'), 'antes');
  const copia = descifrar(await readFile(join(dir, 'copia.json.enc')), clave);
  copia.datos['cuentas:nota:e1'].valor = 'manipulada';
  await writeFile(join(dir, 'mala.json'), JSON.stringify(copia));
  const mala = await ejecutar('restaura', ['mala.json', '--escribir'], dir, destino);
  assert.notEqual(mala.codigo, 0, mala.salida);
  assert.equal(await b.get('cuentas:nota:e1'), 'antes');
  const res = await ejecutar('restaura', ['copia.json.enc', '--escribir', '--empresa=e1', '--sobrescribir'], dir, destino, { COPIA_CLAVE: clave });
  assert.equal(res.codigo, 0, res.salida);
  assert.match(res.salida, /Copia previa cifrada/);
  assert.match(res.salida, /Integridad e1: sin incidencias/);
  const nombre = (await readdir(dir)).find((x) => x.startsWith('antes-de-restaurar-'));
  const previa = descifrar(await readFile(join(dir, nombre)), clave);
  assert.equal(previa.datos['cuentas:nota:e1'].valor, 'antes');
  assert.equal(verificarCopia(previa).ok, true);
  await restaurar(b, previa, { empresa: 'e1', sobrescribir: true, escribir: true });
  assert.equal(await b.get('cuentas:nota:e1'), 'antes');
});
