// Integridad de la emisión (auditoría de octubre de 2026, F01–F05 y F08): numeración única y cadena Verifactu bajo
// concurrencia, reintentos sin duplicar, números que no se reutilizan, cobros que cuadran y documentos históricos estables.
// Contra un Upstash simulado en memoria (tests/apoyo/upstash-mem.mjs): nunca una base de datos real.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

let srv, F, R, C;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  F = await import('../lib/facturas.js');
  R = await import('../lib/redis.js');
  C = await import('../lib/cobros.js');
});
after(() => srv.cerrar());

let n = 0;
// Cada prueba con su propia empresa: no se mezclan los datos.
const empresa = (extra = {}) => {
  const id = `e${++n}`;
  return { id: `u${n}`, empresa: id, emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', iban: 'ES9121000418450200051332', plazo: 30 },
    actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }], ...extra };
};
const datos = (i = 0) => ({ fecha: '2026-03-10', actividad: 'servicios', cliente: { nombre: `Cliente ${i}`, nif: '12345678Z', direccion: 'C/ Sol 2', ciudad: 'Madrid' }, concepto: 'Servicio', base: 100 + i, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false });
const todas = async (u) => (await R.leer(u, 'facturas')) || [];

test('F01: 20 emisiones simultáneas dan 20 facturas distintas con números únicos y correlativos', async () => {
  const u = empresa();
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => F.crearFactura(u, datos(i))));
  assert.ok(res.every((r) => r.factura), res.find((r) => r.error)?.error);
  const ids = res.map((r) => r.factura.id);
  assert.equal(new Set(ids).size, 20, `ids repetidos: ${ids}`);
  const guardadas = await todas(u);
  assert.equal(guardadas.length, 20);
  assert.deepEqual(guardadas.map((f) => f.numero).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  // Cada una conserva sus propios datos (no se pisan).
  for (const r of res) assert.equal(guardadas.find((f) => f.id === r.factura.id).base, r.factura.base);
});

test('F01: reintentar con la misma clave devuelve la misma factura (doble clic, respuesta perdida)', async () => {
  const u = empresa();
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => F.crearFactura(u, datos(), { idem: 'clic-1' })));
  assert.equal(a.factura.id, b.factura.id);
  assert.equal(a.factura.id, c.factura.id);
  const d = await F.crearFactura(u, datos(), { idem: 'clic-1' });
  assert.equal(d.factura.id, a.factura.id);
  assert.equal((await todas(u)).length, 1);
  assert.equal((await F.crearFactura(u, datos(), { idem: 'clic-2' })).factura.numero, 2);
});

test('F02: 10 emisiones simultáneas con Verifactu forman una única cadena', async () => {
  const u = empresa({ verifactu: 'pruebas' });
  const res = await Promise.all(Array.from({ length: 10 }, (_, i) => F.crearFactura(u, datos(i))));
  assert.ok(res.every((r) => r.factura), res.find((r) => r.error)?.error);
  assert.equal(new Set(res.map((r) => r.factura.id)).size, 10);
  const regs = (await R.leer(u, 'registros')) || [];
  assert.equal(regs.length, 10);
  const primeros = regs.filter((r) => !r.HuellaAnterior);
  assert.equal(primeros.length, 1, 'un solo primer registro');
  const huellas = new Set(regs.map((r) => r.Huella));
  for (const r of regs.filter((x) => x.HuellaAnterior)) assert.ok(huellas.has(r.HuellaAnterior), 'cada registro enlaza con uno que existe');
  assert.equal(new Set(regs.map((r) => r.HuellaAnterior)).size, 10, 'ningún registro tiene dos sucesores');
  // La cabeza es el último eslabón y cada factura apunta a su registro.
  const cabeza = await R.redis.get(R.clave(u, 'verifactu'));
  assert.ok(!regs.some((r) => r.HuellaAnterior === cabeza), 'la cabeza no tiene sucesor');
  const facturas = await todas(u);
  for (const r of regs) assert.equal(facturas.find((f) => f.id === r.factura)?.verifactu?.huella, r.Huella);
});

test('F02: un corte a mitad de la emisión no deja registros huérfanos ni rompe la cadena', async () => {
  const u = empresa({ verifactu: 'pruebas' });
  await F.crearFactura(u, datos(1));
  srv.fallos.exec = 1;
  const r = await F.crearFactura(u, datos(2)).catch((e) => ({ error: e.message }));
  assert.ok(r.error, 'la emisión cortada no da éxito');
  assert.equal((await todas(u)).length, 1);
  assert.equal(((await R.leer(u, 'registros')) || []).length, 1, 'sin registro huérfano');
  const ok = await F.crearFactura(u, datos(3));
  assert.equal(ok.factura.numero, 2, 'el número no usado no deja hueco');
  const regs = await R.leer(u, 'registros');
  assert.equal(regs.filter((x) => !x.HuellaAnterior).length, 1);
});

test('F03: borrar la última factura no libera su número', async () => {
  const u = empresa();
  await F.crearFactura(u, datos(1));
  const b = (await F.crearFactura(u, datos(2))).factura;
  const borrado = await F.borrarFactura(u, b.id);
  assert.ok(!borrado.error, borrado.error);
  const c = (await F.crearFactura(u, datos(3))).factura;
  assert.equal(c.numero, 3);
  assert.notEqual(c.id, b.id);
  // Queda constancia de la borrada (número emitido y anulado).
  const borradas = (await R.leer(u, 'facturasBorradas')) || [];
  assert.equal(borradas[0].id, b.id);
});

test('F03: el contador se pone al día con las facturas que ya existían (empresas de antes)', async () => {
  const u = empresa();
  for (const k of [1, 2, 7]) await R.guardar(u, 'facturas', { id: `2026-${k}`, numero: k, anio: 2026, ...datos(k) });
  assert.equal((await F.crearFactura(u, datos(9))).factura.numero, 8);
});

test('F05: la factura guarda el emisor y el vencimiento del momento de emitirla', async () => {
  const u = empresa();
  const f = (await F.crearFactura(u, datos())).factura;
  assert.equal(f.emisor.nombre, 'Emisora S.L.');
  assert.equal(f.vence, '2026-04-09');
  const despues = { ...u, emisor: { ...u.emisor, nombre: 'Otro Nombre S.L.', plazo: 60 } };
  const { emisorDe } = await import('../lib/calculos.js');
  assert.equal(emisorDe(f, despues).nombre, 'Emisora S.L.');
  const { vencimiento } = await import('../lib/calculos.js');
  assert.equal(vencimiento(f, 60), '2026-04-09');
});

test('F04: un pago que no cuadra no salda la factura; uno repetido no se aplica dos veces', async () => {
  const u = empresa();
  await R.redis.hset('empresas', { [u.empresa]: { id: u.empresa } });
  const f = (await F.crearFactura(u, datos())).factura; // 100 + 21 % = 121 €
  const { f: conEnlace } = await C.enlacePago(u, f);
  const sesion = (extra) => ({ id: `cs_${Math.random()}`, payment_status: 'paid', currency: 'eur', amount_total: 12100, metadata: { token: conEnlace.pago, factura: f.id, empresa: u.empresa, importe: '12100' }, ...extra });
  const leerF = async () => R.leerUno(u, 'facturas', f.id);
  // 0,01 USD: ni moneda ni importe.
  assert.equal((await C.marcarPagada(sesion({ amount_total: 1, currency: 'usd' }))).aplicado, false);
  assert.equal((await leerF()).cobrada, false);
  // 0,01 EUR: pago parcial, sigue pendiente con su saldo.
  const parcial = sesion({ amount_total: 1 });
  await C.marcarPagada(parcial);
  let x = await leerF();
  assert.equal(x.cobrada, false);
  assert.equal(x.pagos.length, 1);
  assert.equal(x.pagos[0].importe, 0.01);
  // El mismo evento otra vez (webhook y página a la vez): no duplica.
  await Promise.all([C.marcarPagada(parcial), C.marcarPagada(parcial)]);
  assert.equal((await leerF()).pagos.length, 1);
  // Otra factura distinta en los metadatos: no se aplica.
  assert.equal((await C.marcarPagada(sesion({ metadata: { ...sesion().metadata, factura: 'otra' } }))).aplicado, false);
  // El resto: queda cobrada.
  await C.marcarPagada(sesion({ amount_total: 12099 }));
  x = await leerF();
  assert.equal(x.cobrada, true);
  assert.equal(x.pagos.reduce((s, p) => s + p.importe, 0), 121);
});

test('F08: una recurrente que falla no se da por hecha y se reintenta; dos pasadas a la vez emiten una sola', async () => {
  const { procesarRecurrente } = await import('../lib/recurrentesServidor.js');
  const u = empresa({ verifactu: 'pruebas' });
  const plantilla = { actividad: 'servicios', cliente: { nombre: 'Sin NIF', nif: '' }, concepto: 'Cuota', base: 50, ivaPct: 21, irpfPct: 0 };
  await R.guardar(u, 'recurrentes', { id: 'r1', activa: true, dia: 1, plantilla, enviar: true });
  const enviados = [];
  let falla = true;
  const enviar = async (_, f) => (falla ? { error: 'buzón caído' } : (enviados.push(f.id), {}));
  // 1.º: falla (Verifactu sin NIF del cliente) → queda el fallo y no se marca el mes.
  const a = await procesarRecurrente(u, 'r1', '2026-10-01', { enviar });
  assert.match(a.fallo, /NIF/);
  let r = await R.leerUno(u, 'recurrentes', 'r1');
  assert.equal(r.ultima, undefined);
  assert.equal(r.fallo.intentos, 1);
  // 2.º: siguen sin NIF → otro intento apuntado.
  await procesarRecurrente(u, 'r1', '2026-10-02', { enviar });
  assert.equal((await R.leerUno(u, 'recurrentes', 'r1')).fallo.intentos, 2);
  // Se corrige la plantilla y dos pasadas del cron a la vez: una sola factura.
  await R.guardar(u, 'recurrentes', { ...(await R.leerUno(u, 'recurrentes', 'r1')), plantilla: { ...plantilla, cliente: { nombre: 'Con NIF', nif: '12345678Z' } } });
  const [x, y] = await Promise.all([procesarRecurrente(u, 'r1', '2026-10-03', { enviar }), procesarRecurrente(u, 'r1', '2026-10-03', { enviar })]);
  assert.equal([x, y].filter((z) => z.creada).length, 1);
  assert.equal((await todas(u)).length, 1);
  r = await R.leerUno(u, 'recurrentes', 'r1');
  assert.equal(r.ultima, '2026-10');
  assert.equal(r.fallo, undefined);
  // El email falló (una o dos veces, si la otra pasada también lo intentó): se reintenta después sin emitir otra factura.
  assert.ok(r.envios[0].intentos >= 1);
  falla = false;
  const z = await procesarRecurrente(u, 'r1', '2026-10-04', { enviar });
  assert.equal(z.creada, undefined);
  assert.deepEqual(enviados, [r.envios[0].factura]);
  assert.equal((await R.leerUno(u, 'recurrentes', 'r1')).envios, undefined);
  assert.equal((await todas(u)).length, 1);
  // Y el mes que viene, la siguiente.
  assert.ok((await procesarRecurrente(u, 'r1', '2026-11-01', { enviar })).creada);
  assert.equal((await todas(u)).length, 2);
});

// Auditoría completa (21-10-2026, revisión de Codex): con el día 28, un fallo en febrero no se reintentaba en marzo hasta el 28
// y entonces se creaba marzo: febrero se perdía sin aviso. Y el email pendiente de un mes lo pisaba el del siguiente.
test('F08: un mes que falla se recupera en cuanto se arregla, antes de crear el siguiente', async () => {
  const { procesarRecurrente } = await import('../lib/recurrentesServidor.js');
  const u = empresa({ verifactu: 'pruebas' });
  const plantilla = { actividad: 'servicios', cliente: { nombre: 'Sin NIF', nif: '' }, concepto: 'Cuota', base: 50, ivaPct: 21, irpfPct: 0 };
  await R.guardar(u, 'recurrentes', { id: 'r3', activa: true, dia: 28, plantilla, ultima: '2026-01' });
  assert.match((await procesarRecurrente(u, 'r3', '2026-02-28')).fallo, /NIF/);
  // El 3 de marzo ya está arreglado: sale febrero (aunque aún no sea día 28) y marzo espera a su día.
  await R.guardar(u, 'recurrentes', { ...(await R.leerUno(u, 'recurrentes', 'r3')), plantilla: { ...plantilla, cliente: { nombre: 'Con NIF', nif: '12345678Z' } } });
  const m3 = await procesarRecurrente(u, 'r3', '2026-03-03');
  assert.equal(m3.creadas?.length, 1);
  assert.equal((await R.leerUno(u, 'recurrentes', 'r3')).ultima, '2026-02');
  assert.equal((await procesarRecurrente(u, 'r3', '2026-03-28')).creadas?.length, 1);
  assert.equal((await R.leerUno(u, 'recurrentes', 'r3')).ultima, '2026-03');
  assert.equal((await todas(u)).length, 2);
});

test('F08: si el cron no pasó el día del mes, el siguiente lo recupera; y en pausa no se rellena', async () => {
  const { procesarRecurrente } = await import('../lib/recurrentesServidor.js');
  const u = empresa();
  const plantilla = { actividad: 'servicios', cliente: { nombre: 'Ana', nif: '12345678Z' }, concepto: 'Cuota', base: 50, ivaPct: 21, irpfPct: 0 };
  await R.guardar(u, 'recurrentes', { id: 'r4', activa: true, dia: 28, plantilla, ultima: '2026-01' });
  // Nadie pasó el 28 de febrero: el 1 de marzo sale febrero.
  assert.equal((await procesarRecurrente(u, 'r4', '2026-03-01')).creadas?.length, 1);
  assert.equal((await R.leerUno(u, 'recurrentes', 'r4')).ultima, '2026-02');
  // En pausa nada; dos meses más tarde se reanuda (app/api/recurrentes pone `ultima` en el mes anterior): solo sale el actual.
  await R.guardar(u, 'recurrentes', { ...(await R.leerUno(u, 'recurrentes', 'r4')), activa: false });
  assert.equal((await procesarRecurrente(u, 'r4', '2026-04-28')).creadas, undefined);
  await R.guardar(u, 'recurrentes', { ...(await R.leerUno(u, 'recurrentes', 'r4')), activa: true, ultima: '2026-05' });
  assert.equal((await procesarRecurrente(u, 'r4', '2026-06-28')).creadas?.length, 1);
  assert.equal((await todas(u)).length, 2);
});

test('F08: el email pendiente de un mes no lo pisa la factura del siguiente', async () => {
  const { procesarRecurrente } = await import('../lib/recurrentesServidor.js');
  const u = empresa();
  await R.guardar(u, 'recurrentes', { id: 'r5', activa: true, dia: 1, enviar: true, ultima: '2026-09', plantilla: { actividad: 'servicios', cliente: { nombre: 'Ana', nif: '12345678Z' }, concepto: 'Cuota', base: 50, ivaPct: 21, irpfPct: 0 } });
  const enviados = [];
  let falla = true;
  const enviar = async (_, f) => (falla ? { error: 'buzón caído' } : (enviados.push(f.fecha), {}));
  await procesarRecurrente(u, 'r5', '2026-10-01', { enviar });
  await procesarRecurrente(u, 'r5', '2026-11-01', { enviar });
  assert.equal((await R.leerUno(u, 'recurrentes', 'r5')).envios.length, 2);
  falla = false;
  await procesarRecurrente(u, 'r5', '2026-11-02', { enviar });
  assert.deepEqual(enviados.sort(), ['2026-10-01', '2026-11-01']);
  assert.equal((await R.leerUno(u, 'recurrentes', 'r5')).envios, undefined);
});

test('F08: un corte entre emitir y apuntar el mes no duplica la factura al reintentar', async () => {
  const { procesarRecurrente } = await import('../lib/recurrentesServidor.js');
  const u = empresa();
  await R.guardar(u, 'recurrentes', { id: 'r2', activa: true, dia: 1, plantilla: { actividad: 'servicios', cliente: { nombre: 'Ana', nif: '12345678Z' }, concepto: 'Cuota', base: 50, ivaPct: 21, irpfPct: 0 } });
  // Simula el corte: la factura del mes ya se emitió con su clave, pero la plantilla no llegó a apuntarlo.
  await F.crearFactura(u, { actividad: 'servicios', cliente: { nombre: 'Ana', nif: '12345678Z' }, concepto: 'Cuota', base: 50, ivaPct: 21, irpfPct: 0, fecha: '2026-10-01', cobrada: false }, { idem: 'rec:r2:2026-10' });
  await procesarRecurrente(u, 'r2', '2026-10-02');
  assert.equal((await todas(u)).length, 1);
  assert.equal((await R.leerUno(u, 'recurrentes', 'r2')).ultima, '2026-10');
});

test('F01: 100 emisiones simultáneas en dos series: 100 facturas, sin huecos ni repetidos', async () => {
  const u = empresa({ actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }, { id: 'cursos', nombre: 'Cursos', serie: 'C', ivaPct: 21, irpfPct: 0 }] });
  const res = await Promise.all(Array.from({ length: 100 }, (_, i) => F.crearFactura(u, { ...datos(i), actividad: i % 2 ? 'cursos' : 'servicios' })));
  assert.ok(res.every((r) => r.factura), res.find((r) => r.error)?.error);
  const fs = await todas(u);
  assert.equal(fs.length, 100);
  for (const serie of ['', 'C']) assert.deepEqual(fs.filter((f) => (f.serie || '') === serie).map((f) => f.numero).sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1));
});

test('F05: las facturas de antes de la instantánea se congelan antes de cambiar los datos del emisor', async () => {
  const u = empresa({ marca: { color: '#123456', logo: 'data:image/png;base64,AAAA' } });
  // Una factura antigua, sin instantánea, y otra ya con la suya.
  await R.guardar(u, 'facturas', { id: '2025-1', numero: 1, anio: 2025, ...datos(1), fecha: '2025-05-01' });
  const nueva = (await F.crearFactura(u, datos(2))).factura;
  assert.equal(await F.congelarInstantaneas(u), 1);
  assert.equal(await F.congelarInstantaneas(u), 0, 'idempotente');
  const vieja = await R.leerUno(u, 'facturas', '2025-1');
  assert.equal(vieja.emisor.nombre, 'Emisora S.L.');
  assert.equal(vieja.vence, '2025-05-31');
  const { identidadDoc } = await import('../lib/documento.js');
  const despues = { ...u, emisor: { nombre: 'Nuevo S.L.' }, marca: { color: '#000000' } };
  const id = await identidadDoc(despues, vieja);
  assert.equal(id.emisor.nombre, 'Emisora S.L.');
  assert.deepEqual(id.marca, { color: '#123456', logo: 'data:image/png;base64,AAAA' });
  assert.equal((await identidadDoc(despues, nueva)).marca.logo, 'data:image/png;base64,AAAA');
});

test('comprobación de integridad: detecta lo que dejaba el código anterior y da limpio lo emitido ahora', async () => {
  const { comprobarIntegridad } = await import('../lib/integridad.js');
  const u = empresa({ verifactu: 'pruebas' });
  await Promise.all(Array.from({ length: 6 }, (_, i) => F.crearFactura(u, datos(i))));
  const leerTodo = async () => ({ facturas: await todas(u), borradas: (await R.leer(u, 'facturasBorradas')) || [], registros: (await R.leer(u, 'registros')) || [], cabeza: await R.redis.get(R.clave(u, 'verifactu')), numeracion: (await R.redis.hgetall(R.clave(u, 'numeracion'))) || {} });
  assert.deepEqual(comprobarIntegridad(await leerTodo()), []);
  // Lo que producía el fallo F02: dos registros colgando del mismo anterior, y un número repetido (F01).
  const d = await leerTodo();
  const a = d.registros.find((r) => r.HuellaAnterior);
  const roto = { ...d, registros: [...d.registros, { ...a, Huella: 'X', NumSerieFactura: 'dup' }], facturas: [...d.facturas, { ...d.facturas[0], id: 'otra' }] };
  const tipos = comprobarIntegridad(roto).map((x) => x.tipo);
  assert.ok(tipos.includes('cadena-bifurcada'));
  assert.ok(tipos.includes('numero-repetido'));
});

test('contadoresDe: el mayor número emitido o borrado de cada serie y año; las importadas no cuentan', async () => {
  const { contadoresDe } = await import('../lib/integridad.js');
  assert.deepEqual(contadoresDe([{ anio: 2026, numero: 3 }, { anio: 2026, numero: 9, importada: '2026/9' }, { serie: 'R', anio: 2026, numero: 1 }], [{ anio: 2026, numero: 5 }]), { '-|2026': 5, 'R|2026': 1 });
});

// Auditoría 28-10-2026: la numeración ha de ser correlativa (art. 6.1.a del Reglamento de facturación).
test('Numeración: saltar números se puede antes de emitir en la serie, pero no después (dejaría un hueco)', async () => {
  const nueva = empresa();
  assert.deepEqual(await F.saltarNumeracion(nueva, '', 2026, 41), { ok: true, siguiente: 41 });
  assert.equal((await F.crearFactura(nueva, datos())).factura.numero, 41);
  const u = empresa();
  await F.crearFactura(u, datos(1));
  const r = await F.saltarNumeracion(u, '', 2026, 50);
  assert.match(r.error, /hueco/);
  assert.equal((await F.crearFactura(u, datos(2))).factura.numero, 2);
  // Otro año de la misma serie, sin facturas aún: sí.
  assert.equal((await F.saltarNumeracion(u, '', 2027, 10)).ok, true);
});

test('Numeración: la revisión de integridad detecta los huecos, pero no el número de inicio ni las borradas', async () => {
  const { comprobarIntegridad } = await import('../lib/integridad.js');
  const f = (numero, extra = {}) => ({ id: `n${numero}`, anio: 2026, numero, emisor: {}, ...extra });
  const huecos = (datos) => comprobarIntegridad(datos).filter((i) => i.tipo === 'hueco');
  assert.deepEqual(huecos({ facturas: [f(1), f(2), f(4), f(7)] }).map((i) => i.detalle), ['-|2026: faltan 3, 5, 6']);
  assert.equal(huecos({ facturas: [f(41), f(42), f(43)] }).length, 0);
  assert.equal(huecos({ facturas: [f(1), f(3)], borradas: [f(2)] }).length, 0);
  assert.equal(huecos({ facturas: [f(1), f(3, { importada: 'A-3' })] }).length, 0);
  assert.equal(huecos({ facturas: [f(1), f(2, { serie: 'V' })] }).length, 0);
});
