// Posiciones contrastadas con DR111e16v18, DR115e15v13, DR390e2025 y diseños BOE 180/190/347/349.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fichero111, fichero115, fichero390, importe, nombreFichero, numero, registro } from '../lib/ficheroAeat.js';
import { fichero180, fichero190, fichero347, fichero349 } from '../lib/ficherosInformativas.js';
import { modelo111 } from '../lib/nominas.js';
import { modelo115, modelo180, modelo190, modelo347, modelo349, modelo390, periodos349, retencionesProfesionales } from '../lib/modelos.js';

const yo = { nif: '12345678Z', nombre: 'Ana García López', telefono: '+34 600 123 456', contacto: 'José Muñoz Pérez' };
const cliente = { nombre: 'Álmacén Peña SL', nif: 'B12345674' };
const de = { nombre: 'Berlin GmbH', nif: 'DE123456789' };
const gasto = (id, fecha, base, extra = {}) => ({ id, fecha, pagado: fecha, base, ivaPct: 21, proveedor: cliente.nombre, proveedorNif: cliente.nif, concepto: 'Material', ...extra });
const factura = (id, fecha, base, extra = {}) => ({ id, fecha, base, ivaPct: 21, cliente, ...extra });
const nomina = (empleado, mes, bruto, irpf, ss = 0) => ({ empleado, mes, importes: { bruto, irpf, ssTrabajador: ss, ssEmpresa: 0 } });
const nominas = [nomina('e1', '2026-02', 2000, 300, 130), nomina('e1', '2026-03', 1000, 150, 65)];
const alquileres = [
  gasto('a1', '2026-01-15', 1000, { alquiler: true, inmueble: { situacion: 1, refCatastral: '1234567AB1234C0001DE' } }),
  gasto('a2', '2026-02-15', 1200, { alquiler: true, inmueble: { situacion: 4 } }),
  gasto('pendiente', '2026-03-15', 900, { alquiler: true, pendiente: true }),
];
const profesionales = [gasto('p1', '2026-03-01', 300, { irpfPct: 15 })];
const campo = (s, pos, lon) => s.slice(pos - 1, pos - 1 + lon);

// Validador lector independiente: posiciones desde 1 y número con signo separado o prefijo N.
function leer(s, esquema) {
  return Object.fromEntries(Object.entries(esquema).map(([k, [pos, lon, tipo]]) => {
    const v = campo(s, pos, lon);
    assert.equal(v.length, lon, k);
    if (tipo === 'numero') { assert.match(v, /^\d+$/, k); return [k, Number(v)]; }
    if (tipo === 'signo') { assert.match(v, /^[ N]\d+$/, k); return [k, (v[0] === 'N' ? -1 : 1) * Number(v.slice(1))]; }
    if (tipo === 'importe') { assert.match(v, /^(N\d+|\d+)$/, k); return [k, v[0] === 'N' ? -Number(v.slice(1)) : Number(v)]; }
    return [k, v.trimEnd()];
  }));
}
function paginas(contenido, modelo, periodo, longitudes) {
  assert.ok(contenido.startsWith(`<T${modelo}02026${periodo}0000><AUX>`));
  assert.ok(contenido.endsWith(`</T${modelo}02026${periodo}0000>`));
  assert.equal(campo(contenido, 323, 6), '</AUX>');
  let pos = 328;
  const p = {};
  for (const [id, lon] of Object.entries(longitudes)) {
    const etiqueta = `${modelo}${id.padEnd(5, '0')}`;
    p[id] = contenido.slice(pos, pos + lon);
    assert.equal(p[id].length, lon);
    assert.equal(Buffer.byteLength(p[id], 'latin1'), lon);
    assert.equal(campo(p[id], 1, 11), `<T${etiqueta}>`);
    assert.equal(campo(p[id], lon - 11, 12), `</T${etiqueta}>`);
    pos += lon;
  }
  assert.equal(pos + 18, contenido.length, 'No hay páginas sobrantes ni omitidas');
  return p;
}
function boe(contenido, modelo, cuantos) {
  const lineas = contenido.split('\r\n');
  assert.equal(lineas.length, cuantos + 1);
  assert.ok(!contenido.replaceAll('\r\n', '').match(/[\r\n]/));
  for (const [i, linea] of lineas.entries()) {
    assert.equal(linea.length, 500);
    assert.equal(Buffer.byteLength(linea, 'latin1'), 500);
    assert.match(linea, /^[A-Z0-9ÑÇ ]+$/);
    assert.equal(campo(linea, 1, 17), `${i ? '2' : '1'}${modelo}202612345678Z`);
  }
  const cab = leer(lineas[0], { nombre: [18, 40], soporte: [58, 1], telefono: [59, 9], contacto: [68, 40], id: [108, 13], anterior: [123, 13, 'numero'] });
  assert.equal(cab.nombre, 'GARCIA LOPEZ ANA');
  assert.equal(cab.soporte, modelo === '349' ? '' : 'T');
  assert.equal(cab.telefono, '600123456');
  assert.equal(cab.contacto, 'MUÑOZ PEREZ JOSE');
  assert.match(cab.id, new RegExp(`^${modelo}\\d{10}$`));
  assert.equal(campo(lineas[0], 121, 2), '  ');
  assert.equal(cab.anterior, 0);
  return lineas;
}

test('111: página de 1.000 posiciones, nóminas y profesionales, sobre y casillas 01-30', () => {
  const r = fichero111(yo, 2026, 1, modelo111(nominas, 2026, 1), retencionesProfesionales(profesionales, 2026, 1));
  const p = paginas(r.contenido, '111', '1T', { '01': 1000 })['01'];
  assert.deepEqual(leer(p, { nif: [14, 9], apellidos: [23, 60], nombre: [83, 20], ejercicio: [103, 4, 'numero'], periodo: [107, 2],
    trabajadores: [109, 8, 'numero'], bruto: [117, 17, 'numero'], retTrabajo: [134, 17, 'numero'], profesionales: [193, 8, 'numero'], base: [201, 17, 'numero'], retProf: [218, 17, 'numero'], total: [487, 17, 'numero'], resultado: [521, 17, 'numero'] }),
  { nif: yo.nif, apellidos: 'GARCIA LOPEZ', nombre: 'ANA', ejercicio: 2026, periodo: '1T', trabajadores: 1, bruto: 300000, retTrabajo: 45000, profesionales: 1, base: 30000, retProf: 4500, total: 49500, resultado: 49500 });
  assert.equal(campo(p, 13, 1), 'I');
  assert.equal(campo(p, 151, 42), '0'.repeat(42));
  assert.equal(campo(p, 235, 252), '0'.repeat(252));
  assert.equal(campo(p, 538, 451), ' '.repeat(451));
  assert.equal(r.resultado, 495);
});

test('115: página de 500 posiciones, arrendadores, base, retención y resultado', () => {
  const r = fichero115(yo, 2026, 1, modelo115(alquileres, 2026, 1));
  const p = paginas(r.contenido, '115', '1T', { '01': 500 })['01'];
  assert.deepEqual(leer(p, { nif: [14, 9], ejercicio: [103, 4, 'numero'], periodo: [107, 2], perceptores: [109, 15, 'numero'], base: [124, 17, 'numero'], ret: [141, 17, 'numero'], anterior: [158, 17, 'numero'], resultado: [175, 17, 'numero'] }),
    { nif: yo.nif, ejercicio: 2026, periodo: '1T', perceptores: 1, base: 220000, ret: 41800, anterior: 0, resultado: 41800 });
  assert.equal(campo(p, 192, 297), ' '.repeat(297));
  const vacio = fichero115({ nif: 'B12345674', nombre: 'Sociedad de Ejemplo SL' }, 2026, 2, modelo115([], 2026, 2));
  const q = paginas(vacio.contenido, '115', '2T', { '01': 500 })['01'];
  assert.equal(campo(q, 23, 60).trim(), 'SOCIEDAD DE EJEMPLO SL');
  assert.equal(campo(q, 83, 20), ' '.repeat(20));
  assert.equal(vacio.tipo, 'N');
  assert.equal(fichero111(yo, 2026, 1, modelo111([], 2026, 1)).tipo, 'N');
});

test('180: declarante y un perceptor por inmueble, referencia, bases y totales BOE', () => {
  const [cab, p, otro] = boe(fichero180(yo, 2026, modelo180(alquileres, 2026)).contenido, '180', 2);
  assert.deepEqual(leer(cab, { n: [136, 9, 'numero'], base: [145, 16, 'signo'], ret: [161, 15, 'numero'] }), { n: 2, base: 220000, ret: 41800 });
  assert.deepEqual(leer(p, { nif: [18, 9], representante: [27, 9], nombre: [36, 40], provincia: [76, 2], modalidad: [78, 1], base: [79, 14, 'signo'], pct: [93, 4, 'numero'], ret: [97, 13, 'numero'], devengo: [110, 4, 'numero'], situacion: [114, 1], referencia: [115, 20] }),
    { nif: cliente.nif, representante: '', nombre: 'ALMACEN PEÑA SL', provincia: '00', modalidad: '1', base: 100000, pct: 1900, ret: 19000, devengo: 0, situacion: '1', referencia: '1234567AB1234C0001DE' });
  assert.equal(campo(otro, 114, 21), '4' + ' '.repeat(20));
  assert.equal(campo(p, 135, 181), ' '.repeat(181));
  assert.equal(campo(p, 316, 12), '0'.repeat(12));
  assert.equal(campo(p, 328, 173), ' '.repeat(173));
});

test('190: perceptor A con datos 145, E con retenciones estatales, G y H con subclave', () => {
  const empleados = [{ id: 'e1', nombre: 'Eva Núñez Pérez', nif: '11111111H', datos145: { nacimiento: 1986, situacionFamiliar: 2, nifConyuge: '22222222J', discapacidad: '33a65', movilidadReducida: true, contrato: 'inferiorAnio', movilidadGeografica: true,
    descendientes: [{ nacimiento: 2025, porEntero: true }, { nacimiento: 2015, porEntero: false }] } },
  { id: 'e2', nombre: 'Luis García López', nif: '33333333P', cotizacion: { administrador: 'autonomo', pequena: true } }];
  const N = [...nominas, nomina('e2', '2026-02', 1000, 190)];
  const G = [gasto('g', '2026-03-01', 100, { irpfPct: 7 }), gasto('h', '2026-04-01', 200, { irpfPct: 1 })];
  const [cab, a, e, g, h] = boe(fichero190(yo, 2026, modelo190(N, empleados, 2026, G)).contenido, '190', 4);
  assert.deepEqual(leer(cab, { n: [136, 9, 'numero'], bruto: [145, 16, 'signo'], ret: [161, 15, 'numero'] }), { n: 4, bruto: 430000, ret: 64900 });
  assert.deepEqual(leer(a, { nif: [18, 9], nombre: [36, 40], provincia: [76, 2], clave: [78, 1], subclave: [79, 2], bruto: [81, 14, 'signo'], ret: [95, 13, 'numero'], nacimiento: [153, 4, 'numero'], familiar: [157, 1], conyuge: [158, 9], discapacidad: [167, 1], contrato: [168, 1], movilidad: [170, 1], gastos: [184, 13, 'numero'], menores: [223, 2], resto: [225, 4] }),
    { nif: '11111111H', nombre: 'NUÑEZ PEREZ EVA', provincia: '00', clave: 'A', subclave: '00', bruto: 300000, ret: 45000, nacimiento: 1986, familiar: '2', conyuge: '22222222J', discapacidad: '2', contrato: '2', movilidad: '1', gastos: 19500, menores: '11', resto: '0100' });
  assert.equal(campo(e, 78, 3), 'E03');
  assert.equal(campo(e, 323, 13), '0000000019000');
  assert.equal(campo(g, 78, 3), 'G03');
  assert.equal(campo(h, 78, 3), 'H04');
  assert.equal(campo(g, 153, 5), '00000');
  assert.equal(campo(g, 395, 106), ' '.repeat(106));
});

test('347: residentes, no residentes y NIF comunitario, importes anuales y trimestrales', () => {
  const F = [factura('1', '2026-02-01', 1000), factura('2', '2026-05-01', 2000),
    factura('usa', '2026-07-01', 4000, { ivaPct: 0, cliente: { nombre: 'American Co', pais: 'US', nif: 'US123456789' }, operacion: 'servicios-fuera' }),
    factura('fr', '2026-10-01', 3000, { cliente: { nombre: 'Paris SARL', nif: 'FR12345678901', pais: 'FR' } })];
  const G = [gasto('alq', '2026-04-01', 3000, { alquilerSinRetencion: true })];
  const lineas = boe(fichero347(yo, 2026, modelo347(F, G, 2026)).contenido, '347', 4);
  assert.deepEqual(leer(lineas[0], { n: [136, 9, 'numero'], total: [145, 16, 'signo'], inmuebles: [161, 9, 'numero'] }), { n: 4, total: 1489000, inmuebles: 0 });
  const esp = lineas.find((p) => campo(p, 18, 9) === cliente.nif && campo(p, 82, 1) === 'B');
  assert.deepEqual(leer(esp, { nif: [18, 9], nombre: [36, 40], hoja: [76, 1], provincia: [77, 2], pais: [79, 2], clave: [82, 1], total: [83, 16, 'signo'], t1: [136, 16, 'signo'], t2: [168, 16, 'signo'], t3: [200, 16, 'signo'], t4: [232, 16, 'signo'] }),
    { nif: cliente.nif, nombre: 'ALMACEN PEÑA SL', hoja: 'D', provincia: '00', pais: '', clave: 'B', total: 363000, t1: 121000, t2: 242000, t3: 0, t4: 0 });
  const usa = lineas.find((p) => campo(p, 79, 2) === 'US');
  assert.equal(campo(usa, 18, 9), ' '.repeat(9));
  assert.equal(campo(usa, 77, 4), '99US');
  assert.equal(campo(usa, 84, 15), '000000000400000');
  const fr = lineas.find((p) => campo(p, 264, 17).trim() === 'FR12345678901');
  assert.equal(campo(fr, 77, 4), '99FR');
  assert.equal(campo(fr, 18, 9), ' '.repeat(9));
  const alquiler = lineas.find((p) => campo(p, 82, 1) === 'A');
  assert.equal(campo(alquiler, 100, 1), 'X');
});

test('347: caja solo anual, efectivo y ejercicio de origen, e importes negativos con N separada', () => {
  const F = [factura('caja', '2026-01-01', 6000, { pagos: [{ fecha: '2026-11-01', importe: 7000, metodo: 'efectivo' }] })];
  const m = modelo347(F, [], 2026, { recc: { desde: '2026-01-01' } });
  const [, p] = boe(fichero347(yo, 2026, m).contenido, '347', 1);
  assert.equal(campo(p, 281, 1), 'X');
  assert.equal(campo(p, 285, 15), '000000000700000');
  assert.equal(campo(p, 101, 15), '000000000700000');
  assert.equal(campo(p, 132, 4), '2026');
  assert.equal(campo(p, 136, 128), (' ' + '0'.repeat(15)).repeat(8));
  const [, negativo] = boe(fichero347(yo, 2026, modelo347([factura('neg', '2026-02-01', -4000)], [], 2026)).contenido, '347', 1);
  assert.equal(campo(negativo, 83, 16), 'N000000000484000');
  assert.equal(campo(negativo, 136, 16), 'N000000000484000');
});

test('349: operadores E/S/A/I, bases, periodo y rectificación completa del periodo anterior', () => {
  const F = [factura('previa', '2026-02-01', 1000, { cliente: de, ivaPct: 0 }),
    factura('bienes', '2026-04-01', 2000, { cliente: de, ivaPct: 0, operacion: 'intracomunitaria' }),
    factura('servicio', '2026-04-01', 3000, { cliente: de, ivaPct: 0 }),
    factura('abono', '2026-05-01', -300, { cliente: de, ivaPct: 0, rectifica: { id: 'previa', fecha: '2026-02-01' } })];
  const G = [gasto('mercancia', '2026-04-01', 500, { proveedor: de.nombre, proveedorNif: de.nif, categoria: '600', ivaPct: 0 }),
    gasto('servicio', '2026-05-01', 200, { proveedor: de.nombre, proveedorNif: de.nif, categoria: '629', ivaPct: 0 })];
  const [cab, ...detalles] = boe(fichero349(yo, 2026, '2T', modelo349(F, 2026, 2, G)).contenido, '349', 5);
  assert.deepEqual(leer(cab, { periodo: [136, 2], n: [138, 9, 'numero'], total: [147, 15, 'numero'], nr: [162, 9, 'numero'], totalr: [171, 15, 'numero'] }), { periodo: '2T', n: 4, total: 570000, nr: 1, totalr: 70000 });
  assert.deepEqual(detalles.slice(0, 4).map((p) => campo(p, 133, 1)).sort(), ['A', 'E', 'I', 'S']);
  const entrega = detalles.find((p) => campo(p, 133, 1) === 'E');
  assert.deepEqual(leer(entrega, { pais: [76, 2], nif: [78, 15], nombre: [93, 40], clave: [133, 1], base: [134, 13, 'numero'] }),
    { pais: 'DE', nif: '123456789', nombre: 'BERLIN GMBH', clave: 'E', base: 200000 });
  const rect = detalles.at(-1);
  assert.equal(campo(rect, 134, 13), ' '.repeat(13));
  assert.deepEqual(leer(rect, { nif: [76, 17], clave: [133, 1], ejercicio: [147, 4, 'numero'], periodo: [151, 2], nueva: [153, 13, 'numero'], anterior: [166, 13, 'numero'] }),
    { nif: de.nif, clave: 'S', ejercicio: 2026, periodo: '1T', nueva: 70000, anterior: 100000 });
  assert.equal(campo(rect, 179, 322), ' '.repeat(322));
  // La app no calcula triangulares; el serializador respeta la clave T cuando la recibe.
  const [, triangular] = boe(fichero349(yo, 2026, '2T', { operadores: [{ ...de, clave: 'T', base: 123.45 }] }).contenido, '349', 1);
  assert.equal(campo(triangular, 133, 14), 'T0000000012345');
});

test('349: transición a mensual acumula hasta el mes de corte, X solo si abarca los dos primeros meses', () => {
  const F = [factura('ene', '2026-01-01', 30000, { cliente: de, ivaPct: 0 }), factura('feb', '2026-02-01', 25000, { cliente: de, ivaPct: 0 })];
  const periodos = periodos349(F, 2026, 1);
  assert.deepEqual(periodos.map((p) => p.periodo), ['02', '03']);
  const [cab] = boe(fichero349(yo, 2026, '02', periodos[0]).contenido, '349', 1);
  assert.equal(campo(cab, 136, 2), '02');
  assert.equal(campo(cab, 147, 15), '000000005500000');
  assert.equal(campo(cab, 186, 1), 'X');
  const siguiente = periodos349(F, 2026, 2)[1];
  assert.equal(campo(fichero349(yo, 2026, siguiente.periodo, siguiente).contenido, 186, 1), ' ');
});

test('390: nueve páginas con longitudes del diseño, sobre 0A, casillas de devengo, deducción, liquidación y volumen', () => {
  const F = [factura('f', '2026-02-01', 1000), factura('f2', '2026-05-01', 2000)];
  const G = [gasto('g', '2026-02-01', 200)];
  const m = modelo390(F, G, 2026);
  const p = paginas(fichero390(yo, 2026, m).contenido, '390', '0A', { '01': 1187, '02': 1806, '02B': 531, '03': 1840, '04': 854, '05': 1519, '06': 828, '07': 776, '08': 1092 });
  assert.deepEqual(leer(p['01'], { nif: [14, 9], apellidos: [23, 60], nombre: [83, 20], ejercicio: [103, 4, 'numero'], periodo: [107, 2] }),
    { nif: yo.nif, apellidos: 'GARCIA LOPEZ', nombre: 'ANA', ejercicio: 2026, periodo: '' });
  assert.deepEqual(leer(p['02'], { base21: [217, 17, 'importe'], cuota21: [234, 17, 'importe'], baseTotal: [1611, 17, 'importe'], cuotaTotal: [1628, 17, 'importe'] }), { base21: 300000, cuota21: 63000, baseTotal: 300000, cuotaTotal: 63000 });
  assert.equal(campo(p['02B'], 353, 17), '00000000000063000');
  assert.deepEqual(leer(p['03'], { base21: [183, 17, 'importe'], cuota21: [200, 17, 'importe'], baseTotal: [217, 17, 'importe'], cuotaTotal: [234, 17, 'importe'] }), { base21: 20000, cuota21: 4200, baseTotal: 20000, cuotaTotal: 4200 });
  assert.deepEqual(leer(p['04'], { deducciones: [659, 17, 'importe'], resultado: [676, 17, 'importe'] }), { deducciones: 4200, resultado: 58800 });
  assert.deepEqual(leer(p['06'], { anual: [30, 17, 'importe'], resultado: [81, 17, 'importe'], ingresar: [225, 17, 'numero'], general: [361, 17, 'importe'], volumen: [650, 17, 'importe'] }), { anual: 58800, resultado: 58800, ingresar: 58800, general: 300000, volumen: 300000 });
  assert.equal(campo(p['07'], 64, 17), '0'.repeat(17));
  assert.equal(campo(p['08'], 13, 918), '0'.repeat(918));
});

test('390: negativos N, prorrata G, recargo y rechazo de casillas históricas no exportables', () => {
  const F = [factura('re', '2026-02-01', 1000, { recargo: true }), factura('ex', '2026-02-01', 1000, { ivaPct: 0, operacion: 'exenta' })];
  const G = [gasto('g', '2026-02-01', 5000)];
  const p = paginas(fichero390(yo, 2026, modelo390(F, G, 2026)).contenido, '390', '0A', { '01': 1187, '02': 1806, '02B': 531, '03': 1840, '04': 854, '05': 1519, '06': 828, '07': 776, '08': 1092 });
  assert.equal(campo(p['02B'], 217, 17), '00000000000100000');
  assert.equal(campo(p['02B'], 234, 17), '00000000000005200');
  assert.equal(campo(p['04'], 676, 1), 'N');
  assert.equal(campo(p['07'], 243, 17), '00000000000200000');
  assert.equal(campo(p['07'], 260, 17), '00000000000100000');
  assert.equal(campo(p['07'], 277, 6), 'G05000');
  assert.throws(() => fichero390(yo, 2026, modelo390([factura('x', '2026-02-01', 100, { ivaPct: 5 })], [], 2026)), /Revisa el 390/);
  assert.throws(() => fichero390(yo, 2026, { c: { 667: 100 } }), /debe ser cero/);
});

test('390: las marcas de caja y 347 no dependen de que haya cobros o pagos, y conserva actividad e IAE', () => {
  const r = fichero390(yo, 2026, modelo390([], [], 2026), { criterioCaja: true, destinatarioCaja: true, declara347: true,
    actividades: [{ nombre: 'Servicios de producción', iae: '9651' }] });
  const p = r.contenido.slice(328, 328 + 1187);
  assert.equal(campo(p, 131, 2), '11');
  assert.equal(campo(p, 430, 1), '1');
  assert.equal(campo(p, 148, 40).trim(), 'SERVICIOS DE PRODUCCION');
  assert.equal(campo(p, 188, 3), '   ');
  assert.equal(campo(p, 191, 4), '9651');
});

test('campos compartidos: sin truncar importes negativos, enteros estrictos y registros sin solapamiento', () => {
  assert.equal(importe(-1.23, 5, true), 'N0123');
  assert.throws(() => importe(-123.45, 5, true), /demasiado grande/);
  assert.throws(() => importe(NaN), /no válido/);
  assert.throws(() => importe(Infinity), /no válido/);
  assert.throws(() => numero(1.5, 4), /no válido/);
  assert.throws(() => numero(100, 2), /demasiado grande/);
  assert.throws(() => registro(2, [[1, 'ABC']]), /fuera/);
  assert.throws(() => registro(2, [[1, 'AB'], [2, 'C']]), /solapados/);
  assert.equal(nombreFichero('111', 2026, 1), '111_2026_1T.txt');
  assert.equal(nombreFichero('349', 2026, '02'), '349_2026_02.txt');
  assert.equal(nombreFichero('390', 2026), '390_2026.txt');
});

test('informativas: errores claros por teléfono, contacto, identificativo, NIF y bases negativas del 349', () => {
  assert.throws(() => fichero347({ ...yo, telefono: '' }, 2026, modelo347([], [], 2026)), /teléfono.*Ajustes/);
  assert.equal(campo(fichero190({ ...yo, email: 'ana+fiscal@example.es' }, 2026, modelo190([], [], 2026)).contenido, 176, 50).trim(), 'ANA+FISCAL@EXAMPLE.ES');
  assert.throws(() => fichero180({ ...yo, contacto: '' }, 2026, modelo180([], 2026)), /nombre de usuario/);
  assert.throws(() => fichero190({ ...yo, identificativo: '1801234567890' }, 2026, modelo190([], [], 2026)), /13 dígitos.*190/);
  assert.throws(() => fichero180(yo, 2026, modelo180([gasto('x', '2026-01-01', 100, { alquiler: true, proveedorNif: '' })], 2026)), /NIF español/);
  assert.throws(() => fichero349(yo, 2026, '1T', { operadores: [], negativos: [{ base: -50 }] }), /bases negativas/);
  const trimestral = fichero349(yo, 2026, '1T', { operadores: [] }).contenido;
  const octubre = fichero349(yo, 2026, '10', { operadores: [] }).contenido;
  assert.notEqual(campo(trimestral, 108, 13), campo(octubre, 108, 13));
  assert.throws(() => fichero180(yo, 2026, { arrendadores: [{ ...cliente, base: -100, retenciones: 0 }] }), /ejercicio de devengo/);
  assert.throws(() => fichero190(yo, 2026, { perceptores: [{ ...cliente, percepciones: -100, retenciones: 0, clave: 'G', subclave: '01' }] }), /ejercicio de devengo/);
});

// Ruta real con las dos fronteras externas sustituidas: sesión y lectura de datos; cálculos y serializadores reales.
async function cargarRuta(estado) {
  globalThis.__ficherosAeat = estado;
  const externo = (codigo) => `data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`;
  let fuente = await readFile(new URL('../app/api/aeat/route.js', import.meta.url), 'utf8');
  fuente = fuente.replace(/from '@\/lib\/([^']+)'/g, (_, nombre) => {
    let url;
    if (nombre === 'api') url = externo('export const usuarioApi = async (op) => { globalThis.__ficherosAeat.permiso = op; return globalThis.__ficherosAeat.sesion; };');
    else if (nombre === 'redis') url = externo('export const leer = async (u, coleccion) => globalThis.__ficherosAeat[coleccion] || [];');
    else if (nombre === 'datosImpuestos') url = externo('export const datosImpuestos = async () => globalThis.__ficherosAeat.datos;');
    else url = new URL(`../lib/${nombre}.js`, import.meta.url).href;
    return `from '${url}'`;
  });
  return (await import(externo(fuente))).GET;
}
const peticion = (q) => ({ nextUrl: new URL(`https://fisquo.test/api/aeat?${q}`) });

test('API: siete modelos, anuales sin t, nombres, ISO-8859-1, aplicabilidad, validación y permisos', async () => {
  const u = { rol: 'admin', nombre: yo.contacto, emisor: { nif: yo.nif, nombre: yo.nombre, telefono: yo.telefono }, fiscal: { trabajadores: true, alquiler: true, intracom: true } };
  const estado = { sesion: { u }, nominas, empleados: [{ id: 'e1', nombre: 'Eva Núñez Pérez', nif: '11111111H' }], datos: { facturas: [factura('f', '2026-02-01', 4000)], gastos: [...alquileres, ...profesionales] } };
  const GET = await cargarRuta(estado);
  for (const modelo of ['111', '115', '180', '190', '347', '349', '390']) {
    const trimestral = ['111', '115', '349'].includes(modelo);
    const res = await GET(peticion(`modelo=${modelo}&anio=2026${trimestral ? '&t=1' : ''}`));
    assert.equal(res.status, 200, `${modelo}: ${res.status}`);
    assert.equal(res.headers.get('Content-Type'), 'text/plain; charset=iso-8859-1');
    assert.equal(res.headers.get('Content-Disposition'), `attachment; filename="${nombreFichero(modelo, 2026, trimestral ? 1 : undefined)}"`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (modelo === '190') { assert.ok(bytes.includes(209)); assert.equal(Buffer.from(bytes).toString('latin1').includes('NUÑEZ'), true); }
  }
  assert.deepEqual(estado.permiso, { permiso: 'resumen' });
  for (const q of ['modelo=111&t=0', 'modelo=115&t=5', 'modelo=349&t=1&mes=4', 'modelo=349&t=1&mes=0', 'modelo=111&t=1&anio=abc', 'modelo=999&t=1']) {
    assert.equal((await GET(peticion(q))).status, 400, q);
  }
  u.fiscal = { iva: 'exento' }; estado.nominas = []; estado.datos = { facturas: [], gastos: [] };
  for (const modelo of ['111', '115', '180', '190', '349', '390']) assert.equal((await GET(peticion(`modelo=${modelo}&anio=2026&t=1`))).status, 400, modelo);
  // Una retención profesional hace aplicables 111 y 190 aunque no se hayan marcado trabajadores.
  estado.datos.gastos = profesionales;
  assert.equal((await GET(peticion('modelo=111&anio=2026&t=1'))).status, 200);
  assert.equal((await GET(peticion('modelo=190&anio=2026'))).status, 200);
  u.emisor.telefono = '';
  const sinTelefono = await GET(peticion('modelo=347&anio=2026'));
  assert.equal(sinTelefono.status, 422);
  assert.match((await sinTelefono.json()).error, /teléfono.*Ajustes/);
  u.emisor.telefono = yo.telefono;
  u.rol = 'empleado'; u.permisos = ['resumen']; u.pv = 2; estado.nominas = nominas;
  assert.equal((await GET(peticion('modelo=190&anio=2026'))).status, 403);
  estado.sesion = { res: Response.json({ error: 'No autorizado' }, { status: 401 }) };
  assert.equal((await GET(peticion('modelo=347&anio=2026'))).status, 401);
});

test('API 349: exige mes en mensual, respeta el corte y rechaza meses que no son declaraciones', async () => {
  const estado = { sesion: { u: { rol: 'admin', nombre: yo.contacto, emisor: yo, fiscal: { intracom: true } } }, datos: { gastos: [], facturas: [
    factura('ene', '2026-01-01', 30000, { cliente: de, ivaPct: 0 }), factura('feb', '2026-02-01', 25000, { cliente: de, ivaPct: 0 }),
  ] } };
  const GET = await cargarRuta(estado);
  const sinMes = await GET(peticion('modelo=349&anio=2026&t=1'));
  assert.equal(sinMes.status, 400);
  assert.match((await sinMes.json()).error, /mensual.*mes=/);
  assert.equal((await GET(peticion('modelo=349&anio=2026&t=1&mes=1'))).status, 400);
  const res = await GET(peticion('modelo=349&anio=2026&t=1&mes=2'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Disposition'), 'attachment; filename="349_2026_02.txt"');
  const [cab, p] = boe(Buffer.from(await res.arrayBuffer()).toString('latin1'), '349', 1);
  assert.equal(campo(cab, 136, 2), '02');
  assert.equal(campo(cab, 186, 1), 'X');
  assert.equal(campo(p, 134, 13), '0000005500000');
});
