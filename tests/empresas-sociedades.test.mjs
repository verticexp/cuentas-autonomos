// Sociedades ficticias completas (2025 y 2026), revisión fiscal del 25-10-2026: todos sus modelos comprobados al céntimo.
// Los esperados están calculados a mano, sin llamar a la app: cada número lleva su cuenta y la regla con su fuente.
// Fuentes: Ley 37/1992 del IVA (LIVA) y su Reglamento (RIVA); Ley 27/2014 del Impuesto sobre Sociedades (LIS); Manual
// práctico de Sociedades 2025 de la AEAT; instrucciones y diseños de registro de la Sede de la AEAT (303 DR303e26v101,
// 390 de 2025, 347, 349, 190 de 2025, 369, 123 y 193); Orden PJC/297/2026 de cotización (bases y tipos de 2026, en
// lib/cotizacion.js) y «Algoritmo de cálculo del tipo de retención 2026» de la AEAT (10-09-2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, liquidaciones303 } from '../lib/calculos.js';
import { borradorSociedades, modelo190, modelo202, modelo347, modelo349, modelo390, periodos349, retencionesProfesionales, tiposIS } from '../lib/modelos.js';
import { calculoNomina, gastoDeNomina, limpiarCotizacion, limpiarDatos145, modelo111, nominaCompleta } from '../lib/nominas.js';
import { baseMensual, nominaCotizacion } from '../lib/cotizacion.js';
import { retencionTrabajo } from '../lib/retencionIrpf.js';
import { modelo369 } from '../lib/oss.js';
import { casillas123, limpiarPago, modelo123, modelo193 } from '../lib/capitalMobiliario.js';
import { generarAsientos } from '../lib/asientos.js';

let n = 0;
const fac = (fecha, cliente, base, ivaPct, extra = {}) => ({ id: `f${++n}`, fecha, numero: n, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente, base, ivaPct, irpfPct: 0, ...extra });
const gas = (fecha, proveedor, proveedorNif, concepto, base, ivaPct, extra = {}) => ({ id: `g${++n}`, fecha, actividad: 'a', proveedor, proveedorNif, concepto, base, ivaPct, ...extra });
const casillas = (c, ks) => Object.fromEntries(ks.map((k) => [k, c[k]]));
const K303 = ['04', '06', '07', '09', '10', '11', '12', '13', '14', '15', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '44', '45', '46', '59', '60', '120', '122', '123'];
// Un 303 con todas las casillas de K303 a cero salvo las indicadas.
const c303 = (v) => ({ ...Object.fromEntries(K303.map((k) => [k, 0])), ...v });

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. REFORMAS LEVANTE S.L. — constituida el 1-3-2024, microempresa. Obras: a constructoras con inversión del sujeto pasivo
// (art. 84.Uno.2.º.f LIVA), rehabilitación de viviendas de particulares al 10 % (art. 91.Uno.2.10.º LIVA) y reformas de
// locales de empresas al 21 %. No está en el criterio de caja.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const constructora = { nombre: 'Constructora Mediterráneo S.L.', nif: 'B46123457' };
const ana = { nombre: 'Ana García Soler', nif: '12345678Z' };
const juan = { nombre: 'Juan Pérez Mora', nif: '87654321X' };
const asesoria = { nombre: 'Asesoría Sur S.L.', nif: 'B03123452' };
const clinica = { nombre: 'Clínica Dental Levante S.L.', nif: 'B12345674' };

const facturasRL = [
  // 2025
  fac('2025-03-10', constructora, 90000, 0, { operacion: 'isp' }),
  fac('2025-06-12', ana, 45000, 10),
  fac('2025-10-20', asesoria, 30000, 21),
  // 2026
  fac('2026-01-20', constructora, 52000, 0, { operacion: 'isp' }),
  fac('2026-02-10', ana, 8500, 10),
  fac('2026-03-05', asesoria, 16200, 21),
  fac('2026-04-15', constructora, 61000, 0, { operacion: 'isp' }),
  fac('2026-05-20', juan, 12000, 10),
  fac('2026-06-10', asesoria, 13000, 21),
  fac('2026-07-08', constructora, 38500, 0, { operacion: 'isp' }),
  fac('2026-08-14', clinica, 19800, 21),
  fac('2026-09-15', ana, 4300, 10),
  fac('2026-10-20', constructora, 47000, 0, { operacion: 'isp' }),
  fac('2026-11-05', juan, 2500, 10),
  fac('2026-12-01', clinica, 11000.55, 21),
];
const ruiz = ['Albañilería Hermanos Ruiz S.L.', 'B30123459'];
const almacenes = ['Almacenes Levante S.A.', 'A46111112'];
const gestoria = ['Gestoría Contable S.L.', 'B46222223'];
const gastosRL = [
  // 2025
  gas('2025-01-15', 'Mapfre Seguros', 'A28141935', 'Seguro de responsabilidad civil 2025', 16396.40, 0),
  gas('2025-02-10', ...almacenes, 'Materiales de obra', 60000, 21, { categoria: '601' }),
  gas('2025-05-10', ...ruiz, 'Subcontrata de albañilería', 40000, 0, { origen: 'isp' }),
  // 2026
  gas('2026-01-05', 'Mapfre Seguros', 'A28141935', 'Seguro de responsabilidad civil 2026', 2400, 0),
  gas('2026-01-12', ...almacenes, 'Materiales de obra', 5200, 21, { categoria: '601' }),
  gas('2026-02-15', ...ruiz, 'Subcontrata de albañilería', 9000, 0, { origen: 'isp' }),
  gas('2026-03-15', 'Valencia Motor S.A.', 'A46333334', 'Furgoneta de obra', 24000, 21, { inversion: { tipo: 'transporte' } }),
  gas('2026-03-31', ...gestoria, 'Gestoría 1T', 300, 21),
  gas('2026-04-08', ...almacenes, 'Materiales de obra', 6400, 21, { categoria: '601' }),
  gas('2026-05-10', ...ruiz, 'Subcontrata de albañilería', 11000, 0, { origen: 'isp' }),
  gas('2026-06-05', 'Luis Martín Gómez', '67890123B', 'Dirección de obra (arquitecto técnico)', 1800, 21, { irpfPct: 15 }),
  gas('2026-06-30', ...gestoria, 'Gestoría 2T', 300, 21),
  gas('2026-07-20', ...almacenes, 'Materiales de obra', 4100.40, 21, { categoria: '601' }),
  gas('2026-09-01', 'DGT', 'S2816015H', 'Multa de tráfico', 400, 0),
  gas('2026-09-30', ...gestoria, 'Gestoría 3T', 300, 21),
  gas('2026-10-14', ...almacenes, 'Materiales de obra', 3900, 21, { categoria: '601' }),
  gas('2026-11-10', ...ruiz, 'Subcontrata de albañilería', 6500, 0, { origen: 'isp' }),
  gas('2026-12-31', ...gestoria, 'Gestoría 4T', 300, 21),
];

// Plantilla de 2026: jefe de obra (grupo 1), oficial (grupo 8, base diaria), peón temporal de 15 días en marzo y la
// administradora, asimilada al régimen general (art. 136.2.c LGSS).
const jefe = {
  id: 'eA', nombre: 'Pablo Sanz Ortega', nif: '23456789D', bruto: 3000, alta: '2024-09-01', horasSemana: 40,
  cotizacion: limpiarCotizacion({ grupo: 1, atPct: 6.7 }),
  datos145: limpiarDatos145({ nacimiento: 1985, situacionFamiliar: 3, descendientes: [{ nacimiento: 2018 }] }, '23456789D'),
};
const oficial = {
  id: 'eB', nombre: 'Rafael Moreno Gil', nif: '34567890V', bruto: 1450, alta: '2025-01-01', horasSemana: 40,
  cotizacion: limpiarCotizacion({ grupo: 8, atPct: 6.7 }),
  datos145: limpiarDatos145({ nacimiento: 1990, situacionFamiliar: 3 }, '34567890V'),
};
const peon = {
  id: 'eC', nombre: 'Iván Torres Ruiz', nif: '45678901G', bruto: 1500, alta: '2026-03-09', baja: '2026-03-23', horasSemana: 40,
  cotizacion: limpiarCotizacion({ grupo: 10, temporal: true, atPct: 6.7 }),
  datos145: limpiarDatos145({ nacimiento: 2000, situacionFamiliar: 3, contrato: 'inferiorAnio' }, '45678901G'),
};
const administradora = {
  id: 'eD', nombre: 'Carmen Levante Vidal', nif: '56789012B', bruto: 4000, alta: '2024-03-01', horasSemana: 40,
  cotizacion: limpiarCotizacion({ grupo: 1, administrador: 'asimilado', atPct: 1.5 }),
};
const empleadosRL = [jefe, oficial, peon, administradora];
// Como app/api/nominas (POST): la nómina guarda lo de nominaCompleta; se da por pagada el último día del mes.
const nominaDe = (e, mes, bruto = e.bruto) => {
  const c = nominaCompleta(e, { bruto, mes });
  return { id: `${e.id}-${mes}`, mes, empleado: e.id, empleadoNombre: e.nombre, bruto: c.importes.bruto, ...c, completa: true };
};
const MESES26 = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
// 2025: nóminas sencillas (bruto y porcentajes, lib/nominas.js calculoNomina).
const simple = (e, mes, bruto) => ({ id: `${e.id}-${mes}`, mes, empleado: e.id, empleadoNombre: e.nombre, bruto, irpfPct: 15, ssTrabajadorPct: 6.5, ssEmpresaPct: 32.15 });
const nominasRL = [
  ...MESES26.map((m) => simple(jefe, m.replace('2026', '2025'), 2800)),
  ...MESES26.map((m) => simple(oficial, m.replace('2026', '2025'), 1400)),
  ...MESES26.map((m) => nominaDe(jefe, m)),
  ...MESES26.map((m) => nominaDe(oficial, m)),
  nominaDe(peon, '2026-03', 750), // 15 días × 50 €
  ...MESES26.map((m) => nominaDe(administradora, m)),
];
// Cada nómina guarda también su gasto (app/api/nominas guardarConGasto).
const todosGastosRL = [...gastosRL, ...nominasRL.map((x) => gastoDeNomina(x, 'a'))];
const cuotaISRL = { 2024: 1200, 2025: 0 }; // 2024: base positiva (cuota apuntada en Impuestos); 2025: pérdidas
const opRL = { constitucion: '2024-03-01', cuotaIS: cuotaISRL, pagos202: { 2026: { 1: 216 } } };

test('Reformas Levante · cotización 2026 (Orden PJC/297/2026): bases por grupo y días, cuotas por concepto', () => {
  // Grupo 8 (base diaria, mínima 47,48 €/día): en un mes de 31 días la mínima es 31 × 47,48 = 1.471,88 € > 1.450 € de sueldo
  // (también la de AT, 1.424,40 × 31 / 30 = 1.471,88); en uno de 30, 30 × 47,48 = 1.424,40 < 1.450: cotiza por 1.450.
  const enero = baseMensual({ remuneracion: 1450, grupo: 8, dias: 31, prorrateadas: true });
  assert.deepEqual([enero.remuneracion, enero.base, enero.baseAT, enero.minima, enero.exceso], [1450, 1471.88, 1471.88, 1471.88, 0]);
  assert.deepEqual(baseMensual({ remuneracion: 1450, grupo: 8, dias: 28, prorrateadas: true }).base, 1450); // 28 × 47,48 = 1.329,44
  // Peón temporal (grupo 10), 15 días: base 750 (mínima 15 × 47,48 = 712,20). Trabajador: 4,70 % 35,25 + desempleo temporal
  // 1,60 % 12,00 + formación 0,10 % 0,75 + MEI 0,15 % 1,125 → 1,13 = 49,13. Empresa: 23,60 % 177,00 + desempleo temporal
  // 6,70 % 50,25 + FOGASA 0,20 % 1,50 + formación 0,60 % 4,50 + MEI 0,75 % 5,625 → 5,63 + AT 6,70 % 50,25 + 33,62 de la
  // cotización adicional de los contratos de menos de 30 días (art. 151 LGSS: 3 × 47,48 × 23,60 % = 33,62) = 322,75.
  const c = nominaCotizacion({ bruto: 750, grupo: 10, dias: 15, prorrateadas: true, temporal: true, atPct: 6.7, contratoCorto: true });
  assert.deepEqual(c.cuotas.trabajador, { contingenciasComunes: 35.25, desempleo: 12, formacion: 0.75, mei: 1.13, horasExtra: 0, solidaridad: 0, total: 49.13 });
  assert.deepEqual(c.cuotas.empresa, { contingenciasComunes: 177, desempleo: 50.25, fogasa: 1.5, formacion: 4.5, mei: 5.63, at: 50.25, contratoCorto: 33.62, horasExtra: 0, solidaridad: 0, total: 322.75 });
  assert.deepEqual(peon.cotizacion, { grupo: 10, temporal: true, pagas: 2, prorrateadas: true, atPct: 6.7 });
});

test('Reformas Levante · retención del IRPF de 2026 con el algoritmo de la AEAT', () => {
  // Oficial: 1.450 × 12 = 17.400 €; cotizaciones de un mes de 30 días 94,26 × 12 = 1.131,12. RNT = 16.268,88; reducción del
  // art. 20: 7.302 − 1,75 × (16.268,88 − 14.852) = 4.822,46; RNTREDU = 16.268,88 − 2.000 − 4.822,46 = 9.446,42.
  // Cuota: 9.446,42 × 19 % − 5.550 × 19 % = 1.794,82 − 1.054,50 = 740,32; límite del 43 % (situación 3, sin hijos:
  // 15.876): (17.400 − 15.876) × 0,43 = 655,32. Tipo: 655,32 / 17.400 = 3,7662 % → truncado 3,76 %.
  const b = retencionTrabajo({ ...oficial.datos145, nif: oficial.nif, retribuciones: 17400, cotizaciones: 1131.12 });
  // (El algoritmo no redondea los importes intermedios: aquí se comparan al céntimo.)
  const cent = (l) => l.map((x) => Math.round(x * 100) / 100);
  assert.deepEqual(cent([b.rendimientoNeto, b.reduccion20, b.base, b.minimo.total, b.limiteCuota, b.cuota, b.tipo]), [16268.88, 4822.46, 9446.42, 5550, 655.32, 655.32, 3.76]);
  // Jefe de obra: 36.000 €, cotizaciones 195 × 12 = 2.340; RNT 33.660 (sin reducción: más de 19.747,50); base 31.660.
  // Mínimo 5.550 + 2.400 × 50 % (hijo de 2018, a medias) = 6.750. Cuota 4.225,50 + (31.660 − 20.200) × 30 % = 7.663,50 −
  // 6.750 × 19 % (1.282,50) = 6.381. Tipo 6.381 / 36.000 = 17,725 % → 17,72 %.
  const a = retencionTrabajo({ ...jefe.datos145, nif: jefe.nif, retribuciones: 36000, cotizaciones: 2340 });
  assert.deepEqual(cent([a.reduccion20, a.base, a.minimo.total, a.cuota, a.tipo]), [0, 31660, 6750, 6381, 17.72]);
});

test('Reformas Levante · nóminas de 2026: grupo 1, grupo 8 con los días reales del mes, temporal y administradora', () => {
  const de = (e, mes) => nominasRL.find((x) => x.empleado === e.id && x.mes === mes);
  // Jefe (grupo 1, 3.000 € con pagas prorrateadas, AT 6,70 % de la construcción): trabajador 141 + 46,50 + 3 + 4,50 = 195;
  // empresa 708 + 165 + 6 + 18 + 22,50 + 201 = 1.120,50; IRPF 17,72 % = 531,60.
  assert.deepEqual(de(jefe, '2026-05').importes, { bruto: 3000, irpf: 531.6, ssTrabajador: 195, ssEmpresa: 1120.5 });
  // Oficial en enero (31 días, base 1.471,88): trabajador 69,18 + 22,81 + 1,47 + 2,21 = 95,67; empresa 347,36 + 80,95 +
  // 2,94 + 8,83 + 11,04 + 98,62 = 549,74; IRPF 3,76 % de 1.450 = 54,52.
  assert.deepEqual([de(oficial, '2026-01').detalle.dias, de(oficial, '2026-01').importes], [31, { bruto: 1450, irpf: 54.52, ssTrabajador: 95.67, ssEmpresa: 549.74 }]);
  // En febrero (28 días) y abril (30), base 1.450: trabajador 68,15 + 22,48 + 1,45 + 2,18 = 94,26; empresa 342,20 + 79,75 +
  // 2,90 + 8,70 + 10,88 + 97,15 = 541,58.
  assert.deepEqual([de(oficial, '2026-02').detalle.dias, de(oficial, '2026-02').importes], [28, { bruto: 1450, irpf: 54.52, ssTrabajador: 94.26, ssEmpresa: 541.58 }]);
  assert.deepEqual(de(oficial, '2026-04').importes, { bruto: 1450, irpf: 54.52, ssTrabajador: 94.26, ssEmpresa: 541.58 });
  // Peón: contrato de menos de un año, exento por el límite (725,81 € del año < 15.876) → mínimo del 2 % (art. 86.2 RIRPF):
  // 750 × 2 % = 15; cuotas de la prueba de cotización.
  const p = de(peon, '2026-03');
  assert.deepEqual([p.detalle.dias, p.irpfPct, p.importes], [15, 2, { bruto: 750, irpf: 15, ssTrabajador: 49.13, ssEmpresa: 322.75 }]);
  // Administradora asimilada (4.000 €, AT 1,50 %): sin desempleo, FOGASA ni formación. Trabajador 188 + 6 = 194; empresa
  // 944 + 30 + 60 = 1.034; retención fija del 35 % (art. 101.2 RIRPF: la sociedad facturó 165.000 € en 2025) = 1.400.
  assert.deepEqual(de(administradora, '2026-07').importes, { bruto: 4000, irpf: 1400, ssTrabajador: 194, ssEmpresa: 1034 });
  // 2025, nómina sencilla: 2.800 € con 15 %, 6,5 % y 32,15 %: IRPF 420, SS 182 y 900,20; neto 2.198; coste 3.700,20.
  assert.deepEqual(calculoNomina(de(jefe, '2025-06')), { bruto: 2800, irpf: 420, ssTrabajador: 182, ssEmpresa: 900.2, neto: 2198, coste: 3700.2, seguros: 1082.2 });
});

test('Reformas Levante · 303 de 2026 (×4) e IVA a compensar que viene de 2025', () => {
  // 1T: 10 % 8.500 → 850; 21 % 16.200 → 3.402; inversión del sujeto pasivo en la venta a la constructora (122) 52.000.
  // Subcontrata con inversión del sujeto pasivo: devengo 9.000 × 21 % = 1.890 (12-13) y deducción (28-29).
  // 28: 5.200 materiales + 9.000 subcontrata + 300 gestoría = 14.500; 29: 1.092 + 1.890 + 63 = 3.045.
  // Furgoneta (bien de inversión, art. 108 LIVA): 24.000 / 5.040 en las 30-31. 27 = 850 + 3.402 + 1.890 = 6.142;
  // 45 = 3.045 + 5.040 = 8.085; 46 = −1.943.
  assert.deepEqual(casillas(casillas303(facturasRL, todosGastosRL, 2026, 1), K303), c303({ '04': 8500, '06': 850, '07': 16200, '09': 3402, 12: 9000, 13: 1890, 27: 6142, 28: 14500, 29: 3045, 30: 24000, 31: 5040, 45: 8085, 46: -1943, 122: 52000 }));
  // 2T: 12.000 → 1.200; 13.000 → 2.730; subcontrata 11.000 → 2.310. 28: 6.400 + 11.000 + 1.800 (arquitecto) + 300 =
  // 19.500; 29: 1.344 + 2.310 + 378 + 63 = 4.095. 27 = 6.240; 46 = 2.145.
  assert.deepEqual(casillas(casillas303(facturasRL, todosGastosRL, 2026, 2), K303), c303({ '04': 12000, '06': 1200, '07': 13000, '09': 2730, 12: 11000, 13: 2310, 27: 6240, 28: 19500, 29: 4095, 45: 4095, 46: 2145, 122: 61000 }));
  // 3T: 4.300 → 430; 19.800 → 4.158. 28: 4.100,40 + 300; 29: 861,08 (4.100,40 × 21 % = 861,084) + 63 = 924,08.
  assert.deepEqual(casillas(casillas303(facturasRL, todosGastosRL, 2026, 3), K303), c303({ '04': 4300, '06': 430, '07': 19800, '09': 4158, 27: 4588, 28: 4400.4, 29: 924.08, 45: 924.08, 46: 3663.92, 122: 38500 }));
  // 4T: 2.500 → 250; 11.000,55 → 2.310,12 (2.310,1155); subcontrata 6.500 → 1.365. 28: 3.900 + 6.500 + 300; 29: 819 + 1.365 + 63.
  assert.deepEqual(casillas(casillas303(facturasRL, todosGastosRL, 2026, 4), K303), c303({ '04': 2500, '06': 250, '07': 11000.55, '09': 2310.12, 12: 6500, 13: 1365, 27: 3925.12, 28: 10700, 29: 2247, 45: 2247, 46: 1678.12, 122: 47000 }));
  // Compensación (art. 99.Cinco LIVA). 2025: 1T −12.600 (materiales); 2T +4.500 (la subcontrata se anula: 8.400 − 8.400) →
  // quedan 8.100; 4T +6.300 → quedan 1.800 para 2026. 2026: 1T −1.943 → 3.743; 2T 2.145 compensado → 1.598; 3T 3.663,92 −
  // 1.598 = 2.065,92 a ingresar; 4T 1.678,12 a ingresar.
  const L = liquidaciones303(facturasRL, todosGastosRL, 2026);
  assert.deepEqual(L.map((l) => [l.bruto, l.anterior, l.compensado, l.ingresar, l.pendiente]), [[-1943, 1800, 0, 0, 3743], [2145, 3743, 2145, 0, 1598], [3663.92, 1598, 1598, 2065.92, 0], [1678.12, 0, 0, 1678.12, 0]]);
});

test('Reformas Levante · 390 de 2026: cuadra con los cuatro 303', () => {
  const { c } = modelo390(facturasRL, todosGastosRL, 2026);
  // 03-04: 27.300 al 10 % → 2.730; 05-06: 60.000,55 al 21 % → 3.402 + 2.730 + 4.158 + 2.310,12 = 12.600,12; 27-28 (otras
  // inversiones del sujeto pasivo, la subcontrata): 26.500 → 5.565. 33 = 113.800,55; 34 = 20.895,12.
  // Deducciones: 605-606 interiores al 21 %: 14.500 + 19.500 + 4.400,40 + 10.700 = 49.100,40 → 10.311,08; 613-614 bienes de
  // inversión: 24.000 → 5.040. 64 = 15.351,08; 65 = 5.544,04 = −1.943 + 2.145 + 3.663,92 + 1.678,12.
  // 85: los 1.800 de 2025 compensados en el 2T; 86 = 3.744,04 = 95 (lo ingresado en los 303). Volumen (art. 121 LIVA):
  // 99 = 27.300 + 60.000,55; 125 (inversión del sujeto pasivo) 198.500; 108 = 285.800,55.
  assert.deepEqual(casillas(c, ['03', '04', '05', '06', '27', '28', '33', '34', '605', '606', '613', '614', '48', '49', '50', '51', '64', '65', '85', '86', '95', '99', '125', '108']),
    { '03': 27300, '04': 2730, '05': 60000.55, '06': 12600.12, 27: 26500, 28: 5565, 33: 113800.55, 34: 20895.12, 605: 49100.4, 606: 10311.08, 613: 24000, 614: 5040, 48: 49100.4, 49: 10311.08, 50: 24000, 51: 5040, 64: 15351.08, 65: 5544.04, 85: 1800, 86: 3744.04, 95: 3744.04, 99: 87300.55, 125: 198500, 108: 285800.55 });
});

test('Reformas Levante · 111 de 2026 (×4): trabajo y la dirección de obra del arquitecto', () => {
  const N = nominasRL;
  // 1T: jefe 3 × 3.000 (3 × 531,60), oficial 3 × 1.450 (3 × 54,52), peón 750 (15) y administradora 3 × 4.000 (3 × 1.400):
  // 4 perceptores, 26.100 € y 1.594,80 + 163,56 + 15 + 4.200 = 5.973,36.
  assert.deepEqual(modelo111(N, 2026, 1), { perceptores: 4, percepciones: 26100, retenciones: 5973.36, seguros: 9929.04 });
  // 2T a 4T: sin el peón, 25.350 € y 5.958,36 por trimestre.
  for (const t of [2, 3, 4]) assert.deepEqual([modelo111(N, 2026, t).perceptores, modelo111(N, 2026, t).percepciones, modelo111(N, 2026, t).retenciones], [3, 25350, 5958.36], `${t}T`);
  // Casillas 07-09 (actividades económicas): el arquitecto técnico en el 2T, 1.800 × 15 % = 270.
  assert.deepEqual(retencionesProfesionales(todosGastosRL, 2026, 2), { perceptores: 1, base: 1800, retenciones: 270 });
  assert.deepEqual(retencionesProfesionales(todosGastosRL, 2026, 1), { perceptores: 0, base: 0, retenciones: 0 });
  // Seguridad Social del 1T (dato del 111 de la app: cuotas de trabajador y empresa): jefe 3 × 1.315,50; oficial enero y
  // marzo (31 días) 2 × (95,67 + 549,74) y febrero 94,26 + 541,58; peón 49,13 + 322,75; administradora 3 × 1.228:
  // 3.946,50 + 1.290,82 + 635,84 + 371,88 + 3.684 = 9.929,04 (va en la primera comprobación de arriba).

});

test('Reformas Levante · 190 de 2026: claves A y E.01 con sus datos, y G.01 del profesional', () => {
  const m = modelo190(nominasRL, empleadosRL, 2026, todosGastosRL);
  const p = (nombre) => m.perceptores.find((x) => x.nombre === nombre);
  // Jefe: 12 × 3.000; 12 × 531,60 = 6.379,20; gastos deducibles (su Seguridad Social) 12 × 195 = 2.340. Datos del 145.
  assert.deepEqual(p('Pablo Sanz Ortega'), { nombre: 'Pablo Sanz Ortega', nif: '23456789D', clave: 'A', subclave: '', percepciones: 36000, retenciones: 6379.2, gastosDeducibles: 2340, nacimiento: 1985, situacionFamiliar: 3, discapacidad: 0, contrato: 1, movilidad: 0, hijos: { menores3: { total: 0, porEntero: 0 }, resto: { total: 1, porEntero: 0 } } });
  // Oficial: 17.400; 12 × 54,52 = 654,24; SS 7 meses de 31 días × 95,67 + 5 × 94,26 = 669,69 + 471,30 = 1.140,99.
  assert.deepEqual([p('Rafael Moreno Gil').clave, p('Rafael Moreno Gil').percepciones, p('Rafael Moreno Gil').retenciones, p('Rafael Moreno Gil').gastosDeducibles, p('Rafael Moreno Gil').contrato], ['A', 17400, 654.24, 1140.99, 1]);
  // Peón: contrato de menos de un año (2 en el diseño).
  assert.deepEqual([p('Iván Torres Ruiz').percepciones, p('Iván Torres Ruiz').retenciones, p('Iván Torres Ruiz').gastosDeducibles, p('Iván Torres Ruiz').contrato], [750, 15, 49.13, 2]);
  // Administradora asimilada de una sociedad que facturó más de 100.000 €: E.01 (diseño del 190 de 2025), con su SS.
  assert.deepEqual(p('Carmen Levante Vidal'), { nombre: 'Carmen Levante Vidal', nif: '56789012B', clave: 'E', subclave: '01', percepciones: 48000, retenciones: 16800, gastosDeducibles: 2328 });
  assert.deepEqual(p('Luis Martín Gómez'), { nombre: 'Luis Martín Gómez', nif: '67890123B', clave: 'G', subclave: '01', percepciones: 1800, retenciones: 270 });
  // Totales = la suma de los cuatro 111: 26.100 + 3 × 25.350 + 1.800 = 103.950; 5.973,36 + 3 × 5.958,36 + 270 = 24.118,44.
  assert.deepEqual([m.perceptores.length, m.percepciones, m.retenciones], [5, 103950, 24118.44]);
});

test('Reformas Levante · 347 de 2026: clientes y proveedores de más de 3.005,06 €, la subcontrata con la marca de inversión', () => {
  const m = modelo347(facturasRL, todosGastosRL, 2026);
  const T = (o) => [o.nombre, o.total, o.trimestres, Boolean(o.isp)];
  // Ventas (base + IVA). La marca de inversión del sujeto pasivo (posición 282) es «sólo del destinatario»: la venta a la
  // constructora va sin ella (diseño de registro del 347).
  assert.deepEqual(m.ventas.map(T), [
    ['Constructora Mediterráneo S.L.', 198500, [52000, 61000, 38500, 47000], false],
    ['Clínica Dental Levante S.L.', 37268.67, [0, 0, 23958, 13310.67], false], // 19.800 × 1,21; 11.000,55 + 2.310,12
    ['Asesoría Sur S.L.', 35332, [19602, 15730, 0, 0], false],
    ['Juan Pérez Mora', 15950, [0, 13200, 0, 2750], false],
    ['Ana García Soler', 14080, [9350, 0, 4730, 0], false],
  ]);
  // Compras: la furgoneta (24.000 + 5.040), la subcontrata con la «X» de inversión del sujeto pasivo (sin IVA) y los
  // materiales (19.600,40 + 4.116,08). Fuera: la gestoría (1.452), el seguro (2.400), la multa y el arquitecto (190).
  assert.deepEqual(m.compras.map(T), [
    ['Valencia Motor S.A.', 29040, [29040, 0, 0, 0], false],
    ['Albañilería Hermanos Ruiz S.L.', 26500, [9000, 11000, 0, 6500], true],
    ['Almacenes Levante S.A.', 23716.48, [6292, 7744, 4961.48, 4719], false],
  ]);
});

test('Reformas Levante · IS de 2025 (pérdidas) y de 2026: compensa la base negativa, multa no deducible, micro 19/21 %', () => {
  // 2025: ingresos 90.000 + 45.000 + 30.000 = 165.000; gastos 16.396,40 + 60.000 + 40.000 + nóminas 12 × (3.700,20 +
  // 1.850,10) = 66.603,60 → 183.000. Base −18.000 (art. 26 LIS: se compensa en los años siguientes).
  const b25 = borradorSociedades(facturasRL, todosGastosRL, 2025, opRL);
  assert.deepEqual([b25.ingresos, b25.gastos, b25.resultadoContable, b25.base, b25.perdida, b25.cuota, b25.tamano], [165000, 183000, -18000, 0, 18000, 0, 'micro']);
  const b = borradorSociedades(facturasRL, todosGastosRL, 2026, opRL);
  // Ingresos 2026: 198.500 (ISP) + 27.300 (10 %) + 60.000,55 (21 %) = 285.800,55.
  // Gastos: materiales 19.600,40 + subcontrata 26.500 + gestoría 1.200 + arquitecto 1.800 + seguro 2.400 + multa 400 +
  // amortización de la furgoneta (16 %, art. 12.1.a LIS, del 15-3 al 31-12: 292 días) 24.000 × 16 % × 292 / 365 = 3.072 +
  // nóminas: jefe 12 × 4.120,50 = 49.446; oficial 17.400 + 7 × 549,74 + 5 × 541,58 = 23.956,08; peón 750 + 322,75 =
  // 1.072,75; administradora 12 × 5.034 = 60.408 → 134.882,83. Total 189.855,23. Resultado 95.945,32.
  // La multa no es deducible (art. 15.c LIS): base previa 96.345,32. Compensa los 18.000 de 2025 (límite del 70 % y, en todo
  // caso, 1 M: art. 26.1) → base 78.345,32. Microempresa (cifra de negocios de 2025 < 1 M; la sociedad tuvo base positiva
  // en 2024, así que 2026 ya no es su primer año ni el siguiente con beneficio: sin el 15 % del art. 29.1): 50.000 × 19 % =
  // 9.500 + 28.345,32 × 21 % = 5.952,52 (5.952,5172) → 15.452,52 (DT 44.ª LIS; Manual de Sociedades 2025, pág. 11).
  // Sin retenciones; pagado el 202 del 1P (216): resultado 15.236,52.
  assert.deepEqual([b.ingresos, b.amortizacion, b.gastos, b.resultadoContable, b.ajusteNoDeducible, b.basePrevia, b.compensacion, b.base], [285800.55, 3072, 189855.23, 95945.32, 400, 96345.32, 18000, 78345.32]);
  assert.deepEqual([b.tamano, b.tipos, b.tramos], ['micro', [19, 21], [{ base: 50000, pct: 19, cuota: 9500 }, { base: 28345.32, pct: 21, cuota: 5952.52 }]]);
  assert.deepEqual([b.cuota, b.retenciones, b.cuotaEjercicio, b.pagos, b.resultado], [15452.52, 0, 15452.52, 216, 15236.52]);
  assert.deepEqual([b.binsPendientes, b.binsQuedan, b.nuevaCreacion.aplica], [[{ de: 2025, importe: 18000 }], [], false]);
});

test('Reformas Levante · 202 de 2026 y 2027 (art. 40.2 LIS: 18 % de la cuota del último IS vencido)', () => {
  // 2026: en abril, la de 2024 (1.200 → 216); en octubre y diciembre, la de 2025 (pérdidas: 0, no hay pago).
  assert.deepEqual(modelo202(cuotaISRL, 2026), [
    { p: 1, mes: 'abril', de: 2024, cuota: 1200, pago: 216, fecha: '2026-04-20' },
    { p: 2, mes: 'octubre', de: 2025, cuota: 0, pago: 0, fecha: '2026-10-20' },
    { p: 3, mes: 'diciembre', de: 2025, cuota: 0, pago: 0, fecha: '2026-12-21' }, // el 20 es domingo
  ]);
  // 2027 (octubre y diciembre): 18 % de 15.452,52 = 2.781,45 (2.781,4536).
  assert.deepEqual(modelo202({ ...cuotaISRL, 2026: 15452.52 }, 2027).slice(1).map((p) => p.pago), [2781.45, 2781.45]);
});

test('Reformas Levante · asiento del Impuesto sobre Sociedades de 2026: cuadra y coincide con el borrador', () => {
  const A = generarAsientos({ facturas: facturasRL, gastos: todosGastosRL, nominas: nominasRL, fiscal: { tipo: 'sociedad', iva: 'general', constitucion: '2024-03-01' }, cuotaIS: cuotaISRL, pagos202: { 2026: { 1: 216 } } }, '2027-03-01');
  const is = A.find((a) => a.concepto === 'Impuesto sobre Sociedades 2026');
  // 630 al debe por la cuota (15.452,52); 473 al haber por el 202 pagado (216); 4752 al haber por lo que queda (15.236,52).
  assert.deepEqual(is.lineas, [{ cuenta: '630', debe: 15452.52, haber: 0 }, { cuenta: '473', debe: 0, haber: 216 }, { cuenta: '4752', debe: 0, haber: 15236.52 }]);
  // El resultado antes de impuestos de la contabilidad (cuentas 6 y 7 de 2026 sin la 630) es el resultado contable del
  // borrador: 95.945,32; después del impuesto, 80.492,80 a la 129.
  const del2026 = A.filter((a) => a.fecha.startsWith('2026-') && a.origen?.tipo !== 'regularizacion');
  const pyg = Math.round(del2026.flatMap((a) => a.lineas).filter((l) => /^[67]/.test(l.cuenta) && l.cuenta !== '630').reduce((s, l) => s + l.haber - l.debe, 0) * 100) / 100;
  assert.equal(pyg, 95945.32);
  const reg = A.find((a) => a.concepto === 'Regularización de 2026');
  assert.deepEqual(reg.lineas.find((l) => l.cuenta === '129'), { cuenta: '129', debe: 0, haber: 80492.8 });
  for (const a of A) assert.ok(Math.abs(a.lineas.reduce((s, l) => s + l.debe - l.haber, 0)) < 0.005, a.concepto);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. IMPORTACIONES NÓRDICAS S.L. — reducida dimensión (cifra de negocios de 2025 entre 1 y 10 M). Importa de China (DUA),
// compra bienes en Alemania, vende a empresas de Francia y a particulares de la UE por la ventanilla única, vende en España
// al 21 y al 10 %, alquila dos viviendas (exentas, art. 20.Uno.23.º LIVA: prorrata), vende una máquina usada que compró
// antes de usar la app y reparte dividendos. 2025 con prorrata general; para 2026 opta por la especial (art. 103.Dos LIVA,
// marcada en el 303 del 4T de 2025).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
const iberia = { nombre: 'Distribuciones Iberia S.A.', nif: 'A28123456' };
const superC = { nombre: 'Supermercados Cantábrico S.L.', nif: 'B39123450' };
const ferreteria = { nombre: 'Ferretería López S.L.', nif: 'B33123451' };
const talleres = { nombre: 'Talleres Martínez S.L.', nif: 'B48123452' };
const lars = { nombre: 'Lars Nilsen', nif: 'Y1234567X' };
const marta = { nombre: 'Marta Gómez Ruiz', nif: '11111111H' };
const maison = { nombre: 'Maison Design SARL', nif: 'FR12345678901' };
const bricolage = { nombre: 'Bricolage Lyon SAS', nif: 'FR98765432109' };
const ue = (fecha, cliente, base) => fac(fecha, cliente, base, 0, { operacion: 'intracomunitaria' });
const oss = (fecha, nombre, pais, base, ivaPct, extra = {}) => fac(fecha, { nombre }, base, ivaPct, { oss: { pais, bienes: true }, ...extra });
const alquileres = (anio, importe) => ['03-31', '06-30', '09-30', '12-31'].flatMap((d) => [lars, marta].map((c) => fac(`${anio}-${d}`, c, importe, 0, { operacion: 'exenta' })));
const ventaFerreteria = { ...fac('2026-01-08', ferreteria, 4000, 21), id: 'fFerr' };
const ossJonas = { ...oss('2026-02-14', 'Jonas Weber', 'DE', 1500, 19), id: 'fJonas' };
const facturasNO = [
  ...['02-15', '05-15', '08-14', '11-14'].map((d) => fac(`2025-${d}`, iberia, 300000, 21)),
  ...alquileres(2025, 8250),
  fac('2026-02-15', iberia, 280000, 21), fac('2026-05-15', iberia, 290000, 21), fac('2026-08-14', iberia, 260000, 21), fac('2026-11-16', iberia, 233700, 21),
  fac('2026-03-10', superC, 45000.50, 10), fac('2026-06-12', superC, 38000, 10), fac('2026-09-09', superC, 41200, 10), fac('2026-12-02', superC, 52300, 10),
  ventaFerreteria,
  // Impago (art. 80.Cuatro LIVA: pasados 6 meses del devengo y reclamado; volumen de 2025 < 6.010.121,04 €).
  fac('2026-07-20', ferreteria, -4000, 21, { rectifica: { id: 'fFerr', motivo: 'incobrable', fecha: '2026-01-08' } }),
  ...alquileres(2026, 7500),
  // La máquina usada (bien de inversión de la empresa, comprada en 2019, antes de usar la app): art. 104.Tres.1.º LIVA.
  fac('2026-09-30', talleres, 7000, 21, { accesoria: 'inversion' }),
  ue('2026-01-20', maison, 18000), ue('2026-02-18', maison, 22000), ue('2026-04-10', maison, 25000), ue('2026-05-12', maison, 30000),
  ue('2026-05-28', bricolage, 7000), ue('2026-06-20', maison, 12000), ue('2026-07-15', maison, 15000), ue('2026-08-20', maison, 8000),
  ue('2026-09-25', maison, 9500), ue('2026-10-14', maison, 20000), ue('2026-12-10', maison, 16000),
  oss('2026-01-25', 'Claire Dubois', 'FR', 2000, 20), ossJonas, oss('2026-03-03', 'Marco Rossi', 'IT', 800, 22),
  oss('2026-04-12', 'Julie Martin', 'FR', 2500, 20), oss('2026-05-07', 'Lena Fischer', 'DE', 1200, 7),
  oss('2026-05-20', 'Jonas Weber', 'DE', -1500, 19, { rectifica: { id: 'fJonas', motivo: 'devolucion', fecha: '2026-02-14' } }),
  oss('2026-08-03', 'Paul Bernard', 'FR', 1800, 20), oss('2026-10-05', 'Giulia Bianchi', 'IT', 1000, 22), oss('2026-12-12', 'Hugo Petit', 'FR', 2400, 20),
];
const mercaderias = ['Mercaderías del Norte S.A.', 'A48999990'];
const logistica = ['Logística Cantábrica S.L.', 'B39555551'];
const grav = { usoProrrata: 'gravadas' };
const gastosNO = [
  ...['02-01', '05-01', '08-01', '11-01'].map((d) => gas(`2025-${d}`, ...mercaderias, 'Mercaderías', 200000, 21, { categoria: '600' })),
  ...['03-15', '06-15', '09-15', '12-15'].map((d) => gas(`2025-${d}`, ...logistica, 'Transporte y almacén', 62500, 21)),
  ...['02-01', '05-01', '08-01', '11-01'].map((d) => gas(`2026-${d}`, ...mercaderias, 'Mercaderías', 150000, 21, { categoria: '600', ...grav })),
  ...['03-15', '06-15', '09-15', '12-15'].map((d) => gas(`2026-${d}`, ...logistica, 'Transporte y almacén', 50000, 21)),
  gas('2026-05-05', 'Reformas Hogar Bilbao S.L.', 'B48777772', 'Reparación de las viviendas alquiladas', 3000, 21, { usoProrrata: 'exentas' }),
  gas('2026-03-02', 'Shenzhen Furniture Co.', '', 'Mercancía importada (DUA)', 60000, 21, { importacion: true, categoria: '600', ...grav }),
  gas('2026-06-03', 'Oslo Seafood AS', '', 'Salmón importado (DUA)', 45000, 10, { importacion: true, categoria: '600', ...grav }),
  gas('2026-09-01', 'Shenzhen Furniture Co.', '', 'Máquina embaladora importada (DUA)', 9000, 21, { importacion: true, inversion: { tipo: 'maquinaria' }, ...grav }),
  gas('2026-11-20', 'Shenzhen Furniture Co.', '', 'Mercancía importada (DUA)', 52000, 21, { importacion: true, categoria: '600', ...grav }),
  gas('2026-02-05', 'Möbel Werk GmbH', 'DE123456789', 'Muebles', 35000, 0, { categoria: '600', ...grav }),
  gas('2026-04-20', 'Stapler AG', 'DE987654321', 'Carretilla elevadora', 18500, 0, { inversion: { tipo: 'maquinaria' }, ...grav }),
  gas('2026-07-22', 'Möbel Werk GmbH', 'DE123456789', 'Muebles', 28000, 0, { categoria: '600', ...grav }),
];
const ivaNO = { prorrata: { especial: { 2026: true } } };
// Baja de la máquina vendida (la apunta la gestoría): costó 30.000 €, amortizados 26.000 → valor neto 4.000; vendida por
// 7.000 → beneficio 3.000 (771). Como la factura de la app la lleva a la 705, el asiento la saca de ahí.
const manualesNO = [{ id: 'm1', fecha: '2026-09-30', concepto: 'Baja de la máquina vendida', lineas: [{ cuenta: '705', debe: 7000, haber: 0 }, { cuenta: '2813', debe: 26000, haber: 0 }, { cuenta: '213', debe: 0, haber: 30000 }, { cuenta: '771', debe: 0, haber: 3000 }] }];
const capitalNO = [
  { fecha: '2026-05-30', tipo: 'dividendos', perceptor: { nombre: 'Erik Larsen', nif: 'X1234567L' }, bruto: 30000 },
  { fecha: '2026-05-30', tipo: 'dividendos', perceptor: { nombre: 'Ana Ruiz Pérez', nif: '12345678Z' }, bruto: 20000 },
  // Préstamo de 200.000 € de Erik (60 % de unos fondos propios de 50.000: el triple de su parte son 90.000): los intereses
  // de los 110.000 de exceso, 8.000 × 110 / 200 = 4.400, van a la base general (art. 46.a LIRPF, clave D del 193).
  { fecha: '2026-12-30', tipo: 'intereses', perceptor: { nombre: 'Erik Larsen', nif: 'X1234567L' }, bruto: 8000, vinculado: true, exceso: 4400 },
].map((b, i) => ({ id: `c${i}`, ...limpiarPago(b) }));

test('Importaciones Nórdicas · 303 de 2026 (×4): DUA, compras en Alemania, entregas a Francia, ventanilla única y prorrata especial', () => {
  const q = [1, 2, 3, 4].map((t) => casillas303(facturasNO, gastosNO, 2026, t, ivaNO));
  // Prorrata provisional de 2026: la definitiva de 2025 (art. 105 LIVA): 1.200.000 con derecho a deducir entre 1.266.000
  // (con los 66.000 de alquileres exentos) = 94,79 % → 95 % (art. 104.Dos: redondeo a la unidad superior).
  // Con la especial (art. 106), las mercancías, los DUA y las compras a Alemania (usadas solo en ventas con IVA) se deducen
  // enteras; el transporte (común) al 95 %: 10.500 × 95 % = 9.975; la reparación de las viviendas (exentas), nada.
  // 1T: 10 % 45.000,50 → 4.500,05; 21 % 280.000 + 4.000 (Ferretería) → 59.640; Alemania (10-11) 35.000 → 7.350.
  // 28: 150.000 + 50.000; 29: 31.500 + 9.975 = 41.475; DUA 32-33: 60.000 → 12.600; 36-37: 35.000 → 7.350.
  // 27 = 4.500,05 + 59.640 + 7.350 = 71.490,05; 45 = 61.425; 46 = 10.065,05. 59 (Francia): 18.000 + 22.000.
  // 123 (ventanilla única, solo la base): 2.000 + 1.500 + 800.
  assert.deepEqual(casillas(q[0], K303), c303({ '04': 45000.5, '06': 4500.05, '07': 284000, '09': 59640, 10: 35000, 11: 7350, 27: 71490.05, 28: 200000, 29: 41475, 32: 60000, 33: 12600, 36: 35000, 37: 7350, 45: 61425, 46: 10065.05, 59: 40000, 123: 4300 }));
  // 2T: 38.000 → 3.800; 290.000 → 60.900; carretilla de Alemania, bien de inversión (38-39): 18.500 → 3.885; DUA del salmón
  // al 10 %: 45.000 → 4.500. 28-29 como en el 1T (la reparación de las viviendas no entra). 27 = 68.585; 45 = 49.860.
  // 59: 25.000 + 30.000 + 7.000 + 12.000. 123: 2.500 + 1.200 − 1.500 (la devolución de Jonas).
  assert.deepEqual(casillas(q[1], K303), c303({ '04': 38000, '06': 3800, '07': 290000, '09': 60900, 10: 18500, 11: 3885, 27: 68585, 28: 200000, 29: 41475, 32: 45000, 33: 4500, 38: 18500, 39: 3885, 45: 49860, 46: 18725, 59: 74000, 123: 2200 }));
  // 3T: 41.200 → 4.120; 260.000 + 7.000 (la máquina) → 56.070; impago de Ferretería (14-15): −4.000 / −840; Alemania 28.000
  // → 5.880 (36-37); embaladora importada, bien de inversión (34-35): 9.000 → 1.890. 27 = 65.230; 45 = 49.245.
  assert.deepEqual(casillas(q[2], K303), c303({ '04': 41200, '06': 4120, '07': 267000, '09': 56070, 10: 28000, 11: 5880, 14: -4000, 15: -840, 27: 65230, 28: 200000, 29: 41475, 34: 9000, 35: 1890, 36: 28000, 37: 5880, 45: 49245, 46: 15985, 59: 32500, 123: 1800 }));
  // 4T: 52.300 → 5.230; 233.700 → 49.077; DUA 52.000 → 10.920. Regularización (44, art. 105.Tres y 106.Dos): prorrata
  // definitiva de 2026 = 1.434.400,50 / 1.494.400,50 = 95,985 % → 96 %, sin la venta de la máquina (art. 104.Tres.1.º:
  // con ella, 1.441.400,50 / 1.501.400,50 = 96,004 % → 97 %): (96 − 95) % de lo común del año, 4 × 10.500 = 420.
  // 45 = 31.500 + 9.975 + 10.920 + 420 = 52.815; 46 = 54.307 − 52.815 = 1.492.
  assert.deepEqual(casillas(q[3], K303), c303({ '04': 52300, '06': 5230, '07': 233700, '09': 49077, 27: 54307, 28: 200000, 29: 41475, 32: 52000, 33: 10920, 44: 420, 45: 52815, 46: 1492, 59: 36000, 123: 3400 }));
  // IVA que no se deduce: 5 % del común (525) por trimestre, los 630 de la reparación, y en el 4T 525 − 420.
  assert.deepEqual(q.map((c) => c.prorrata), [{ provisional: 95, especial: true, perdido: 525 }, { provisional: 95, especial: true, perdido: 1155 }, { provisional: 95, especial: true, perdido: 525 }, { provisional: 95, definitiva: 96, especial: true, perdido: 105 }]);
  // 2025: prorrata general del 95 % todo el año; la opción por la especial de 2026 va en el 303 del 4T de 2025.
  const q25 = casillas303(facturasNO, gastosNO, 2025, 4, ivaNO);
  // 28-29: 200.000 + 62.500 → 55.125 × 95 % = 52.368,75; 27: 300.000 × 21 % = 63.000; 46 = 10.631,25.
  assert.deepEqual([q25['28'], q25['29'], q25['44'], q25['46'], q25.opcionEspecial, q25.prorrata], [262500, 52368.75, 0, 10631.25, 'opcion', { provisional: 95, definitiva: 95, perdido: 2756.25 }]);
});

test('Importaciones Nórdicas · 390 de 2026: cuadra con los 303, la máquina en la 107 y la prorrata especial', () => {
  const { c } = modelo390(facturasNO, gastosNO, 2026, ivaNO);
  // Devengado: 10 % 176.500,50 → 17.650,05; 21 % 284.000 + 290.000 + 267.000 + 233.700 = 1.074.700 → 225.687; compras de
  // bienes en Alemania al 21 % (25-26) 81.500 → 17.115; impago (31-32, art. 80.Cuatro: «créditos total o parcialmente
  // incobrables», instrucciones del 390) −4.000 / −840, y nada en la 29-30. 33 = 1.328.700,50; 34 = 47 = 259.612,05.
  // Deducciones (ya con la prorrata): interiores 605-606: 800.000 / 4 × 41.475 = 165.900; importaciones al 21 % 621-622:
  // 112.000 / 23.520 y al 10 % 619-620: 45.000 / 4.500 (52-53: 157.000 / 28.020); importación de bien de inversión 625-626:
  // 9.000 / 1.890; Alemania corrientes 629-630: 63.000 / 13.230; bien de inversión de Alemania 633-634: 18.500 / 3.885;
  // regularización de la prorrata (522) 420. 64 = 213.345; 65 = 46.267,05 = 10.065,05 + 18.725 + 15.985 + 1.492 = 95.
  // Volumen (art. 121 LIVA): 99 = 1.074.700 − 4.000 + 176.500,50 = 1.247.200,50 (con la máquina); 103 (Francia) 182.500;
  // 105 (alquileres) 60.000; 126 (ventanilla única) 11.700; 107 (la máquina) 7.000; 108 = 1.494.400,50.
  // Prorrata: 115 = 1.494.400,50; 116 = 1.434.400,50; 117 especial; 118 = 96.
  assert.deepEqual(casillas(c, ['03', '04', '05', '06', '25', '26', '29', '30', '31', '32', '33', '34', '47', '605', '606', '48', '49', '619', '620', '621', '622', '52', '53', '625', '626', '54', '55', '629', '630', '56', '57', '633', '634', '58', '59', '522', '64', '65', '84', '85', '86', '95', '97', '99', '103', '105', '107', '108', '110', '125', '126', '115', '116', '117', '118', '232']), {
    '03': 176500.5, '04': 17650.05, '05': 1074700, '06': 225687, 25: 81500, 26: 17115, 29: 0, 30: 0, 31: -4000, 32: -840, 33: 1328700.5, 34: 259612.05, 47: 259612.05,
    605: 800000, 606: 165900, 48: 800000, 49: 165900, 619: 45000, 620: 4500, 621: 112000, 622: 23520, 52: 157000, 53: 28020, 625: 9000, 626: 1890, 54: 9000, 55: 1890,
    629: 63000, 630: 13230, 56: 63000, 57: 13230, 633: 18500, 634: 3885, 58: 18500, 59: 3885, 522: 420, 64: 213345, 65: 46267.05, 84: 46267.05, 85: 0, 86: 46267.05, 95: 46267.05, 97: 0,
    99: 1247200.5, 103: 182500, 105: 60000, 107: 7000, 108: 1494400.5, 110: undefined, 125: undefined, 126: 11700, 115: 1494400.5, 116: 1434400.5, 117: 'E', 118: 96, 232: 0,
  });
});

test('Importaciones Nórdicas · 349 de 2026 por periodo: trimestral, mensual desde mayo al pasar de 50.000 € (art. 81 RIVA)', () => {
  const P = (t) => periodos349(facturasNO, 2026, t, gastosNO).map((p) => [p.periodo, p.plazo, p.operadores.map((o) => [o.nombre, o.clave, o.base]), p.total]);
  // 1T: entregas a Francia 40.000 (no pasa de 50.000, ni ningún trimestre anterior): trimestral. Compras de bienes en
  // Alemania, clave A (35.000). Plazo: 20 de abril.
  assert.deepEqual(P(1), [['1T', '2026-04-20', [['Maison Design SARL', 'E', 40000], ['Möbel Werk GmbH', 'A', 35000]], 75000]]);
  // 2T: a final de abril 25.000; a final de mayo 25.000 + 30.000 + 7.000 = 62.000 > 50.000 → declaración de abril y mayo
  // (instrucciones del 349: «para el mes o los meses transcurridos desde el comienzo de dicho trimestre»), hasta el 20 de
  // junio (sábado: el 22), y junio aparte, hasta el 20 de julio. La carretilla de Alemania (A) va en abril-mayo.
  assert.deepEqual(P(2), [
    ['05', '2026-06-22', [['Maison Design SARL', 'E', 55000], ['Stapler AG', 'A', 18500], ['Bricolage Lyon SAS', 'E', 7000]], 80500],
    ['06', '2026-07-20', [['Maison Design SARL', 'E', 12000]], 12000],
  ]);
  // 3T y 4T: mensual (el 2T pasó de 50.000: «ni durante el trimestre de referencia ni en cada uno de los cuatro anteriores»).
  // Julio y agosto, hasta el 20 de septiembre (domingo: el 21); diciembre, hasta el 30 de enero (sábado: el 1 de febrero).
  assert.deepEqual(P(3), [
    ['07', '2026-09-21', [['Möbel Werk GmbH', 'A', 28000], ['Maison Design SARL', 'E', 15000]], 43000],
    ['08', '2026-09-21', [['Maison Design SARL', 'E', 8000]], 8000],
    ['09', '2026-10-20', [['Maison Design SARL', 'E', 9500]], 9500],
  ]);
  assert.deepEqual(P(4), [
    ['10', '2026-11-20', [['Maison Design SARL', 'E', 20000]], 20000],
    ['11', '2026-12-21', [], 0],
    ['12', '2027-02-01', [['Maison Design SARL', 'E', 16000]], 16000],
  ]);
  // El 349 recoge lo mismo que la casilla 59 de cada 303 (40.000, 74.000, 32.500, 36.000) en las claves E.
  const E = (t) => periodos349(facturasNO, 2026, t, gastosNO).flatMap((p) => p.operadores).filter((o) => o.clave === 'E').reduce((s, o) => s + o.base, 0);
  assert.deepEqual([1, 2, 3, 4].map(E), [40000, 74000, 32500, 36000]);
  assert.equal(modelo349(facturasNO, 2026, 2, gastosNO).mensual, '2026-05');
});

test('Importaciones Nórdicas · 369 de 2026 (×4): por país y tipo, y un país negativo no compensa a los demás', () => {
  const M = (t) => modelo369(facturasNO, 2026, t);
  const pais = (p, pct, base, cuota) => ({ pais: p, tipos: [{ pct, base, cuota }], base, cuota });
  // 1T (bienes enviados desde España, apartado 4): Alemania 1.500 × 19 % = 285; Francia 2.000 × 20 % = 400; Italia 800 ×
  // 22 % = 176. A ingresar 861.
  assert.deepEqual(M(1), { servicios: [], bienes: [pais('DE', 19, 1500, 285), pais('FR', 20, 2000, 400), pais('IT', 22, 800, 176)], correcciones: [], fuera: [], paises: [{ pais: 'DE', saldo: 285 }, { pais: 'FR', saldo: 400 }, { pais: 'IT', saldo: 176 }], base: 4300, cuota: 861, devolver: 0, sinActividad: false });
  // 2T: Alemania 1.200 × 7 % = 84 y la devolución de Jonas, de una venta del 1T, en las correcciones (apartado 7): −285.
  // Alemania queda en −201, que devuelve Alemania; Francia 2.500 × 20 % = 500 a ingresar, sin restarle esos 201 (apartado 8).
  assert.deepEqual(M(2), { servicios: [], bienes: [pais('DE', 7, 1200, 84), pais('FR', 20, 2500, 500)], correcciones: [{ pais: 'DE', anio: 2026, t: 1, cuota: -285 }], fuera: [], paises: [{ pais: 'DE', saldo: -201 }, { pais: 'FR', saldo: 500 }], base: 3700, cuota: 500, devolver: 201, sinActividad: false });
  assert.deepEqual([M(3).cuota, M(3).base, M(3).devolver], [360, 1800, 0]); // 1.800 × 20 %
  assert.deepEqual([M(4).bienes, M(4).cuota], [[pais('FR', 20, 2400, 480), pais('IT', 22, 1000, 220)], 700]);
});

test('Importaciones Nórdicas · 347 de 2026: sin los clientes de la UE, los DUA ni las compras a Alemania', () => {
  const m = modelo347(facturasNO, gastosNO, 2026);
  const T = (o) => [o.nombre, o.total, o.trimestres];
  // Ventas con IVA: Iberia 1.063.700 × 1,21 = 1.287.077; Supermercados 176.500,50 × 1,10 = 194.150,55; alquileres exentos
  // (los declara la sociedad arrendadora) 4 × 7.500; la máquina 7.000 × 1,21 = 8.470. Ferretería: 4.840 − 4.840 = 0, no se
  // declara. Francia va en el 349 y los particulares de la ventanilla única no pasan de 3.005,06 cada uno.
  assert.deepEqual(m.ventas.map(T), [
    ['Distribuciones Iberia S.A.', 1287077, [338800, 350900, 314600, 282777]],
    ['Supermercados Cantábrico S.L.', 194150.55, [49500.55, 41800, 45320, 57530]],
    ['Lars Nilsen', 30000, [7500, 7500, 7500, 7500]],
    ['Marta Gómez Ruiz', 30000, [7500, 7500, 7500, 7500]],
    ['Talleres Martínez S.L.', 8470, [0, 0, 8470, 0]],
  ]);
  // Compras: mercaderías 600.000 × 1,21; transporte 200.000 × 1,21; la reparación 3.000 × 1,21 = 3.630 (con su IVA aunque no
  // se deduzca). Fuera: los DUA (art. 33.2 RGAT, van en la declaración de importación) y las compras a Alemania (349).
  assert.deepEqual(m.compras.map(T), [
    ['Mercaderías del Norte S.A.', 726000, [181500, 181500, 181500, 181500]],
    ['Logística Cantábrica S.L.', 242000, [60500, 60500, 60500, 60500]],
    ['Reformas Hogar Bilbao S.L.', 3630, [0, 3630, 0, 0]],
  ]);
});

test('Importaciones Nórdicas · 123 (×4) y 193 de 2026: dividendos a dos socios y los intereses del préstamo de uno (B y D)', () => {
  // Retención del 19 % (art. 101.4 LIRPF). 2T: dividendos 30.000 + 20.000 → 5.700 + 3.800.
  assert.deepEqual(casillas123(capitalNO, 2026, 2), { '01': 2, '02': 0, '03': 2, '04': 50000, '05': 0, '06': 50000, '07': 9500, '08': 0, '09': 9500, 12: 9500, 14: 9500 });
  // 4T: intereses 8.000 → 1.520 (resto de rentas).
  assert.deepEqual(casillas123(capitalNO, 2026, 4), { '01': 0, '02': 1, '03': 1, '04': 0, '05': 8000, '06': 8000, '07': 0, '08': 1520, '09': 1520, 12: 1520, 14: 1520 });
  assert.deepEqual([1, 2, 3, 4].map((t) => modelo123(capitalNO, 2026, t)), [{ perceptores: 0, base: 0, retenciones: 0 }, { perceptores: 2, base: 50000, retenciones: 9500 }, { perceptores: 0, base: 0, retenciones: 0 }, { perceptores: 1, base: 8000, retenciones: 1520 }]);
  // 193: dividendos A.02; intereses del préstamo B.03 por 3.600 (retención 1.520 − 836 = 684) y D.03 por el exceso, 4.400
  // (19 % = 836). Total 58.000 y 11.020.
  const m = modelo193(capitalNO, 2026);
  assert.deepEqual(m.perceptores.map((p) => [p.nombre, p.nif, p.clave, p.naturaleza, p.base, p.retenciones]), [
    ['Ana Ruiz Pérez', '12345678Z', 'A', '02', 20000, 3800],
    ['Erik Larsen', 'X1234567L', 'A', '02', 30000, 5700],
    ['Erik Larsen', 'X1234567L', 'B', '03', 3600, 684],
    ['Erik Larsen', 'X1234567L', 'D', '03', 4400, 836],
  ]);
  assert.deepEqual([m.base, m.retenciones], [58000, 11020]);
});

const cuotaISNO = { 2024: 30000, 2025: 49194 }; // 2025: la cuota por la norma (abajo)
const opNO = { manuales: manualesNO, capital: capitalNO, cuotaIS: cuotaISNO, pagos202: { 2026: { 1: 5400, 2: 8854.92, 3: 8854.92 } } };

test('Importaciones Nórdicas · IS: reducida dimensión, la máquina vendida, los intereses del socio y el 202 de 2026', () => {
  // 2025: cifra de negocios 1.200.000 + 66.000 de alquileres = 1.266.000 (sin datos de 2024 en la app, la del propio año):
  // entre 1 y 10 M → reducida dimensión, 24 % en 2025 (DT 44.ª LIS; Manual de Sociedades 2025, pág. 11).
  const b25 = borradorSociedades(facturasNO, gastosNO, 2025, opNO);
  assert.deepEqual([b25.ingresos, b25.incn, b25.tamano, b25.tipos], [1266000, 1266000, 'reducida', [24, 24]]);
  // 2026: cifra de negocios de 2025 → reducida, 23 %. Ingresos: 1.063.700 + 176.500,50 + 4.000 − 4.000 (impago) + 60.000 +
  // 182.500 (Francia) + 11.700 (ventanilla única) + 7.000 (la máquina) = 1.501.400,50. El asiento de baja de la máquina
  // (−7.000 de la 705 y +3.000 de beneficio en la 771) deja en el resultado solo el beneficio: ajustes −4.000.
  // Amortización (12 % maquinaria, art. 12.1.a LIS): carretilla 18.500 × 12 % × 256 / 365 = 1.557,04 (desde el 20-4) y
  // embaladora 9.000 × 12 % × 122 / 365 = 360,99 (desde el 1-9) → 1.918,03. Intereses del préstamo del socio: 8.000 de
  // gasto financiero (cuenta 662; deducibles: el art. 16 LIS solo limita lo que pase de 1 M); los dividendos no son gasto.
  const b = borradorSociedades(facturasNO, gastosNO, 2026, opNO);
  assert.deepEqual([b.ingresos, b.amortizacion, b.financieros, b.ajustesContables, b.incn, b.tamano, b.tipos], [1501400.5, 1918.03, 8000, -4000, 1266000, 'reducida', [23, 23]]);
  // 202 de 2026 (art. 40.2 LIS; la cifra de negocios no pasa de 6 M: no es el del art. 40.3): 18 % de 30.000 (2024) = 5.400
  // en abril y 18 % de 49.194 (2025) = 8.854,92 en octubre y diciembre.
  assert.equal(b.obligado403, false);
  assert.deepEqual(modelo202(cuotaISNO, 2026).map((p) => [p.de, p.pago]), [[2024, 5400], [2025, 8854.92], [2025, 8854.92]]);
});

test('Importaciones Nórdicas · IS por la norma: el IVA que no se deduce por la prorrata es gasto (NRV 12.ª PGC)', { todo: 'borradorSociedades no resta el IVA no deducible por la prorrata (sí lo hace la renta, resumenAnual); ver el informe' }, () => {
  // 2025: prorrata general del 95 %: no se deduce el 5 % de 4 × 55.125 = 11.025, que es más coste de las compras (norma de
  // registro y valoración 12.ª del PGC; art. 10.3 LIS). Gastos 800.000 + 250.000 + 11.025 = 1.061.025; base 204.975 × 24 % =
  // 49.194.
  const b25 = borradorSociedades(facturasNO, gastosNO, 2025, opNO);
  assert.deepEqual([b25.gastos, b25.resultadoContable, b25.base, b25.cuota], [1061025, 204975, 204975, 49194]);
  // 2026: 600.000 + 200.000 + 3.000 + 157.000 (DUA) + 63.000 (Alemania) + 1.918,03 + 8.000 (intereses) + 2.310 de IVA no
  // deducible (4 × 525 del transporte al 95 % − 420 de la regularización + los 630 de la reparación de las viviendas) =
  // 1.035.228,03. Resultado 1.501.400,50 − 1.035.228,03 − 4.000 = 462.172,47 × 23 % = 106.299,67 (106.299,6681); menos los
  // 202 (5.400 + 8.854,92 + 8.854,92 = 23.109,84) → 83.189,83.
  const b = borradorSociedades(facturasNO, gastosNO, 2026, opNO);
  assert.deepEqual([b.gastos, b.resultadoContable, b.base, b.cuota, b.pagos, b.resultado], [1035228.03, 462172.47, 462172.47, 106299.67, 23109.84, 83189.83]);
});

test('IS: los intereses pagados a un socio (123) son gasto financiero en el borrador y en la contabilidad', () => {
  const F = [fac('2026-03-01', iberia, 100000, 21)];
  const G = [gas('2026-04-01', ...mercaderias, 'Mercaderías', 40000, 21, { categoria: '600' })];
  const capital = [
    { fecha: '2026-06-30', tipo: 'dividendos', perceptor: { nombre: 'Erik Larsen', nif: 'X1234567L' }, bruto: 10000 },
    { fecha: '2026-12-30', tipo: 'intereses', perceptor: { nombre: 'Erik Larsen', nif: 'X1234567L' }, bruto: 5000 },
  ].map((x, i) => ({ id: `k${i}`, ...limpiarPago(x) }));
  // 100.000 − 40.000 − 5.000 de intereses (el dividendo no es gasto) = 55.000; micro: 50.000 × 19 % + 5.000 × 21 % = 10.550.
  const b = borradorSociedades(F, G, 2026, { capital });
  assert.deepEqual([b.financieros, b.resultadoContable, b.base, b.cuota], [5000, 55000, 55000, 10550]);
  // La contabilidad lleva los intereses a la 662: su resultado antes de impuestos es el del borrador, y el asiento del
  // impuesto, la cuota del borrador.
  const A = generarAsientos({ facturas: F, gastos: G, capital, fiscal: { tipo: 'sociedad', iva: 'general' } }, '2027-03-01');
  const pyg = Math.round(A.filter((a) => a.fecha.startsWith('2026-') && a.origen?.tipo !== 'regularizacion').flatMap((a) => a.lineas).filter((l) => /^[67]/.test(l.cuenta) && l.cuenta !== '630').reduce((s, l) => s + l.haber - l.debe, 0) * 100) / 100;
  assert.equal(pyg, 55000);
  assert.equal(A.find((a) => a.concepto === 'Impuesto sobre Sociedades 2026').lineas.find((l) => l.cuenta === '630').debe, 10550);
});

test('IS: la venta de un bien de inversión no es cifra de negocios (art. 35.2 del Código de Comercio)', () => {
  // 2025: ventas 950.000 y la venta de una máquina usada, 60.000 (accesoria). La cifra de negocios es 950.000 < 1 M: en 2026
  // es microempresa (19/21 %), no de reducida dimensión.
  const F = [fac('2025-06-01', iberia, 950000, 21), fac('2025-09-01', talleres, 60000, 21, { accesoria: 'inversion' }), fac('2026-03-01', iberia, 100000, 21)];
  const b = borradorSociedades(F, [gas('2025-06-02', ...mercaderias, 'Mercaderías', 900000, 21)], 2026);
  assert.deepEqual([b.incn, b.tamano, b.tipos], [950000, 'micro', [19, 21]]);
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. ENTIDADES DE NUEVA CREACIÓN (art. 29.1 LIS): 15 % en el primer periodo con base imponible positiva y en el siguiente,
// salvo que les toque un tipo menor.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
test('Tipos del IS por año y tamaño (art. 29 y DT 44.ª LIS; Manual de Sociedades 2025, págs. 10-11)', () => {
  assert.deepEqual([tiposIS(2025, 'micro'), tiposIS(2026, 'micro'), tiposIS(2027, 'micro')], [[21, 22], [19, 21], [17, 20]]);
  assert.deepEqual([tiposIS(2025, 'reducida'), tiposIS(2026, 'reducida'), tiposIS(2027, 'reducida'), tiposIS(2026, 'general')], [[24, 24], [23, 23], [22, 22], [25, 25]]);
});

test('Brotes Digitales S.L. (constituida el 1-4-2025, con beneficio desde el primer año): 15 % en 2025 y 2026, micro en 2027', () => {
  const cliente = { nombre: 'Agencia Web S.L.', nif: 'B28777774' };
  const F = [fac('2025-06-10', cliente, 30000, 21), fac('2025-11-15', cliente, 25000, 21), fac('2026-03-01', cliente, 150000, 21), fac('2027-02-01', cliente, 80000, 21)];
  const G = [gas('2025-05-01', ...gestoria, 'Programación', 15000, 21), gas('2026-04-01', ...gestoria, 'Programación', 30000, 21), gas('2027-03-01', ...gestoria, 'Programación', 20000, 21)];
  const op = { constitucion: '2025-04-01' };
  // 2025: base 55.000 − 15.000 = 40.000 × 15 % = 6.000 (en vez de 40.000 × 21 % = 8.400 de la micro de 2025).
  const b25 = borradorSociedades(F, G, 2025, op);
  assert.deepEqual([b25.base, b25.tipos, b25.cuota, b25.nuevaCreacion], [40000, [15, 15], 6000, { aplica: true, primero: 2025 }]);
  // 2026, el siguiente: 120.000 × 15 % = 18.000 (la micro de 2026 serían 9.500 + 70.000 × 21 % = 24.200).
  const b26 = borradorSociedades(F, G, 2026, op);
  assert.deepEqual([b26.base, b26.tamano, b26.tipos, b26.cuota, b26.nuevaCreacion], [120000, 'micro', [15, 15], 18000, { aplica: true, primero: 2025 }]);
  // 2027: ya no; micro de 2027: 50.000 × 17 % + 10.000 × 20 % = 10.500.
  const b27 = borradorSociedades(F, G, 2027, op);
  assert.deepEqual([b27.base, b27.tipos, b27.cuota, b27.nuevaCreacion.aplica], [60000, [17, 20], 10500, false]);
  // 202 (art. 40.2): en 2026, 18 % de 6.000 = 1.080 en octubre y diciembre (en abril no hay IS vencido); en 2027, 1.080 en
  // abril y 18 % de 18.000 = 3.240 en octubre y diciembre.
  assert.deepEqual(modelo202({ 2025: 6000 }, 2026).map((p) => p.pago), [0, 1080, 1080]);
  assert.deepEqual(modelo202({ 2025: 6000, 2026: 18000 }, 2027).map((p) => p.pago), [1080, 3240, 3240]);
});

test('Nueva creación con pérdidas el primer año: el 15 % empieza con la primera base positiva (2026) y sigue en 2027', () => {
  const cliente = { nombre: 'Agencia Web S.L.', nif: 'B28777774' };
  const F = [fac('2025-10-01', cliente, 5000, 21), fac('2026-02-01', cliente, 70000, 21), fac('2027-02-01', cliente, 40000, 21), fac('2028-02-01', cliente, 40000, 21)];
  const G = [gas('2025-10-05', ...gestoria, 'Equipos', 9000, 21), gas('2026-03-01', ...gestoria, 'Programación', 16000, 21), gas('2027-03-01', ...gestoria, 'Programación', 10000, 21), gas('2028-03-01', ...gestoria, 'Programación', 10000, 21)];
  const op = { constitucion: '2025-09-01' };
  // 2025: −4.000. 2026: base previa 54.000 − 4.000 compensados = 50.000, primera positiva → 15 % = 7.500.
  const b26 = borradorSociedades(F, G, 2026, op);
  assert.deepEqual([b26.compensacion, b26.base, b26.tipos, b26.cuota, b26.nuevaCreacion], [4000, 50000, [15, 15], 7500, { aplica: true, primero: 2026 }]);
  // 2027: la siguiente → 30.000 × 15 % = 4.500. 2028: micro (17 % hasta 50.000) → 5.100.
  assert.deepEqual([borradorSociedades(F, G, 2027, op).cuota, borradorSociedades(F, G, 2028, op).cuota], [4500, 5100]);
});
