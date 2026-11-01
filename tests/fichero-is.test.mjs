// Posiciones contrastadas con el diseño de registro DR202e25 v1.3 (ejercicio 2025 y siguientes), páginas 01 (700
// posiciones) y 02 (900), y las casillas del 200 con el DR200e25 v1.02 (páginas 12, 13, 14 y 14 bis).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importe } from '../lib/ficheroAeat.js';
import { casillas200, csvCasillas200, fichero202, nombreCsv200, nombreFichero202 } from '../lib/ficheroIs.js';
import { borradorSociedades, modelo202, modelo202Art403 } from '../lib/modelos.js';

const yo = { nif: 'B12345674', nombre: 'Taller Peña SL' };
const campo = (s, pos, lon) => s.slice(pos - 1, pos - 1 + lon);
const factura = (id, fecha, base, extra = {}) => ({ id, fecha, base, ivaPct: 21, cliente: { nombre: 'Ana', nif: '11111111H' }, ...extra });
const gasto = (id, fecha, base, extra = {}) => ({ id, fecha, pagado: fecha, base, ivaPct: 21, concepto: 'Material', ...extra });

// Las dos páginas del 202 dentro de su sobre, con las longitudes del diseño.
function paginas202(contenido, anio, periodo) {
  assert.ok(contenido.startsWith(`<T2020${anio}${periodo}0000><AUX>`));
  assert.ok(contenido.endsWith(`</T2020${anio}${periodo}0000>`));
  assert.equal(campo(contenido, 323, 6), '</AUX>');
  const p = {};
  let pos = 328;
  for (const [id, lon] of [['01', 700], ['02', 900]]) {
    p[id] = contenido.slice(pos, pos + lon);
    assert.equal(p[id].length, lon);
    assert.equal(Buffer.byteLength(p[id], 'latin1'), lon);
    assert.equal(campo(p[id], 1, 11), `<T202${id}000>`);
    assert.equal(campo(p[id], lon - 11, 12), `</T202${id}000>`);
    pos += lon;
  }
  assert.equal(pos + 18, contenido.length, 'No hay páginas sobrantes ni omitidas');
  return p;
}

test('202 (art. 40.2): sobre 1P, páginas de 700 y 900 posiciones y las casillas 01 a 03 en su posición', () => {
  const x = modelo202({ 2024: 10000 }, 2026)[0];
  assert.deepEqual([x.p, x.cuota, x.pago], [1, 10000, 1800]);
  const r = fichero202(yo, 2026, x, { is: borradorSociedades([], [], 2026, {}) });
  const p = paginas202(r.contenido, 2026, '1P');
  assert.equal(campo(p['01'], 12, 1), ' ');
  assert.equal(campo(p['01'], 13, 1), 'I');
  assert.equal(campo(p['01'], 14, 9), 'B12345674');
  assert.equal(campo(p['01'], 23, 60), 'TALLER PEÑA SL'.padEnd(60, ' '));
  assert.equal(campo(p['01'], 83, 20), ' '.repeat(20)); // una sociedad va entera en «Denominación»
  assert.equal(campo(p['01'], 103, 1), ' '); // normativa foral
  assert.equal(campo(p['01'], 104, 4), '2026');
  assert.equal(campo(p['01'], 108, 2), '1P');
  assert.equal(campo(p['01'], 110, 8), '01012026');
  assert.equal(campo(p['01'], 118, 4), '0000'); // C.N.A.E.: se elige en la Sede
  assert.equal(campo(p['01'], 132, 15), ' '.repeat(15)); // tipo de gravamen: se elige en la Sede
  assert.equal(campo(p['01'], 147, 1), '0');
  assert.equal(campo(p['01'], 148, 1), 'A');
  assert.equal(campo(p['01'], 149, 17), importe(10000)); // 01 base del pago fraccionado
  assert.equal(campo(p['01'], 166, 17), importe(0)); // 02 declaración anterior (complementarias)
  assert.equal(campo(p['01'], 183, 17), importe(1800)); // 03 a ingresar
  assert.equal(campo(p['01'], 200, 17), importe(0)); // la modalidad B queda a cero
  assert.equal(campo(p['01'], 353, 17), importe(0));
  assert.equal(campo(p['01'], 438, 251), ' '.repeat(251));
  // Página 02: los numéricos a ceros y los alfanuméricos en blanco (notas 3 y 4 del diseño).
  assert.equal(campo(p['02'], 13, 17), importe(0));
  assert.equal(campo(p['02'], 30, 5), '00000');
  assert.equal(campo(p['02'], 412, 5), '00000');
  assert.equal(campo(p['02'], 485, 17), importe(0));
  assert.equal(campo(p['02'], 502, 1), ' ');
  assert.equal(campo(p['02'], 503, 22), ' '.repeat(22));
  assert.equal(campo(p['02'], 695, 17), importe(0));
  assert.equal(campo(p['02'], 712, 1), ' ');
  assert.equal(campo(p['02'], 726, 34), ' '.repeat(34));
  assert.deepEqual([r.resultado, r.tipo, r.modalidad], [1800, 'I', '40.2']);
  assert.equal(nombreFichero202(2026, 1), '202_2026_1P.txt');
});

test('202 (art. 40.2): el pago de octubre y el de diciembre llevan su periodo, y sin cuota no hay fichero', () => {
  const pagos = modelo202({ 2024: 10000, 2025: 50000 }, 2026);
  for (const [i, periodo] of [[1, '2P'], [2, '3P']]) {
    const p = paginas202(fichero202(yo, 2026, pagos[i]).contenido, 2026, periodo);
    assert.equal(campo(p['01'], 108, 2), periodo);
    assert.equal(campo(p['01'], 149, 17), importe(50000));
    assert.equal(campo(p['01'], 183, 17), importe(9000));
  }
  assert.throws(() => fichero202(yo, 2026, modelo202({}, 2026)[0]), /Sin la cuota del Impuesto sobre Sociedades de 2024/);
  assert.throws(() => fichero202(yo, 2026, { p: 1, cuota: 0, de: 2024 }), /no hay 202 que presentar/);
  assert.throws(() => fichero202(yo, 2024, pagos[0]), /desde el ejercicio 2025/);
  assert.throws(() => fichero202(yo, 2026, { ...pagos[0], p: 4 }), /tres pagos/);
  assert.throws(() => fichero202(yo, 2026, pagos[0], { is: { foral: 'navarra' } }), /territorio foral/);
});

test('202 (art. 40.3): un solo porcentaje (B1), base previa, correcciones y resultado', () => {
  // Más de 6 M el año anterior: obliga al art. 40.3. Reducida dimensión (menos de 10 M): 23 % en 2026 → 5/7 = 16 %.
  const F = [factura('p1', '2025-03-01', 4000000), factura('p2', '2025-09-01', 4000000), factura('f1', '2026-02-01', 1500000)];
  const G = [gasto('g', '2026-01-10', 200000), gasto('multa', '2026-01-11', 500, { ivaPct: 0, concepto: 'Multa de tráfico' })];
  const is = borradorSociedades(F, G, 2026, {});
  assert.deepEqual([is.incn, is.tamano, is.obligado403, is.tipos], [8000000, 'reducida', true, [23, 23]]);
  const x = modelo202Art403(F, G, 2026, {})[0];
  assert.deepEqual([x.modalidad, x.base, x.tramos.length, x.tramos[0].pct], ['40.3', 1300000, 1, 16]);
  const p = paginas202(fichero202(yo, 2026, x, { is }).contenido, 2026, '1P');
  assert.equal(campo(p['01'], 148, 1), 'B');
  assert.equal(campo(p['01'], 149, 17), importe(0)); // la modalidad A queda a cero
  assert.equal(campo(p['01'], 183, 17), importe(0));
  assert.equal(campo(p['01'], 200, 17), importe(x.resultadoContable, 17, true)); // 04 resultado contable
  assert.equal(campo(p['01'], 285, 17), importe(500)); // 07 resto de correcciones: la multa (art. 15.c LIS)
  assert.equal(campo(p['01'], 319, 17), importe(500)); // 38 total de aumentos
  assert.equal(campo(p['01'], 336, 17), importe(0)); // 39 disminuciones
  assert.equal(campo(p['01'], 353, 17), importe(x.basePrevia, 17, true)); // 13 base imponible previa
  assert.equal(campo(p['01'], 387, 17), importe(0)); // 14 bases negativas
  // 13 = 04 + 38 − 39 (instrucciones del 202).
  assert.equal(x.basePrevia, x.resultadoContable + 500);
  // B1: 16, 17 y 18; el bloque B2 (19 a 26) a cero.
  assert.equal(campo(p['02'], 13, 17), importe(1300000));
  assert.equal(campo(p['02'], 30, 5), '01600');
  assert.equal(campo(p['02'], 103, 17), importe(208000)); // 18 = 16 × 17 / 100
  assert.equal(campo(p['02'], 120, 17), importe(0));
  assert.equal(campo(p['02'], 137, 17), importe(0));
  assert.equal(campo(p['02'], 361, 17), importe(0));
  assert.equal(campo(p['02'], 378, 17), importe(0)); // 27 bonificaciones del periodo: Fisquo no las reparte
  assert.equal(campo(p['02'], 395, 17), importe(x.retenciones)); // 28 retenciones
  assert.equal(campo(p['02'], 412, 5), '10000'); // 29 volumen en territorio común: 100 %
  assert.equal(campo(p['02'], 417, 17), importe(0)); // 30 pagos anteriores del año
  assert.equal(campo(p['02'], 451, 17), importe(208000)); // 32 = 18 − 27 − 28 − 30 − 31
  assert.equal(campo(p['02'], 468, 17), importe(0)); // 33 mínimo: solo desde 10 M
  assert.equal(campo(p['02'], 485, 17), importe(x.pago)); // 34 = mayor de 32 y 33
});

test('202 (art. 40.3): dos porcentajes (B2) de la microempresa, pagos anteriores y declaración negativa', () => {
  // Microempresa (menos de 1 M el año anterior): 19/21 % en 2026 → 5/7 = 13/15 %, con la base partida en 50.000 €.
  const F = [factura('p', '2025-03-01', 400000), factura('f', '2026-02-01', 300000, { irpfPct: 15 })];
  const G = [gasto('g', '2026-01-10', 100000), gasto('s', '2026-01-11', 1000, { ivaPct: 0, concepto: 'Sanción de Hacienda' })];
  const is = borradorSociedades(F, G, 2026, {});
  assert.deepEqual([is.tamano, is.tipos], ['micro', [19, 21]]);
  const x = modelo202Art403(F, G, 2026, { pagos202: { 2026: {} } })[0];
  assert.deepEqual(x.tramos.map((t) => [t.base, t.pct, t.cuota]), [[50000, 13, 6500], [150000, 15, 22500]]);
  const r = fichero202(yo, 2026, x, { is, constitucion: '2024-03-15' });
  const p = paginas202(r.contenido, 2026, '1P');
  assert.equal(campo(p['01'], 110, 8), '01012026'); // la constitución es de otro año: el periodo empieza en enero
  // B1 vacío y B2 con sus dos tramos (19 a 26).
  assert.equal(campo(p['02'], 13, 17), importe(0));
  assert.equal(campo(p['02'], 30, 5), '00000');
  assert.equal(campo(p['02'], 103, 17), importe(0));
  assert.equal(campo(p['02'], 120, 17), importe(200000)); // 19 base del pago fraccionado
  assert.equal(campo(p['02'], 137, 17), importe(50000)); // 20 base a tipo 1
  assert.equal(campo(p['02'], 154, 5), '01300'); // 21
  assert.equal(campo(p['02'], 159, 17), importe(6500)); // 22
  assert.equal(campo(p['02'], 176, 17), importe(150000)); // 23 base a tipo 2
  assert.equal(campo(p['02'], 193, 5), '01500'); // 24
  assert.equal(campo(p['02'], 198, 17), importe(22500)); // 25
  assert.equal(campo(p['02'], 215, 17), importe(0)); // 61 tercer tipo: Fisquo usa como mucho dos
  assert.equal(campo(p['02'], 361, 17), importe(29000)); // 26 = 22 + 25
  assert.equal(campo(p['02'], 395, 17), importe(45000)); // 28 retenciones del periodo
  // Las retenciones se comen el pago: la 32 no admite signo, así que va a cero y la declaración es negativa.
  assert.equal(campo(p['02'], 451, 17), importe(0));
  assert.equal(campo(p['02'], 485, 17), importe(0));
  assert.deepEqual([r.resultado, r.tipo], [0, 'N']);
  assert.equal(campo(p['01'], 13, 1), 'N');
  // Segundo pago: lo ingresado en abril va a la casilla 30 y resta del resultado.
  const segundo = modelo202Art403(F, G, 2026, { pagos202: { 2026: { 1: 500 } } })[1];
  const p2 = paginas202(fichero202(yo, 2026, segundo, { is }).contenido, 2026, '2P');
  assert.equal(campo(p2['02'], 417, 17), importe(500));
  assert.equal(campo(p2['02'], 485, 17), importe(segundo.pago));
});

test('202: el mínimo del 23 % de la DA 14.ª y las marcas de datos adicionales según la cifra de negocios', () => {
  // 10 M o más: el porcentaje es 19/20 del tipo (25 % → 24 %) y el pago no baja del 23 % del resultado contable.
  const F = [factura('p', '2025-03-01', 12000000), factura('f', '2026-02-01', 3000000)];
  const G = [gasto('g', '2026-01-10', 100000, { inversion: true, vidaUtil: 10 })];
  const is = borradorSociedades(F, G, 2026, {});
  assert.deepEqual([is.tamano, is.tipos, is.incn], ['general', [25, 25], 12000000]);
  const x = modelo202Art403(F, G, 2026, {})[0];
  assert.equal(x.tramos[0].pct, 24);
  assert.ok(x.minimo > 0);
  const p = paginas202(fichero202(yo, 2026, x, { is }).contenido, 2026, '1P');
  assert.equal(campo(p['02'], 468, 17), importe(x.minimo)); // 33 mínimo a ingresar
  assert.equal(campo(p['02'], 485, 17), importe(x.pago)); // 34 = mayor de 32 y 33
  assert.equal(campo(p['02'], 485, 17), importe(Math.max(x.previo - x.retenciones, x.minimo)));
  // 20 (más de 6 M), 1 (tramo de 10 a 20 M) y sin marca de reducida dimensión ni de microempresa.
  assert.deepEqual([campo(p['01'], 126, 1), campo(p['01'], 127, 1), campo(p['01'], 130, 1), campo(p['01'], 147, 1)], [' ', 'X', ' ', '1']);
  const micro = borradorSociedades([factura('p', '2025-03-01', 400000)], [], 2026, {});
  const pm = paginas202(fichero202(yo, 2026, modelo202({ 2024: 1000 }, 2026)[0], { is: micro }).contenido, 2026, '1P');
  assert.deepEqual([campo(pm['01'], 126, 1), campo(pm['01'], 127, 1), campo(pm['01'], 130, 1)], [' ', ' ', 'X']);
  const reducida = borradorSociedades([factura('p', '2025-03-01', 5000000)], [], 2026, {});
  const pr = paginas202(fichero202(yo, 2026, modelo202({ 2024: 1000 }, 2026)[0], { is: reducida }).contenido, 2026, '1P');
  assert.deepEqual([campo(pr['01'], 126, 1), campo(pr['01'], 127, 1), campo(pr['01'], 130, 1)], ['X', ' ', ' ']);
  // Primer año de la sociedad: el periodo impositivo empieza el día de la constitución.
  const nueva = fichero202(yo, 2026, modelo202({ 2024: 1000 }, 2026)[0], { constitucion: '2026-03-15' });
  assert.equal(campo(paginas202(nueva.contenido, 2026, '1P')['01'], 110, 8), '15032026');
});

test('200: casillas numeradas del borrador, con el detalle del art. 15 y la cuota que encadena con el 202', () => {
  const F = [factura('p', '2025-03-01', 400000), factura('f', '2026-02-01', 300000, { irpfPct: 15 })];
  const G = [gasto('g', '2026-01-10', 100000),
    gasto('s', '2026-01-11', 1000, { ivaPct: 0, concepto: 'Sanción de Hacienda' }),
    gasto('d', '2026-01-12', 400, { ivaPct: 0, concepto: 'Donativo al club del barrio' }),
    gasto('is', '2026-07-25', 3000, { ivaPct: 0, concepto: 'Modelo 200 del ejercicio anterior' })];
  const is = borradorSociedades(F, G, 2026, { pagos202: { 2026: { 1: 2000 } } });
  const filas = casillas200(is, { pagos: { 1: 2000 } });
  const v = Object.fromEntries(filas.map((f) => [f.casilla, f.importe]));
  const pagina = Object.fromEntries(filas.map((f) => [f.casilla, f.pagina]));
  assert.equal(v['00500'], is.resultadoContable);
  assert.equal(v['00301'], 3000); // art. 15.b: el propio impuesto, que lleva al resultado antes de impuestos
  assert.equal(v['00501'], is.resultadoContable + 3000);
  assert.equal(v['01815'], 1000); // art. 15.c: sanciones
  assert.equal(v['00339'], 400); // art. 15.e: donativos y liberalidades
  assert.equal(v['00417'], 1400); // total de aumentos, sin la corrección por el impuesto
  assert.equal(v['00418'], 0);
  assert.equal(v['00550'], is.basePrevia);
  assert.equal(v['00552'], is.base);
  assert.equal(v['00558'], 1921); // nota 1 del diseño: el 19/21 % de la microempresa se escribe «1921»
  assert.equal(v['00562'], is.cuotaIntegra);
  assert.equal(v['00582'], is.cuotaAjustada);
  assert.equal(v['00592'], is.cuotaLiquida);
  assert.equal(v['01766'], is.retenciones);
  assert.equal(v['00599'], is.cuotaEjercicio); // base del 202 del año siguiente (art. 40.2 LIS)
  assert.equal(v['00601'], 2000);
  assert.equal(v['00611'], is.cuotaDiferencial); // cuadra con el «saldría a pagar» de la pantalla
  assert.equal(v['01586'], is.resultado);
  // 00501 = 00500 + 00301 y 00550 = 00501 + 00417 − 00418.
  assert.equal(v['00550'], v['00501'] + v['00417'] - v['00418']);
  assert.deepEqual([pagina['00500'], pagina['00417'], pagina['00552'], pagina['00592']], ['12', '13', '14', '14 bis']);
  // Las casillas sin importe no salen (salvo el esqueleto de la liquidación), y van en el orden del modelo.
  assert.ok(!filas.some((f) => ['01032', '00547', '00567', '00568', '00588', '00565', '00603', '00605'].includes(f.casilla)));
  assert.deepEqual(filas.map((f) => f.pagina), [...filas.map((f) => f.pagina)].sort((a, b) => a.localeCompare(b)));
});

test('200: la reserva, las pérdidas compensadas y las deducciones apuntadas salen en su casilla', () => {
  // Sin datos de 2025 en la app: lo pendiente de años anteriores (bases negativas y deducciones) llega entero a 2026.
  const F = [factura('f', '2026-02-01', 500000)];
  const G = [gasto('g2', '2026-01-10', 100000)];
  const deduccionesIS = [
    { tipo: 'ceuta', de: 2026, importe: 1000 }, { tipo: 'serviciosLocales', de: 2026, importe: 500 },
    { tipo: 'ddiInterna', de: 2024, importe: 300 }, { tipo: 'ddiJuridica', de: 2025, importe: 200 },
    { tipo: 'idi', de: 2026, importe: 800 }, { tipo: 'donativo', de: 2026, importe: 1000, entidad: 'Cruz Roja' },
  ];
  const is = borradorSociedades(F, G, 2026, { deduccionesIS, fondosPropios: { 2026: 50000 }, binsPrevias: { 2025: 100000 } });
  const v = Object.fromEntries(casillas200(is).map((f) => [f.casilla, f.importe]));
  assert.equal(v['01032'], is.reserva.aplicada);
  assert.ok(v['01032'] > 0);
  assert.equal(v['00547'], is.compensacion);
  assert.ok(v['00547'] > 0);
  assert.equal(v['00567'], 1000);
  assert.equal(v['00568'], 500);
  assert.equal(v['01344'], 300);
  assert.equal(v['00571'], 200);
  assert.equal(v['00565'], is.donativos);
  assert.equal(v['00588'], is.deduccionesCapIV);
  // Cuota íntegra ajustada = íntegra − doble imposición − bonificaciones; líquida = ajustada − donativos − cap. IV.
  assert.equal(v['00582'], v['00562'] - v['01344'] - v['00571'] - v['00567'] - v['00568']);
  assert.equal(v['00592'], v['00582'] - v['00565'] - v['00588']);
  assert.throws(() => casillas200(null), /No hay borrador/);
  assert.throws(() => casillas200({ foral: 'navarra' }), /territorio foral/);
});

test('200: el CSV lleva cabecera, separador de punto y coma y los decimales con coma', () => {
  const is = borradorSociedades([factura('f', '2026-02-01', 100000)], [gasto('g', '2026-01-10', 10000)], 2026, {});
  const csv = csvCasillas200(is, 2026, {});
  const lineas = csv.split('\r\n');
  assert.ok(csv.startsWith('﻿'));
  assert.equal(lineas[0], '﻿casilla;página;concepto;importe 2026');
  assert.equal(lineas[1], '00500;12;Resultado de la cuenta de pérdidas y ganancias;90000,00');
  assert.ok(lineas.some((l) => l.startsWith('00558;14;"Tipo de gravamen')), 'el concepto con punto y coma va entre comillas');
  assert.ok(lineas.some((l) => /^00558;14;"Tipo de gravamen.*";1921$/.test(l)), 'el tipo de gravamen es un código, no un importe');
  assert.equal(lineas.at(-1), '');
  assert.equal(nombreCsv200(2026), 'casillas-200-2026.csv');
});

// Ruta real con las dos fronteras externas sustituidas (sesión y lectura de datos), como en ficheros-aeat-modelos.
async function cargarRuta(estado) {
  globalThis.__ficheroIs = estado;
  const externo = (codigo) => `data:text/javascript;base64,${Buffer.from(codigo).toString('base64')}`;
  let fuente = await readFile(new URL('../app/api/aeat/route.js', import.meta.url), 'utf8');
  fuente = fuente.replace(/from '@\/lib\/([^']+)'/g, (_, nombre) => {
    let url;
    if (nombre === 'api') url = externo('export const usuarioApi = async (op) => { globalThis.__ficheroIs.permiso = op; return globalThis.__ficheroIs.sesion; };');
    else if (nombre === 'redis') url = externo('export const leer = async (u, coleccion) => globalThis.__ficheroIs[coleccion] || [];');
    else if (nombre === 'datosImpuestos') url = externo('export const datosImpuestos = async () => globalThis.__ficheroIs.datos;');
    else url = new URL(`../lib/${nombre}.js`, import.meta.url).href;
    return `from '${url}'`;
  });
  return (await import(externo(fuente))).GET;
}
const peticion = (q) => ({ nextUrl: new URL(`https://fisquo.test/api/aeat?${q}`) });

test('API: el 202 de cada pago en ISO-8859-1, el 200 como CSV y la validación del pago', async () => {
  const u = { rol: 'admin', nombre: 'Ana', emisor: { nif: yo.nif, nombre: yo.nombre }, fiscal: { tipo: 'sociedad' }, cuotaIS: { 2024: 10000, 2025: 20000 }, pagos202: { 2026: { 1: 1800 } } };
  const estado = { sesion: { u }, datos: { facturas: [factura('f', '2026-02-01', 400000)], gastos: [gasto('g', '2026-01-10', 50000)] } };
  const GET = await cargarRuta(estado);
  for (const p of [1, 2, 3]) {
    const res = await GET(peticion(`modelo=202&anio=2026&p=${p}`));
    assert.equal(res.status, 200, `pago ${p}: ${res.status}`);
    assert.equal(res.headers.get('Content-Type'), 'text/plain; charset=iso-8859-1');
    assert.equal(res.headers.get('Content-Disposition'), `attachment; filename="202_2026_${p}P.txt"`);
    const texto = Buffer.from(new Uint8Array(await res.arrayBuffer())).toString('latin1');
    assert.ok(texto.startsWith(`<T20202026${p}P0000>`));
    assert.equal(texto.length, 1946);
    assert.ok(texto.includes('TALLER PEÑA SL'));
  }
  assert.deepEqual(estado.permiso, { permiso: 'resumen' });
  const tabla = await GET(peticion('modelo=200&anio=2026'));
  assert.equal(tabla.status, 200);
  assert.equal(tabla.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  assert.equal(tabla.headers.get('Content-Disposition'), 'attachment; filename="casillas-200-2026.csv"');
  // Los bytes, no el texto: Response.text() se come la marca de orden que necesita Excel.
  const bytes = Buffer.from(new Uint8Array(await tabla.arrayBuffer()));
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const csv = bytes.toString('utf8');
  assert.ok(csv.startsWith('﻿casilla;página;concepto;importe 2026'));
  assert.ok(csv.includes('\r\n00601;14 bis;1.º pago fraccionado del 202;1800,00'));
  // El pago solo es del 202, y el 202 no va por trimestres ni sin pago.
  for (const q of ['modelo=202&anio=2026', 'modelo=202&anio=2026&p=0', 'modelo=202&anio=2026&p=4', 'modelo=200&anio=2026&p=1', 'modelo=303&anio=2026&t=1&p=1']) {
    assert.equal((await GET(peticion(q))).status, 400, q);
  }
  // Un autónomo no presenta ninguno de los dos.
  u.fiscal = { tipo: 'autonomo' };
  for (const q of ['modelo=202&anio=2026&p=1', 'modelo=200&anio=2026']) assert.equal((await GET(peticion(q))).status, 400, q);
  // Sin cuota del Impuesto sobre Sociedades no hay 202 que presentar: error claro, no un fichero a medias.
  u.fiscal = { tipo: 'sociedad' }; u.cuotaIS = {};
  const sinCuota = await GET(peticion('modelo=202&anio=2026&p=1'));
  assert.equal(sinCuota.status, 422);
  assert.match((await sinCuota.json()).error, /Sin la cuota del Impuesto sobre Sociedades/);
});
