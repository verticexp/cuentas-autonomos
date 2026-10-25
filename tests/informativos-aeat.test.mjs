// Modelos informativos 347, 349, 190, 180 y 193 (y el 115) según los diseños de registro de la AEAT (ejercicio 2025) y las instrucciones
// de cada modelo. Los esperados están calculados a mano; la fuente, en el comentario de cada caso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303 } from '../lib/calculos.js';
import { SUBCLAVES_190, clave190De, importes, modelo115, modelo180, modelo190, modelo347, modelo349, retencionesProfesionales } from '../lib/modelos.js';
import { NATURALEZAS_C, NATURALEZAS_C_NOMBRES, clave193, limpiarPago, modelo193 } from '../lib/capitalMobiliario.js';
import { gastoEditado, nuevoGasto } from '../lib/gastoCuerpo.js';
import { conLoHabitual, habitualDeGastos } from '../lib/proveedorHabitual.js';

const fac = (id, fecha, base, ivaPct, cliente, extra = {}) => ({ id, fecha, base, ivaPct, cliente, ...extra });
const gas = (id, fecha, base, ivaPct, proveedor, proveedorNif, extra = {}) => ({ id, fecha, pagado: fecha, base, ivaPct, proveedor, proveedorNif, concepto: 'Material', ...extra });
const ANA = { nombre: 'Ana SL', nif: 'B12345674' };

// ---------- 347 ----------

test('347: fuera los tributos (631), los sueldos (640), la Seguridad Social (642) y las nóminas (art. 33.2.a RGAT)', () => {
  const G = [
    gas('ibi', '2026-03-01', 4000, 0, 'Ayuntamiento', 'P2807900B', { concepto: 'IBI del local' }),
    gas('tgss', '2026-03-02', 3500, 0, 'TGSS', 'Q2827003A', { concepto: 'Cuota de autónomos' }),
    gas('sueldo', '2026-03-03', 5000, 0, 'Eva', '12345678Z', { categoria: '640' }),
    gas('nom', '2026-03-31', 5000, 0, 'Nómina Eva', '12345678Z', { nomina: 'n1' }),
    gas('mat', '2026-03-04', 3000, 21, 'Almacén SL', 'B76543213'),
  ];
  const r = modelo347([], G, 2026);
  // Solo el material: 3.000 + 630 de IVA = 3.630.
  assert.deepEqual(r.compras.map((o) => [o.nombre, o.total]), [['Almacén SL', 3630]]);
});

test('347: el importe lleva el recargo de equivalencia y la compensación del REAGP (instrucciones, «Importe de las operaciones»)', () => {
  // Venta con recargo: 3.000 + 630 de IVA + 156 de recargo (5,2 %) = 3.786.
  const F = [fac('r', '2026-02-01', 3000, 21, ANA, { recargo: true })];
  // Compra a un agricultor del REAGP: 3.000 sin IVA + 12 % de compensación (360) = 3.360. Sin ella (3.000) no pasaría de 3.005,06.
  const G = [gas('agri', '2026-02-02', 3000, 0, 'Huerta Pepe', '12345678Z', { compensacion: 12 })];
  const r = modelo347(F, G, 2026);
  assert.equal(r.ventas[0].total, 3786);
  assert.equal(r.compras[0].total, 3360);
});

test('347: una simplificada con NIF del cliente se declara; sin él (cierre de caja, tique), no (art. 7.2 RD 1619/2012)', () => {
  const F = [
    fac('s1', '2026-04-01', 3000, 21, { nombre: 'Bar Pepe SL', nif: 'B12345674' }, { simplificada: true }),
    fac('z1', '2026-04-02', 9000, 21, undefined, { simplificada: true }),
  ];
  assert.deepEqual(modelo347(F, [], 2026).ventas.map((o) => [o.nombre, o.total]), [['Bar Pepe SL', 3630]]);
});

test('347: las ventas cuentan por la fecha del 303 (fechaIva): un servicio de diciembre facturado en enero va al 4T', () => {
  const F = [fac('e', '2027-01-05', 3000, 21, ANA, { evento: { fecha: '2026-12-20' } })];
  const r = modelo347(F, [], 2026);
  assert.deepEqual(r.ventas[0].trimestres, [0, 0, 0, 3630]);
  assert.equal(modelo347(F, [], 2027).ventas.length, 0);
});

test('347: cliente de la UE con IVA español: su NIF-IVA va como NIF de operador comunitario (posiciones 264-280)', () => {
  const F = [
    fac('fr', '2026-03-01', 3000, 21, { nombre: 'Paris SARL', nif: 'FR12345678901' }),
    // Con líneas sin IVA de servicios a la UE (van en el 349) y otras con IVA: en el 347, solo las de IVA: 3.000 + 630.
    fac('mix', '2026-03-02', 5000, 21, { nombre: 'Berlin GmbH', nif: 'DE123456789' }, { lineas: [{ cantidad: 1, precio: 2000, ivaPct: 0 }, { cantidad: 1, precio: 3000, ivaPct: 21 }] }),
  ];
  const r = modelo347(F, [], 2026);
  const fr = r.ventas.find((o) => o.nombre === 'Paris SARL');
  assert.deepEqual([fr.nif, fr.nifComunitario, fr.total], ['', 'FR12345678901', 3630]);
  assert.equal(r.ventas.find((o) => o.nombre === 'Berlin GmbH').total, 3630);
  assert.deepEqual(r.sinNif, []);
});

test('347: compras con inversión del sujeto pasivo en un registro aparte (posición 282)', () => {
  // IGIC con inversión del sujeto pasivo (g.isp): 4.000 + 7 % = 4.280; otra compra normal al mismo proveedor, 1.000 + 210.
  const G = [
    gas('isp', '2026-05-01', 4000, 7, 'Obras Canarias SL', 'B76543213', { impuesto: 'igic', isp: true }),
    gas('n', '2026-05-02', 1000, 21, 'Obras Canarias SL', 'B76543213'),
  ];
  const r = modelo347([], G, 2026);
  // Los dos registros se declaran: el proveedor pasa de 3.005,06 € con la suma (5.490).
  assert.deepEqual(r.compras.map((o) => [o.isp ?? false, o.total]), [[true, 4280], [false, 1210]]);
});

test('347: criterio de caja en un registro aparte y solo anual, con lo devengado al cobrar (FAQ del 347, ejemplo de los 4.000 €)', () => {
  const recc = { desde: '2026-01-01' };
  // Factura de febrero de 4.840 € (4.000 + 840) con 3.025 € cobrados en noviembre (el 62,5 %) y el resto en marzo de 2027.
  const F = [fac('c', '2026-02-10', 4000, 21, ANA, { pagos: [{ fecha: '2026-11-10', importe: 3025 }, { fecha: '2027-03-01', importe: 1815 }] })];
  const r = modelo347(F, [], 2026, { recc });
  assert.equal(r.soloAnual, true);
  assert.deepEqual(r.ventas, [{ clave: 'B', nif: 'B12345674', nombre: 'Ana SL', caja: true, importeCaja: 3025, total: 4840 }]);
  // En 2027: nada por la regla general y 1.815 devengados al cobrar; se declara porque la operación pasó del límite en 2026.
  assert.deepEqual(modelo347(F, [], 2027, { recc }).ventas.map((o) => [o.total, o.importeCaja]), [[0, 1815]]);
  // Gasto de un proveedor en el criterio de caja (g.recc), sin la empresa en él: registro aparte; el resto con trimestres.
  const G = [gas('p', '2026-06-01', 3000, 21, 'Caja SL', 'B76543213', { recc: true, pagado: '2026-07-01' }), gas('q', '2026-06-02', 3000, 21, 'Otro SL', 'A58818501')];
  const r2 = modelo347([], G, 2026);
  assert.equal(r2.soloAnual, false);
  assert.deepEqual(r2.compras.map((o) => [o.nombre, o.caja ?? false, o.importeCaja ?? null, o.trimestres ?? null]), [['Caja SL', true, 3630, null], ['Otro SL', false, null, [0, 3630, 0, 0]]]);
});

test('347: cobros en efectivo de más de 6.000 € de un cliente, con el ejercicio de sus facturas (posiciones 101-115 y 132-135)', () => {
  const F = [
    // 3.630 cobrados en efectivo y 3.630 cobrados a mano en una factura que se cobra en efectivo: 7.260 > 6.000.
    fac('m1', '2026-03-01', 3000, 21, ANA, { pagos: [{ fecha: '2026-03-01', importe: 3630, metodo: 'efectivo' }] }),
    fac('m2', '2026-04-01', 3000, 21, ANA, { formaCobro: 'efectivo', cobrada: true, cobro: { fecha: '2026-04-02', metodo: 'manual' } }),
    // Otro cliente: 5.000 en efectivo (no pasa de 6.000) y el resto por el banco.
    fac('m3', '2026-05-01', 5000, 21, { nombre: 'Luis SL', nif: 'A58818501' }, { pagos: [{ fecha: '2026-05-01', importe: 5000, metodo: 'efectivo' }, { fecha: '2026-05-02', importe: 1050, metodo: 'banco' }] }),
    // Factura de 2025 (7.260) cobrada en efectivo en enero de 2026: registro aparte, ejercicio 2025, sin importe de 2026.
    fac('m4', '2025-12-20', 6000, 21, { nombre: 'Rosa SL', nif: 'B87654321' }, { pagos: [{ fecha: '2026-01-10', importe: 7260, metodo: 'metalico' }] }),
  ];
  const r = modelo347(F, [], 2026);
  const de = (n) => r.ventas.filter((o) => o.nombre === n).map((o) => [o.total, o.metalico ?? 0, o.ejercicioMetalico ?? null]);
  assert.deepEqual(de('Ana SL'), [[7260, 7260, 2026]]);
  assert.deepEqual(de('Luis SL'), [[6050, 0, null]]);
  assert.deepEqual(de('Rosa SL'), [[0, 7260, 2025]]);
});

// ---------- 349 ----------

test('349: sin lo que el REAV o el REBU dejan fuera de la base (fueraBase), como en la casilla 59 del 303', () => {
  // Agencia de viajes a una empresa alemana: una línea de 1.000 € con 800 de coste (margen 200 al 21 %: base 165,29) y otra
  // de 500 € sin IVA. Fuera de la base quedan 800. Al 349 (y a la 59) solo van los 500.
  const F = [fac('v', '2026-02-01', 1500, 21, { nombre: 'Reise GmbH', nif: 'DE123456789' }, { margen: 'reav', operacion: 'servicios-ue', lineas: [{ cantidad: 1, precio: 1000, coste: 800, ivaPct: 21 }, { cantidad: 1, precio: 500, coste: 0, ivaPct: 0 }] })];
  assert.equal(modelo349(F, 2026, 1).total, 500);
  assert.equal(casillas303(F, [], 2026, 1)['59'], 500);
});

test('349: una rectificativa de un periodo ya declarado va como rectificación; del mismo periodo, se neta (diseño, posiciones 147-178)', () => {
  const DE = { nombre: 'Berlin GmbH', nif: 'DE123456789' }, FR = { nombre: 'Paris SARL', nif: 'FR12345678901' };
  const F = [
    fac('f1', '2026-02-10', 1000, 0, DE),
    fac('f2', '2026-04-15', 2000, 0, DE),
    fac('r1', '2026-05-10', -300, 0, DE, { rectifica: { id: 'f1', fecha: '2026-02-10' } }),
    fac('f3', '2026-07-01', 500, 0, FR),
    fac('r3', '2026-08-01', -100, 0, FR, { rectifica: { id: 'f3', fecha: '2026-07-01' } }),
    fac('r1b', '2026-08-15', -200, 0, DE, { rectifica: { id: 'f1', fecha: '2026-02-10' } }),
  ];
  // Abono de un proveedor irlandés sin la factura que corrige: no puede dejar la base en negativo.
  const G = [gas('ab', '2026-11-05', -50, 0, 'Dublin Ltd', 'IE6388047V', { concepto: 'Abono de la suscripción de software' })];
  assert.deepEqual(modelo349(F, 2026, 1, G).operadores.map((o) => [o.nif, o.base]), [['DE123456789', 1000]]);
  const q2 = modelo349(F, 2026, 2, G);
  // 2T: los 2.000 de f2 (los −300 no restan aquí) y la rectificación del 1T: de 1.000 declarados a 700.
  assert.deepEqual(q2.operadores.map((o) => [o.nif, o.base]), [['DE123456789', 2000]]);
  assert.deepEqual(q2.rectificaciones, [{ nif: 'DE123456789', nombre: 'Berlin GmbH', clave: 'S', ejercicio: 2026, periodo: '1T', base: 700, anterior: 1000 }]);
  assert.equal(q2.totalRectificaciones, 700);
  const q3 = modelo349(F, 2026, 3, G);
  // 3T: la de Paris se neta (500 − 100 = 400); la segunda rectificativa de f1 deja el 1T en 500 (antes, 700).
  assert.deepEqual(q3.operadores.map((o) => [o.nif, o.base]), [['FR12345678901', 400]]);
  assert.deepEqual(q3.rectificaciones.map((r) => [r.periodo, r.base, r.anterior]), [['1T', 500, 700]]);
  const q4 = modelo349(F, 2026, 4, G);
  assert.deepEqual(q4.operadores, []);
  assert.deepEqual(q4.negativos.map((o) => [o.nif, o.clave, o.base]), [['IE6388047V', 'I', -50]]);
});

test('349: mensual si las entregas y servicios pasan de 50.000 € en el trimestre o en alguno de los cuatro anteriores (art. 81 RIVA)', () => {
  const DE = { nombre: 'Berlin GmbH', nif: 'DE123456789' };
  const F = [
    // 1T 2026: 20.000 en enero, 25.000 en febrero (45.000) y 10.000 en marzo (55.000): se pasa a final de marzo.
    fac('e1', '2026-01-20', 20000, 0, DE, { operacion: 'intracomunitaria' }),
    fac('e2', '2026-02-20', 25000, 0, DE, { operacion: 'intracomunitaria' }),
    fac('e3', '2026-03-20', 10000, 0, DE, { operacion: 'intracomunitaria' }),
    fac('e4', '2026-04-20', 1000, 0, DE, { operacion: 'intracomunitaria' }),
    // Rectificativa en mayo de la de febrero: corrige la declaración mensual de marzo (enero a marzo), de 55.000 a 50.000.
    fac('e5', '2026-05-05', -5000, 0, DE, { operacion: 'intracomunitaria', rectifica: { id: 'e2', fecha: '2026-02-20' } }),
  ];
  assert.equal(modelo349(F, 2026, 1).mensual, '2026-03');
  // 2T 2026: el 1T pasó de 50.000: mensual desde abril. La rectificación, del periodo 03 (la declaración de enero a marzo).
  const q2 = modelo349(F, 2026, 2);
  assert.equal(q2.mensual, '2026-04');
  assert.deepEqual(q2.rectificaciones.map((r) => [r.clave, r.ejercicio, r.periodo, r.base, r.anterior]), [['E', 2026, '03', 50000, 55000]]);
  // 1T 2027: el 1T de 2026 aún está entre los cuatro anteriores; en el 2T de 2027 ya no.
  assert.equal(modelo349(F, 2027, 1).mensual, '2027-01');
  assert.equal(modelo349(F, 2027, 2).mensual, null);
  // Las compras (claves A e I) no cuentan: 60.000 de servicios de Irlanda siguen siendo trimestrales.
  assert.equal(modelo349([], 2026, 1, [gas('ie', '2026-02-01', 60000, 0, 'Dublin Ltd', 'IE6388047V')]).mensual, null);
});

// ---------- 190 ----------

test('190: clave E de consejeros y administradores con su subclave, y gastos deducibles en la A, la E.01 y la E.02', () => {
  const nom = (empleado, mes, bruto, irpf, ssTrabajador) => ({ empleado, mes, importes: { bruto, irpf, ssTrabajador, ssEmpresa: 0 } });
  const E = [
    { id: 'a1', nombre: 'Asimilado', nif: '11111111H', cotizacion: { administrador: 'asimilado' } },
    { id: 'a2', nombre: 'Asimilado pequeña', nif: '22222222J', cotizacion: { administrador: 'asimilado', pequena: true } },
    { id: 'a3', nombre: 'Autónomo pequeña', nif: '33333333P', cotizacion: { administrador: 'autonomo', pequena: true } },
    { id: 'a4', nombre: 'Autónomo', nif: '44444444A', cotizacion: { administrador: 'autonomo' } },
  ];
  const N = [nom('a1', '2026-01', 4000, 1400, 190), nom('a1', '2026-02', 4000, 1400, 190), nom('a2', '2026-01', 3000, 570, 140), nom('a3', '2026-01', 3000, 570, 0), nom('a4', '2026-01', 5000, 1750, 0)];
  const r = modelo190(N, E, 2026);
  assert.deepEqual(r.perceptores.map((p) => [p.nombre, `${p.clave}${p.subclave}`, p.percepciones, p.retenciones, p.gastosDeducibles ?? null]), [
    ['Asimilado', 'E01', 8000, 2800, 380],
    ['Asimilado pequeña', 'E02', 3000, 570, 140],
    ['Autónomo pequeña', 'E03', 3000, 570, null],
    ['Autónomo', 'E04', 5000, 1750, null],
  ]);
});

test('190: clave A con los datos adicionales del 145 (posiciones 153-254) y la Seguridad Social como gasto deducible', () => {
  const e = { id: 't', nombre: 'Eva Gil', nif: '12345678Z', datos145: {
    nacimiento: 1985, situacionFamiliar: 2, nifConyuge: '87654321X', discapacidad: '33a65', movilidadReducida: true, contrato: 'inferiorAnio', movilidadGeografica: false,
    descendientes: [
      { nacimiento: 2025, discapacidad: 'no', porEntero: true }, // 1 año: menor de 3
      { nacimiento: 2015, discapacidad: 'no', porEntero: false }, // 11 años: resto
      { nacimiento: 1990, discapacidad: 'no', porEntero: true }, // 36 años sin discapacidad: sin derecho al mínimo
      { nacimiento: 2018, adopcion: 2024, discapacidad: 'no', porEntero: true }, // adoptado hace 2 años: cuenta como menor de 3
    ] } };
  const N = [{ empleado: 't', mes: '2026-01', importes: { bruto: 2000, irpf: 200, ssTrabajador: 130, ssEmpresa: 0 } }, { empleado: 't', mes: '2026-02', importes: { bruto: 2000, irpf: 200, ssTrabajador: 130, ssEmpresa: 0 } }];
  const [p] = modelo190(N, [e], 2026).perceptores;
  assert.deepEqual(p, {
    nombre: 'Eva Gil', nif: '12345678Z', clave: 'A', subclave: '', percepciones: 4000, retenciones: 400, gastosDeducibles: 260,
    nacimiento: 1985, situacionFamiliar: 2, nifConyuge: '87654321X', discapacidad: 2, contrato: 2, movilidad: 0,
    hijos: { menores3: { total: 2, porEntero: 2 }, resto: { total: 1, porEntero: 0 } },
  });
  // Sin el 145: contrato general (1) y nada más.
  assert.equal(modelo190(N, [{ id: 't', nombre: 'Eva', nif: '12345678Z' }], 2026).perceptores[0].contrato, 1);
});

test('190: subclaves G, H e I de los gastos con retención: la elegida (clave190) si es de ese %, o la que toca al %', () => {
  const g = (proveedor, irpfPct, clave190) => gas(proveedor, '2026-03-01', 1000, 21, proveedor, '', { irpfPct, ...(clave190 ? { clave190 } : {}) });
  const G = [g('Gestoría', 15), g('Corredor', 7, 'G02'), g('Joven', 7), g('Carpintería', 1), g('Monte', 2, 'H03'), g('Granja', 2, 'G01')];
  assert.deepEqual(modelo190([], [], 2026, G).perceptores.map((p) => [p.nombre, `${p.clave}${p.subclave}`]),
    [['Gestoría', 'G01'], ['Corredor', 'G02'], ['Joven', 'G03'], ['Carpintería', 'H04'], ['Monte', 'H03'], ['Granja', 'H01']]);
  assert.equal(clave190De({ irpfPct: 19 }), 'I03');
  // Los % de las subclaves son los que admite un gasto (lib/validacion.js validarGasto).
  assert.ok(Object.values(SUBCLAVES_190).every((s) => [1, 2, 7, 15, 19, 24].includes(s.pct)));
});

test('190: el gasto guarda clave190 solo con retención de ese %, fuera del alquiler, y se recuerda por proveedor', () => {
  const u = { actividades: [{ id: 'a', nombre: 'Tienda' }], fiscal: { tipo: 'autonomo', iva: 'general' } };
  const b = { fecha: '2026-05-03', actividad: 'a', concepto: 'Seguro', proveedor: 'Corredor', base: '1000', ivaPct: 21, irpfPct: 7, clave190: 'G02' };
  assert.equal(nuevoGasto(u, b).gasto.clave190, 'G02');
  assert.equal(nuevoGasto(u, { ...b, irpfPct: 15 }).gasto.clave190, undefined);
  assert.equal(nuevoGasto(u, { ...b, irpfPct: 0 }).gasto.clave190, undefined);
  assert.equal(nuevoGasto(u, { ...b, clave190: 'X99' }).gasto.clave190, undefined);
  const { gasto } = nuevoGasto(u, b);
  assert.equal(gastoEditado(u, { ...b, irpfPct: 15 }, gasto).gasto.clave190, undefined);
  const h = habitualDeGastos([gasto]);
  assert.equal(h.clave190, 'G02');
  assert.equal(conLoHabitual({ irpfPct: null }, h).clave190, 'G02');
  assert.equal(conLoHabitual({ irpfPct: 15 }, h).clave190, undefined);
});

// ---------- 193 ----------

test('193: clave y naturaleza por perceptor (diseño, posiciones 92-94): dividendos A.02 o A.08, intereses B.03, otros C', () => {
  const p = (tipo, nombre, nif, retencionPct, extra = {}) => limpiarPago({ fecha: '2026-06-30', tipo, perceptor: { nombre, nif }, bruto: 1000, retencionPct, ...extra });
  const pagos = [
    p('dividendos', 'Ana', '12345678Z', 19),
    p('dividendos', 'Matriz SL', 'B12345674', 0), // sociedad sin retención (art. 61 RIS): A.08
    p('dividendos', 'Matriz SL', 'B12345674', 19), // sociedad con retención: A.02
    p('dividendos', 'Luis', '87654321X', 0), // persona física sin retención: sigue siendo A.02
    p('intereses', 'Ana', '12345678Z', 19),
    p('otros', 'Ana', '12345678Z', 19, { naturaleza: '04' }),
    p('otros', 'Ana', '12345678Z', 19),
    p('otros', 'Matriz SL', 'B12345674', 19),
  ];
  assert.deepEqual(modelo193(pagos, 2026).perceptores.map((x) => [x.nombre, x.clave, x.naturaleza, x.base]), [
    ['Ana', 'A', '02', 1000], ['Ana', 'B', '03', 1000], ['Ana', 'C', '04', 1000], ['Ana', 'C', '12', 1000],
    ['Luis', 'A', '02', 1000],
    ['Matriz SL', 'A', '08', 1000], ['Matriz SL', 'A', '02', 1000], ['Matriz SL', 'C', '14', 1000],
  ]);
  // La naturaleza solo se guarda en «otros» y si es una de la clave C (01 a 15).
  assert.equal(p('intereses', 'Ana', '12345678Z', 19, { naturaleza: '04' }).naturaleza, undefined);
  assert.equal(p('otros', 'Ana', '12345678Z', 19, { naturaleza: '99' }).naturaleza, undefined);
  assert.deepEqual(clave193({ tipo: 'intereses', perceptor: { nif: 'B12345674' } }), { clave: 'B', naturaleza: '03' });
});

test('193: clave D, intereses del préstamo de un socio vinculado por el exceso sobre el triple de su parte (art. 46.a LIRPF)', () => {
  const p = (extra = {}) => limpiarPago({ fecha: '2026-12-31', tipo: 'intereses', perceptor: { nombre: 'Socio', nif: '12345678Z' }, bruto: '2.000', retencionPct: 19, ...extra });
  // 2.000 de intereses, 500 del exceso: D.03 con 500 y 95 de retención (19 %); B.03 con 1.500 y 380 − 95 = 285.
  const v = p({ vinculado: true, exceso: '500' });
  assert.deepEqual([v.vinculado, v.exceso, v.retencion], [true, 500, 380]);
  const m = modelo193([v], 2026);
  assert.deepEqual(m.perceptores.map((x) => [x.clave, x.naturaleza, x.base, x.retenciones]), [['B', '03', 1500, 285], ['D', '03', 500, 95]]);
  assert.deepEqual([m.base, m.retenciones], [2000, 380]);
  // Todo del exceso: solo D. Sin exceso (no pasa del triple): solo B. Sin marcar: B, como siempre.
  assert.deepEqual(modelo193([p({ vinculado: true, exceso: 2000 })], 2026).perceptores.map((x) => [x.clave, x.base, x.retenciones]), [['D', 2000, 380]]);
  assert.deepEqual(modelo193([p({ vinculado: true, exceso: '' })], 2026).perceptores.map((x) => [x.clave, x.base]), [['B', 2000]]);
  assert.equal(p().vinculado, undefined);
  // Solo en intereses y con el socio persona física (la clave D es de contribuyentes del IRPF); el exceso, de 0 al bruto.
  assert.equal(limpiarPago({ fecha: '2026-12-31', tipo: 'otros', perceptor: { nombre: 'Socio', nif: '12345678Z' }, bruto: 100, vinculado: true, exceso: 50 }).vinculado, undefined);
  assert.match(p({ vinculado: true, exceso: 10, perceptor: { nombre: 'Matriz SL', nif: 'B12345674' } }).error, /persona física/);
  assert.match(p({ vinculado: true, exceso: '2000,01' }).error, /no pueden pasar del bruto/);
  assert.match(p({ vinculado: true, exceso: '-1' }).error, /0 o más/);
});

test('193: naturalezas de la clave C del diseño (posiciones 93-94), de la 01 a la 15, con nombre para el formulario', () => {
  assert.deepEqual(NATURALEZAS_C, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15']);
  assert.ok(NATURALEZAS_C.every((k) => NATURALEZAS_C_NOMBRES[k].length > 5));
});

// ---------- 190 y 111: rentas del art. 75.2.b RIRPF ----------

test('190 clave I y 111 (casillas 07-09): gastos con el 19 % o el 24 % fuera del alquiler del local (art. 75.2.b y 101.2 RIRPF)', () => {
  const u = { actividades: [{ id: 'a', nombre: 'Tienda' }], fiscal: { tipo: 'autonomo', iva: 'general' } };
  const b = { fecha: '2026-05-03', actividad: 'a', concepto: 'Alquiler de la carretilla', proveedor: 'Maquinaria SL', proveedorNif: 'B76543213', base: '1000', ivaPct: 21, irpfPct: 19 };
  const maquina = nuevoGasto(u, b).gasto;
  assert.equal(maquina.irpfPct, 19);
  // 1.000 de base: 190 de retención; total 1.000 + 210 − 190 = 1.020.
  assert.deepEqual([importes(maquina).irpf, importes(maquina).total], [190, 1020]);
  const imagen = nuevoGasto(u, { ...b, proveedor: 'Modelo', proveedorNif: '12345678Z', concepto: 'Derechos de imagen', irpfPct: 24 }).gasto;
  const autor = nuevoGasto(u, { ...b, proveedor: 'Autora', proveedorNif: '87654321X', concepto: 'Derechos de autor', irpfPct: 15, clave190: 'I02' }).gasto;
  const G = [maquina, imagen, autor].map((g) => ({ ...g, pagado: g.fecha }));
  assert.deepEqual(modelo190([], [], 2026, G).perceptores.map((x) => [x.nombre, `${x.clave}${x.subclave}`, x.percepciones, x.retenciones]),
    [['Maquinaria SL', 'I03', 1000, 190], ['Modelo', 'I01', 1000, 240], ['Autora', 'I02', 1000, 150]]);
  // En el 111, con las actividades económicas (instrucciones del 111: «cuando deriven de una actividad económica
  // desarrollada por su perceptor»): 3 perceptores, 3.000 de base y 580 de retenciones. Nada en el 115.
  assert.deepEqual(retencionesProfesionales(G, 2026, 2), { perceptores: 3, base: 3000, retenciones: 580 });
  assert.equal(modelo115(G, 2026, 2).base, 0);
  // El 19 % o el 24 % no van con el alquiler del local (lleva su 19 % o ninguna); otros % siguen sin admitirse.
  assert.match(nuevoGasto(u, { ...b, alquiler: true }).error, /alquiler del local ya lleva/);
  assert.match(nuevoGasto(u, { ...b, irpfPct: 21 }).error, /1, 2, 7, 15, 19 o 24/);
});

// ---------- 115, 180 y 347: alquiler del local por inmueble y sin retención ----------

test('115 y 180 por arrendador e inmueble (diseño del 180, posiciones 114-134); sin retención, al 347 como arrendamiento', () => {
  const REF = '9872023VH5797S0001WX';
  const G = [
    gas('a1', '2026-01-05', 1000, 21, 'Locales SL', 'B12345674', { alquiler: true, inmueble: { situacion: 1, refCatastral: REF } }),
    gas('a2', '2026-02-05', 1000, 21, 'Locales SL', 'B12345674', { alquiler: true, inmueble: { situacion: 1, refCatastral: REF } }),
    gas('a3', '2026-02-05', 500, 21, 'Locales SL', 'B12345674', { alquiler: true, inmueble: { situacion: 4 } }),
    // Sin retención (epígrafe 861 con cuota, art. 75.3.h.3.º RIRPF): ni 115 ni 180; al 347 con la marca de la posición 100.
    gas('s1', '2026-03-01', 3000, 21, 'Rentas Luis', '87654321X', { alquilerSinRetencion: 'epigrafe861', inmueble: { situacion: 2, refCatastral: REF } }),
    gas('s2', '2026-06-01', 3000, 21, 'Rentas Luis', '87654321X', { alquilerSinRetencion: 'epigrafe861' }),
  ];
  // 115 del 1T: 2.500 de base y el 19 %: 190 + 190 + 95 = 475, un perceptor.
  assert.deepEqual(modelo115(G, 2026, 1), { perceptores: 1, base: 2500, retenciones: 475 });
  // 180: un registro por inmueble del mismo arrendador.
  assert.deepEqual(modelo180(G, 2026), {
    arrendadores: [
      { nombre: 'Locales SL', nif: 'B12345674', situacion: 1, refCatastral: REF, base: 2000, retenciones: 380 },
      { nombre: 'Locales SL', nif: 'B12345674', situacion: 4, base: 500, retenciones: 95 },
    ],
    base: 2500, retenciones: 475,
  });
  // Sin retención, importes() no retiene: 3.000 + 630 = 3.630 por recibo.
  assert.deepEqual([importes(G[3]).irpf, importes(G[3]).total], [0, 3630]);
  // 347: Locales SL fuera (va en el 180); Rentas Luis, 7.260, en el 1T y el 2T, con la marca de arrendamiento.
  const r = modelo347([], G, 2026);
  assert.deepEqual(r.compras.map((o) => [o.nombre, o.total, o.trimestres, o.arrendamiento ?? false]), [['Rentas Luis', 7260, [3630, 3630, 0, 0], true]]);
});

test('alquiler del local sin retención e inmueble: lo que guarda el gasto y lo que no admite', () => {
  const u = { actividades: [{ id: 'a', nombre: 'Tienda' }], fiscal: { tipo: 'autonomo', iva: 'general' } };
  const b = { fecha: '2026-05-03', actividad: 'a', concepto: 'Alquiler del local', proveedor: 'Rentas Luis', proveedorNif: '87654321X', base: '60', ivaPct: 21 };
  const g = nuevoGasto(u, { ...b, alquilerSinRetencion: 'menos900', inmueble: { situacion: '1', refCatastral: '9872023 vh5797s 0001wx' } }).gasto;
  assert.deepEqual([g.alquiler, g.alquilerSinRetencion, g.inmueble], [undefined, 'menos900', { situacion: 1, refCatastral: '9872023VH5797S0001WX' }]);
  // Con retención, el inmueble sin referencia (situación 4); en un gasto que no es alquiler, el inmueble no se guarda.
  assert.deepEqual(nuevoGasto(u, { ...b, alquiler: true, inmueble: { situacion: 4 } }).gasto.inmueble, { situacion: 4 });
  assert.equal(nuevoGasto(u, { ...b, inmueble: { situacion: 4 } }).gasto.inmueble, undefined);
  // Al editar, quitar la marca la quita.
  assert.equal(gastoEditado(u, b, g).gasto.alquilerSinRetencion, undefined);
  for (const [extra, texto] of [
    [{ alquiler: true, alquilerSinRetencion: 'menos900' }, /una de las dos/],
    [{ alquilerSinRetencion: 'porque sí' }, /por qué el alquiler/],
    [{ alquilerSinRetencion: 'menos900', irpfPct: 15 }, /no lleva retención/],
    [{ alquiler: true, inmueble: { situacion: 1, refCatastral: '1234' } }, /20 letras y números/],
    [{ alquiler: true, inmueble: { situacion: 5 } }, /dónde está el inmueble/],
    [{ alquiler: true, inmueble: { situacion: 4, refCatastral: '9872023VH5797S0001WX' } }, /en blanco/],
  ]) assert.match(nuevoGasto(u, { ...b, ...extra }).error, texto, JSON.stringify(extra));
  // Lo habitual del proveedor recuerda la causa y el inmueble; si la nueva factura ya dice «alquiler», manda ella.
  const h = habitualDeGastos([g]);
  assert.deepEqual([h.alquilerSinRetencion, h.inmueble.situacion], ['menos900', 1]);
  assert.equal(conLoHabitual({}, h).alquilerSinRetencion, 'menos900');
  assert.equal(conLoHabitual({ alquiler: true }, h).alquilerSinRetencion, undefined);
});

test('349 mensual: el trimestre en que se pasa de 50.000 € se parte en la declaración hasta ese mes y una por mes', async () => {
  const { periodos349 } = await import('../lib/modelos.js');
  const ue = (id, fecha, base) => ({ id, fecha, actividad: 'a', cliente: { nombre: 'Berlin GmbH', nif: 'DE123456789' }, base, ivaPct: 0, irpfPct: 0, operacion: 'servicios-ue' });
  // 30.000 en abril y 30.000 en mayo: se superan los 50.000 € en mayo.
  const F = [ue('a', '2026-04-10', 30000), ue('b', '2026-05-10', 30000), ue('c', '2026-06-10', 1000)];
  const p = periodos349(F, 2026, 2);
  assert.deepEqual(p.map((x) => [x.periodo, x.total, x.plazo]), [['05', 60000, '2026-06-22'], ['06', 1000, '2026-07-20']]);
  // Un trimestre normal: una sola declaración trimestral.
  assert.deepEqual(periodos349([ue('d', '2026-02-10', 1000)], 2026, 1).map((x) => [x.periodo, x.total, x.plazo]), [['1T', 1000, '2026-04-20']]);
});
