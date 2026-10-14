// Fichas de clientes y proveedores y límite de riesgo: validación de la ficha, riesgo máximo que ninguna factura puede
// superar (alta, concurrencia, rectificativas, cobradas), la ficha que sobrevive a las facturas y el plazo del cliente.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { filtrarFichas, limpiarFicha, mismoCliente, valoresDe } from '../lib/terceros.js';
import { evaluarRiesgo, riesgoDe, tieneLimite } from '../lib/riesgo.js';
import { unirProveedores } from '../lib/proveedores.js';
import { importes } from '../lib/calculos.js';
import { limpiarDoc } from '../lib/albaranes.js';
import { riesgoAlbaran } from '../lib/riesgo.js';

const importesTotal = (f) => importes(f).total;

let srv, F, R, S, A;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  [F, R, S, A] = await Promise.all([import('../lib/facturas.js'), import('../lib/redis.js'), import('../lib/tercerosServidor.js'), import('../lib/albaranesServidor.js')]);
});
after(() => srv.cerrar());

let n = 0;
const empresa = () => {
  const id = `fr${++n}`;
  return { id: `u${n}`, empresa: id, emisor: { nombre: 'Emisora S.L.', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: '28013 Madrid', iban: 'ES9121000418450200051332', plazo: 30 },
    actividades: [{ id: 'servicios', nombre: 'Servicios', serie: '', ivaPct: 21, irpfPct: 0 }] };
};
// base 100 + 21 % de IVA = 121 € por factura.
const datos = (extra = {}, cliente = {}) => ({ fecha: '2026-03-10', actividad: 'servicios', cliente: { nombre: 'Cliente Uno', nif: '12345678Z', direccion: 'C/ Sol 2', ciudad: 'Madrid', ...cliente },
  concepto: 'Servicio', base: 100, ivaPct: 21, irpfPct: 0, nota: '', cobrada: false, ...extra });
// Crea la ficha de «Cliente Uno» o, si ya está, la cambia entera (lo que no se pasa se queda vacío).
const ficha = async (u, extra = {}) => S.guardarFichaCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z', ...extra },
  { puedeRiesgo: true, ...((await R.leerUno(u, 'clientes', 'CLIENTE UNO')) ? { id: 'CLIENTE UNO' } : {}) });

test('ficha: la forma de cobro, el plazo y el riesgo se validan; vacío = sin dato', () => {
  const ok = limpiarFicha({ nombre: ' Eventos SL ', nif: 'B12345674', formaCobro: 'domiciliacion', plazo: '30', comercial: ' Ana ', zona: 'Cataluña', riesgoMax: '5.000,50', telefono: '+34 600 111 222' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.datos, { nombre: 'Eventos SL', nif: 'B12345674', direccion: '', ciudad: '', telefono: '+34 600 111 222', formaCobro: 'domiciliacion', plazo: 30, comercial: 'Ana', zona: 'Cataluña', riesgoMax: 5000.5 });
  const vacia = limpiarFicha({ nombre: 'X', formaCobro: '', plazo: '', riesgoMax: '', comercial: ' ' });
  assert.equal(vacia.ok, true);
  assert.equal('riesgoMax' in vacia.datos, false);
  assert.equal('plazo' in vacia.datos, false);
  assert.equal('formaCobro' in vacia.datos, false);
  assert.equal(limpiarFicha({ nombre: 'X', riesgoMax: '0' }).datos.riesgoMax, 0, '0 es un límite: nada a crédito');
  for (const [mal, campo] of [[{ nombre: '' }, 'nombre'], [{ nombre: 'X', formaCobro: 'bitcoin' }, 'formaCobro'], [{ nombre: 'X', plazo: '-1' }, 'plazo'], [{ nombre: 'X', plazo: '1,5' }, 'plazo'],
    [{ nombre: 'X', plazo: 400 }, 'plazo'], [{ nombre: 'X', riesgoMax: '-5' }, 'riesgoMax'], [{ nombre: 'X', riesgoMax: 'mucho' }, 'riesgoMax'], [{ nombre: 'X', nif: '12345678A' }, 'nif'],
    [{ nombre: 'X', email: 'no' }, 'email'], [{ nombre: 'X', telefono: 'abc' }, 'telefono']]) {
    const r = limpiarFicha(mal);
    assert.equal(r.ok, false, JSON.stringify(mal));
    assert.ok(r.errores[campo], `${campo}: ${JSON.stringify(r.errores)}`);
  }
  assert.equal(limpiarFicha({ nombre: 'Prov', formaPago: 'transferencia', riesgoMax: 500 }, 'proveedor').datos.riesgoMax, undefined, 'el proveedor no lleva riesgo');
  assert.equal(limpiarFicha({ nombre: 'Prov', formaPago: 'transferencia' }, 'proveedor').datos.formaPago, 'transferencia');
});

test('riesgo: lo pendiente de las facturas frente al límite, en céntimos y sin bloquear lo que no suma', () => {
  const f = (total, extra = {}) => ({ base: total / 1.21, ivaPct: 21, irpfPct: 0, ...extra });
  assert.equal(riesgoDe([f(121), f(60.5, { pagos: [{ importe: 20 }] }), f(121, { cobrada: true })]), 161.5);
  assert.equal(riesgoDe([f(121), f(-121)]), 0, 'una rectificativa sin liquidar resta; nunca negativo');
  assert.equal(riesgoDe([]), 0);
  assert.equal(tieneLimite({ riesgoMax: 0 }), true);
  assert.equal(tieneLimite({}), false);
  const justo = evaluarRiesgo({ limite: 1000, riesgo: 879, incremento: 121 });
  assert.equal(justo.ok, true, 'llegar justo al límite está permitido');
  const pasa = evaluarRiesgo({ limite: 1000, riesgo: 879.01, incremento: 121, cliente: 'Eventos SL' });
  assert.equal(pasa.ok, false);
  assert.match(pasa.error, /Eventos SL/);
  assert.equal(pasa.exceso, 0.01);
  assert.equal(evaluarRiesgo({ limite: 1000, riesgo: 5000, incremento: -50 }).ok, true, 'un cliente ya pasado puede seguir cobrando y rectificando');
  assert.equal(evaluarRiesgo({ limite: 1000, riesgo: 5000, incremento: 0 }).ok, true);
  assert.equal(evaluarRiesgo({ limite: 0, riesgo: 0, incremento: 0.01 }).ok, false, 'límite 0: nada a crédito');
  assert.equal(evaluarRiesgo({ limite: null, riesgo: 1e6, incremento: 1e6 }).ok, true, 'sin límite');
  assert.equal(evaluarRiesgo({ limite: 0.3, riesgo: 0.1, incremento: 0.2 }).ok, true, '0,1 + 0,2 no se pasa de 0,3 por la coma flotante');
});

test('filtros y listas: por comercial, zona y texto; valores ya usados; mismo cliente', () => {
  const l = [{ nombre: 'Alfa', comercial: 'Ana', zona: 'Norte', nif: 'A1' }, { nombre: 'Beta', comercial: 'Luis', zona: 'Norte', email: 'b@x.es' }, { nombre: 'Gamma', zona: 'Sur' }];
  assert.deepEqual(filtrarFichas(l, { comercial: 'Ana' }).map((x) => x.nombre), ['Alfa']);
  assert.deepEqual(filtrarFichas(l, { zona: 'Norte' }).map((x) => x.nombre), ['Alfa', 'Beta']);
  assert.deepEqual(filtrarFichas(l, { comercial: '__sin__' }).map((x) => x.nombre), ['Gamma']);
  assert.deepEqual(filtrarFichas(l, { q: 'b@x' }).map((x) => x.nombre), ['Beta']);
  assert.deepEqual(filtrarFichas(l, {}).length, 3);
  assert.deepEqual(valoresDe(l, 'zona'), ['Norte', 'Sur']);
  assert.equal(mismoCliente({ nombre: 'Ana ', nif: 'a-1' }, { nombre: 'ANA', nif: 'A1' }), true);
  assert.equal(mismoCliente({ nombre: 'Ana', nif: 'A1' }, { nombre: 'Ana', nif: 'B2' }), false);
  assert.equal(mismoCliente({ nombre: 'Ana' }, { nombre: 'Ana', nif: 'B2' }), true);
});

test('proveedores: la ficha se une por clave, NIF o nombre y las fichas sin gastos también salen', () => {
  const lista = [{ clave: 'B12345674', nombre: 'Audio SL', nif: 'B12345674', n: 3, total: 300, ultimo: '2026-03-01', pendientes: 1, debe: 50 },
    { clave: 'luz sa', nombre: 'Luz SA', nif: '', n: 1, total: 80, ultimo: '2026-02-01', pendientes: 0, debe: 0 }];
  const fichas = [{ id: 'audio sl', nombre: 'AUDIO SL', nif: 'B-12345674', formaPago: 'transferencia' }, { id: 'luz sa', nombre: 'Luz S.A.', formaPago: 'recibo' }, { id: 'nuevo', nombre: 'Nuevo', formaPago: 'efectivo' }];
  const u = unirProveedores(lista, fichas);
  assert.deepEqual(u.map((p) => p.nombre), ['Audio SL', 'Luz SA', 'Nuevo']);
  assert.equal(u[0].ficha.formaPago, 'transferencia', 'por NIF');
  assert.equal(u[1].ficha.formaPago, 'recibo', 'por clave');
  assert.equal(u[2].n, 0);
  assert.equal(u[2].clave, 'nuevo');
});

test('límite: una factura que pasa del riesgo máximo no se emite; llegar justo, sí', async () => {
  const u = empresa();
  assert.equal((await ficha(u, { riesgoMax: '300' })).cliente.riesgoMax, 300);
  assert.ok((await F.crearFactura(u, datos())).factura, '121 de 300');
  assert.ok((await F.crearFactura(u, datos())).factura, '242 de 300');
  const tercera = await F.crearFactura(u, datos());
  assert.equal(tercera.factura, undefined, '363 > 300');
  assert.match(tercera.error, /riesgo máximo/);
  assert.equal(tercera.riesgo.limite, 300);
  assert.equal(tercera.riesgo.riesgo, 242);
  assert.equal(tercera.riesgo.disponible, 58);
  assert.equal((await R.leer(u, 'facturas')).length, 2, 'la rechazada no se guarda');
  const exacta = await F.crearFactura(u, datos({ base: 47.93 }));
  assert.equal(exacta.factura.numero, 3, 'el número de la rechazada no se gasta');
  assert.equal(importesTotal(exacta.factura), 58, 'llegar justo al límite (242 + 58 = 300,00) se permite');
  assert.equal((await S.riesgoCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z' })).riesgo, 300);
  assert.match((await F.crearFactura(u, datos({ base: 0.01 }))).error, /riesgo máximo/, 'un céntimo más ya no cabe');
});

test('límite: cobrar libera riesgo, lo ya cobrado y las rectificativas no se bloquean, y otro cliente no cuenta', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '150' });
  const a = (await F.crearFactura(u, datos())).factura;
  assert.ok((await F.crearFactura(u, datos({ cobrada: true }))).factura, 'ya cobrada: no suma riesgo');
  assert.ok((await F.crearFactura(u, datos({ cobrada: true }))).factura);
  assert.match((await F.crearFactura(u, datos())).error, /riesgo máximo/, '121 + 121 > 150');
  assert.ok((await F.crearFactura(u, datos({}, { nombre: 'Otro Cliente', nif: '' }))).factura, 'otro cliente sin ficha: sin límite');
  // Una rectificativa que anula la pendiente nunca se bloquea (aunque el cliente esté pasado de límite).
  await ficha(u, { riesgoMax: '10' });
  const rect = await F.crearFactura(u, datos({ base: -100 }), { original: a, motivo: 'error' });
  assert.ok(rect.factura, 'una rectificativa no suma riesgo');
  // Cobrada la 1.ª, el cliente vuelve a poder facturar.
  await ficha(u, { riesgoMax: '150' });
  await R.guardar(u, 'facturas', { ...a, cobrada: true });
  await R.guardar(u, 'facturas', { ...rect.factura, cobrada: true });
  assert.ok((await F.crearFactura(u, datos())).factura);
});

test('límite: 0 € = solo al contado; sin límite no se comprueba nada', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '0' });
  assert.match((await F.crearFactura(u, datos())).error, /riesgo máximo/);
  assert.ok((await F.crearFactura(u, datos({ cobrada: true }))).factura, 'al contado sí');
  await ficha(u, {});
  assert.ok((await F.crearFactura(u, datos())).factura, 'al quitar el límite, vuelve a poder');
});

test('límite: diez altas a la vez no suman por encima del riesgo máximo', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '400' });
  const r = await Promise.all(Array.from({ length: 10 }, () => F.crearFactura(u, datos())));
  assert.equal(r.filter((x) => x.factura).length, 3, '3 × 121 = 363 ≤ 400; la cuarta pasaría de 400');
  assert.equal(r.filter((x) => x.riesgo).length, 7);
  assert.equal((await S.riesgoCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z' })).riesgo, 363);
});

test('límite: dos clientes con el mismo nombre y distinto NIF no comparten riesgo', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '130' });
  assert.ok((await F.crearFactura(u, datos())).factura);
  assert.match((await F.crearFactura(u, datos())).error, /riesgo máximo/, 'mismo cliente: 242 > 130');
  const otro = await F.crearFactura(u, datos({}, { nif: 'B12345674' }));
  assert.ok(otro.factura, 'mismo nombre, otro NIF: es otro deudor y no cuenta lo del primero');
});

test('ficha: los datos de la ficha sobreviven a las facturas, y el nombre se fija con el primero', async () => {
  const u = empresa();
  const r = await ficha(u, { formaCobro: 'domiciliacion', plazo: '15', comercial: 'Ana', zona: 'Norte', riesgoMax: '1000', notas: 'VIP' });
  assert.equal(r.nuevo, true);
  assert.equal((await S.guardarFichaCliente(u, { nombre: 'cliente uno' }, {})).error, 'Ya existe un cliente con ese nombre', 'el alta de un nombre repetido (sin mayúsculas) no pisa la ficha');
  await F.crearFactura(u, datos({}, { direccion: 'C/ Nueva 9', email: 'x@cliente.es' }));
  await F.guardarCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z', direccion: 'Otra 1', ciudad: 'Reus' });
  const c = await R.leerUno(u, 'clientes', 'CLIENTE UNO');
  assert.equal(c.direccion, 'Otra 1', 'los datos básicos se actualizan con la factura');
  assert.deepEqual([c.formaCobro, c.plazo, c.comercial, c.zona, c.riesgoMax, c.notas], ['domiciliacion', 15, 'Ana', 'Norte', 1000, 'VIP'], 'la ficha se conserva');
  const cambio = await S.guardarFichaCliente(u, { nombre: 'Otro nombre', zona: 'Sur', direccion: 'C/ Sol 2' }, { id: 'CLIENTE UNO', puedeRiesgo: true });
  assert.equal(cambio.cliente.nombre, 'Cliente Uno', 'el nombre no cambia al editar');
  assert.equal(cambio.cliente.zona, 'Sur');
  assert.equal(cambio.cliente.riesgoMax, undefined, 'lo que se vacía en el formulario se quita');
  assert.equal((await S.guardarFichaCliente(u, { zona: 'Sur' }, { id: 'NO EXISTE' })).status, 404);
});

test('ficha: solo quien puede (administrador) cambia el riesgo máximo', async () => {
  const u = empresa();
  assert.equal((await S.guardarFichaCliente(u, { nombre: 'Nuevo', riesgoMax: '100' }, { puedeRiesgo: false })).status, 403);
  assert.ok((await S.guardarFichaCliente(u, { nombre: 'Nuevo', zona: 'Norte' }, { puedeRiesgo: false })).cliente, 'sin tocar el riesgo, puede');
  await S.guardarFichaCliente(u, { nombre: 'Con Limite', riesgoMax: '100' }, { puedeRiesgo: true });
  assert.equal((await S.guardarFichaCliente(u, { nombre: 'Con Limite', riesgoMax: '999' }, { id: 'CON LIMITE', puedeRiesgo: false })).status, 403);
  assert.equal((await S.guardarFichaCliente(u, { nombre: 'Con Limite', riesgoMax: '100', zona: 'Sur' }, { id: 'CON LIMITE', puedeRiesgo: false })).cliente.zona, 'Sur', 'si el riesgo no cambia, no hace falta permiso');
});

test('plazo: el del cliente manda sobre el de Ajustes en el vencimiento', async () => {
  const u = empresa();
  await ficha(u, { plazo: '60' });
  assert.equal((await F.crearFactura(u, datos())).factura.vence, '2026-05-09', '10 de marzo + 60 días');
  assert.equal((await F.crearFactura(u, datos({}, { nombre: 'Sin ficha', nif: '' }))).factura.vence, '2026-04-09', 'sin ficha: los 30 días de Ajustes');
  await ficha(u, { plazo: '0' });
  assert.equal((await F.crearFactura(u, datos())).factura.vence, '2026-03-10', 'plazo 0: al contado');
});

test('clientes: el listado trae el riesgo, lo que queda y si está pasado; el detalle, sus facturas', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '200', comercial: 'Ana' });
  await F.crearFactura(u, datos());
  await F.crearFactura(u, datos({ cobrada: true }));
  await F.crearFactura(u, datos({}, { nombre: 'Sin Ficha Limite', nif: '' }));
  const l = await S.listarClientes(u);
  const c = l.find((x) => x.id === 'CLIENTE UNO');
  assert.deepEqual([c.riesgo, c.limite, c.disponible, c.excedido], [121, 200, 79, false]);
  assert.equal(l.find((x) => x.id === 'SIN FICHA LIMITE').limite, null);
  await ficha(u, { riesgoMax: '100' });
  assert.equal((await S.listarClientes(u)).find((x) => x.id === 'CLIENTE UNO').excedido, true, 'bajar el límite por debajo de lo que debe lo deja pasado');
  const d = await S.detalleCliente(u, 'CLIENTE UNO');
  assert.equal(d.cliente.riesgo, 121);
  assert.equal(d.pendientes.length, 1);
  assert.equal(d.facturas.length, 2);
  assert.equal(await S.detalleCliente(u, 'NO EXISTE'), null);
  assert.match((await F.crearFactura(u, datos({ cobrada: true }))).error ?? '', /^$/, 'ya pasado, lo cobrado al emitir sí se puede');
});

test('borrar: la ficha de un cliente con facturas se queda; sin facturas se va', async () => {
  const u = empresa();
  await ficha(u, {});
  await F.crearFactura(u, datos());
  assert.equal((await S.borrarFichaCliente(u, 'CLIENTE UNO')).status, 409);
  await S.guardarFichaCliente(u, { nombre: 'Vacio' }, {});
  assert.ok((await S.borrarFichaCliente(u, 'VACIO')).cliente);
  assert.equal(await R.leerUno(u, 'clientes', 'VACIO'), null);
});

test('proveedores: la ficha se crea con la clave del NIF, se edita sin cambiar el nombre y sale en la lista', async () => {
  const u = empresa();
  const nueva = await S.guardarFichaProveedor(u, { nombre: 'Audio SL', nif: 'B12345674', formaPago: 'transferencia', plazo: '45', comercial: 'Luis', zona: 'Madrid' });
  assert.equal(nueva.ficha.id, 'B12345674');
  assert.equal((await S.guardarFichaProveedor(u, { nombre: 'Audio SL', nif: 'B12345674' })).status, 409);
  const edit = await S.guardarFichaProveedor(u, { nombre: 'Otro', nif: 'B12345674', formaPago: 'recibo' }, { id: 'B12345674' });
  assert.equal(edit.ficha.nombre, 'Audio SL');
  assert.equal(edit.ficha.formaPago, 'recibo');
  assert.equal((await S.guardarFichaProveedor(u, { nombre: 'X', formaPago: 'oro' })).status, 400);
  // Un proveedor que viene de los gastos y aún no tiene ficha: se crea con su clave.
  await R.guardar(u, 'gastos', { id: 'g1', fecha: '2026-03-01', proveedor: 'Luz SA', concepto: 'Luz', base: 100, ivaPct: 21, pendiente: true });
  const lista = await S.listarProveedores(u);
  assert.deepEqual(lista.map((p) => [p.nombre, p.n, Boolean(p.ficha)]), [['Luz SA', 1, false], ['Audio SL', 0, true]]);
  const c = await S.guardarFichaProveedor(u, { nombre: 'Luz SA', formaPago: 'domiciliacion' }, { id: lista[0].clave });
  assert.equal(c.nuevo, true);
  const d = await S.detalleProveedor(u, lista[0].clave);
  assert.equal(d.ficha.formaPago, 'domiciliacion');
  assert.equal(d.gastos.length, 1);
  assert.equal((await S.detalleProveedor(u, 'B12345674')).n, 0, 'una ficha sin gastos también tiene detalle');
  assert.equal(await S.detalleProveedor(u, 'no-existe'), null);
  assert.ok((await S.borrarFichaProveedor(u, 'B12345674')).ficha);
  assert.deepEqual((await S.listarProveedores(u)).map((p) => p.nombre), ['Luz SA']);
});

// base 100 + 21 % de IVA = 121 € por albarán de una línea.
const albaran = (tipo = 'albaran', precio = 100, cliente = {}) => limpiarDoc({ fecha: '2026-03-10', cliente: { nombre: 'Cliente Uno', nif: '12345678Z', ...cliente },
  lineas: [{ concepto: 'Servicio', cantidad: 1, precio, ivaPct: 21 }] }, tipo);

test('albaranes: solo cuentan los albaranes entregados sin facturar, con IVA', () => {
  assert.equal(riesgoAlbaran({ ...albaran(), id: 'a' }), 121);
  assert.equal(riesgoAlbaran({ ...albaran('pedido'), id: 'p' }), 0, 'un pedido no se ha servido');
  assert.equal(riesgoAlbaran({ ...albaran(), id: 'a', factura: '2026-1' }), 0, 'facturado: ya está en su factura');
});

test('albaranes: suman riesgo junto a las facturas y no se puede guardar uno que pase del límite', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '300' });
  assert.ok((await F.crearFactura(u, datos())).factura, '121 en factura');
  await A.guardarDoc(u, albaran());
  const ya = await S.riesgoCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z' });
  assert.deepEqual([ya.riesgo, ya.deFacturas, ya.deAlbaranes], [242, 121, 121]);
  await assert.rejects(A.guardarDoc(u, albaran()), (e) => e instanceof F.RiesgoSuperado && /riesgo máximo/.test(e.message), '363 > 300');
  assert.equal((await R.leer(u, 'albaranes')).length, 1, 'el rechazado no se guarda');
  assert.ok(await A.guardarDoc(u, albaran('pedido')), 'un pedido no suma riesgo');
  assert.ok(await A.guardarDoc(u, albaran('albaran', 100, { nombre: 'Otro', nif: '' })), 'otro cliente sin ficha: sin límite');
  assert.match((await F.crearFactura(u, datos())).error, /riesgo máximo/, 'las facturas también cuentan los albaranes: 242 + 121');
});

test('albaranes: corregir uno a más importe se comprueba, a menos no, y el cliente no cuenta dos veces su propio albarán', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '150' });
  const a = await A.guardarDoc(u, albaran());
  const sube = await A.corregirDoc(u, a.id, { ...albaran('albaran', 200), tipo: 'albaran' });
  assert.equal(sube.status, 409, '242 > 150');
  assert.match(sube.error, /riesgo máximo/);
  const igual = await A.corregirDoc(u, a.id, { ...albaran('albaran', 110), tipo: 'albaran' });
  assert.ok(igual.doc, '133,10 ≤ 150: el albarán de antes se descuenta de lo que ya debe');
  assert.ok((await A.corregirDoc(u, a.id, { ...albaran('albaran', 50), tipo: 'albaran' })).doc, 'bajar siempre se puede');
});

test('albaranes: facturarlos no cuenta dos veces (la factura sustituye a sus albaranes)', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '250' });
  const a = await A.guardarDoc(u, albaran());
  const b = await A.guardarDoc(u, albaran());
  assert.equal((await S.riesgoCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z' })).riesgo, 242);
  const r = await A.facturarAlbaranes(u, { ids: [a.id, b.id], fecha: '2026-03-12', actividad: 'servicios', irpfPct: 0 });
  assert.ok(r.factura, `242 en albaranes → 242 en factura, no 484: ${r.error}`);
  const despues = await S.riesgoCliente(u, { nombre: 'Cliente Uno', nif: '12345678Z' });
  assert.deepEqual([despues.riesgo, despues.deFacturas, despues.deAlbaranes], [242, 242, 0]);
  const otro = await A.guardarDoc(u, albaran()).catch((e) => e);
  assert.ok(otro instanceof F.RiesgoSuperado, '363 > 250');
});

test('albaranes: el listado y el detalle de clientes incluyen los albaranes sin facturar', async () => {
  const u = empresa();
  await ficha(u, { riesgoMax: '500' });
  await F.crearFactura(u, datos());
  await A.guardarDoc(u, albaran());
  const c = (await S.listarClientes(u)).find((x) => x.id === 'CLIENTE UNO');
  assert.deepEqual([c.riesgo, c.disponible], [242, 258]);
  const d = await S.detalleCliente(u, 'CLIENTE UNO');
  assert.deepEqual([d.cliente.riesgo, d.deFacturas, d.deAlbaranes, d.albaranes.length], [242, 121, 121, 1]);
  assert.equal((await S.riesgosPendientes(u)).get('CLIENTE UNO'), 242);
});
