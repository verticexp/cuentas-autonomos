// Empresas ficticias con regímenes especiales, un año completo (2026), comprobadas al céntimo. Los esperados se calculan
// a mano en cada prueba (la cuenta va en el comentario, con la regla y su fuente) y nunca con funciones de la app.
// Fuentes de la AEAT (sede.agenciatributaria.gob.es): diseños de registro DR303e26v101, DR390e2025 y DR309 (dr309e23),
// instrucciones del 390 de 2025 y del 347 («Importe de las operaciones»). Ley 37/1992 del IVA (LIVA). Reglamento de
// facturación (RD 1619/2012). Del IGIC (Ley 20/1991 y Ley 4/2012) no se ha podido abrir la web de la Agencia Tributaria
// Canaria desde estas pruebas: las casillas del 420 y del 425 se comprueban con el significado que les da lib/igic.js.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';
import { casillas303, desglose, importes, numeroFactura, resumenAnual } from '../lib/calculos.js';
import { modelo309, modelo347, modelo390 } from '../lib/modelos.js';
import { casillas420, liquidaciones420, modelo425 } from '../lib/igic.js';
import { validarFactura } from '../lib/validacion.js';
import { nuevoGasto } from '../lib/gastoCuerpo.js';

let srv, F;
before(async () => {
  srv = await arrancar();
  process.env.KV_REST_API_URL = srv.url;
  process.env.KV_REST_API_TOKEN = 'pruebas';
  F = await import('../lib/facturas.js');
});
after(() => srv.cerrar());

const fac = (id, fecha, base, ivaPct, extra = {}) => ({ id, fecha, numero: 1, anio: 2026, actividad: 'a', cliente: { nombre: 'Cliente', nif: '12345678Z' }, concepto: 'Venta', base, ivaPct, irpfPct: 0, ...extra });
const gasto = (id, fecha, base, ivaPct, extra = {}) => ({ id, fecha, actividad: 'a', concepto: 'Compra', proveedor: 'Proveedor', proveedorNif: 'B12345674', base, ivaPct, ...extra });
const ver = (c, claves) => Object.fromEntries(claves.map((k) => [k, c[k] ?? 0]));
const linea = (concepto, cantidad, precio, ivaPct, extra = {}) => ({ concepto, cantidad, precio, dto: 0, ivaPct, ...extra });

// ------------------------------------------------------------------------------------------------------------------
// 1. «Moda Carmen»: boutique de una autónoma en recargo de equivalencia (no presenta el 303; sí el 309 y el 130)
// ------------------------------------------------------------------------------------------------------------------
const TEXTIL = { proveedor: 'Textil Levante S.L.', proveedorNif: 'B12345674', categoria: '600', actividad: 'tienda' };
const MILANO = { proveedor: 'Moda Milano SRL', proveedorNif: 'IT12345678901', categoria: '600', actividad: 'tienda' };
// Compras de 2026. Las de España llevan IVA y recargo (art. 154 y 161 LIVA: 21 % + 5,2 %, 10 % + 1,4 %, 4 % + 0,5 %).
const gastosBoutique = [
  gasto('b1', '2026-01-15', 3000, 21, { ...TEXTIL, recargo: true }), // IVA 630,00 · recargo 156,00
  gasto('b5', '2026-03-12', 2500, 0, MILANO), // adquisición intracomunitaria de bienes (309, hecho imponible 1)
  gasto('b8', '2026-03-31', 150, 21, { proveedor: 'Asesoría Pérez', proveedorNif: '12345678Z', categoria: '623', actividad: 'tienda' }), // servicio: sin recargo
  gasto('b2', '2026-04-10', 1500, 21, { ...TEXTIL, recargo: true }), // IVA 315,00 · recargo 78,00
  gasto('b3', '2026-05-05', 250, 4, { proveedor: 'Kiosko Distribuciones S.L.', proveedorNif: 'B76543214', categoria: '600', actividad: 'tienda', recargo: true }), // revistas: IVA 10,00 · recargo 1,25
  gasto('b4', '2026-06-18', 800, 10, { proveedor: 'Viveros del Sur S.L.', proveedorNif: 'B11111119', categoria: '600', actividad: 'tienda', recargo: true }), // plantas: IVA 80,00 · recargo 11,20
  gasto('b6', '2026-09-08', 1200, 0, MILANO),
  gasto('b7', '2026-09-15', 100, 0, { proveedor: 'Cloud Software Ltd', proveedorNif: 'IE6388047V', categoria: '629', actividad: 'tienda' }), // servicio de la UE (309, hecho 3)
];
// Ventas: el ticket de cada mes en la serie FS (sin NIF: factura simplificada) y dos facturas completas a un hotel.
const MOSTRADOR = { nombre: 'Venta en tienda' };
const HOTEL = { nombre: 'Hotel Las Dunas S.L.', nif: 'B76543214', direccion: 'Av. del Mar 1', ciudad: 'Alicante' };
const facturasBoutique = [
  ...Array.from({ length: 12 }, (_, i) => fac(`fs${i + 1}`, `2026-${String(i + 1).padStart(2, '0')}-28`, 2000, 21, { actividad: 'tienda', serie: 'FS', cliente: MOSTRADOR })),
  fac('fs-s1', '2026-01-20', 2479.34, 21, { actividad: 'tienda', serie: 'FS', cliente: MOSTRADOR }), // 2.479,34 + 520,66 = 3.000,00
  fac('h1', '2026-07-15', 2800, 21, { actividad: 'tienda', cliente: HOTEL }), // 2.800 + 588 = 3.388
  fac('h2', '2026-10-02', 200, 21, { actividad: 'tienda', cliente: HOTEL }), // 200 + 42 = 242
];

test('boutique en recargo: 309 del 1T y del 3T (IVA y recargo de las compras de ropa a Italia; servicio de Irlanda sin recargo)', () => {
  // DR309: situación tributaria 2 (recargo de equivalencia); hecho imponible 1 (adquisición intracomunitaria de bienes) y
  // 3 (inversión del sujeto pasivo); régimen general en 01-03 y recargo en 10-12 (art. 156 LIVA: quien está en recargo lo
  // ingresa también en sus adquisiciones intracomunitarias); 22 = suma de cuotas, 23 a deducir = 0, 24 = 22 − 23.
  // 1T: 2.500 × 21 % = 525,00 · 2.500 × 5,2 % = 130,00 · 22 = 655,00.
  const t1 = modelo309(gastosBoutique, 2026, 1, { regimen: 'recargo' });
  assert.equal(t1.declaraciones.length, 1);
  assert.deepEqual({ hecho: t1.declaraciones[0].hecho, situacion: t1.declaraciones[0].situacion, ...ver(t1.declaraciones[0].c, ['01', '02', '03', '10', '11', '12', '22', '23', '24']) },
    { hecho: 1, situacion: 2, '01': 2500, '02': 21, '03': 525, 10: 2500, 11: 5.2, 12: 130, 22: 655, 23: 0, 24: 655 });
  assert.equal(t1.ingresar, 655);
  // 2T: sin compras de fuera, no hay 309.
  assert.deepEqual(modelo309(gastosBoutique, 2026, 2, { regimen: 'recargo' }), { declaraciones: [], ingresar: 0 });
  // 3T: ropa 1.200 × 21 % = 252,00 y × 5,2 % = 62,40 → 314,40. Servicio 100 × 21 % = 21,00, sin recargo (el recargo es de
  // las entregas de bienes, art. 154 LIVA). Total a ingresar 314,40 + 21,00 = 335,40.
  const t3 = modelo309(gastosBoutique, 2026, 3, { regimen: 'recargo' });
  assert.deepEqual(t3.declaraciones.map((d) => [d.hecho, ver(d.c, ['01', '02', '03', '10', '11', '12', '22', '24'])]), [
    [1, { '01': 1200, '02': 21, '03': 252, 10: 1200, 11: 5.2, 12: 62.4, 22: 314.4, 24: 314.4 }],
    [3, { '01': 100, '02': 21, '03': 21, 10: 0, 11: 0, 12: 0, 22: 21, 24: 21 }],
  ]);
  assert.equal(t3.ingresar, 335.4);
});

test('boutique en recargo: 347 (proveedor con IVA y recargo; los tickets sin NIF no se declaran)', () => {
  // Instrucciones del 347, «Importe de las operaciones»: se suman las cuotas de IVA y los recargos de equivalencia
  // repercutidos o soportados. Textil Levante: 1T 3.000 + 630 + 156 = 3.786,00; 2T 1.500 + 315 + 78 = 1.893,00;
  // total 5.679,00 > 3.005,06. Moda Milano (UE, va en el 349) y Cloud Software (Irlanda) no van. El resto no llega al
  // límite (asesoría 181,50; kiosko 261,25; viveros 891,20).
  // Ventas: el hotel 3.388 (3T) + 242 (4T) = 3.630,00. Los tickets sin NIF (serie FS, 12 × 2.420 = 29.040 € a nombre de
  // «Venta en tienda» y el de 3.000 €) son facturas simplificadas sin datos del destinatario: no se declaran (art. 33.2.a
  // del Reglamento de gestión e inspección, RD 1065/2007: operaciones sin obligación de factura con los datos del
  // destinatario; un registro del 347 necesita además el NIF del declarado).
  const m = modelo347(facturasBoutique, gastosBoutique, 2026);
  assert.deepEqual(m.compras.map((o) => [o.nombre, o.nif, o.total, o.trimestres]), [['Textil Levante S.L.', 'B12345674', 5679, [3786, 1893, 0, 0]]]);
  assert.deepEqual(m.ventas.map((o) => [o.nombre, o.nif, o.total, o.trimestres]), [['Hotel Las Dunas S.L.', 'B76543214', 3630, [0, 0, 3388, 242]]]);
  assert.deepEqual(m.sinNif, []);
});

test('boutique en recargo: 130, ingresos con el IVA cobrado y el IVA del 309 como coste', () => {
  // Quien está en recargo de equivalencia no ingresa el IVA que cobra ni se deduce el que paga: para el IRPF el IVA
  // repercutido es ingreso y el soportado (también el que ingresa con el 309) es gasto (art. 28 LIRPF con remisión a la
  // LIS; el IVA no recuperable es mayor coste: norma 12.ª del PGC).
  // Ingresos (base + IVA): 1T tickets ene-mar 3 × 2.420 = 7.260 + 3.000 = 10.260,00; 2T 7.260,00; 3T 7.260 + 3.388 =
  // 10.648,00; 4T 7.260 + 242 = 7.502,00.
  // Gastos sin recargo: asesoría 150 + 31,50 = 181,50 (1T); servicio de Irlanda 100 + 21 del 309 = 121,00 (3T).
  const sinRecargo = gastosBoutique.filter((g) => ['b8', 'b7'].includes(g.id));
  const r = resumenAnual(facturasBoutique, sinRecargo, 2026, {}, ['tienda'], { ivaCoste: true });
  assert.deepEqual(r.trimestres.map((q) => q.ingresos), [10260, 7260, 10648, 7502]);
  assert.deepEqual(r.trimestres.map((q) => q.gastos), [181.5, 0, 121, 0]);
});

test('boutique en recargo: el recargo soportado también es coste en el 130 (compras de España y del 309)', { todo: 'ERROR DE LA APP sin arreglar: un gasto no guarda el recargo de equivalencia soportado (lib/gastoCuerpo.js) y el coste sin 303 (lib/ivaDeducible.js ivaNoDeducible) solo suma el IVA, ni el recargo de la factura ni el del 309' }, () => {
  // El recargo que cobra el mayorista (art. 161 LIVA) y el que se ingresa con el 309 (art. 156) no se recuperan nunca:
  // son coste de la compra igual que el IVA. Gasto por trimestre:
  // 1T: 3.000 + 630 + 156 = 3.786 · 2.500 + 525 + 130 = 3.155 · 150 + 31,50 = 181,50 → 7.122,50
  // 2T: 1.500 + 315 + 78 = 1.893 · 250 + 10 + 1,25 = 261,25 · 800 + 80 + 11,20 = 891,20 → 3.045,45
  // 3T: 1.200 + 252 + 62,40 = 1.514,40 · 100 + 21 = 121 → 1.635,40 · 4T: 0.
  // 130 (art. 110 RIRPF; 5 % de difícil justificación del art. 30.2.4.ª RIRPF), con los pagos anteriores presentados:
  // 1T: 10.260 − 7.122,50 = 3.137,50; 5 % = 156,875 → 156,88; 2.980,62 × 20 % = 596,124 → 596,12.
  // 2T: 17.520 − 10.167,95 = 7.352,05; 5 % = 367,60; 6.984,45 × 20 % = 1.396,89 − 596,12 = 800,77.
  // 3T: 28.168 − 11.803,35 = 16.364,65; 5 % = 818,23; 15.546,42 × 20 % = 3.109,284 − 1.396,89 → 1.712,39.
  // 4T: 35.670 − 11.803,35 = 23.866,65; 5 % = 1.193,33; 22.673,32 × 20 % = 4.534,664 − 3.109,28 → 1.425,38.
  const r = resumenAnual(facturasBoutique, gastosBoutique, 2026, { 1: 596.12, 2: 800.77, 3: 1712.39 }, ['tienda'], { ivaCoste: true });
  assert.deepEqual(r.trimestres.map((q) => q.gastos), [7122.5, 3045.45, 1635.4, 0]);
  assert.deepEqual(r.trimestres.map((q) => q.c07), [596.12, 800.77, 1712.39, 1425.38]);
  // Y el alta de un gasto con recargo lo conserva (si no, ni el 347 ni el IRPF lo pueden ver).
  const u = { fiscal: { iva: 'recargo' }, actividades: [{ id: 'tienda', nombre: 'Boutique' }] };
  const g = nuevoGasto(u, { fecha: '2026-01-15', concepto: 'Ropa', base: '3000', ivaPct: 21, recargo: true, proveedor: 'Textil Levante S.L.', proveedorNif: 'B12345674' }).gasto;
  assert.equal(importes(g).recargo, 156);
});

test('boutique en recargo: facturas sin NIF hasta 3.000 € en la serie FS, completas en la suya y rectificativas en la R', async () => {
  const u = { id: 'u-boutique', empresa: 'moda-carmen', rol: 'admin', fiscal: { iva: 'recargo', tipo: 'autonomo' },
    emisor: { nombre: 'Carmen Ruiz', nif: '12345678Z', direccion: 'C/ Mayor 3', ciudad: '03001 Alicante', plazo: 0 },
    actividades: [{ id: 'tienda', nombre: 'Boutique', serie: '', ivaPct: 21, irpfPct: 0 }] };
  const venta = (fecha, base, cliente) => ({ fecha, actividad: 'tienda', concepto: 'Ropa', base, ivaPct: 21, irpfPct: 0, cliente });
  // Art. 4.1.c del Reglamento de facturación: el comercio minorista puede hacer factura simplificada hasta 3.000 € IVA
  // incluido. 2.479,34 × 21 % = 520,6614 → 520,66; total 3.000,00 (cabe). 2.479,35 × 21 % = 520,6635 → 520,66; total
  // 3.000,01 (no cabe: hay que pedir el NIF).
  assert.equal(validarFactura(venta('2026-01-20', 2479.34, MOSTRADOR), { limiteSimplificada: 3000 }).ok, true);
  assert.match(validarFactura(venta('2026-01-20', 2479.35, MOSTRADOR), { limiteSimplificada: 3000 }).error, /3\.000 €/);
  const s1 = await F.crearFactura(u, venta('2026-01-20', 2479.34, MOSTRADOR));
  assert.equal(importes(s1.factura).total, 3000);
  assert.match((await F.crearFactura(u, venta('2026-01-21', 2479.35, MOSTRADOR))).error, /3\.000 €/);
  const h1 = (await F.crearFactura(u, venta('2026-01-25', 2800, HOTEL))).factura;
  const s2 = (await F.crearFactura(u, venta('2026-01-28', 2000, MOSTRADOR))).factura;
  // Devolución de una prenda del ticket de 3.000 €: rectificativa (art. 15) en su serie R, sin límite (art. 4.1.b).
  const r1 = (await F.crearFactura(u, venta('2026-02-02', -100, MOSTRADOR), { original: s1.factura, motivo: 'devolucion' })).factura;
  const s3 = (await F.crearFactura(u, venta('2026-02-05', 150, MOSTRADOR))).factura;
  assert.deepEqual([s1.factura, h1, s2, r1, s3].map(numeroFactura), ['FS2026-001', '01-2026', 'FS2026-002', 'R01-2026', 'FS2026-003']);
  // −100 × 21 % = −21,00 → total −121,00.
  assert.deepEqual([importes(r1).iva, importes(r1).total], [-21, -121]);
});

// ------------------------------------------------------------------------------------------------------------------
// 2. «Distribuciones Mediterráneo S.L.»: mayorista en el régimen general que vende a minoristas en recargo
// ------------------------------------------------------------------------------------------------------------------
const MINORISTA = { nombre: 'Moda Carmen', nif: '12345678Z', direccion: 'C/ Mayor 3', ciudad: 'Alicante' };
const facturasMayorista = [
  // 10 × 35,50 − 5 % = 337,25 (21 %) · 20 × 12,35 = 247,00 (10 %) · 50 × 1,99 = 99,50 (4 %); base 683,75.
  fac('m1', '2026-01-20', 683.75, 21, { cliente: MINORISTA, recargo: true, lineas: [
    linea('Camisetas', 10, 35.5, 21, { dto: 5 }), linea('Ramos de flores', 20, 12.35, 10), linea('Revistas', 50, 1.99, 4)] }),
  fac('m2', '2026-02-14', 1234.56, 21, { cliente: { nombre: 'Bazar Sol', nif: '87654321X' }, recargo: true }),
  fac('m3', '2026-03-05', 5000, 21, { cliente: { nombre: 'Hotel Las Dunas S.L.', nif: 'B76543214' } }), // sin recargo
  fac('r1', '2026-03-25', -200, 21, { cliente: { nombre: 'Bazar Sol', nif: '87654321X' }, recargo: true, serie: 'R', rectifica: { id: 'm2', fecha: '2026-02-14', motivo: 'devolucion' } }),
  fac('m4', '2026-05-10', 800, 21, { cliente: MINORISTA, recargo: true }),
];
const gastosMayorista = [gasto('gm1', '2026-01-10', 4000, 21)];

test('mayorista: factura con recargo por tipo (IVA y recargo por tipo sobre la suma de bases)', () => {
  // IVA: 337,25 × 21 % = 70,8225 → 70,82; 247 × 10 % = 24,70; 99,50 × 4 % = 3,98 → 99,50.
  // Recargo (art. 161 LIVA): 337,25 × 5,2 % = 17,537 → 17,54; 247 × 1,4 % = 3,458 → 3,46; 99,50 × 0,5 % = 0,4975 → 0,50
  // → 21,50. Total 683,75 + 99,50 + 21,50 = 804,75.
  const m1 = facturasMayorista[0];
  assert.deepEqual(desglose(m1).map((d) => [d.pct, d.base, d.iva, d.re, d.recargo]), [[21, 337.25, 70.82, 5.2, 17.54], [10, 247, 24.7, 1.4, 3.46], [4, 99.5, 3.98, 0.5, 0.5]]);
  assert.deepEqual(importes(m1), { base: 683.75, iva: 99.5, recargo: 21.5, irpf: 0, total: 804.75 });
});

test('mayorista: 303 del 1T y 2T con el recargo en 168-170, 19-21 y 22-24 y la rectificativa en 14-15 y 25-26', () => {
  // DR303e26v101: recargo 0,5 % en 168-170, 1,4 % en 19-21, 5,2 % en 22-24; modificaciones del recargo en 25-26; las
  // modificaciones de bases y cuotas (art. 80 LIVA) en 14-15.
  // 07: 337,25 + 1.234,56 + 5.000 = 6.571,81 · 09: 70,82 + 259,26 (1.234,56 × 21 % = 259,2576) + 1.050 = 1.380,08.
  // 22: 337,25 + 1.234,56 = 1.571,81 · 24: 17,54 + 64,20 (1.234,56 × 5,2 % = 64,19712) = 81,74.
  // Rectificativa: −200 × 21 % = −42,00; −200 × 5,2 % = −10,40.
  // 27 = 3,98 + 24,70 + 1.380,08 − 42 + (0,50 + 3,46 + 81,74 − 10,40 = 75,30) = 1.442,06; 29 = 4.000 × 21 % = 840;
  // 46 = 1.442,06 − 840 = 602,06.
  const t1 = casillas303(facturasMayorista, gastosMayorista, 2026, 1);
  assert.deepEqual(ver(t1, ['01', '03', '04', '06', '07', '09', '168', '170', '19', '21', '22', '24', '14', '15', '25', '26', '27', '28', '29', '46']), {
    '01': 99.5, '03': 3.98, '04': 247, '06': 24.7, '07': 6571.81, '09': 1380.08, 168: 99.5, 170: 0.5, 19: 247, 21: 3.46, 22: 1571.81, 24: 81.74,
    14: -200, 15: -42, 25: -200, 26: -10.4, 27: 1442.06, 28: 4000, 29: 840, 46: 602.06 });
  // 2T: 800 × 21 % = 168,00 y × 5,2 % = 41,60 → 27 = 209,60.
  const t2 = casillas303(facturasMayorista, gastosMayorista, 2026, 2);
  assert.deepEqual(ver(t2, ['07', '09', '22', '24', '25', '26', '27', '46']), { '07': 800, '09': 168, 22: 800, 24: 41.6, 25: 0, 26: 0, 27: 209.6, 46: 209.6 });
});

test('mayorista: 390 con el recargo en 35-36, 599-602 y su modificación en 43-44', () => {
  // DR390e2025 e instrucciones: recargo 0,5 % (35-36), 1,4 % (599-600), 5,2 % (601-602), modificación del recargo (43-44),
  // total de cuotas de IVA y recargo (47). 05: 6.571,81 + 800 = 7.371,81; 06: 1.380,08 + 168 = 1.548,08.
  // 601: 1.571,81 + 800 = 2.371,81; 602: 81,74 + 41,60 = 123,34.
  // 33 = 99,50 + 247 + 7.371,81 − 200 = 7.518,31; 34 = 3,98 + 24,70 + 1.548,08 − 42 = 1.534,76.
  // 47 = 1.534,76 + 0,50 + 3,46 + 123,34 − 10,40 = 1.651,66 (= 1.442,06 + 209,60 de los 303). 65 = 1.651,66 − 840 = 811,66.
  // Volumen (99, 108): 683,75 + 1.234,56 + 5.000 − 200 + 800 = 7.518,31.
  const { c } = modelo390(facturasMayorista, gastosMayorista, 2026);
  assert.deepEqual(ver(c, ['01', '02', '03', '04', '05', '06', '29', '30', '33', '34', '35', '36', '599', '600', '601', '602', '43', '44', '47', '605', '606', '49', '64', '65', '95', '99', '108']), {
    '01': 99.5, '02': 3.98, '03': 247, '04': 24.7, '05': 7371.81, '06': 1548.08, 29: -200, 30: -42, 33: 7518.31, 34: 1534.76,
    35: 99.5, 36: 0.5, 599: 247, 600: 3.46, 601: 2371.81, 602: 123.34, 43: -200, 44: -10.4, 47: 1651.66,
    605: 4000, 606: 840, 49: 840, 64: 840, 65: 811.66, 95: 811.66, 99: 7518.31, 108: 7518.31 });
});

// ------------------------------------------------------------------------------------------------------------------
// 3. «Hotel Rural La Gomera S.L.»: IGIC (420 trimestral y 425 anual)
// ------------------------------------------------------------------------------------------------------------------
const IGIC = { impuesto: 'igic' };
const facturasHotel = [
  fac('h1', '2026-01-31', 18450, 7, { ...IGIC, cliente: { nombre: 'Tour Operador Atlántico S.L.', nif: 'B76543214' } }),
  // 3 noches × 95 − 10 % = 256,50 (7 %) · agua 6 × 1,20 = 7,20 (0 %) · excursión 2 × 45 = 90 (3 %) · crema solar 39,90
  // (9,5 %) · perfume 120 (15 %). Base 513,60.
  fac('h2', '2026-02-15', 513.6, 7, { ...IGIC, lineas: [linea('Alojamiento', 3, 95, 7, { dto: 10 }), linea('Agua mineral', 6, 1.2, 0), linea('Excursión guiada', 2, 45, 3), linea('Crema solar', 1, 39.9, 9.5), linea('Perfume', 1, 120, 15)] }),
  fac('h3', '2026-02-28', 12345.67, 7, IGIC),
  fac('h4', '2026-05-31', 22000, 7, IGIC),
  fac('hr', '2026-06-10', -256.5, 7, { ...IGIC, serie: 'R', rectifica: { id: 'h2', fecha: '2026-02-15', motivo: 'devolucion' } }),
  fac('h5', '2026-08-31', 30000, 7, IGIC),
  fac('h6', '2026-11-30', 5000, 7, IGIC),
];
const gastosHotel = [
  gasto('i1', '2026-01-10', 3200, 7, IGIC), // suministros: 224
  gasto('i2', '2026-02-20', 2000, 7, { ...IGIC, importacion: true }), // mobiliario importado (DUA): 140
  gasto('i3', '2026-03-15', 10000, 7, { ...IGIC, isp: true }), // obra con inversión del sujeto pasivo: 700
  gasto('i4', '2026-04-05', 1000, 7, IGIC), // lavandería: 70
  gasto('i5', '2026-05-20', 6000, 7, { ...IGIC, inversion: { tipo: 'maquinaria' } }), // cocina industrial (bien de inversión): 420
  gasto('i6', '2026-09-10', 2500, 7, IGIC), // 175
  gasto('i7', '2026-12-01', 9000, 7, { ...IGIC, inversion: { tipo: 'instalaciones' } }), // reforma (bien de inversión): 630
];

test('hotel en Canarias: 420 del 1T con cinco tipos, importación (DUA) e inversión del sujeto pasivo', () => {
  // Devengado por tipo, de mayor a menor (lib/igic.js: filas 01-18 de base, tipo y cuota):
  // 15 %: 120 → 18,00 · 9,5 %: 39,90 → 3,7905 → 3,79 · 7 %: 18.450 + 256,50 + 12.345,67 = 31.052,17; cuota 1.291,50 +
  // 17,955 → 17,96 + 864,1969 → 864,20 = 2.173,66 · 3 %: 90 → 2,70 · 0 %: 7,20.
  // Inversión del sujeto pasivo (19-20): 10.000 × 7 % = 700. Total devengado 25 = 18 + 3,79 + 2.173,66 + 2,70 + 700 = 2.898,15.
  // Deducible: interiores corrientes (26-27) 3.200 + 10.000 = 13.200 → 224 + 700 = 924; importaciones corrientes
  // (30-31) 2.000 → 140. 40 = 1.064; 41 = 2.898,15 − 1.064 = 1.834,15.
  const c = casillas420(facturasHotel, gastosHotel, 2026, 1);
  assert.deepEqual(ver(c, ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '19', '20', '21', '22', '25', '26', '27', '28', '29', '30', '31', '40', '41']), {
    '01': 120, '02': 15, '03': 18, '04': 39.9, '05': 9.5, '06': 3.79, '07': 31052.17, '08': 7, '09': 2173.66, 10: 90, 11: 3, 12: 2.7, 13: 7.2, 14: 0, 15: 0,
    19: 10000, 20: 700, 21: 0, 22: 0, 25: 2898.15, 26: 13200, 27: 924, 28: 0, 29: 0, 30: 2000, 31: 140, 40: 1064, 41: 1834.15 });
});

test('hotel en Canarias: 420 del 2T al 4T (rectificativa, bien de inversión) y 425 del año', () => {
  // 2T: 22.000 × 7 % = 1.540; rectificativa −256,50 × 7 % = −17,955 → −17,96 (21-22); 25 = 1.522,04. Deducible: 1.000 →
  // 70 (26-27) y bien de inversión 6.000 → 420 (28-29); 40 = 490; 41 = 1.032,04.
  const t2 = casillas420(facturasHotel, gastosHotel, 2026, 2);
  assert.deepEqual(ver(t2, ['01', '02', '03', '21', '22', '25', '26', '27', '28', '29', '40', '41']), { '01': 22000, '02': 7, '03': 1540, 21: -256.5, 22: -17.96, 25: 1522.04, 26: 1000, 27: 70, 28: 6000, 29: 420, 40: 490, 41: 1032.04 });
  // 3T: 2.100 − 175 = 1.925. 4T: 350 − 630 = −280 (a compensar: sin devolución pedida, pasa al año siguiente).
  const L = liquidaciones420(facturasHotel, gastosHotel, 2026);
  assert.deepEqual(L.map((x) => [x.bruto, x.ingresar, x.pendiente]), [[1834.15, 1834.15, 0], [1032.04, 1032.04, 0], [1925, 1925, 0], [-280, 0, 280]]);
  // 425: devengado por tipo del año (con la rectificativa): 7 %: 18.450 + 256,50 + 12.345,67 + 22.000 − 256,50 + 30.000 +
  // 5.000 = 87.795,67; cuota 1.291,50 + 17,96 + 864,20 + 1.540 − 17,96 + 2.100 + 350 = 6.145,70.
  // Total devengado: 2.898,15 + 1.522,04 + 2.100 + 350 = 6.870,19 (= 6.145,70 + 18 + 3,79 + 2,70 + 700 de la ISP).
  // Deducciones: corrientes 924 + 70 + 175 = 1.169; bienes de inversión 420 + 630 = 1.050; importaciones 140; total 2.359.
  const m = modelo425(facturasHotel, gastosHotel, 2026);
  assert.deepEqual(m.devengadoPorTipo.map((x) => [x.pct, x.base, x.cuota]), [[15, 120, 18], [9.5, 39.9, 3.79], [7, 87795.67, 6145.7], [3, 90, 2.7], [0, 7.2, 0]]);
  assert.equal(m.totalDevengado, 6870.19);
  assert.deepEqual(m.deducciones, { corrientes: 1169, bienesInversion: 1050, importacionesCorrientes: 140, importacionesInversion: 0, rectificaciones: 0, compensaciones: 0, total: 2359 });
  assert.deepEqual(m.resultadosTrimestrales, [1834.15, 1032.04, 1925, -280]);
});

// ------------------------------------------------------------------------------------------------------------------
// 4. «Ferretería El Clavo»: criterio de caja (RECC, arts. 163 decies a sexiesdecies LIVA)
// ------------------------------------------------------------------------------------------------------------------
const recc = { recc: { desde: '2026-01-01' } };
const facturasCaja = [
  // 2.000 + 420 = 2.420: cobra 1.000 en el 1T y 1.420 en el 2T.
  fac('c1', '2026-02-10', 2000, 21, { pagos: [{ fecha: '2026-03-15', importe: 1000 }, { fecha: '2026-05-20', importe: 1420 }] }),
  fac('c3', '2026-08-01', 300, 4, { pagos: [{ fecha: '2026-08-01', importe: 312 }] }), // cobrada en el acto
  fac('c2', '2026-11-05', 500, 10), // sin cobrar: se devenga el 31-12-2027
];
const gastosCaja = [
  gasto('d1', '2026-03-01', 1000, 21, { pagado: '2026-04-10' }), // se deduce en el 2T, al pagarla
  gasto('d2', '2026-12-01', 400, 21, { pendiente: true }), // sin pagar: se deduce el 31-12-2027
];

test('criterio de caja: 303 de cada trimestre con lo cobrado y pagado, y la información de las 62-63 y 74-75', () => {
  // Art. 163 terdecies LIVA: el IVA se devenga al cobrar, en la proporción cobrada. 1T: 1.000 / 2.420 del total:
  // base 2.000 × 1.000 / 2.420 = 826,446… → 826,45; cuota 420 × 1.000 / 2.420 = 173,553… → 173,55.
  // 62-63 (lo que se habría devengado por la regla general, art. 75): 2.000 y 420. 74-75 (lo que se habría deducido): la
  // compra del 1-3 de 1.000 y 210. No se deduce hasta el pago (2T). 46 = 173,55.
  const t1 = casillas303(facturasCaja, gastosCaja, 2026, 1, recc);
  assert.deepEqual(ver(t1, ['07', '09', '28', '29', '62', '63', '74', '75', '46']), { '07': 826.45, '09': 173.55, 28: 0, 29: 0, 62: 2000, 63: 420, 74: 1000, 75: 210, 46: 173.55 });
  assert.equal(t1.criterioCaja, true);
  // 2T: el resto (2.000 − 826,45 = 1.173,55; 420 − 173,55 = 246,45) y la deducción de la compra pagada (1.000; 210).
  // 46 = 246,45 − 210 = 36,45.
  assert.deepEqual(ver(casillas303(facturasCaja, gastosCaja, 2026, 2, recc), ['07', '09', '28', '29', '62', '63', '46']), { '07': 1173.55, '09': 246.45, 28: 1000, 29: 210, 62: 0, 63: 0, 46: 36.45 });
  // 3T: 300 × 4 % = 12, cobrada el mismo día.
  assert.deepEqual(ver(casillas303(facturasCaja, gastosCaja, 2026, 3, recc), ['01', '03', '62', '63', '46']), { '01': 300, '03': 12, 62: 300, 63: 12, 46: 12 });
  // 4T: nada cobrado ni pagado; solo la información: 62-63 500 y 50; 74-75 400 y 84.
  assert.deepEqual(ver(casillas303(facturasCaja, gastosCaja, 2026, 4, recc), ['04', '06', '28', '29', '62', '63', '74', '75', '46']), { '04': 0, '06': 0, 28: 0, 29: 0, 62: 500, 63: 50, 74: 400, 75: 84, 46: 0 });
  // 4T de 2027: lo que sigue sin cobrar y sin pagar se devenga y se deduce el 31 de diciembre del año siguiente
  // (art. 163 terdecies.Uno y quaterdecies.Uno LIVA): 500 → 50 devengado; 400 → 84 deducido; 46 = −34.
  assert.deepEqual(ver(casillas303(facturasCaja, gastosCaja, 2027, 4, recc), ['04', '06', '28', '29', '46']), { '04': 500, '06': 50, 28: 400, 29: 84, 46: -34 });
});

test('criterio de caja: 390 con lo devengado por caja (643-648), la regla general (654-657) y el volumen (653)', () => {
  // Instrucciones del 390: 643-648, bases y cuotas del criterio de caja por tipo (lo devengado en el año: 21 % 2.000 / 420;
  // 4 % 300 / 12; el 10 % no se ha cobrado); 654-655 y 656-657, por la regla general del art. 75: entregas 2.000 + 300 +
  // 500 = 2.800 y 420 + 12 + 50 = 482; adquisiciones 1.000 + 400 = 1.400 y 210 + 84 = 294. 653: volumen del criterio de
  // caja «como si no les hubiera sido de aplicación»: 2.800.
  // 33 = 2.300; 34 = 47 = 432; deducido 210 (605-606); 65 = 222 (= 173,55 + 36,45 + 12 + 0 de los 303).
  const { c } = modelo390(facturasCaja, gastosCaja, 2026, recc);
  assert.deepEqual(ver(c, ['01', '02', '05', '06', '643', '644', '645', '646', '647', '648', '33', '34', '47', '605', '606', '65', '95', '654', '655', '656', '657', '653', '99', '108']), {
    '01': 0, '02': 0, '05': 0, '06': 0, 643: 300, 644: 12, 645: 0, 646: 0, 647: 2000, 648: 420, 33: 2300, 34: 432, 47: 432, 605: 1000, 606: 210, 65: 222, 95: 222,
    654: 2800, 655: 482, 656: 1400, 657: 294, 653: 2800, 99: 0, 108: 2800 });
});

// ------------------------------------------------------------------------------------------------------------------
// 5. «Antigüedades Ribera» (REBU) y «Viajes Albufera» (REAV): margen operación por operación
// ------------------------------------------------------------------------------------------------------------------
// Arts. 137 y 145 LIVA: la base es el margen (venta − coste) menos el IVA que lleva dentro: margen / 1,21. Con margen
// negativo la base es cero y no se compensa con otras operaciones.
const facturasAnticuario = [
  // Cómoda: 2.420 − 1.200 = 1.220 → base 1.220 / 1,21 = 1.008,264… → 1.008,26; IVA 211,74. Espejo: 300 − 450 < 0 → 0.
  // Fuera de la base (coste más el espejo): 1.200 + 300 = 1.500. Base de la factura 1.008,26 + 1.500 = 2.508,26.
  fac('a1', '2026-02-10', 2508.26, 21, { margen: 'rebu', lineas: [linea('Cómoda isabelina', 1, 2420, 21, { coste: 1200 }), linea('Espejo dorado', 1, 300, 21, { coste: 450 })] }),
  // Relojes: 2 × 605 = 1.210 − 2 × 400 = 410 → 410 / 1,21 = 338,842… → 338,84; IVA 71,16; fuera 800.
  fac('a2', '2026-05-20', 1138.84, 21, { margen: 'rebu', lineas: [linea('Reloj de bolsillo', 2, 605, 21, { coste: 400 })] }),
  fac('a3', '2026-06-01', 500, 21), // restauración de un mueble del cliente: régimen general
];
const gastosAnticuario = [
  gasto('ga1', '2026-01-05', 1200, 0, { proveedor: 'Particular', proveedorNif: '' }), // compra a un particular: sin IVA
  gasto('ga2', '2026-01-15', 200, 21), // barnices: 42
];
const facturasAgencia = [
  // Roma: 2 × 1.100 = 2.200 − 1.700 = 500 → 413,223… → 413,22; IVA 86,78.
  fac('v1', '2026-03-10', 2113.22, 21, { margen: 'reav', lineas: [linea('Viaje a Roma (2 personas)', 2, 1100, 21, { coste: 850 })] }),
  // Marruecos: 3.000 − 3.150 < 0 → sin IVA; no se compensa con Mallorca (mismo trimestre).
  fac('v2', '2026-07-05', 3000, 21, { margen: 'reav', lineas: [linea('Circuito Marruecos', 1, 3000, 21, { coste: 3150 })] }),
  // Mallorca: 4 × 412,50 = 1.650 − 1.200 = 450 → 371,900… → 371,90; IVA 78,10.
  fac('v3', '2026-07-20', 1571.9, 21, { margen: 'reav', lineas: [linea('Escapada Mallorca', 4, 412.5, 21, { coste: 300 })] }),
];
const gastosAgencia = [gasto('gv1', '2026-02-01', 300, 21)]; // programa de reservas: 63

test('REBU: 303 y 390 (07-12 del margen, 227 del volumen) con un margen negativo sin compensar', () => {
  assert.deepEqual(importes(facturasAnticuario[0]), { base: 2508.26, iva: 211.74, irpf: 0, total: 2720 });
  // 1T: 07 = 1.008,26; 09 = 211,74; 28-29 = 200 y 42 (lo comprado al particular no lleva IVA); 46 = 169,74.
  assert.deepEqual(ver(casillas303(facturasAnticuario, gastosAnticuario, 2026, 1), ['07', '09', '28', '29', '46']), { '07': 1008.26, '09': 211.74, 28: 200, 29: 42, 46: 169.74 });
  // 2T: 338,84 + 500 = 838,84; 71,16 + 105 = 176,16.
  assert.deepEqual(ver(casillas303(facturasAnticuario, gastosAnticuario, 2026, 2), ['07', '09', '46']), { '07': 838.84, '09': 176.16, 46: 176.16 });
  // 390 (instrucciones, 07 a 12 y 227): REBU 21 % 1.008,26 + 338,84 = 1.347,10 y 211,74 + 71,16 = 282,90; ordinario 500 y
  // 105. 227: importe de las entregas en REBU sin el IVA: 2.720 + 1.210 − 282,90 = 3.647,10. 108 = 3.647,10 + 500.
  const { c } = modelo390(facturasAnticuario, gastosAnticuario, 2026);
  assert.deepEqual(ver(c, ['05', '06', '11', '12', '33', '34', '47', '605', '606', '65', '95', '227', '99', '108']), {
    '05': 500, '06': 105, 11: 1347.1, 12: 282.9, 33: 1847.1, 34: 387.9, 47: 387.9, 605: 200, 606: 42, 65: 345.9, 95: 345.9, 227: 3647.1, 99: 500, 108: 4147.1 });
});

test('REAV: 303 y 390 (13-14 del margen, 228 del volumen) con un viaje con pérdidas que no compensa', () => {
  assert.deepEqual(ver(casillas303(facturasAgencia, gastosAgencia, 2026, 1), ['07', '09', '29', '46']), { '07': 413.22, '09': 86.78, 29: 63, 46: 23.78 });
  // 3T: solo Mallorca (Marruecos, margen negativo, base 0).
  assert.deepEqual(ver(casillas303(facturasAgencia, gastosAgencia, 2026, 3), ['07', '09', '46']), { '07': 371.9, '09': 78.1, 46: 78.1 });
  // 390: 13 = 413,22 + 371,90 = 785,12; 14 = 86,78 + 78,10 = 164,88. 228 (prestaciones en REAV sin el IVA):
  // 2.200 + 3.000 + 1.650 − 164,88 = 6.685,12. 65 = 164,88 − 63 = 101,88.
  const { c } = modelo390(facturasAgencia, gastosAgencia, 2026);
  assert.deepEqual(ver(c, ['05', '06', '13', '14', '33', '34', '47', '606', '65', '95', '228', '108']), {
    '05': 0, '06': 0, 13: 785.12, 14: 164.88, 33: 785.12, 34: 164.88, 47: 164.88, 606: 63, 65: 101.88, 95: 101.88, 228: 6685.12, 108: 6685.12 });
});

// ------------------------------------------------------------------------------------------------------------------
// 6. Facturas: totales de varias líneas, límite de la simplificada y numeración por series
// ------------------------------------------------------------------------------------------------------------------
const uDiseno = { id: 'u-diseno', empresa: 'estudio-lucia', rol: 'admin', fiscal: { iva: 'general', tipo: 'autonomo' },
  emisor: { nombre: 'Lucía Martín', nif: '12345678Z', direccion: 'C/ Colón 5', ciudad: '46004 Valencia', plazo: 30 },
  actividades: [{ id: 'diseno', nombre: 'Diseño gráfico', serie: 'D', ivaPct: 21, irpfPct: 15 }] };
const EMPRESA = { nombre: 'Bodegas Turia S.L.', nif: 'B76543214', direccion: 'C/ Vino 7', ciudad: 'Valencia' };

test('factura de varias líneas con descuentos, tres tipos y retención: base por línea, IVA por tipo, total', async () => {
  // Bases por línea al céntimo: 450 − 10 % = 405,00 · 3 × 33,69 = 101,07 · 7,5 × 41,15 = 308,625 → 308,63 ·
  // 2 × 49,99 − 15 % = 84,983 → 84,98 (libro, 4 %) · 4 × 19,95 − 2,5 % = 77,805 → 77,81 (catering, 10 %).
  // IVA por tipo sobre la suma de sus bases (art. 6.1.g del Reglamento de facturación: base y cuota de cada tipo; lib/redondeo.js):
  // 21 %: 405 + 101,07 + 308,63 = 814,70 × 21 % = 171,087 → 171,09 (línea a línea saldría 85,05 + 21,22 + 64,81 = 171,08);
  // 4 %: 84,98 → 3,3992 → 3,40; 10 %: 77,81 → 7,781 → 7,78. IVA 182,27.
  // Base 977,49; retención 15 % sobre la base = 146,6235 → 146,62; total 977,49 + 182,27 − 146,62 = 1.013,14.
  const b = { fecha: '2026-04-15', actividad: 'diseno', irpfPct: 15, cliente: EMPRESA, lineas: [
    linea('Diseño de logotipo', 1, 450, 21, { dto: 10 }), linea('Tarjetas de visita', 3, 33.69, 21), linea('Folletos', 7.5, 41.15, 21),
    linea('Libro de estilo impreso', 2, 49.99, 4, { dto: 15 }), linea('Catering de la presentación', 4, 19.95, 10, { dto: 2.5 })] };
  const datos = F.limpiar(b, uDiseno.actividades);
  assert.equal(datos.error, undefined);
  const f = (await F.crearFactura(uDiseno, datos)).factura;
  assert.equal(numeroFactura(f), 'D2026-001');
  assert.deepEqual(desglose(f).map((d) => [d.pct, d.base, d.iva]), [[21, 814.7, 171.09], [4, 84.98, 3.4], [10, 77.81, 7.78]]);
  assert.deepEqual(importes(f), { base: 977.49, iva: 182.27, irpf: 146.62, total: 1013.14 });
});

test('factura sin NIF fuera del comercio: hasta 400 € IVA incluido, contados como en la factura (al céntimo)', () => {
  // Art. 4.1.a del Reglamento de facturación: 400 € IVA incluido. Un fontanero (no es del art. 4.1.c):
  // material 200,21 × 21 % = 42,0441 → 42,04; reparación en vivienda 143,41 × 10 % = 14,341 → 14,34;
  // total 200,21 + 42,04 + 143,41 + 14,34 = 400,00: cabe. (Sin redondear cada cuota daría 400,0051 → 400,01.)
  const reparacion = { fecha: '2026-06-03', actividad: 'diseno', irpfPct: 0, cliente: { nombre: 'Vecino del 3.º' }, lineas: [linea('Material de fontanería', 1, 200.21, 21), linea('Mano de obra en vivienda', 1, 143.41, 10)] };
  assert.deepEqual(validarFactura(reparacion), { ok: true });
  // Sin líneas: 330,58 × 21 % = 69,4218 → 69,42; total 400,00 (cabe). 330,59 × 21 % = 69,4239 → 69,42; total 400,01 (no).
  const simple = (base) => ({ fecha: '2026-06-03', concepto: 'Reparación', base, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'Vecino del 3.º' } });
  assert.deepEqual(validarFactura(simple(330.58)), { ok: true });
  assert.match(validarFactura(simple(330.59)).error, /hasta 400 €/);
  // Con el NIF del cliente no hay límite.
  assert.deepEqual(validarFactura({ ...simple(5000), cliente: { nombre: 'Vecino del 3.º', nif: '87654321X' } }), { ok: true });
});

test('numeración correlativa separada: serie de la actividad, FS de las simplificadas y R de las rectificativas', async () => {
  // Art. 6.1.a del Reglamento de facturación: numeración correlativa dentro de cada serie; las simplificadas y las
  // rectificativas, en series propias (arts. 7.1 y 15.5). La primera factura de la actividad ya es la D2026-001 (prueba anterior).
  const venta = (fecha, base, cliente) => ({ fecha, actividad: 'diseno', concepto: 'Diseño', base, ivaPct: 21, irpfPct: cliente.nif ? 15 : 0, cliente });
  const sinNif = { nombre: 'Particular' };
  const fs1 = (await F.crearFactura(uDiseno, venta('2026-04-20', 330.58, sinNif))).factura; // 400,00: cabe
  assert.match((await F.crearFactura(uDiseno, venta('2026-04-21', 330.59, sinNif))).error, /hasta 400 €/); // 400,01
  const d2 = (await F.crearFactura(uDiseno, venta('2026-04-22', 1200, EMPRESA))).factura;
  const r1 = (await F.crearFactura(uDiseno, { ...venta('2026-04-23', -1200, EMPRESA) }, { original: d2, motivo: 'error' })).factura;
  const fs2 = (await F.crearFactura(uDiseno, venta('2026-04-24', 100, sinNif))).factura;
  const r2 = (await F.crearFactura(uDiseno, { ...venta('2026-04-25', -100, sinNif) }, { original: fs2, motivo: 'devolucion' })).factura;
  const d3 = (await F.crearFactura(uDiseno, venta('2026-04-26', 800, EMPRESA))).factura;
  assert.deepEqual([fs1, d2, r1, fs2, r2, d3].map(numeroFactura), ['FS2026-001', 'D2026-002', 'R01-2026', 'FS2026-002', 'R02-2026', 'D2026-003']);
  // Rectificativa de la D2026-002 (anula 1.200 con su retención): −1.200 − 252 + 180 = −1.272.
  assert.deepEqual(importes(r1), { base: -1200, iva: -252, irpf: -180, total: -1272 });
});
