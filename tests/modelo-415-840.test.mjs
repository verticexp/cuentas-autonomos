// Modelo 415 (operaciones con terceras personas de la Agencia Tributaria Canaria; Decreto 192/2000, modificado por el
// Decreto 81/2004, e instrucciones del modelo de la ATC) y modelo 840 (alta en el IAE; art. 82.1 del texto refundido de la
// Ley de Haciendas Locales y arts. 5 y 7 del Real Decreto 243/1995). Los umbrales son los de las normas, no los de la app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITE_347, LIMITE_415, exentoDel415, modelo347, modelo415 } from '../lib/modelos.js';
import { UMBRAL_IAE, incnEjercicio, modelo840 } from '../lib/iae.js';
import { limpiarFiscal, modelosDe } from '../lib/empresa.js';
import { plazosFiscales } from '../lib/avisos.js';

const ANIO = 2026;
let n = 0;
const fac = (base, { nombre = 'Cliente S.L.', nif = 'B35111111', fecha = `${ANIO}-03-10`, ivaPct = 7, ...resto } = {}) =>
  ({ id: `f${++n}`, fecha, numero: ++n, anio: Number(fecha.slice(0, 4)), actividad: 'a', impuesto: 'igic', cliente: { nombre, nif }, base, ivaPct, irpfPct: 0, ...resto });
const gas = (base, { nombre = 'Proveedor S.L.', nif = 'B38222222', fecha = `${ANIO}-04-01`, ivaPct = 7, ...resto } = {}) =>
  ({ id: `g${++n}`, fecha, actividad: 'a', impuesto: 'igic', proveedor: nombre, proveedorNif: nif, concepto: 'Servicio', base, ivaPct, ...resto });
const totales = (l) => l.map((o) => [o.nombre, o.total]);

// ---------- 415 ----------

test('415: el umbral es el del 347 (3.005,06 €, el IGIC incluido) y se mide por persona, ventas y compras por separado', () => {
  assert.equal(LIMITE_415, 3005.06);
  assert.equal(LIMITE_415, LIMITE_347);
  // 2.900 € de base al 5 % son 3.045 € con el IGIC: pasa aunque la base no llegue. Con 2.800 € (2.940 €) no.
  assert.deepEqual(totales(modelo415([fac(2900, { ivaPct: 5 })], [], ANIO).ventas), [['Cliente S.L.', 3045]]);
  assert.deepEqual(modelo415([fac(2800, { ivaPct: 5 })], [], ANIO).ventas, []);
  // «Superado» es estrictamente más: 3.005,06 € exactos no se declaran, 3.005,07 € sí (art. 2.Uno.1 del Decreto 192/2000).
  assert.deepEqual(modelo415([fac(3005.06, { ivaPct: 0 })], [], ANIO).ventas, []);
  assert.equal(modelo415([fac(3005.07, { ivaPct: 0 })], [], ANIO).ventas.length, 1);
  // Mismo tercero como cliente (2.000 €) y como proveedor (2.000 €): cada lado se mide aparte y ninguno llega.
  const mixto = modelo415([fac(2000, { ivaPct: 0 })], [gas(2000, { nif: 'B35111111', nombre: 'Cliente S.L.', ivaPct: 0 })], ANIO);
  assert.deepEqual([mixto.ventas.length, mixto.compras.length], [0, 0]);
  // Varias facturas a la misma persona se suman.
  assert.equal(modelo415([fac(1600, { ivaPct: 0 }), fac(1600, { ivaPct: 0, fecha: `${ANIO}-08-01` })], [], ANIO).ventas[0].total, 3200);
});

test('415: sin desglose por trimestres, a diferencia del 347', () => {
  const f = [fac(5000, { ivaPct: 0 })];
  assert.deepEqual(modelo347(f, [], ANIO).ventas[0].trimestres, [5000, 0, 0, 0]);
  const v = modelo415(f, [], ANIO).ventas[0];
  assert.equal('trimestres' in v, false);
  assert.equal(v.total, 5000);
});

test('415: entra lo que lleva retención y el alquiler del local, que el 347 deja a otras declaraciones', () => {
  const f = [fac(4000, { ivaPct: 0, irpfPct: 15, nombre: 'Estudio S.L.' })];
  const g = [gas(6000, { nombre: 'Casero', nif: '42111111A', alquiler: true, ivaPct: 7 })];
  // 347: la factura con retención va al 190 y el alquiler con retención al 180.
  assert.deepEqual([modelo347(f, g, ANIO).ventas.length, modelo347(f, g, ANIO).compras.length], [0, 0]);
  // 415: el Decreto no los excluye (art. 2.Uno.3). Importe: contraprestación más IGIC, sin restar la retención.
  const m = modelo415(f, g, ANIO);
  assert.deepEqual(totales(m.ventas), [['Estudio S.L.', 4000]]);
  assert.deepEqual(totales(m.compras), [['Casero', 6420]]);
});

test('415: cada operación cuenta el día de su factura (art. 4.1); el 347 la lleva a su devengo', () => {
  // Servicio de diciembre de 2026 facturado el 10 de enero de 2027: devengo en 2026, factura en 2027.
  const f = [fac(5000, { ivaPct: 0, fecha: '2027-01-10', evento: { fecha: '2026-12-20' } })];
  assert.equal(modelo347(f, [], 2026).ventas.length, 1);
  assert.equal(modelo415(f, [], 2026).ventas.length, 0);
  assert.equal(modelo415(f, [], 2027).ventas.length, 1);
});

test('415: fuera las exportaciones y lo no sujeto (servicios a otros países); el 347 sí declara los servicios a terceros países', () => {
  const eeuu = fac(9000, { ivaPct: 0, nombre: 'Acme Inc', nif: 'US123456789', operacion: 'servicios-fuera' });
  const peninsula = fac(9000, { ivaPct: 0, nombre: 'Península S.L.', nif: 'B28111111', operacion: 'exportacion' });
  const ue = fac(9000, { ivaPct: 0, nombre: 'Berlin GmbH', nif: 'DE123456789', operacion: 'servicios-ue' });
  assert.equal(modelo347([eeuu], [], ANIO).ventas.length, 1);
  assert.deepEqual(modelo415([eeuu, peninsula, ue], [], ANIO).ventas, []);
  // Una factura mixta: solo la parte gravada con IGIC (1.000 € + 70 €) cuenta; los 9.000 € de la línea sin impuesto, no.
  const mixta = fac(10000, { nombre: 'Mixta S.L.', ivaPct: 7, operacion: 'exportacion', lineas: [{ concepto: 'Local', cantidad: 1, precio: 1000, ivaPct: 7 }, { concepto: 'Envío', cantidad: 1, precio: 9000, ivaPct: 0 }] });
  assert.deepEqual(modelo415([mixta], [], ANIO).ventas, []);
  // Con la parte gravada por encima del umbral sí entra, y solo por esa parte.
  const mixta2 = { ...mixta, base: 13000, lineas: [{ concepto: 'Local', cantidad: 1, precio: 4000, ivaPct: 7 }, { concepto: 'Envío', cantidad: 1, precio: 9000, ivaPct: 0 }] };
  assert.deepEqual(totales(modelo415([mixta2], [], ANIO).ventas), [['Mixta S.L.', 4280]]);
});

test('415: tickets sin NIF, sueldos, impuestos, nóminas e importaciones no entran; la inversión del sujeto pasivo, por la contraprestación', () => {
  const ticket = fac(9000, { ivaPct: 7, nif: '', nombre: 'Mostrador', simplificada: true });
  const g = [
    gas(9000, { nombre: 'Aduana', importacion: true }),
    gas(9000, { nombre: 'Hacienda', categoria: '631' }),
    gas(9000, { nombre: 'Sueldo', nomina: true }),
    gas(4000, { nombre: 'Obra', nif: 'B35999999', isp: true, ivaPct: 7 }),
  ];
  const m = modelo415([ticket], g, ANIO);
  assert.deepEqual(m.ventas, []);
  // 4.000 € de contraprestación, sin los 280 € de cuota autorrepercutida, y sin el registro aparte del 347.
  assert.deepEqual(totales(m.compras), [['Obra', 4000]]);
  assert.equal(m.compras[0].isp, undefined);
});

test('415: ni el criterio de caja ni el efectivo de más de 6.000 € son cosas suyas', () => {
  const cobrada = fac(8000, { ivaPct: 0, pagos: [{ importe: 8000, fecha: `${ANIO}-05-01`, metodo: 'efectivo' }] });
  const v = modelo415([cobrada], [], ANIO).ventas[0];
  assert.equal(v.total, 8000);
  assert.equal(v.metalico, undefined);
  assert.equal(v.caja, undefined);
  // Un gasto marcado de caja (g.recc) no se parte en un registro aparte.
  const c = modelo415([], [gas(4000, { ivaPct: 7, recc: true })], ANIO).compras;
  assert.deepEqual(totales(c), [['Proveedor S.L.', 4280]]);
  assert.equal(c[0].caja, undefined);
});

test('415: solo lo tienen las empresas del IGIC; la persona física en el simplificado no lo presenta', () => {
  const ids = (f) => modelosDe(limpiarFiscal(f)).map((m) => m.id);
  assert.ok(ids({ tipo: 'sociedad', iva: 'general', territorio: 'canarias' }).includes('415'));
  assert.ok(ids({ tipo: 'autonomo', iva: 'general', territorio: 'canarias' }).includes('415'));
  // Fuera de Canarias, ni rastro.
  assert.ok(!ids({ tipo: 'sociedad', iva: 'general' }).includes('415'));
  assert.ok(!ids({ tipo: 'autonomo', iva: 'general' }).includes('415'));
  const m = Object.fromEntries(modelosDe(limpiarFiscal({ tipo: 'sociedad', iva: 'general', territorio: 'canarias' })).map((x) => [x.id, x]));
  assert.equal(m['415'].calcula, true);
  assert.equal(exentoDel415({ tipo: 'autonomo', iva: 'simplificado', territorio: 'canarias' }), true);
  assert.equal(exentoDel415({ tipo: 'autonomo', iva: 'general', territorio: 'canarias' }), false);
  assert.equal(exentoDel415({ tipo: 'sociedad', iva: 'general', territorio: 'canarias' }), false);
});

test('415: el calendario avisa del 415 junto al 347 solo en Canarias', () => {
  const texto = (fiscal) => plazosFiscales(fiscal, 2028).find((p) => /347/.test(p.texto))?.texto;
  assert.equal(texto({ tipo: 'sociedad', iva: 'general', territorio: 'canarias' }), '347 y 415 (si pasas de 3.005,06 € con alguien)');
  assert.equal(texto({ tipo: 'sociedad', iva: 'general' }), '347 (si pasas de 3.005,06 € con alguien)');
});

// ---------- 840 ----------

// Facturas de un ejercicio por un importe total (en dos para no depender de una sola).
const ventas = (y, total) => [{ id: `v${y}a`, fecha: `${y}-03-01`, base: total / 2 }, { id: `v${y}b`, fecha: `${y}-09-01`, base: total - total / 2 }];

test('840: exenta con menos de 1.000.000 €; con 1.000.000 € exactos o más, no', () => {
  assert.equal(UMBRAL_IAE, 1000000);
  const a = modelo840(ventas(2026, 999999.98), [], 2026);
  assert.deepEqual([a.incn, a.supera, a.situacion], [999999.98, false, 'exenta']);
  const b = modelo840(ventas(2026, 1000000), [], 2026);
  assert.deepEqual([b.incn, b.supera], [1000000, true]);
  const c = modelo840(ventas(2026, 1000000.02), [], 2026);
  assert.equal(c.supera, true);
  // Una sociedad que se queda a un céntimo del millón sigue exenta, pero la pantalla avisa de que está al filo.
  assert.equal(modelo840([{ fecha: '2026-05-01', base: 999999.99 }], [], 2026).cerca, true);
  assert.equal(modelo840(ventas(2026, 800000), [], 2026).cerca, false);
});

test('840: la cifra de 2026 decide el IAE de 2028 y el alta es de diciembre de 2027', () => {
  const m = modelo840([...ventas(2025, 400000), ...ventas(2026, 1500000)], [], 2026, { hoy: '2027-02-01' });
  assert.equal(m.situacion, 'alta');
  assert.equal(m.tributaDesde, 2028);
  assert.deepEqual(m.plazo, { desde: '2027-12-01', hasta: '2027-12-31' });
  assert.equal(m.anteriorSinDatos, false);
  // El plazo que acaba en domingo pasa al día hábil: el 31 de diciembre de 2028 es domingo y el 1 de enero, fiesta.
  assert.equal(modelo840(ventas(2027, 2000000), [], 2027, { hoy: '2028-02-01' }).plazo.hasta, '2029-01-02');
});

test('840: situaciones según la cifra del año y la del anterior', () => {
  const sit = (anterior, actual, extra = {}) => modelo840([...ventas(2025, anterior), ...ventas(2026, actual)], [], 2026, { hoy: '2027-02-01', ...extra }).situacion;
  assert.equal(sit(200000, 300000), 'exenta');
  assert.equal(sit(200000, 1200000), 'alta');
  assert.equal(sit(1100000, 1200000), 'sigue');
  assert.equal(sit(1100000, 300000), 'baja');
  // Sin nada en 2026 no se concluye.
  assert.equal(modelo840(ventas(2025, 5000000), [], 2026, { hoy: '2027-02-01' }).situacion, 'sin-datos');
  // Con el año sin acabar y por debajo del millón, de momento no hay nada que decir; por encima, el alta ya es segura.
  assert.equal(modelo840(ventas(2026, 300000), [], 2026, { hoy: '2026-11-01' }).situacion, 'en-curso');
  assert.equal(modelo840(ventas(2026, 1200000), [], 2026, { hoy: '2026-11-01' }).situacion, 'alta');
  // Sin datos del año anterior, el «alta» puede ser un «sigue»: la pantalla lo dice.
  const sinPrevio = modelo840(ventas(2026, 1200000), [], 2026, { hoy: '2027-02-01' });
  assert.deepEqual([sinPrevio.situacion, sinPrevio.anteriorSinDatos, sinPrevio.anterior], ['alta', true, null]);
  // Los gastos del año anterior bastan para saber que el año anterior sí tiene datos (aunque sin ventas).
  const soloGastos = modelo840(ventas(2026, 1200000), [{ fecha: '2025-06-01', base: 100 }], 2026, { hoy: '2027-02-01' });
  assert.deepEqual([soloGastos.anterior, soloGastos.anteriorSinDatos], [0, false]);
});

test('840: la cifra de negocios no cuenta las ventas de bienes de inversión y las rectificativas la bajan', () => {
  const f = [...ventas(2026, 900000), { fecha: '2026-06-01', base: 300000, accesoria: 'inversion' }];
  assert.equal(modelo840(f, [], 2026).incn, 900000);
  assert.equal(modelo840([...ventas(2026, 1100000), { fecha: '2026-12-01', base: -200000 }], [], 2026).supera, false);
  // Solo el año natural pedido.
  assert.equal(incnEjercicio([...ventas(2025, 700000), ...ventas(2026, 500000)], 2026).incn, 500000);
});

test('840: el ejercicio de la constitución, si duró menos de un año, se eleva al año (regla 2.ª del art. 82.1.c)', () => {
  // Constituida el 1 de julio de 2026: 184 días. 600.000 € en medio año son 1.190.217,39 € al año.
  const e = incnEjercicio(ventas(2026, 600000), 2026, '2026-07-01');
  assert.deepEqual([e.real, e.elevada, e.incn], [600000, true, 1190217.39]);
  assert.equal(modelo840(ventas(2026, 600000), [], 2026, { constitucion: '2026-07-01' }).supera, true);
  // Constituida el 1 de enero, el ejercicio es entero: no se eleva. Ni los ejercicios posteriores.
  assert.equal(incnEjercicio(ventas(2026, 600000), 2026, '2026-01-01').elevada, false);
  assert.equal(incnEjercicio(ventas(2027, 600000), 2027, '2026-07-01').elevada, false);
});

test('840: lo lleva la sociedad, no el autónomo, y Fisquo dice que lo calcula', () => {
  const ids = (f) => modelosDe(limpiarFiscal(f)).map((m) => m.id);
  assert.ok(ids({ tipo: 'sociedad' }).includes('840'));
  assert.ok(!ids({ tipo: 'autonomo' }).includes('840'));
  const m = modelosDe(limpiarFiscal({ tipo: 'sociedad' })).find((x) => x.id === '840');
  assert.equal(m.calcula, true);
  assert.match(m.cuando, /diciembre/);
});
