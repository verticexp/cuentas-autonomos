// Modelo 232: declaración informativa de operaciones vinculadas y de operaciones con países o territorios calificados
// como paraísos fiscales (lib/modelos.js modelo232). Los límites son los del art. 2 de la Orden HFP/816/2017, que
// desarrolla el art. 13.4 del Reglamento del Impuesto sobre Sociedades, con las instrucciones de cumplimentación de la
// AEAT (págs. 1-2): 250.000 € con la misma vinculada, 100.000 € en operaciones específicas del mismo tipo y el 50 % de
// la cifra de negocios del período. La vinculación se marca en la ficha (lib/terceros.js), no se deduce de los datos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIMITE_232, LIMITE_232_ESPECIFICAS, PCT_232_CIFRA, TIPOS_OPERACION_232, esParaiso, modelo232, paraisosDe } from '../lib/modelos.js';
import { CAMPOS_FICHA, TIPOS_VINCULO, limpiarFicha } from '../lib/terceros.js';

const ANIO = 2026;
let n = 0;
// Factura de servicios a un cliente (sin líneas con producto del catálogo: va a «servicios»).
const fac = (base, { nombre = 'Socia S.L.', nif = 'B11111111', pais, fecha = `${ANIO}-03-10`, ...resto } = {}) =>
  ({ id: `f${++n}`, fecha, numero: ++n, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente: { nombre, nif, ...(pais ? { pais } : {}) }, base, ivaPct: 21, irpfPct: 0, ...resto });
const gas = (base, { nombre = 'Socia S.L.', nif = 'B11111111', concepto = 'Consultoría', pais, fecha = `${ANIO}-04-01`, ...resto } = {}) =>
  ({ id: `g${++n}`, fecha, actividad: 'a', proveedor: nombre, proveedorNif: nif, ...(pais ? { proveedorPais: pais } : {}), concepto, base, ivaPct: 21, ...resto });
const ficha = (extra = {}) => ({ id: 'SOCIA S.L.', nombre: 'Socia S.L.', nif: 'B11111111', vinculo: 'socio', ...extra });
const m232 = (facturas, gastos, opciones = {}) => modelo232(facturas, gastos, ANIO, { clientes: [ficha()], ...opciones });
const reglas = (r) => r.motivos.map((x) => x.regla).sort();

test('los límites son los de la Orden HFP/816/2017 y la lista de paraísos, la de la Orden HFP/115/2023', () => {
  assert.deepEqual([LIMITE_232, LIMITE_232_ESPECIFICAS, PCT_232_CIFRA], [250000, 100000, 50]);
  // Los que siguen en la lista lo son en cualquier ejercicio.
  for (const y of [2025, 2026, 2027, 2030]) assert.ok(esParaiso('KY', y) && esParaiso('vu', y) && esParaiso('JE', y), String(y));
  assert.equal(paraisosDe(2027).KY, 'Islas Caimán');
  // Ni Samoa ni Rusia: lo son solo «por lo que respecta al régimen fiscal perjudicial», no enteras (puntos 20 y 25),
  // así que una operación con una empresa de allí no entra sola en el cuadro III.
  for (const y of [2025, 2026, 2027, 2030]) assert.ok(!esParaiso('WS', y) && !esParaiso('RU', y), String(y));
  assert.ok(!esParaiso('', 2026) && !esParaiso(undefined, 2026) && !esParaiso('ES', 2026));
});

test('las bajas de la Orden HAC/649/2026 solo valen desde 2027 (su disposición transitoria única)', () => {
  // La orden entró en vigor el 28 de junio de 2026, pero manda aplicar la lista anterior a los tributos cuyo período
  // impositivo no hubiera concluido: el ejercicio 2026 de una sociedad con el año natural estaba abierto.
  const bajas = ['GI', 'BB', 'DM', 'SC', 'TT'];
  for (const p of bajas) {
    for (const y of [2023, 2025, 2026]) assert.ok(esParaiso(p, y), `${p} en ${y} todavía es paraíso`);
    for (const y of [2027, 2028]) assert.ok(!esParaiso(p, y), `${p} en ${y} ya no es paraíso`);
  }
  assert.deepEqual([paraisosDe(2026).GI, paraisosDe(2027).GI], ['Gibraltar', undefined]);
  // La lista de 2026 son los 18 que quedan más las 5 bajas; la de 2027, solo los 18.
  assert.deepEqual([Object.keys(paraisosDe(2026)).length, Object.keys(paraisosDe(2027)).length], [23, 18]);
});

test('una operación con Gibraltar entra en el cuadro III en 2026 y no en 2027', () => {
  const con = (anio, pais) => modelo232([{ fecha: `${anio}-05-10`, base: 1200, ivaPct: 0, cliente: { nombre: 'Rock Ltd', nif: 'GI1234567', pais } }], [], anio);
  const gi2026 = con(2026, 'GI');
  assert.deepEqual([gi2026.obligado, gi2026.paraisos.length, gi2026.paraisos[0].nombrePais], [true, 1, 'Gibraltar']);
  assert.deepEqual(gi2026.motivos.map((x) => x.regla), ['paraiso']);
  const gi2027 = con(2027, 'GI');
  assert.deepEqual([gi2027.obligado, gi2027.paraisos.length], [false, 0]);
  // Lo mismo con Seychelles, otra de las retiradas, en un gasto.
  const gasto = (anio) => modelo232([], [{ fecha: `${anio}-07-01`, base: 800, ivaPct: 0, proveedor: 'Victoria Ltd', proveedorNif: 'SC55555', proveedorPais: 'SC', concepto: 'Servicios' }], anio);
  assert.deepEqual([gasto(2026).obligado, gasto(2026).paraisos[0].nombrePais, gasto(2027).obligado], [true, 'Seychelles', false]);
  // Y uno que no se va de la lista entra en los dos ejercicios.
  assert.deepEqual([con(2026, 'KY').obligado, con(2027, 'KY').obligado], [true, true]);
});

test('límite de 250.000 € con la misma persona o entidad vinculada (art. 2.1.a)', () => {
  // Con un cliente ajeno de 1.000.000 € la cifra de negocios es alta y no se cruza el límite del 50 % (art. 2.3), que
  // se mira aparte: aquí solo se comprueba el de los 250.000 € con la misma vinculada.
  const ajeno = fac(1000000, { nombre: 'Cliente ajeno S.A.', nif: 'B99999990' });
  // 250.000 justos no obligan: el límite es «superar» esa cifra.
  const justo = m232([ajeno, fac(250000)], []);
  assert.equal(justo.obligado, false);
  assert.deepEqual([justo.terceros.length, justo.terceros[0].total, justo.terceros[0].supera250], [1, 250000, false]);
  // Un euro más, sí.
  const pasa = m232([ajeno, fac(250001)], []);
  assert.equal(pasa.obligado, true);
  assert.equal(pasa.terceros[0].supera250, true);
  assert.deepEqual(reglas(pasa), ['250000']);
});

test('ingresos y pagos suman para el límite, pero no se compensan entre sí (apartado A de las instrucciones)', () => {
  const r = m232([fac(200000)], [gas(60000)]);
  assert.deepEqual([r.terceros[0].ingresos, r.terceros[0].pagos, r.terceros[0].total], [200000, 60000, 260000]);
  assert.equal(r.terceros[0].supera250, true);
  // Dos registros del cuadro I: el mismo tipo de operación, uno de ingreso y otro de pago.
  assert.deepEqual(r.filas.map((x) => [x.tipo, x.lado, x.importe]), [['servicios', 'I', 200000], ['servicios', 'P', 60000]]);
});

test('varias operaciones del mismo tipo que juntas pasan del límite', () => {
  // Seis facturas de 45.000 (270.000 en total) con la misma vinculada: ninguna llega sola, el conjunto sí.
  const facturas = Array.from({ length: 6 }, (_, i) => fac(45000, { fecha: `${ANIO}-0${i + 1}-15` }));
  const r = m232(facturas, []);
  assert.equal(r.terceros[0].total, 270000);
  assert.equal(r.terceros[0].supera250, true);
  // Se agrupan en un solo registro por tipo y lado (el 232 agrupa por tipo de operación, no por factura).
  assert.deepEqual(r.filas.map((x) => [x.tipo, x.lado, x.importe]), [['servicios', 'I', 270000]]);
});

test('límite de 100.000 € en operaciones específicas del mismo tipo (art. 2.1.b)', () => {
  // Persona física en módulos con el 25 % o más (marcado en su ficha): todas sus operaciones son específicas.
  const modulos = { clientes: [ficha({ nombre: 'Juan Pérez', nif: '12345678Z', vinculo: 'socio', vinculoModulos: true })] };
  const quien = { nombre: 'Juan Pérez', nif: '12345678Z' };
  // 120.000 € de pagos: no llega a 250.000, pero pasa de los 100.000 de las específicas.
  const r = m232([], [gas(120000, quien)], modulos);
  assert.equal(r.obligado, true);
  assert.deepEqual(reglas(r), ['100000']);
  assert.equal(r.terceros[0].especifica, true);
  // Las específicas no cuentan para el límite de 250.000 (art. 2.1.a: «no operaciones específicas»).
  assert.equal(r.terceros[0].supera250, false);
  // Por debajo de 100.000 no hay obligación por esta regla.
  const poco = m232([], [gas(100000, quien)], modulos);
  assert.equal(poco.obligado, false);
  assert.deepEqual(poco.porTipo, [{ tipo: 'servicios', total: 100000, especificas: 100000, supera100: false, supera50: false }]);
});

test('las específicas se miran por tipo de operación en el conjunto del año, no con cada vinculada', () => {
  // Dos personas en módulos, 60.000 cada una en servicios: ninguna llega a 100.000, el conjunto del tipo sí (120.000).
  const clientes = [
    ficha({ id: 'A', nombre: 'Ana Gil', nif: '12345678Z', vinculoModulos: true }),
    ficha({ id: 'B', nombre: 'Luis Mas', nif: '87654321X', vinculoModulos: true }),
  ];
  const gastos = [gas(60000, { nombre: 'Ana Gil', nif: '12345678Z' }), gas(60000, { nombre: 'Luis Mas', nif: '87654321X' })];
  const r = modelo232([], gastos, ANIO, { clientes });
  assert.deepEqual(reglas(r), ['100000']);
  assert.equal(r.porTipo.find((x) => x.tipo === 'servicios').especificas, 120000);
  // Y reparte las operaciones por su clase: un alquiler (cuenta 621) no suma con los servicios.
  const conAlquiler = modelo232([], [gas(60000, { nombre: 'Ana Gil', nif: '12345678Z' }), gas(60000, { nombre: 'Luis Mas', nif: '87654321X', concepto: 'Alquiler del almacén' })], ANIO, { clientes });
  assert.equal(conAlquiler.obligado, false);
  assert.deepEqual(conAlquiler.porTipo.map((x) => [x.tipo, x.especificas]), [['servicios', 60000], ['alquileres', 60000]]);
});

test('límite del 50 % de la cifra de negocios del período (art. 2.3), sea cual sea el importe', () => {
  // Factura 100.000 en total (90.000 a un tercero no vinculado y 10.000 a la vinculada) y le paga 60.000: los pagos de
  // servicios son el 60 % de la cifra de negocios (100.000), así que hay que presentarlo aunque no llegue a 250.000.
  const facturas = [fac(90000, { nombre: 'Cliente ajeno S.A.', nif: 'B99999990' }), fac(10000)];
  const r = m232(facturas, [gas(60000)]);
  assert.deepEqual([r.incn, r.limite50], [100000, 50000]);
  assert.deepEqual(reglas(r), ['50']);
  assert.equal(r.terceros[0].supera250, false);
  // Justo el 50 % no obliga.
  const justo = m232(facturas, [gas(40000)]);
  assert.equal(justo.obligado, false);
  assert.equal(justo.porTipo.find((x) => x.tipo === 'servicios').supera50, false);
});

test('un tercero vinculado sin operaciones en el año no se declara, pero se enseña', () => {
  const r = m232([], []);
  assert.deepEqual([r.obligado, r.terceros.length, r.filas.length], [false, 0, 0]);
  assert.deepEqual(r.sinOperaciones, [{ nombre: 'Socia S.L.', nif: 'B11111111', vinculo: 'socio' }]);
  assert.equal(r.vinculadas, 1);
  // Y tampoco cuentan las operaciones de otros años.
  const otroAnio = m232([fac(300000, { fecha: `${ANIO - 1}-05-05` })], []);
  assert.deepEqual([otroAnio.obligado, otroAnio.terceros.length, otroAnio.sinOperaciones.length], [false, 0, 1]);
});

test('una ficha antigua no tiene el campo: no es vinculada y no rompe nada', () => {
  // Fichas como las de antes de esta pantalla (sin `vinculo`): sus operaciones no van al 232.
  const vieja = { id: 'SOCIA S.L.', nombre: 'Socia S.L.', nif: 'B11111111', formaCobro: 'transferencia', plazo: 30 };
  const r = modelo232([fac(400000)], [gas(300000)], ANIO, { clientes: [vieja] });
  assert.deepEqual([r.obligado, r.terceros.length, r.sinOperaciones.length, r.vinculadas], [false, 0, 0, 0]);
  // Y sin fichas de ninguna clase tampoco falla.
  assert.equal(modelo232([fac(400000)], [gas(300000)], ANIO).obligado, false);
  assert.equal(modelo232([], [], ANIO, { clientes: null, proveedores: null }).vinculadas, 0);
  // Un vínculo que no existe (dato viejo o estropeado) se ignora igual que si no estuviera.
  assert.equal(modelo232([fac(400000)], [], ANIO, { clientes: [ficha({ vinculo: 'inventado' })] }).vinculadas, 0);
});

test('la vinculación vale igual en la ficha del cliente y en la del proveedor, y suma en el mismo registro', () => {
  // Solo está marcada la ficha del proveedor: sus facturas de venta también entran, porque la identidad es el NIF.
  const r = modelo232([fac(200000)], [gas(60000)], ANIO, { proveedores: [ficha({ vinculo: 'grupo' })] });
  assert.equal(r.terceros.length, 1);
  assert.deepEqual([r.terceros[0].ingresos, r.terceros[0].pagos, r.terceros[0].letra], [200000, 60000, 'd']);
  // Marcada en las dos (cliente y proveedor), sigue siendo un solo registro: no se cuenta dos veces.
  const dos = modelo232([fac(200000)], [gas(60000)], ANIO, { clientes: [ficha()], proveedores: [ficha({ vinculo: 'grupo' })] });
  assert.deepEqual([dos.terceros.length, dos.terceros[0].total], [1, 260000]);
});

test('sin NIF se cruza por el nombre', () => {
  const sinNif = { id: 'ADMINISTRADOR', nombre: 'Administrador', nif: '', vinculo: 'administrador' };
  const r = modelo232([], [gas(300000, { nombre: 'administrador', nif: '' })], ANIO, { proveedores: [sinNif] });
  assert.deepEqual([r.terceros.length, r.terceros[0].total, r.terceros[0].letra], [1, 300000, 'b']);
});

test('cuadro III: cualquier operación con un paraíso fiscal obliga, vinculada o no y sea cual sea su importe', () => {
  // 500 € a un cliente de las Islas Caimán sin ninguna vinculación: hay que presentar el modelo.
  const r = modelo232([fac(500, { nombre: 'Offshore Ltd', nif: 'KY123456', pais: 'KY' })], [], ANIO);
  assert.deepEqual([r.obligado, reglas(r)], [true, ['paraiso']]);
  assert.deepEqual(r.paraisos, [{ nombre: 'Offshore Ltd', nif: 'KY123456', pais: 'KY', nombrePais: 'Islas Caimán', lado: 'I', importe: 500 }]);
  // El país puede venir de la ficha en lugar de la factura o el gasto.
  const porFicha = modelo232([], [gas(1000, { nombre: 'Jersey Corp', nif: 'JE98765' })], ANIO, { proveedores: [{ id: 'jersey corp', nombre: 'Jersey Corp', nif: 'JE98765', pais: 'JE' }] });
  assert.deepEqual([porFicha.obligado, porFicha.paraisos[0].nombrePais, porFicha.paraisos[0].lado], [true, 'Jersey', 'P']);
  // Un país normal no entra en el cuadro III.
  assert.equal(modelo232([fac(500000, { nombre: 'Lisboa Lda', nif: 'PT123456789', pais: 'PT' })], [], ANIO).obligado, false);
});

test('las nóminas y la Seguridad Social quedan fuera (art. 18.2.b: retribución del administrador por sus funciones)', () => {
  const quien = { nombre: 'Socia S.L.', nif: 'B11111111' };
  const r = m232([], [gas(300000, { ...quien, concepto: 'Nómina de marzo', nomina: true }), gas(300000, { ...quien, concepto: 'Seguridad Social' })]);
  assert.deepEqual([r.obligado, r.terceros.length], [false, 0]);
});

test('el tipo de operación sale de lo que la app sabe: bienes, servicios, alquileres e intereses', () => {
  const quien = { nombre: 'Socia S.L.', nif: 'B11111111' };
  const gastos = [gas(10000, { ...quien, concepto: 'Compra de mercancía' }), gas(20000, { ...quien, concepto: 'Consultoría' }),
    gas(30000, { ...quien, concepto: 'Alquiler de la nave' }), gas(40000, { ...quien, concepto: 'Intereses del préstamo' })];
  const r = m232([], gastos);
  assert.deepEqual(r.filas.map((x) => [x.tipo, x.importe]), [['bienes', 10000], ['servicios', 20000], ['alquileres', 30000], ['intereses', 40000]]);
  assert.deepEqual(Object.keys(TIPOS_OPERACION_232), ['bienes', 'servicios', 'alquileres', 'intereses']);
  // Una factura con un producto del catálogo es entrega de bienes; sin líneas, servicios. Y es la base, sin IVA.
  const conProducto = m232([fac(5000, { lineas: [{ concepto: 'Mesa', cantidad: 2, precio: 2500, ivaPct: 21, producto: 'abcdef123456' }] })], []);
  assert.deepEqual(conProducto.filas.map((x) => [x.tipo, x.importe]), [['bienes', 5000]]);
  // Una entrega de bienes a una empresa de la UE (clave E del 349) también es de bienes.
  const ue = m232([fac(5000, { nif: 'DE123456789', pais: 'DE', ivaPct: 0, operacion: 'intracomunitaria' })], []);
  assert.deepEqual(ue.filas.map((x) => x.tipo), ['bienes']);
});

test('la ficha guarda el tipo de vínculo, lo valida y las de antes siguen funcionando', () => {
  assert.ok(CAMPOS_FICHA.includes('vinculo') && CAMPOS_FICHA.includes('vinculoModulos'));
  // Las letras son las del art. 18.2 LIS: el administrador y el consejero comparten la b.
  assert.deepEqual(Object.entries(TIPOS_VINCULO).map(([k, v]) => [k, v.letra]),
    [['socio', 'a'], ['administrador', 'b'], ['consejero', 'b'], ['familiar', 'c'], ['grupo', 'd'], ['otra', '']]);
  const ok = limpiarFicha({ nombre: 'Socia S.L.', vinculo: 'grupo' });
  assert.deepEqual([ok.ok, ok.datos.vinculo, 'vinculoModulos' in ok.datos], [true, 'grupo', false]);
  // La casilla de módulos solo se guarda con un vínculo marcado.
  assert.equal(limpiarFicha({ nombre: 'X', vinculo: 'socio', vinculoModulos: true }).datos.vinculoModulos, true);
  assert.equal('vinculoModulos' in limpiarFicha({ nombre: 'X', vinculoModulos: true }).datos, false);
  // Sin marcar no hay campo: una ficha de siempre se guarda igual que antes.
  assert.equal('vinculo' in limpiarFicha({ nombre: 'X', formaCobro: 'transferencia' }).datos, false);
  const mal = limpiarFicha({ nombre: 'X', vinculo: 'cuñado' });
  assert.deepEqual([mal.ok, mal.errores.vinculo], [false, 'El tipo de vinculación no es válido']);
  // Vale igual en un proveedor.
  assert.equal(limpiarFicha({ nombre: 'Proveedora S.L.', vinculo: 'administrador' }, 'proveedor').datos.vinculo, 'administrador');
});
