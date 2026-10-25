// Cinco autónomos ficticios (y un bar en módulos) con un año completo de datos (2026): cada modelo comprobado AL CÉNTIMO
// contra lo calculado A MANO, sin llamar a la app para sacar el esperado. Cada cifra lleva su cuenta y la regla de donde
// sale: Ley y Reglamento del IVA (LIVA, RIVA) y del IRPF (LIRPF, RIRPF), instrucciones de los modelos en la Sede de la
// AEAT (303 de 2026, 390 de 2025, 130, 131, 349, 347), Orden de 27-3-1998 (tabla de amortización de la estimación directa
// simplificada) y Manual práctico de Renta 2025 de la AEAT (escalas y mínimos; la app usa los de 2025 en 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, liquidaciones303, resumenAnual, opciones130, minoracion130, importes } from '../lib/calculos.js';
import { modelo390, modelo349, periodos349, modelo347, modelo115, modelo180, modelo190, retencionesProfesionales, modelo309, modelo216, modelo296, borradorRenta } from '../lib/modelos.js';
import { modelo111 } from '../lib/nominas.js';
import { modelos131, simplificado } from '../lib/estimacionObjetiva.js';
import { fichero130, fichero303 } from '../lib/ficheroAeat.js';
import { modelosDe } from '../lib/empresa.js';

// Redondeo propio al céntimo (mitad lejos del cero), solo para escribir sumas de importes con decimales en los esperados.
const c2 = (n) => Math.sign(n) * Math.round(Number((Math.abs(n) * 100).toPrecision(15))) / 100 || 0;
// Campos del fichero de la Sede (diseños DR303e26v101 y DR130e15v12): 17 posiciones en céntimos, con «N» si es negativo.
const f17 = (v) => { const c = Math.round(Math.abs(v) * 100); return v < 0 ? `N${String(c).padStart(16, '0')}` : String(c).padStart(17, '0'); };
const campos = (...v) => v.map(f17).join('');
const MM = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const ultimo = { '01': 31, '02': 28, '03': 31, '04': 30, '05': 31, '06': 30, '07': 31, '08': 31, '09': 30, '10': 31, '11': 30, '12': 31 };

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. Lucía, diseñadora gráfica en Madrid: IVA general, estimación directa simplificada.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const fd = (id, fecha, cliente, base, ivaPct, irpfPct, x = {}) => ({ id, fecha, actividad: 'dis', cliente, base, ivaPct, irpfPct, ...x });
const PIXEL = { nombre: 'Agencia Pixel SL', nif: 'B12345674' };
const NORTE = { nombre: 'Editorial Norte SA', nif: 'A58818501' };
const VERDE = { nombre: 'Startup Verde SL', nif: 'B87654321' }; // cliente nuevo, con la retención del 7 % (art. 101.5 LIRPF)
const LAURA = { nombre: 'Laura Gómez Ruiz', nif: '50123456Z' }; // particular: no retiene (art. 76 RIRPF)
const BLEU = { nombre: 'Studio Bleu SARL', nif: 'FR40303265045' };
const KREATIV = { nombre: 'Kreativ GmbH', nif: 'DE123456789' };
const ACME = { nombre: 'Acme Brands Inc', nif: 'US987654321', pais: 'US' };
const ue = { operacion: 'servicios-ue' }; // art. 69.Uno.1.º LIVA: B2B, se localiza en el país del cliente (59 del 303 y clave S del 349)
const usa = { operacion: 'servicios-fuera' }; // no sujeta por localización (120 del 303)
const facturasD = [
  fd('F1', '2026-01-15', PIXEL, 2000, 21, 15),
  fd('F2', '2026-02-10', NORTE, 1500, 21, 15),
  fd('F3', '2026-02-20', BLEU, 3200, 0, 0, ue),
  fd('F4', '2026-03-05', LAURA, 800, 21, 0),
  fd('F5', '2026-03-25', ACME, 2000, 0, 0, usa),
  // Servicio de marzo facturado el 3 de abril: se devenga en marzo (art. 75.Uno.2.º LIVA; art. 14 LIRPF): 1T.
  fd('F6', '2026-04-03', PIXEL, 900, 21, 15, { evento: { fecha: '2026-03-28' } }),
  fd('F7', '2026-04-15', NORTE, 2500, 21, 15),
  fd('F8', '2026-05-05', VERDE, 1000, 21, 7),
  fd('F9', '2026-05-20', KREATIV, 3600, 0, 0, ue),
  fd('F10', '2026-06-10', LAURA, 1200, 21, 0),
  fd('F11', '2026-06-25', PIXEL, 1800, 21, 15),
  fd('F12', '2026-07-10', NORTE, 2200, 21, 15),
  fd('F13', '2026-08-05', BLEU, 2900, 0, 0, ue),
  fd('F14', '2026-09-15', VERDE, 1400, 21, 7),
  fd('F15', '2026-09-20', LAURA, 1100, 21, 0),
  // Devolución de parte del trabajo de F11 (art. 80.Dos LIVA): modificación de base y cuota en las 14 y 15 del 3T.
  fd('R1', '2026-09-28', PIXEL, -300, 21, 15, { rectifica: { id: 'F11', fecha: '2026-06-25', motivo: 'devolucion' } }),
  fd('F16', '2026-10-08', PIXEL, 2400, 21, 15),
  fd('F17', '2026-11-12', NORTE, 1900, 21, 15),
  fd('F18', '2026-11-20', KREATIV, 4000, 0, 0, ue),
  fd('F19', '2026-12-01', ACME, 2500, 0, 0, usa),
  fd('F20', '2026-12-10', VERDE, 1600, 21, 7),
  fd('F21', '2026-12-18', LAURA, 600, 21, 0),
];
const gd = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'dis', base, ivaPct, ...x });
const gastosD = [
  // Alquiler del estudio a una SL española: 800 € al mes con IVA y retención del 19 % (art. 100 RIRPF): 115 y 180.
  ...MM.map((m) => gd(`alq${m}`, `2026-${m}-01`, 800, 21, { alquiler: true, concepto: 'Alquiler del estudio', proveedor: 'Inmuebles Retiro SL', proveedorNif: 'B76543214' })),
  // Gestoría con retención del 15 % (art. 101.5.a LIRPF): 111 (07-09) y 190 clave G.
  ...['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31'].map((f, i) => gd(`ges${i + 1}`, f, 150, 21, { irpfPct: 15, concepto: 'Asesoría fiscal', proveedor: 'Gestoría Alcalá SL', proveedorNif: 'B11111119' })),
  // Google Ads desde Irlanda: servicio B2B de la UE, inversión del sujeto pasivo (art. 84.Uno.2.º LIVA): 10-11 y 36-37 del
  // 303, clave I del 349.
  ...[['03-31', 300], ['06-30', 450], ['09-30', 250], ['12-31', 500]].map(([f, b], i) => gd(`ads${i + 1}`, `2026-${f}`, b, 0, { concepto: 'Google Ads', proveedor: 'Google Ireland Ltd', proveedorNif: 'IE6388047V', categoria: '627' })),
  // Ordenador de 1.500 €: inmovilizado (26 %, Orden 27-3-1998), pero no bien de inversión del IVA (< 3.005,06 €, art. 108
  // LIVA): su IVA va en las 28-29.
  gd('pc', '2026-02-01', 1500, 21, { inversion: { tipo: 'informatica' }, concepto: 'Ordenador portátil', proveedor: 'PC Componentes SL', proveedorNif: 'B73347494' }),
  // Furgoneta de 20.000 €: bien de inversión del IVA (30-31) y elemento de transporte al 16 %.
  gd('furgo', '2026-07-01', 20000, 21, { inversion: { tipo: 'transporte' }, concepto: 'Furgoneta de reparto', proveedor: 'Motor Castellana SA', proveedorNif: 'A28123453' }),
  // Renting del turismo: el 50 % del IVA (art. 95.Tres.2.ª LIVA) y nada en el IRPF (art. 22.4 RIRPF, uso no exclusivo).
  ...['2026-01-05', '2026-04-05', '2026-07-05', '2026-10-05'].map((f, i) => gd(`rent${i + 1}`, f, 1200, 21, { deduciblePct: 50, afectoPct: 0, concepto: 'Renting del turismo', proveedor: 'Renting Auto SA', proveedorNif: 'A82345671' })),
  // Cuota de autónomos: gasto del IRPF (art. 30.2.1.ª LIRPF), sin IVA y fuera del 347 (art. 33.2 RGAT, sin factura).
  ...MM.map((m) => gd(`reta${m}`, `2026-${m}-${ultimo[m]}`, 300, 0, { categoria: '642', concepto: 'Cuota de autónomos', proveedor: 'Tesorería General de la Seguridad Social' })),
  // Multa: no deducible (art. 14.1.c LIS por remisión del art. 28.1 LIRPF).
  gd('multa', '2026-05-14', 200, 0, { concepto: 'Multa de aparcamiento', proveedor: 'Ayuntamiento de Madrid' }),
  gd('pap1', '2026-05-20', 250, 21, { concepto: 'Papel y tintas', proveedor: 'Papelería Gráfica SL', proveedorNif: 'B84567893' }),
  gd('pap2', '2026-11-15', 400, 21, { concepto: 'Papel y tintas', proveedor: 'Papelería Gráfica SL', proveedorNif: 'B84567893' }),
  ...['03', '06', '09', '12'].map((m) => gd(`tel${m}`, `2026-${m}-15`, 90, 21, { concepto: 'Fibra y móvil', proveedor: 'Telefónica de España SA', proveedorNif: 'A82018474' })),
];
const fiscalD = { tipo: 'autonomo', iva: 'general', irpf: 'simplificada', alquiler: true, trabajadores: true, intracom: true };
const rend130D = { 2025: 15000 }; // rendimiento de 2025 de más de 12.000 €: sin minoración (art. 110.3.c RIRPF)
const opD = opciones130(fiscalD, rend130D, 2026);
// Los pagos del 130 ya presentados (lo que salió en cada uno, calculado abajo a mano).
const pagosD = { 1: 574.42, 2: 379.93, 3: 111.97, 4: 697.47 };

test('diseñadora · 303 del 1T: devengo de F6 en marzo, UE en la 59, EE. UU. en la 120 y Google Ads autoliquidado', () => {
  const c = casillas303(facturasD, gastosD, 2026, 1);
  // 07: F1 2.000 + F2 1.500 + F4 800 + F6 900 = 5.200; 09 = 5.200 × 21 % = 1.092.
  // 10-11: Google Ads 300 × 21 % = 63. 59: F3 3.200. 120: F5 2.000.
  // 28: alquiler 3 × 800 + gestoría 150 + ordenador 1.500 + renting 1.200 × 50 % + teléfono 90 = 4.740
  // 29: 504 + 31,50 + 315 + 252 × 50 % + 18,90 = 995,40 (la base del turismo, en la misma proporción: instrucciones del 303).
  // 36-37: Google Ads 300 / 63. 27 = 1.092 + 63 = 1.155; 45 = 995,40 + 63 = 1.058,40; 46 = 1.155 − 1.058,40 = 96,60.
  assert.deepEqual(['07', '09', '10', '11', '12', '13', '14', '15', '27', '28', '29', '30', '31', '36', '37', '45', '46', '59', '60', '120'].map((k) => c[k]),
    [5200, 1092, 300, 63, 0, 0, 0, 0, 1155, 4740, 995.4, 0, 0, 300, 63, 1058.4, 96.6, 3200, 0, 2000]);
});

test('diseñadora · 303 del 2T, 3T (rectificativa y furgoneta) y 4T', () => {
  const [, q2, q3, q4] = [1, 2, 3, 4].map((t) => casillas303(facturasD, gastosD, 2026, t));
  // 2T. 07: 2.500 + 1.000 + 1.200 + 1.800 = 6.500 (09: 1.365). 10-11 y 36-37: 450 / 94,50. 59: F9 3.600.
  // 28: 2.400 + 150 + 600 + 90 + 250 = 3.490; 29: 504 + 31,50 + 126 + 18,90 + 52,50 = 732,90 (la multa no lleva IVA).
  // 27 = 1.365 + 94,50 = 1.459,50; 45 = 732,90 + 94,50 = 827,40; 46 = 632,10.
  assert.deepEqual(['07', '09', '10', '11', '27', '28', '29', '36', '37', '45', '46', '59', '120'].map((k) => q2[k]), [6500, 1365, 450, 94.5, 1459.5, 3490, 732.9, 450, 94.5, 827.4, 632.1, 3600, 0]);
  // 3T. 07: 2.200 + 1.400 + 1.100 = 4.700 (09: 987); R1 en las 14-15: −300 / −63. 10-11: 250 / 52,50. 59: F13 2.900.
  // 28: 2.400 + 150 + 600 + 90 = 3.240; 29: 680,40. 30-31: furgoneta 20.000 / 4.200 (bien de inversión, ≥ 3.005,06 €).
  // 27 = 987 + 52,50 − 63 = 976,50; 45 = 680,40 + 4.200 + 52,50 = 4.932,90; 46 = 976,50 − 4.932,90 = −3.956,40.
  assert.deepEqual(['07', '09', '10', '11', '14', '15', '27', '28', '29', '30', '31', '36', '37', '45', '46', '59'].map((k) => q3[k]), [4700, 987, 250, 52.5, -300, -63, 976.5, 3240, 680.4, 20000, 4200, 250, 52.5, 4932.9, -3956.4, 2900]);
  // 4T. 07: 2.400 + 1.900 + 1.600 + 600 = 6.500 (09: 1.365). 10-11: 500 / 105. 59: F18 4.000; 120: F19 2.500.
  // 28: 2.400 + 150 + 600 + 90 + 400 = 3.640; 29: 504 + 31,50 + 126 + 18,90 + 84 = 764,40.
  // 27 = 1.365 + 105 = 1.470; 45 = 764,40 + 105 = 869,40; 46 = 600,60.
  assert.deepEqual(['07', '09', '10', '11', '27', '28', '29', '30', '36', '37', '44', '45', '46', '59', '120'].map((k) => q4[k]), [6500, 1365, 500, 105, 1470, 3640, 764.4, 0, 500, 105, 0, 869.4, 600.6, 4000, 2500]);
});

test('diseñadora · compensación de los 303 (art. 99.Cinco LIVA) y devolución pedida en el 4T (art. 115 LIVA)', () => {
  // 1T y 2T a ingresar; el 3T sale −3.956,40 a compensar; el 4T (600,60) lo compensa y quedan 3.356,80 − … :
  // pendiente tras el 4T = 3.956,40 − 600,60 = 3.355,80.
  const L = liquidaciones303(facturasD, gastosD, 2026);
  assert.deepEqual(L.map((l) => [l.bruto, l.anterior, l.compensado, l.ingresar, l.pendiente, l.devolucion]), [
    [96.6, 0, 0, 96.6, 0, 0], [632.1, 0, 0, 632.1, 0, 0], [-3956.4, 0, 0, 0, 3956.4, 0], [600.6, 3956.4, 600.6, 0, 3355.8, 0],
  ]);
  // Con la devolución pedida en el 4T se aplica todo el saldo (78 = 110 = 3.956,40) y se devuelven 600,60 − 3.956,40.
  const D = liquidaciones303(facturasD, gastosD, 2026, undefined, { pres303: { 2026: { 4: 'devolucion' } } })[3];
  assert.deepEqual([D.compensado, D.devolucion, D.pendiente], [3956.4, 3355.8, 0]);
});

test('diseñadora · el fichero del 303 lleva las mismas cifras', () => {
  const yo = { nif: '12345678Z', nombre: 'Lucía Martín Ortega' };
  const L = liquidaciones303(facturasD, gastosD, 2026);
  const q = (t) => casillas303(facturasD, gastosD, 2026, t);
  const f1 = fichero303(yo, 2026, 1, q(1), L[0]);
  assert.deepEqual([f1.tipo, f1.resultado], ['I', 96.6]);
  assert.ok(f1.contenido.includes(`${f17(5200)}02100${campos(1092, 300, 63, 0, 0, 0, 0)}`));
  // 27, 28-39 y 40-46 seguidas: 1.155 | 4.740, 995,40, 0, 0, 0, 0, 0, 0, 300, 63, 0, 0 | 0, 0, 0, 0, 0, 1.058,40, 96,60.
  assert.ok(f1.contenido.includes(campos(1155, 4740, 995.4, 0, 0, 0, 0, 0, 0, 300, 63, 0, 0, 0, 0, 0, 0, 0, 1058.4, 96.6)));
  assert.ok(f1.contenido.includes(campos(3200, 0, 2000, 0, 0, 0))); // 59, 60, 120, 122, 123, 124
  const f3 = fichero303(yo, 2026, 3, q(3), L[2]);
  assert.deepEqual([f3.tipo, f3.resultado], ['C', -3956.4]);
  assert.ok(f3.contenido.includes(campos(4700) + '02100' + campos(987, 250, 52.5, 0, 0, -300, -63)));
  // 4T: 46 = 600,60, compensado del 3T (78) 600,60 → resultado cero («N»); 110 = 3.956,40, 87 = 3.355,80.
  const f4 = fichero303(yo, 2026, 4, q(4), L[3]);
  assert.deepEqual([f4.tipo, f4.resultado], ['N', 0]);
  assert.ok(f4.contenido.includes(campos(3956.4, 600.6, 3355.8)));
});

test('diseñadora · 390: casillas y que cuadra con la suma de los cuatro 303', () => {
  const { c } = modelo390(facturasD, gastosD, 2026);
  // Devengado al 21 %: 05 = 5.200 + 6.500 + 4.700 + 6.500 = 22.900; 06 = 1.092 + 1.365 + 987 + 1.365 = 4.809.
  // Servicios de la UE (551-552): 300 + 450 + 250 + 500 = 1.500 / 315. Modificaciones (29-30): −300 / −63.
  // 33 = 22.900 + 1.500 − 300 = 24.100; 34 = 47 = 4.809 + 315 − 63 = 5.061 (= 1.155 + 1.459,50 + 976,50 + 1.470).
  assert.deepEqual(['05', '06', '551', '552', '29', '30', '33', '34', '47'].map((k) => c[k]), [22900, 4809, 1500, 315, -300, -63, 24100, 5061, 5061]);
  // Deducciones: interiores corrientes 605-606 = 48-49: 4.740 + 3.490 + 3.240 + 3.640 = 15.110 / 995,40 + 732,90 + 680,40 +
  // 764,40 = 3.173,10; bienes de inversión 613-614 = 50-51: 20.000 / 4.200; servicios de la UE 637-638 = 597-598: 1.500 / 315.
  // 64 = 3.173,10 + 4.200 + 315 = 7.688,10 (= suma de las 45); 65 = 5.061 − 7.688,10 = −2.627,10 (= suma de las 46).
  assert.deepEqual(['605', '606', '48', '49', '613', '614', '50', '51', '637', '638', '597', '598', '64', '65'].map((k) => c[k]),
    [15110, 3173.1, 15110, 3173.1, 20000, 4200, 20000, 4200, 1500, 315, 1500, 315, 7688.1, -2627.1]);
  // 95: resultados a ingresar 96,60 + 632,10 = 728,70; 97: el 4T no fue a compensar (0); 662: lo generado en el 3T que no
  // se aplicó en el año, 3.956,40 − 600,60 = 3.355,80 (instrucciones del 390, casilla 662).
  assert.deepEqual(['84', '85', '86', '95', '97', '98', '662'].map((k) => c[k]), [-2627.1, 0, -2627.1, 728.7, 0, 0, 3355.8]);
  // Volumen de operaciones (art. 121 LIVA): 99 régimen general 22.900 − 300 = 22.600; 103 servicios a la UE 3.200 + 3.600 +
  // 2.900 + 4.000 = 13.700; 110 no sujetas por localización 2.000 + 2.500 = 4.500; 108 = 40.800.
  assert.deepEqual(['99', '103', '110', '108'].map((k) => c[k]), [22600, 13700, 4500, 40800]);
});

test('diseñadora · 130 de los cuatro trimestres (01-19), con la amortización y la difícil justificación', () => {
  assert.deepEqual(opD, { minoracion: 0 });
  const T = resumenAnual(facturasD, gastosD, 2026, pagosD, ['dis'], { ...opD }).trimestres;
  // Ingresos por trimestre (base; F6 en el 1T; R1 resta en el 3T):
  //   1T 2.000 + 1.500 + 3.200 + 800 + 2.000 + 900 = 10.400; 2T 2.500 + 1.000 + 3.600 + 1.200 + 1.800 = 10.100;
  //   3T 2.200 + 2.900 + 1.400 + 1.100 − 300 = 7.300; 4T 2.400 + 1.900 + 4.000 + 2.500 + 1.600 + 600 = 13.000.
  // Retenciones: 1T 300 + 225 + 135 = 660; 2T 375 + 70 + 270 = 715; 3T 330 + 98 − 45 = 383; 4T 360 + 285 + 112 = 757.
  // Amortización por días (lineal, Orden 27-3-1998): ordenador 1.500 × 26 % = 390 €/año desde el 1-2: acumulada a 31-3
  //   390 × 59/365 = 63,04; a 30-6 390 × 150/365 = 160,27; a 30-9 390 × 242/365 = 258,58; a 31-12 390 × 334/365 = 356,88
  //   → 63,04 / 97,23 / 98,31 / 98,30. Furgoneta 20.000 × 16 % = 3.200 €/año desde el 1-7: a 30-9 3.200 × 92/365 = 806,58;
  //   a 31-12 3.200 × 184/365 = 1.613,15 → 806,58 / 806,57.
  // Gastos: 1T alquiler 2.400 + gestoría 150 + Ads 300 + autónomos 900 + teléfono 90 + 63,04 = 3.903,04
  //   2T 2.400 + 150 + 450 + 900 + 90 + papel 250 + 97,23 = 4.337,23 (sin la multa ni el turismo)
  //   3T 2.400 + 150 + 250 + 900 + 90 + 98,31 + 806,58 = 4.694,89; 4T 2.400 + 150 + 500 + 900 + 90 + 400 + 98,30 + 806,57 = 5.344,87.
  assert.deepEqual(T.map((q) => [q.ingresos, q.retenciones, q.amortizacion, q.gastos]), [
    [10400, 660, 63.04, 3903.04], [10100, 715, 97.23, 4337.23], [7300, 383, c2(98.31 + 806.58), 4694.89], [13000, 757, c2(98.30 + 806.57), 5344.87],
  ]);
  // Difícil justificación: 5 % del rendimiento acumulado (art. 30.2.4.ª RIRPF; 5 % también en 2025, Manual de Renta 2025).
  //   1T: 10.400 − 3.903,04 = 6.496,96 → 324,85; 03 = 6.172,11; 04 = 1.234,42; 06 = 660; 07 = 574,42.
  //   2T: 20.500 − 8.240,27 = 12.259,73 → 612,99; 03 = 11.646,74; 04 = 2.329,35; 05 = 574,42; 06 = 1.375; 07 = 379,93.
  //   3T: 27.800 − 12.935,16 = 14.864,84 → 743,24; 03 = 14.121,60; 04 = 2.824,32; 05 = 954,35; 06 = 1.758; 07 = 111,97.
  //   4T: 40.800 − 18.280,03 = 22.519,97 → 1.126,00; 03 = 21.393,97; 04 = 4.278,79; 05 = 1.066,32; 06 = 2.515; 07 = 697,47.
  assert.deepEqual(T.map((q) => [q.ingAcum, q.gasAcum, q.rendAcum, q.pagosPrev, q.retAcum, q.c07, q.c12, q.minoracion, q.negPrev, q.c16, q.c19, q.m130]), [
    [10400, 4227.89, 6172.11, 0, 660, 574.42, 574.42, 0, 0, 0, 574.42, 574.42],
    [20500, c2(8240.27 + 612.99), 11646.74, 574.42, 1375, 379.93, 379.93, 0, 0, 0, 379.93, 379.93],
    [27800, c2(12935.16 + 743.24), 14121.6, 954.35, 1758, 111.97, 111.97, 0, 0, 0, 111.97, 111.97],
    [40800, c2(18280.03 + 1126), 21393.97, 1066.32, 2515, 697.47, 697.47, 0, 0, 0, 697.47, 697.47],
  ]);
});

test('diseñadora · 130: la 05 suma solo las 07 positivas de los trimestres presentados', () => {
  // Sin presentar el 2T, el 3T lleva su pago pendiente: 05 = 574,42 y 07 = 2.824,32 − 574,42 − 1.758 = 491,90; el 4T,
  // 05 = 574,42 + 491,90 = 1.066,32 (igual que presentando todos).
  const T = resumenAnual(facturasD, gastosD, 2026, { 1: 574.42, 3: 491.9 }, ['dis'], opD).trimestres;
  assert.deepEqual(T.map((q) => [q.pagosPrev, q.c07]), [[0, 574.42], [574.42, 379.93], [574.42, 491.9], [1066.32, 697.47]]);
  // Sin ninguno presentado, cada trimestre arrastra lo de todos los anteriores: 07 del 4T = 4.278,79 − 2.515 = 1.763,79.
  assert.deepEqual(resumenAnual(facturasD, gastosD, 2026, {}, ['dis'], opD).trimestres.map((q) => q.c07), [574.42, c2(2329.35 - 1375), c2(2824.32 - 1758), c2(4278.794 - 2515)]);
});

test('diseñadora · el fichero del 130 lleva las mismas cifras', () => {
  const yo = { nif: '12345678Z', nombre: 'Lucía Martín Ortega' };
  const T = resumenAnual(facturasD, gastosD, 2026, pagosD, ['dis'], opD).trimestres;
  const esperado = [
    [10400, 4227.89, 6172.11, 1234.42, 0, 660, 574.42],
    [20500, 8853.26, 11646.74, 2329.35, 574.42, 1375, 379.93],
    [27800, 13678.4, 14121.6, 2824.32, 954.35, 1758, 111.97],
    [40800, 19406.03, 21393.97, 4278.79, 1066.32, 2515, 697.47],
  ];
  T.forEach((q, i) => {
    const f = fichero130(yo, 2026, q);
    assert.deepEqual([f.tipo, f.resultado], ['I', esperado[i][6]]);
    assert.ok(f.contenido.includes(campos(...esperado[i])), `130 ${i + 1}T`);
  });
});

test('diseñadora · 111, 115, 180 y 190', () => {
  // 111 (casillas 07-09): la gestoría, 150 € y 22,50 € cada trimestre; sin nóminas (01-06 a cero).
  for (const t of [1, 2, 3, 4]) {
    assert.deepEqual(retencionesProfesionales(gastosD, 2026, t), { perceptores: 1, base: 150, retenciones: 22.5 });
    assert.deepEqual(modelo111([], 2026, t), { perceptores: 0, percepciones: 0, retenciones: 0, seguros: 0 });
    // 115: tres meses de alquiler, 2.400 € y 2.400 × 19 % = 456 €.
    assert.deepEqual(modelo115(gastosD, 2026, t), { perceptores: 1, base: 2400, retenciones: 456 });
  }
  // 180: 12 × 800 = 9.600 € y 12 × 152 = 1.824 €.
  assert.deepEqual(modelo180(gastosD, 2026), { arrendadores: [{ nombre: 'Inmuebles Retiro SL', nif: 'B76543214', base: 9600, retenciones: 1824 }], base: 9600, retenciones: 1824 });
  // 190: la gestoría con la clave G, subclave 01 (15 %): 600 € y 90 €.
  assert.deepEqual(modelo190([], [], 2026, gastosD), { perceptores: [{ nombre: 'Gestoría Alcalá SL', nif: 'B11111119', clave: 'G', subclave: '01', percepciones: 600, retenciones: 90 }], percepciones: 600, retenciones: 90 });
});

test('diseñadora · 347: quién pasa de 3.005,06 € con IVA', () => {
  const r = modelo347(facturasD, gastosD, 2026);
  // Ventas: solo Laura (particular sin retención): (800 + 1.200 + 1.100 + 600) × 1,21 = 4.477 (968 / 1.452 / 1.331 / 726).
  // Los clientes con retención van en su 190 (art. 33.2 RGAT), los de la UE en el 349 y el de EE. UU. no se declara.
  assert.deepEqual(r.ventas.map((o) => [o.nif, o.total, o.trimestres]), [['50123456Z', 4477, [968, 1452, 1331, 726]]]);
  // Compras: furgoneta 24.200 (3T) y renting 4 × 1.452 = 5.808. No: alquiler (180), gestoría (190), Google (349), autónomos
  // (sin factura), ordenador 1.815, papel 786,50, teléfono 435,60 y la multa 200 (no pasan de 3.005,06).
  assert.deepEqual(r.compras.map((o) => [o.nif, o.total, o.trimestres]), [['A28123453', 24200, [0, 0, 24200, 0]], ['A82345671', 5808, [1452, 1452, 1452, 1452]]]);
});

test('diseñadora · 349 de cada trimestre: clave S de sus clientes de la UE y clave I de Google', () => {
  const esperado = [
    [['FR40303265045', 'S', 3200], ['IE6388047V', 'I', 300]],
    [['DE123456789', 'S', 3600], ['IE6388047V', 'I', 450]],
    [['FR40303265045', 'S', 2900], ['IE6388047V', 'I', 250]],
    [['DE123456789', 'S', 4000], ['IE6388047V', 'I', 500]],
  ];
  for (const t of [1, 2, 3, 4]) {
    const m = modelo349(facturasD, 2026, t, gastosD);
    assert.deepEqual(m.operadores.map((o) => [o.nif, o.clave, o.base]), esperado[t - 1]);
    assert.equal(m.total, esperado[t - 1][0][2] + esperado[t - 1][1][2]);
    assert.equal(m.mensual, null); // menos de 50.000 € de entregas y servicios (art. 81 RIVA): trimestral
    assert.deepEqual(periodos349(facturasD, 2026, t, gastosD).map((p) => p.periodo), [`${t}T`]);
    // La 59 del 303 recoge lo mismo que la clave S.
    assert.equal(casillas303(facturasD, gastosD, 2026, t)['59'], esperado[t - 1][0][2]);
  }
});

test('diseñadora · borrador de la renta en Madrid', () => {
  const r = borradorRenta(facturasD, gastosD, 2026, pagosD, { personal: { ccaa: 'madrid', nacimiento: 1990 } });
  // Rendimiento: 40.800 − 18.280,03 = 22.519,97; difícil justificación 1.126,00; neto 21.393,97; sin reducción del art. 32.2
  // (rentas de 12.000 € o más).
  assert.deepEqual([r.ingresos, r.gastos, r.difJust, r.reduccion, r.rendimiento], [40800, 18280.03, 1126, 0, 21393.97]);
  // Escala estatal (art. 63 LIRPF): 12.450 × 9,5 % + 7.750 × 12 % + 1.193,97 × 15 % = 1.182,75 + 930 + 179,10 = 2.291,85;
  // menos la del mínimo personal 5.550 × 9,5 % = 527,25 → 1.764,60.
  // Madrid (Manual de Renta 2025, pág. 1128): 13.362,22 × 8,5 % + 5.642,41 × 10,7 % + 2.389,34 × 12,8 % = 1.135,79 + 603,74 +
  // 305,84 = 2.045,36; menos la del mínimo autonómico 5.956,65 × 8,5 % = 506,32 → 1.539,04.
  assert.deepEqual([r.minimos.total, r.minimosAutonomicos.total, r.cuotaEstatal, r.cuotaAutonomica, r.cuota], [5550, 5956.65, 1764.6, 1539.04, 3303.64]);
  // Resultado: 3.303,64 − retenciones 2.515 − pagos del 130 (574,42 + 379,93 + 111,97 + 697,47 = 1.763,79) = −975,15.
  assert.deepEqual([r.retenciones, r.pagos130, r.resultado], [2515, 1763.79, -975.15]);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2. Marta, fisioterapeuta con prorrata: sesiones exentas (art. 20.Uno.3.º LIVA) y venta de productos al 21 %.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PACIENTE = { nombre: 'Pacientes particulares', nif: '' };
const ff = (id, fecha, base, ivaPct) => ({ id, fecha, actividad: 'fisio', cliente: PACIENTE, base, ivaPct, irpfPct: 0, ...(ivaPct ? {} : { operacion: 'exenta' }) });
const facturasF = [
  // 2025: 30.000 exentas y 10.000 con IVA → prorrata definitiva de 2025 = 10.000 / 40.000 = 25 % (art. 104 LIVA),
  // provisional de 2026 (art. 105.Uno).
  ...['03', '06', '09', '12'].flatMap((m) => [ff(`e25-${m}`, `2025-${m}-28`, 7500, 0), ff(`p25-${m}`, `2025-${m}-15`, 2500, 21)]),
  // 2026: sesiones 8.000 / 8.500 / 6.500 / 9.000 = 32.000; productos 2.500 / 3.000 / 2.000 / 4.500 = 12.000.
  ff('e1', '2026-01-31', 2500, 0), ff('e2', '2026-02-28', 2700, 0), ff('e3', '2026-03-31', 2800, 0),
  ff('e4', '2026-04-30', 2800, 0), ff('e5', '2026-05-31', 2900, 0), ff('e6', '2026-06-30', 2800, 0),
  ff('e7', '2026-07-31', 2600, 0), ff('e8', '2026-08-31', 1500, 0), ff('e9', '2026-09-30', 2400, 0),
  ff('e10', '2026-10-31', 3000, 0), ff('e11', '2026-11-30', 3100, 0), ff('e12', '2026-12-31', 2900, 0),
  ff('p1', '2026-02-15', 1200, 21), ff('p2', '2026-03-20', 1300, 21), ff('p3', '2026-05-10', 3000, 21),
  ff('p4', '2026-08-20', 2000, 21), ff('p5', '2026-11-10', 2000, 21), ff('p6', '2026-12-15', 2500, 21),
];
const gf = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'fisio', base, ivaPct, ...x });
const gastosF = [
  ...[['01-20', 1000], ['04-20', 800], ['07-20', 600], ['10-20', 1200]].map(([f, b], i) => gf(`mat${i}`, `2026-${f}`, b, 21, { concepto: 'Material sanitario', proveedor: 'Suministros Médicos SL', proveedorNif: 'B28765432' })),
  ...[['02-15', 1200], ['05-15', 1500], ['08-15', 1000], ['11-15', 2000]].map(([f, b], i) => gf(`cre${i}`, `2026-${f}`, b, 21, { categoria: '600', concepto: 'Cremas y vendajes para venta', proveedor: 'Farma Distribución SA', proveedorNif: 'A28345678' })),
  ...['03-31', '06-30', '09-30', '12-31'].map((f, i) => gf(`luz${i}`, `2026-${f}`, 150, 21, { concepto: 'Luz de la consulta', proveedor: 'Iberdrola Clientes SAU', proveedorNif: 'A95758389' })),
  ...['03-31', '06-30', '09-30', '12-31'].map((f, i) => gf(`reta${i}`, `2026-${f}`, 900, 0, { categoria: '642', concepto: 'Cuota de autónomos', proveedor: 'TGSS' })),
];

test('fisioterapeuta · 303 con la prorrata provisional del año anterior (25 %) y la regularización con la definitiva (28 %) en la 44', () => {
  const q = [1, 2, 3, 4].map((t) => casillas303(facturasF, gastosF, 2026, t));
  // IVA soportado (todo de uso común): 1T 2.350 → 493,50; 2T 2.450 → 514,50; 3T 1.750 → 367,50; 4T 3.350 → 703,50.
  // Bases sin prorratear (instrucciones del 303); cuotas al 25 %: 123,375 → 123,38; 128,625 → 128,63; 91,875 → 91,88;
  // 175,875 → 175,88.
  // Definitiva 2026: 12.000 / 44.000 = 27,27 % → 28 % (redondeo al entero superior, art. 104.Dos).
  // 44 = 2.079 × 28 % − (123,38 + 128,63 + 91,88 + 175,88) = 582,12 − 519,77 = 62,35 (art. 105.Tres).
  assert.deepEqual(q.map((c) => [c['07'], c['09'], c['28'], c['29'], c['44'], c['45'], c['46']]), [
    [2500, 525, 2350, 123.38, 0, 123.38, c2(525 - 123.38)],
    [3000, 630, 2450, 128.63, 0, 128.63, c2(630 - 128.63)],
    [2000, 420, 1750, 91.88, 0, 91.88, c2(420 - 91.88)],
    [4500, 945, 3350, 175.88, 62.35, c2(175.88 + 62.35), c2(945 - 238.23)],
  ]);
  assert.deepEqual(q.map((c) => c.prorrata), [
    { provisional: 25, perdido: c2(493.5 - 123.38) }, { provisional: 25, perdido: c2(514.5 - 128.63) }, { provisional: 25, perdido: c2(367.5 - 91.88) },
    { provisional: 25, definitiva: 28, perdido: c2(703.5 - 175.88 - 62.35) },
  ]);
});

test('fisioterapeuta · 390 con la prorrata (115-118, 522) y 130 con el IVA no deducible como gasto', () => {
  const { c } = modelo390(facturasF, gastosF, 2026);
  // 115: 44.000; 116: con derecho a deducir 12.000; 117: general; 118: 28 %. Volumen: 99 12.000 y 105 exentas 32.000.
  assert.deepEqual(['115', '116', '117', '118', '99', '105', '108'].map((k) => c[k]), [44000, 12000, 'G', 28, 12000, 32000, 44000]);
  // 605-606: 9.900 de base y lo deducido con la provisional, 519,77; 522: la regularización, 62,35; 64 = 582,12;
  // 47 = 525 + 630 + 420 + 945 = 2.520; 65 = 2.520 − 582,12 = 1.937,88.
  assert.deepEqual(['605', '606', '522', '64', '47', '65'].map((k) => c[k]), [9900, 519.77, 62.35, 582.12, 2520, 1937.88]);
  // 130 (fiscal.iva general, rendimiento de 2025 de 20.000 €: sin minoración). Ingresos: 10.500 / 11.500 / 8.500 / 13.500.
  // Gastos: bases + autónomos + IVA perdido: 1T 2.350 + 900 + 370,12 = 3.620,12; 2T 2.450 + 900 + 385,87 = 3.735,87;
  // 3T 1.750 + 900 + 275,62 = 2.925,62; 4T 3.350 + 900 + 465,27 = 4.715,27 (en total 2.079 − 582,12 = 1.496,88 de IVA).
  const op = opciones130({ tipo: 'autonomo', iva: 'general' }, { 2025: 20000 }, 2026);
  const T = resumenAnual(facturasF, gastosF, 2026, { 1: 1307.18, 2: 1475.18, 3: 1059.13 }, ['fisio'], op).trimestres;
  assert.deepEqual(T.map((x) => [x.ingresos, x.gastos, x.prorrata]), [[10500, 3620.12, 370.12], [11500, 3735.87, 385.87], [8500, 2925.62, 275.62], [13500, 4715.27, 465.27]]);
  // 1T: 6.879,88 − 5 % (343,99) = 6.535,89 → 07 = 1.307,18. 2T: 14.644,01 − 732,20 = 13.911,81 → 2.782,36 − 1.307,18 = 1.475,18.
  // 3T: 20.218,39 − 1.010,92 = 19.207,47 → 3.841,49 − 2.782,36 = 1.059,13. 4T: 29.003,12 − 1.450,16 = 27.552,96 →
  // 5.510,59 − 3.841,49 = 1.669,10.
  assert.deepEqual(T.map((x) => [x.rendAcum, x.c07, x.m130]), [[6535.89, 1307.18, 1307.18], [13911.81, 1475.18, 1475.18], [19207.47, 1059.13, 1059.13], [27552.96, 1669.1, 1669.1]]);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 3. Doctor Ruiz, médico exento puro: sin 303; Google Ads de Irlanda y software de EE. UU. por el 309.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SANITAS = { nombre: 'Aseguradora Salud SA', nif: 'A28032261' };
const fm = (id, fecha, cliente, base, irpfPct) => ({ id, fecha, actividad: 'med', cliente, base, ivaPct: 0, irpfPct, operacion: 'exenta' });
const facturasM = [
  fm('m1', '2026-01-31', PACIENTE, 2000, 0), fm('m2', '2026-02-28', SANITAS, 3000, 15), fm('m3', '2026-03-31', PACIENTE, 2000, 0),
  fm('m4', '2026-04-30', PACIENTE, 2500, 0), fm('m5', '2026-05-31', SANITAS, 3500, 15), fm('m6', '2026-06-30', PACIENTE, 2000, 0),
  fm('m7', '2026-07-31', PACIENTE, 1500, 0), fm('m8', '2026-08-31', SANITAS, 2000, 15), fm('m9', '2026-09-30', PACIENTE, 1500, 0),
  fm('m10', '2026-10-31', PACIENTE, 2500, 0), fm('m11', '2026-11-30', SANITAS, 4000, 15), fm('m12', '2026-12-31', PACIENTE, 2500, 0),
];
const gm = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'med', base, ivaPct, ...x });
const gastosM = [
  ...[['03-31', 200], ['06-30', 300], ['09-30', 100], ['12-31', 400]].map(([f, b], i) => gm(`ads${i}`, `2026-${f}`, b, 0, { concepto: 'Google Ads', proveedor: 'Google Ireland Ltd', proveedorNif: 'IE6388047V', categoria: '627' })),
  ...['01-10', '04-10', '07-10', '10-10'].map((f, i) => gm(`soft${i}`, `2026-${f}`, 100, 0, { origen: 'fuera', concepto: 'Software de citas', proveedor: 'Doxy Inc' })),
  ...MM.map((m) => gm(`alq${m}`, `2026-${m}-01`, 500, 21, { alquiler: true, concepto: 'Alquiler de la consulta', proveedor: 'Clínicas Salamanca SL', proveedorNif: 'B28456789' })),
  ...['03-31', '06-30', '09-30', '12-31'].map((f, i) => gm(`reta${i}`, `2026-${f}`, 900, 0, { categoria: '642', concepto: 'Cuota de autónomos', proveedor: 'TGSS' })),
];

test('médico exento · modelos que presenta: 309 y no 303 ni 390', () => {
  const ids = modelosDe({ tipo: 'autonomo', iva: 'exento', alquiler: true }).map((m) => m.id);
  assert.ok(ids.includes('309') && ids.includes('130') && ids.includes('115'));
  assert.ok(!ids.includes('303') && !ids.includes('390'));
});

test('médico exento · 309 de cada trimestre (hecho imponible 3, situación 3): Ads + software al 21 %', () => {
  // 1T 200 + 100 = 300 → 63; 2T 300 + 100 = 400 → 84; 3T 100 + 100 = 200 → 42; 4T 400 + 100 = 500 → 105
  // (art. 84.Uno.2.º LIVA; quien no presenta el 303 lo ingresa con el 309, sin derecho a deducir: 23 = 0).
  const esperado = [[300, 63], [400, 84], [200, 42], [500, 105]];
  for (const t of [1, 2, 3, 4]) {
    const m = modelo309(gastosM, 2026, t, { regimen: 'exento' });
    const [b, q] = esperado[t - 1];
    assert.deepEqual(m.declaraciones.map((d) => [d.hecho, d.situacion, d.c['01'], d.c['02'], d.c['03'], d.c['22'], d.c['23'], d.c['24']]), [[3, 3, b, 21, q, q, 0, q]]);
    assert.equal(m.ingresar, q);
  }
});

test('médico exento · 130 y renta con el IVA soportado (y el del 309) como coste', () => {
  // Gastos con el IVA: 1T Ads 200 + 42, software 100 + 21, alquiler 3 × 605, autónomos 900 = 242 + 121 + 1.815 + 900 = 3.078;
  // 2T 363 + 121 + 1.815 + 900 = 3.199; 3T 121 + 121 + 1.815 + 900 = 2.957; 4T 484 + 121 + 1.815 + 900 = 3.320.
  const op = { ...opciones130({ tipo: 'autonomo', iva: 'exento' }, { 2025: 25000 }, 2026), ivaCoste: true };
  const T = resumenAnual(facturasM, gastosM, 2026, { 1: 295.18, 2: 387.19, 3: 88.17 }, ['med'], op).trimestres;
  assert.deepEqual(T.map((q) => [q.ingresos, q.gastos, q.retenciones]), [[7000, 3078, 450], [8000, 3199, 525], [5000, 2957, 300], [9000, 3320, 600]]);
  // 1T: 7.000 − 3.078 = 3.922 − 196,10 = 3.725,90 → 745,18 − 450 = 295,18.
  // 2T: 15.000 − 6.277 = 8.723 − 436,15 = 8.286,85 → 1.657,37 − 975 − 295,18 = 387,19.
  // 3T: 20.000 − 9.234 = 10.766 − 538,30 = 10.227,70 → 2.045,54 − 1.275 − 682,37 = 88,17.
  // 4T: 29.000 − 12.554 = 16.446 − 822,30 = 15.623,70 → 3.124,74 − 1.875 − 770,54 = 479,20.
  assert.deepEqual(T.map((q) => [q.rendAcum, q.c07]), [[3725.9, 295.18], [8286.85, 387.19], [10227.7, 88.17], [15623.7, 479.2]]);
  const r = borradorRenta(facturasM, gastosM, 2026, { 1: 295.18, 2: 387.19, 3: 88.17, 4: 479.2 }, { ivaCoste: true, personal: { ccaa: 'madrid', nacimiento: 1975 } });
  assert.deepEqual([r.ingresos, r.gastos, r.difJust, r.rendimiento, r.retenciones], [29000, 12554, 822.3, 15623.7, 1875]);
  // 115 del médico: 3 × 500 = 1.500 y 3 × 95 = 285 cada trimestre.
  assert.deepEqual(modelo115(gastosM, 2026, 2), { perceptores: 1, base: 1500, retenciones: 285 });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 4. Antonio, agricultor en el régimen especial de la agricultura (REAGP) y estimación directa.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COOP = { nombre: 'Cooperativa Agrícola San Isidro', nif: 'F45000001' };
const FRUTAS = { nombre: 'Frutas Levante SL', nif: 'B46000003' };
// Ventas a empresas: compensación del 12 % (art. 130.Tres LIVA) y retención del 2 % (art. 95.4.2.º RIRPF).
const fa = (id, fecha, cliente, base, x = { compensacion: 12, irpfPct: 2 }) => ({ id, fecha, actividad: 'agro', cliente, base, ivaPct: 0, ...x });
const facturasA = [
  fa('a1', '2026-01-20', COOP, 6000), fa('a2', '2026-03-10', FRUTAS, 4000),
  fa('a3', '2026-04-25', COOP, 8000), fa('a4', '2026-06-15', FRUTAS, 7000),
  // Venta directa a un particular en el mercado: sin compensación (art. 130.Tres.1.º: solo a empresarios) ni retención.
  fa('a5', '2026-05-30', { nombre: 'Venta en el mercado', nif: '' }, 500, { irpfPct: 0 }),
  fa('a6', '2026-07-20', COOP, 12000), fa('a7', '2026-09-05', FRUTAS, 8000),
  fa('a8', '2026-11-15', COOP, 5000),
];
const ga = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'agro', base, ivaPct, ...x });
const gastosA = [
  ga('abono', '2026-02-10', 2000, 10, { concepto: 'Abonos', proveedor: 'Fertiberia SA', proveedorNif: 'A28123456' }),
  ga('gasoil', '2026-05-10', 1000, 21, { concepto: 'Gasóleo agrícola', proveedor: 'Repsol Comercial SA', proveedorNif: 'A80298839' }),
  ga('seguro', '2026-09-01', 600, 0, { categoria: '625', concepto: 'Seguro agrario', proveedor: 'Agroseguro SA' }),
  ...['03-31', '06-30', '09-30', '12-31'].map((f, i) => ga(`reta${i}`, `2026-${f}`, 300, 0, { categoria: '642', concepto: 'Cuota de autónomos', proveedor: 'TGSS' })),
];

test('agricultor REAGP · compensación del 12 % y 130 apartado II (08-11) con el 2 % de los ingresos del trimestre', () => {
  // La factura de 6.000: compensación 720, retención 120, total 6.000 + 720 − 120 = 6.600.
  assert.deepEqual(importes(facturasA[0]), { base: 6000, iva: 0, compensacion: 720, irpf: 120, total: 6600 });
  const fiscal = { tipo: 'autonomo', iva: 'reagp' };
  const op = { ...opciones130(fiscal, { 2025: 30000 }, 2026), ivaCoste: true };
  assert.deepEqual(op, { minoracion: 0, agricola: true, ivaCoste: true });
  const T = resumenAnual(facturasA, gastosA, 2026, { 1: 24, 2: 46, 3: 48 }, ['agro'], op).trimestres;
  // 08: ingresos del trimestre con la compensación (es ingreso: Manual de Renta 2025, estimación directa):
  //   1T 10.000 + 1.200 = 11.200; 2T 15.000 + 1.800 + 500 = 17.300; 3T 20.000 + 2.400 = 22.400; 4T 5.000 + 600 = 5.600.
  // 09 = 2 %: 224 / 346 / 448 / 112. 10: retenciones del trimestre 200 / 300 / 400 / 100. 11 = 24 / 46 / 48 / 12.
  // 07 = 0 (sin apartado I); 12 = 07 + 11; 19 = 12 (sin minoración).
  assert.deepEqual(T.map((q) => [q.c07, q.c08, q.c09, q.c10, q.c11, q.c12, q.c19]), [
    [0, 11200, 224, 200, 24, 24, 24], [0, 17300, 346, 300, 46, 46, 46], [0, 22400, 448, 400, 48, 48, 48], [0, 5600, 112, 100, 12, 12, 12],
  ]);
  // El fichero lleva el apartado I a cero y el II con esas cifras.
  const f = fichero130({ nif: '12345678Z', nombre: 'Antonio Pérez Gil' }, 2026, T[1]);
  assert.deepEqual([f.tipo, f.resultado], ['I', 46]);
  assert.ok(f.contenido.includes(campos(0, 0, 0, 0, 0, 0, 0, 17300, 346, 300, 46, 46)));
  // Rendimiento del año (gastos con su IVA, que no recupera): 56.500 − (2.200 + 1.210 + 600 + 1.200) = 51.290.
  assert.deepEqual(resumenAnual(facturasA, gastosA, 2026, {}, ['agro'], op).porActividad, [{ actividad: 'agro', ingresos: 56500, gastos: 5210, rendimiento: 51290 }]);
  // Sin 303: el agricultor presenta el 130 y, si comprara a la UE, el 309.
  const ids = modelosDe(fiscal).map((m) => m.id);
  assert.ok(ids.includes('130') && ids.includes('309') && !ids.includes('303'));
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 5. Pablo, consultor con proveedores no residentes: alquiler a un francés (19 %) y diseñador de EE. UU. (24 %).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const gn = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'seo', base, ivaPct, ...x });
// Retenciones del IRNR (art. 25.1 TRLIRNR): 19 % a residentes en la UE, 24 % al resto.
const casero = (m) => gn(`fr${m}`, `2026-${m}-01`, 900, 0, { origen: 'ue', alquiler: true, concepto: 'Alquiler de la oficina', proveedor: 'Jean-Pierre Martin', proveedorNif: 'FR83404833048', noResidente: { pais: 'FR', clave: 14, pct: 19 } });
const disenador = (id, fecha, pagado, base) => gn(id, fecha, base, 0, { pagado, origen: 'fuera', irpfPct: 15, concepto: 'Diseño de la web', proveedor: 'Pixel Forge LLC', proveedorNif: '98-7654321', noResidente: { pais: 'US', clave: 19, pct: 24 } });
const gastosN = [
  ...MM.map(casero),
  disenador('us1', '2026-02-10', '2026-02-20', 2000),
  // Facturado en mayo y pagado el 3 de julio: va al 216 del 3T (por la fecha de pago, como el 111).
  disenador('us2', '2026-05-15', '2026-07-03', 1500),
  ...['03-31', '06-30', '09-30', '12-31'].map((f, i) => gn(`ges${i}`, `2026-${f}`, 200, 21, { irpfPct: 15, concepto: 'Asesoría', proveedor: 'Asesores Retiro SL', proveedorNif: 'B28999999' })),
];

test('no residentes · 216 de cada trimestre y 296 del año; ni el 111, ni el 115, ni el 180, ni el 190 los recogen', () => {
  // 1T: tres alquileres (3 × 900 = 2.700, 3 × 171 = 513) y el diseñador (2.000 × 24 % = 480): 4 rentas, 4.700, 993.
  // 2T: tres alquileres: 3 rentas, 2.700, 513. 3T: tres alquileres y us2 (1.500 × 24 % = 360): 4 rentas, 4.200, 873.
  // 4T: 3 rentas, 2.700, 513.
  const esperado = [[4, 4700, 993], [3, 2700, 513], [4, 4200, 873], [3, 2700, 513]];
  for (const t of [1, 2, 3, 4]) {
    const m = modelo216(gastosN, 2026, t);
    const [n, b, r] = esperado[t - 1];
    assert.deepEqual([m.c['06'], m.c['09'], m.c['12'], m.c['07'], m.c['10'], m.c['13'], m.c['21'], m.negativa], [n, b, r, n, b, r, r, false]);
    // 111: solo la asesoría (200 / 30); 115: nada.
    assert.deepEqual(retencionesProfesionales(gastosN, 2026, t), { perceptores: 1, base: 200, retenciones: 30 });
    assert.deepEqual(modelo115(gastosN, 2026, t), { perceptores: 0, base: 0, retenciones: 0 });
  }
  const m = modelo296(gastosN, 2026);
  assert.deepEqual(m.perceptores.map((p) => [p.nombre, p.nifResidencia, p.pais, p.clave, p.subclave, p.pct, p.rentas, p.base, p.retenciones]), [
    ['Jean-Pierre Martin', 'FR83404833048', 'FR', 14, '01', 19, 12, 10800, 2052],
    ['Pixel Forge LLC', '98-7654321', 'US', 19, '01', 24, 2, 3500, 840],
  ]);
  assert.deepEqual([m.base, m.retenciones], [14300, 2892]);
  assert.deepEqual(modelo180(gastosN, 2026), { arrendadores: [], base: 0, retenciones: 0 });
  assert.deepEqual(modelo190([], [], 2026, gastosN).perceptores.map((p) => [p.nombre, p.percepciones, p.retenciones]), [['Asesores Retiro SL', 800, 120]]);
  // El servicio del diseñador de EE. UU. lo autoliquida Pablo (art. 84.Uno.2.º LIVA): 12-13 y 28-29 del 303 del 1T,
  // 2.000 / 420 (y la asesoría, 200 / 42, en las 28-29).
  const c = casillas303([], gastosN.filter((g) => !g.noResidente || g.origen === 'fuera'), 2026, 1);
  assert.deepEqual([c['12'], c['13'], c['28'], c['29'], c['46']], [2000, 420, 2200, 462, -42]);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// 6. Bar La Plaza, en módulos (131) y en el régimen simplificado del IVA.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Datos que salen de aplicar la Orden de módulos de 2026 (epígrafe 673.2) a los datos-base de 1 de enero: la app no los
// calcula, los toma de la persona. Rendimiento neto anual 16.500 € con 1 persona asalariada; IVA: cuota devengada anual
// por operaciones corrientes 9.000 €, ingreso a cuenta del 4 % por trimestre y cuota mínima del 20 %.
const modulosBar = { bar: { tipo: 'datos', rendimiento: 16500, asalariados: 1, iva: { cuota: 9000, ingreso: 4, minima: 20 } } };
const gb = (id, fecha, base, ivaPct, x = {}) => ({ id, fecha, actividad: 'bar', base, ivaPct, ...x });
const gastosB = [
  ...[['01-15', 3000], ['04-15', 3500], ['07-15', 4000], ['10-15', 3000]].map(([f, b], i) => gb(`beb${i}`, `2026-${f}`, b, 10, { concepto: 'Bebidas y comida', proveedor: 'Distribuciones Plaza SL', proveedorNif: 'B28111222' })),
  ...['03-31', '06-30', '09-30', '12-31'].map((f, i) => gb(`luz${i}`, `2026-${f}`, 400, 21, { concepto: 'Luz', proveedor: 'Iberdrola Clientes SAU', proveedorNif: 'A95758389' })),
  gb('cafetera', '2026-05-05', 3500, 21, { inversion: { tipo: 'maquinaria' }, concepto: 'Cafetera industrial', proveedor: 'Hostelería Equipos SL', proveedorNif: 'B28333444' }),
];

test('bar en módulos · 131 de los cuatro trimestres', () => {
  // 01 = 16.500; 02 = 3 % (hasta 1 persona asalariada, art. 110.1.b RIRPF) = 495; 08: sin retenciones; 09: rendimiento de
  // 2025 de 11.500 € → 25 € (art. 110.3.c RIRPF; instrucciones del 131); 10 = 13 = 15 = 495 − 25 = 470.
  const q = modelos131({ modulos: modulosBar, facturas: [], rendAnterior: 11500 }, 2026);
  assert.deepEqual(q.map((c) => [c['01'], c['02'], c['07'], c['08'], c['09'], c['10'], c['11'], c['12'], c['13'], c['15']]), Array(4).fill([16500, 495, 495, 0, 25, 470, 0, 0, 470, 470]));
});

test('bar en módulos · 303 del régimen simplificado: 1T-3T y liquidación del 4T', () => {
  // Ingreso a cuenta 9.000 × 4 % = 360. La cafetera (mayo, activo fijo: 3.500 × 21 % = 735) se deduce en el 2T (Sede de
  // la AEAT, régimen simplificado: «en el periodo en que se hayan soportado, o sucesivos»): 2T = 360 − 735 = −375 a
  // compensar; 3T = 360 − 375 = −15 a compensar (art. 99.Cinco LIVA).
  assert.deepEqual([1, 2, 3].map((t) => simplificado({ modulos: modulosBar, gastos: gastosB, anio: 2026, t }).resultado), [360, -375, -15]);
  const s = simplificado({ modulos: modulosBar, gastos: gastosB, anio: 2026, t: 4 });
  // IVA soportado corriente: bebidas (3.000 + 3.500 + 4.000 + 3.000) × 10 % = 1.350 y luz 4 × 84 = 336 → 1.686.
  // Difícil justificación 1 % de 9.000 = 90. Cuota derivada = máx(9.000 − 1.686 − 90 = 7.224; mínima 1.800) = 7.224.
  // Ingresado en el año 3 × 360 = 1.080 (los ingresos a cuenta, aunque se compensaran); 15 a compensar del 3T:
  // 4T = 7.224 − 1.080 − 15 = 6.129.
  assert.deepEqual([s.actividades[0].corrientes, s.actividades[0].dificil, s.actividades[0].minima, s.derivada, s.ingresado, s.activosFijos, s.compensar, s.resultado], [1686, 90, 1800, 7224, 1080, 0, 15, 6129]);
});

test('bar en módulos · el IVA de todo el inmovilizado es de activos fijos, también por debajo de 3.005,06 € (arreglado)', () => {
  // Año malo: 70.000 € de compras al 10 % (7.000 de IVA) + luz 336 = 7.336 de cuotas corrientes; 9.000 − 7.336 − 90 = 1.574,
  // menos que la cuota mínima (9.000 × 20 % = 1.800): derivada 1.800. Un arcón de 1.000 € (inmovilizado) es activo fijo
  // (instrucciones del 303, régimen simplificado, casilla G: «activos fijos los elementos del inmovilizado»): sus 210 € se
  // deducen aparte, en el 1T (360 − 210 = 150), y no se pierden con la cuota mínima. (Antes la app solo trataba como
  // activo fijo lo de 3.005,06 € o más: el arcón iba a corrientes y quedaba absorbido por la cuota mínima.)
  const gastos = [
    gb('compras', '2026-06-15', 70000, 10, { concepto: 'Bebidas y comida', proveedor: 'Distribuciones Plaza SL', proveedorNif: 'B28111222' }),
    ...gastosB.filter((g) => g.id.startsWith('luz') || g.id === 'cafetera'),
    gb('arcon', '2026-03-10', 1000, 21, { inversion: { tipo: 'maquinaria' }, concepto: 'Arcón congelador', proveedor: 'Hostelería Equipos SL', proveedorNif: 'B28333444' }),
  ];
  const s = simplificado({ modulos: modulosBar, gastos, anio: 2026, t: 4 });
  assert.deepEqual([s.actividades[0].corrientes, s.derivada], [7336, 1800]);
  assert.deepEqual([simplificado({ modulos: modulosBar, gastos, anio: 2026, t: 1 }).activosFijos, simplificado({ modulos: modulosBar, gastos, anio: 2026, t: 1 }).resultado], [210, 150]);
});

// ── Errores de la app encontrados y no arreglados (cambio grande o dudoso): quedan como «todo» con el esperado correcto. ──

test('no residentes · el alquiler de un local en España a un casero francés no es una adquisición intracomunitaria de servicios (arreglado)', () => {
  // Servicio sobre un inmueble: se localiza donde está el inmueble (art. 70.Uno.1.º LIVA), no por la regla general del art.
  // 69.Uno.1.º; con un proveedor no establecido, el sujeto pasivo es Pablo (art. 84.Uno.2.º.a). Va en las 12-13 («otras
  // operaciones con inversión del sujeto pasivo», instrucciones del 303) y se deduce en las 28-29; no va en el 349, que
  // solo recoge los servicios de la regla general (art. 79 RIVA y art. 262 de la Directiva 2006/112/CE, por remisión
  // al art. 44). 1T: 3 × 900 = 2.700 y 3 × 189 = 567.
  const fr = gastosN.filter((g) => g.id.startsWith('fr'));
  const c = casillas303([], fr, 2026, 1);
  assert.deepEqual([c['10'], c['11'], c['12'], c['13'], c['28'], c['29'], c['36'], c['37']], [0, 0, 2700, 567, 2700, 567, 0, 0]);
  assert.deepEqual(modelo349([], 2026, 1, fr).operadores, []);
});

const equipo = gf('equipo', '2026-04-01', 4000, 21, { inversion: { tipo: 'electronicos' }, concepto: 'Equipo de electroterapia', proveedor: 'Electromedicina SL', proveedorNif: 'B28777888' });
test('fisioterapeuta · bien de inversión con prorrata: 30-31 al 25 % y regularización en la 44 del 4T', () => {
  const G = [...gastosF, equipo];
  // 2T: 30 = 4.000 (base sin prorratear) y 31 = 840 × 25 % = 210. 4T: 44 = (2.079 + 840) × 28 % − (519,77 + 210) =
  // 817,32 − 729,77 = 87,55 (art. 105.Tres LIVA: la regularización alcanza a todas las deducciones provisionales del año).
  const q2 = casillas303(facturasF, G, 2026, 2), q4 = casillas303(facturasF, G, 2026, 4);
  assert.deepEqual([q2['30'], q2['31'], q2['45'], q4['44']], [4000, 210, c2(128.63 + 210), 87.55]);
});

test('fisioterapeuta · el IVA no deducible por la prorrata de un bien de inversión es más valor del bien (se amortiza)', { todo: 'la app lo resta entero como gasto del trimestre de la compra' }, () => {
  // Norma de registro y valoración 12.ª del PGC (art. 28.1 LIRPF y 10.3 LIS): el IVA soportado no deducible forma parte del
  // precio de adquisición; la regularización por la prorrata definitiva es gasto o ingreso del año. Valor: 4.000 + 840 × 75 %
  // = 4.630; amortización del 2T al 12 % (equipos electrónicos, Orden 27-3-1998): 4.630 × 12 % × 91/365 = 138,52.
  // Gastos del 2T: 3.735,87 + 138,52 = 3.874,39 (la app: 2.450 + 900 + 385,87 + 630 + 4.000 × 12 % × 91/365 = 4.485,54).
  const op = opciones130({ tipo: 'autonomo', iva: 'general' }, { 2025: 20000 }, 2026);
  const T = resumenAnual(facturasF, [...gastosF, equipo], 2026, {}, ['fisio'], op).trimestres;
  assert.equal(T[1].gastos, 3874.39);
});

test('minoración del 130 (art. 110.3.c RIRPF): tabla de la casilla 13', () => {
  assert.deepEqual([9000, 9000.01, 10000, 11000, 12000, 12000.01, null].map((r) => minoracion130(r)), [100, 75, 75, 50, 25, 0, 0]);
  assert.equal(minoracion130(null, { inicio: 2026, anio: 2026 }), 100); // inicio de actividad: rendimiento anterior cero
});
