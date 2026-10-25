// Borradores exactos del Impuesto sobre Sociedades (200), del 202 y de la renta (100), revisión fiscal del 25-10-2026.
// Fuentes: Manual práctico de Sociedades 2025 y Manual práctico de Renta 2025 (parte 1) de la AEAT. Los esperados están
// calculados a mano en cada comentario.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CCAA, borradorRenta, borradorSociedades, cuotaEscala, deduccionMaternidad, minimosRenta, modelo202, modelo202Art403, tiposIS } from '../lib/modelos.js';
import { noDeducibleIS } from '../lib/categorias.js';
import { limpiarRenta } from '../lib/empresa.js';

const fac = (fecha, base, extra = {}) => ({ id: `f${fecha}${base}`, fecha, numero: 1, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente: { nombre: 'Cliente', nif: '12345678Z' }, base, ivaPct: 21, irpfPct: 0, ...extra });
const gas = (fecha, base, extra = {}) => ({ id: `g${fecha}${base}${extra.concepto || ''}`, fecha, concepto: 'Compras', proveedor: 'Proveedor', base, ivaPct: 21, ...extra });

// ── Sociedades: bases imponibles negativas (art. 26 LIS) ──

test('IS: 2025 con −30.000 € y 2026 con base previa 50.000 € de micro → base 20.000 €, cuota 3.800 €', () => {
  const F = [fac('2025-06-01', 10000), fac('2026-06-01', 60000)];
  const G = [gas('2025-06-02', 40000), gas('2026-06-02', 10000)];
  assert.equal(borradorSociedades(F, G, 2025).perdida, 30000);
  const b = borradorSociedades(F, G, 2026);
  assert.equal(b.tamano, 'micro');
  assert.deepEqual([b.basePrevia, b.compensacion, b.base, b.cuota], [50000, 30000, 20000, 3800]); // 20.000 × 19 %
  assert.deepEqual(b.binsPendientes, [{ de: 2025, importe: 30000 }]);
  assert.deepEqual(b.binsQuedan, []);
});

test('IS: límite del 70 % de la base previa, con 1 millón en todo caso', () => {
  // 2025: −1.800.000; 2026: base previa 2.000.000 → límite máx(1.000.000, 1.400.000) = 1.400.000; quedan 400.000.
  const F = [fac('2025-06-01', 200000), fac('2026-06-01', 2500000)];
  const G = [gas('2025-06-02', 2000000), gas('2026-06-02', 500000)];
  const b = borradorSociedades(F, G, 2026);
  assert.deepEqual([b.limiteBIN, b.compensacion, b.base], [1400000, 1400000, 600000]);
  assert.deepEqual(b.binsQuedan, [{ de: 2025, importe: 400000 }]);
  assert.equal(b.cuota, 9500 + 115500); // micro: 50.000 × 19 % + 550.000 × 21 %
  // Base previa 1.200.000 y 1.100.000 pendientes: el 70 % (840.000) es menos de 1 millón → se compensa 1.000.000.
  const b2 = borradorSociedades([fac('2025-06-01', 100000), fac('2026-06-01', 1200000)], [gas('2025-06-02', 1200000)], 2026);
  assert.deepEqual([b2.compensacion, b2.base], [1000000, 200000]);
});

test('IS: con 20 M o más de cifra de negocios el límite es el 50 %', () => {
  // 2025: 25 M de ventas y −5 M; 2026: base previa 4 M → límite máx(1 M, 2 M) = 2 M; base 2 M al 25 %.
  const b = borradorSociedades([fac('2025-06-01', 25e6), fac('2026-06-01', 10e6)], [gas('2025-06-02', 30e6), gas('2026-06-02', 6e6)], 2026);
  assert.deepEqual([b.tamano, b.limiteBIN, b.compensacion, b.base, b.cuota], ['general', 2e6, 2e6, 2e6, 500000]);
});

test('IS: entidad de nueva creación, sin el límite del 70 % en sus tres primeros años con base positiva (art. 26.3)', () => {
  const F = [fac('2025-06-01', 200000), fac('2026-06-01', 2500000)];
  const G = [gas('2025-06-02', 2000000), gas('2026-06-02', 500000)];
  const b = borradorSociedades(F, G, 2026, { constitucion: '2025-01-10' });
  assert.equal(b.sinLimiteBIN, true);
  assert.deepEqual([b.compensacion, b.base], [1800000, 200000]);
  // Primer año con base positiva: 15 % (art. 29.1) → 200.000 × 15 %.
  assert.equal(b.cuota, 30000);
});

test('IS: las pendientes de antes de Fisquo se apuntan por año y se aplican de la más antigua a la más reciente', () => {
  const F = [fac('2026-03-01', 12000)];
  const b = borradorSociedades(F, [], 2026, { binsPrevias: { 2022: 10000, 2023: 5000 } });
  assert.deepEqual([b.compensacion, b.base, b.cuota], [12000, 0, 0]);
  assert.deepEqual(b.binsQuedan, [{ de: 2023, importe: 3000 }]);
  // Lo apuntado manda sobre lo que sale de la app (un año que no está entero en Fisquo): a cero, nada que compensar.
  const conPerdida = [fac('2025-06-01', 1000), ...F];
  assert.equal(borradorSociedades(conPerdida, [gas('2025-06-02', 5000)], 2026).compensacion, 4000);
  assert.equal(borradorSociedades(conPerdida, [gas('2025-06-02', 5000)], 2026, { binsPrevias: { 2025: 0 } }).compensacion, 0);
  // En territorio foral no se compensan (cada Hacienda foral tiene sus reglas).
  assert.equal(borradorSociedades(F, [], 2026, { binsPrevias: { 2022: 10000 }, territorio: 'bizkaia' }).compensacion, 0);
});

// ── Gastos no deducibles (art. 15 LIS) ──

test('IS: el propio impuesto, multas, recargos y donativos no se restan; la gestoría que presenta el impuesto sí', () => {
  const sin = { ivaPct: 0 };
  assert.ok(noDeducibleIS({ concepto: 'Impuesto sobre Sociedades 2025', ...sin }));
  assert.ok(noDeducibleIS({ concepto: 'Modelo 202 1P', ...sin }));
  assert.ok(noDeducibleIS({ concepto: 'Multa de tráfico', ...sin }));
  assert.ok(noDeducibleIS({ concepto: 'Sanción AEAT', ...sin }));
  assert.ok(noDeducibleIS({ concepto: 'Recargo de apremio IAE', ...sin }));
  assert.ok(noDeducibleIS({ concepto: 'Donativo Cruz Roja', ...sin }));
  // Con IVA (la gestoría), sin palabra de la lista o desmarcado a mano: deducible.
  assert.equal(noDeducibleIS({ concepto: 'Gestoría: presentación del Impuesto de Sociedades', ivaPct: 21 }), null);
  assert.equal(noDeducibleIS({ concepto: 'Recargo de equivalencia', ...sin }), null);
  assert.equal(noDeducibleIS({ concepto: 'Multiservicios López', ...sin }), null);
  assert.equal(noDeducibleIS({ concepto: 'Multa', noDeducibleIS: false, ...sin }), null);
  assert.deepEqual(noDeducibleIS({ concepto: 'Regalo a un cliente', ivaPct: 21, noDeducibleIS: true }), { motivo: 'marcado como no deducible', marcado: true });

  const G = [
    gas('2026-02-01', 600, { concepto: 'Multa de tráfico', ivaPct: 0 }), gas('2026-07-10', 2000, { concepto: 'Impuesto sobre Sociedades 2025', ivaPct: 0 }),
    gas('2026-03-01', 300, { concepto: 'Gestoría: presentación del Impuesto de Sociedades' }), gas('2026-04-01', 100, { concepto: 'Donativo Cruz Roja', ivaPct: 0 }),
    gas('2026-05-01', 50, { concepto: 'Recargo de apremio IAE', ivaPct: 0 }), gas('2026-06-01', 200, { concepto: 'Regalo a un cliente', noDeducibleIS: true }),
    gas('2026-06-02', 100, { concepto: 'Multa (recurrida y anulada)', ivaPct: 0, noDeducibleIS: false }),
  ];
  const b = borradorSociedades([fac('2026-01-15', 10000)], G, 2026);
  // Resultado 10.000 − 3.350 = 6.650; ajuste 600 + 2.000 + 100 + 50 + 200 = 2.950; base 9.600 × 19 % = 1.824.
  assert.deepEqual([b.resultadoContable, b.ajusteNoDeducible, b.basePrevia, b.base, b.cuota], [6650, 2950, 9600, 9600, 1824]);
  assert.equal(b.noDeducibles.length, 5);
});

// ── Cifra de negocios elevada al año (art. 101 LIS) ──

test('IS: la cifra de negocios del año de constitución se eleva al año para la reducida dimensión, no para la micro', () => {
  // Constituida el 1-7-2025: 184 días; 6.000.000 / 184 × 365 = 11.902.173,91 → ya no es de reducida dimensión.
  const F = [fac('2025-09-01', 6e6), fac('2026-03-01', 1e6)];
  const G = [gas('2025-09-02', 6e6)];
  const b = borradorSociedades(F, G, 2026, { constitucion: '2025-07-01' });
  assert.deepEqual([b.incn, b.incnAnual, b.tamano], [6e6, 11902173.91, 'general']);
  assert.equal(borradorSociedades(F, G, 2026).tamano, 'reducida');
  // Micro: 500.000 en 92 días (1.983.695,65 elevado) sigue siendo micro: la ley no la eleva.
  assert.equal(borradorSociedades([fac('2025-11-01', 5e5), fac('2026-03-01', 1e5)], [gas('2025-11-02', 5e5)], 2026, { constitucion: '2025-10-01' }).tamano, 'micro');
});

// ── Reserva de capitalización (art. 25 LIS) ──

test('IS: reserva de capitalización del 20 % del incremento de los fondos propios, hasta el 25 % de la base (micro) o el 20 %', () => {
  const F = [fac('2025-06-01', 100000), fac('2026-06-01', 100000)];
  const G = [gas('2025-06-02', 100000)];
  // 20 % de 30.000 = 6.000 (límite 25 % de 100.000 = 25.000): base 94.000 → 9.500 + 44.000 × 21 % = 18.740.
  const b = borradorSociedades(F, G, 2026, { fondosPropios: { 2026: 30000 } });
  assert.deepEqual([b.reserva.aplicada, b.base, b.cuota], [6000, 94000, 18740]);
  // 20 % de 200.000 = 40.000, límite 25.000: quedan 15.000 sin aplicar.
  const r = borradorSociedades(F, G, 2026, { fondosPropios: { 2026: 200000 } }).reserva;
  assert.deepEqual([r.derecho, r.aplicada, r.pendiente], [40000, 25000, 15000]);
  // Con 1 M o más de cifra de negocios, el límite es el 20 %: 20.000.
  assert.equal(borradorSociedades([fac('2025-06-01', 2e6), fac('2026-06-01', 100000)], [gas('2025-06-02', 2e6)], 2026, { fondosPropios: { 2026: 200000 } }).reserva.aplicada, 20000);
  // Primero la reserva y luego las bases negativas, sin bajar de cero: 100.000 − 6.000 − 94.000.
  const conBins = borradorSociedades(F, G, 2026, { fondosPropios: { 2026: 30000 }, binsPrevias: { 2024: 120000 } });
  assert.deepEqual([conBins.compensacion, conBins.base], [94000, 0]);
  assert.deepEqual(conBins.binsQuedan, [{ de: 2024, importe: 26000 }]);
});

test('IS: tipo de la microempresa: 25 % hasta 2022 y 23 % en 2023 y 2024', () => {
  assert.deepEqual([tiposIS(2022, 'micro'), tiposIS(2023, 'micro'), tiposIS(2024, 'micro')], [[25, 25], [23, 23], [23, 23]]);
});

// ── 202 ──

test('202 (art. 40.2): la base es la cuota del ejercicio menos retenciones, la que propone el borrador del año anterior', () => {
  // 2025: base 20.000 × 21 % (micro) = 4.200, retenciones 3.000 → 1.200; 18 % = 216.
  const b = borradorSociedades([fac('2025-06-01', 20000, { irpfPct: 15 })], [], 2025);
  assert.deepEqual([b.cuota, b.retenciones, b.cuotaEjercicio], [4200, 3000, 1200]);
  assert.equal(modelo202({ 2025: b.cuotaEjercicio }, 2026)[1].pago, 216);
});

test('202 (art. 40.3): con más de 6 M, 5/7 del tipo redondeado por defecto sobre la base de los 3, 9 y 11 meses', () => {
  // 2025: 8 M de cifra de negocios (reducida dimensión, 23 % en 2026 → 5/7 × 23 = 16,43 → 16 %).
  const F = [fac('2025-06-01', 8e6), fac('2026-02-01', 1e6), fac('2026-06-01', 1e6), fac('2026-11-15', 5e5)];
  const G = [gas('2025-06-02', 8e6), gas('2026-02-02', 4e5), gas('2026-06-02', 6e5)];
  assert.equal(borradorSociedades(F, G, 2026).obligado403, true);
  const p = modelo202Art403(F, G, 2026);
  // 1P: 600.000 × 16 % = 96.000; 2P: 1.000.000 × 16 % − 96.000 = 64.000; 3P: 1.500.000 × 16 % − 160.000 = 80.000.
  assert.deepEqual(p.map((x) => [x.base, x.tramos[0].pct, x.pago]), [[6e5, 16, 96000], [1e6, 16, 64000], [1.5e6, 16, 80000]]);
  // Con el 1P marcado como pagado por 90.000, el 2P resta lo pagado: 160.000 − 90.000.
  assert.equal(modelo202Art403(F, G, 2026, { pagos202: { 2026: { 1: 90000 } } })[1].pago, 70000);
  assert.equal(borradorSociedades([fac('2025-06-01', 6e6)], [], 2026).obligado403, false); // 6 M justos: no lo supera
});

test('202 (art. 40.3): con 10 M o más, 19/20 del tipo redondeado por exceso y mínimo del 23 % del resultado contable', () => {
  // 2025: 12 M de ventas y −80.000; 2026 1P: resultado 100.000, compensa 80.000 → base 20.000 × 24 % (19/20 × 25 = 23,75)
  // = 4.800; mínimo 23 % de 100.000 = 23.000.
  const F = [fac('2025-06-01', 12e6), fac('2026-02-01', 1e6)];
  const G = [gas('2025-06-02', 12.08e6), gas('2026-02-02', 9e5)];
  const [p1] = modelo202Art403(F, G, 2026);
  assert.deepEqual([p1.compensacion, p1.base, p1.tramos[0].pct, p1.previo, p1.minimo, p1.pago], [80000, 20000, 24, 4800, 23000, 23000]);
});

// ── Renta: escala estatal y autonómica ──

test('renta: escalas autonómicas de 2025 con la cuota de cada tramo del manual (cap. 15)', () => {
  const manual = {
    andalucia: [60000, 8910], aragon: [130000, 25993.29], asturias: [175000, 37127.62], baleares: [175000, 35077.5], canarias: [123745, 24213.1],
    cantabria: [90000, 15258], 'castilla-la-mancha': [60000, 8950.75], 'castilla-y-leon': [53407.2, 7518.83], cataluna: [175000, 36415],
    extremadura: [120200, 23996], galicia: [60000, 8779.16], madrid: [57320.4, 7651.1], murcia: [60000, 8540.15], 'la-rioja': [120000, 23141.9],
    valencia: [200000, 47700], ceuta: [60000, 8950.75], melilla: [60000, 8950.75],
  };
  assert.equal(Object.keys(CCAA).length, 17);
  for (const [id, [base, cuota]] of Object.entries(manual)) assert.equal(cuotaEscala(base, CCAA[id].escala), cuota, id);
});

test('renta: cuota estatal + autonómica de la comunidad, con sus mínimos; Ceuta y Melilla con la deducción del 60 %', () => {
  // 40.000 € de ingresos: difícil justificación 2.000 (tope) → rendimiento 38.000. Estatal: 4.880,75 − 527,25 = 4.353,50.
  const F = [fac('2026-03-01', 40000)];
  const sin = borradorRenta(F, [], 2026, {});
  assert.deepEqual([sin.rendimiento, sin.cuotaEstatal, sin.cuotaAutonomica, sin.cuota, sin.aproximada], [38000, 4353.5, 4353.5, 8707, true]);
  assert.equal(sin.cuota, Math.round((cuotaEscala(38000) - cuotaEscala(5550)) * 100) / 100); // como antes, sin comunidad
  // Madrid: 4.289,35 − 506,32 (mínimo de 5.956,65 € al 8,5 %) = 3.783,03.
  const mad = borradorRenta(F, [], 2026, {}, { personal: { ccaa: 'madrid' } });
  assert.deepEqual([mad.minimosAutonomicos.total, mad.cuotaAutonomica, mad.cuota, mad.aproximada], [5956.65, 3783.03, 8136.53, false]);
  // Cataluña: 4.135 + 5.000 × 19 % = 5.085 − 527,25 = 4.557,75.
  assert.equal(borradorRenta(F, [], 2026, {}, { personal: { ccaa: 'cataluna' } }).cuota, 4353.5 + 4557.75);
  // Ceuta: la escala del art. 65 (4.353,50) y el 60 % de 8.707 = 5.224,20 de deducción.
  const ceuta = borradorRenta(F, [], 2026, {}, { personal: { ccaa: 'ceuta' } });
  assert.deepEqual([ceuta.cuota, ceuta.deduccionCeuta, ceuta.resultado], [8707, 5224.2, 3482.8]);
});

test('renta: mínimos autonómicos por edad, hijos y ascendientes (Valencia)', () => {
  const m = minimosRenta(2026, { nacimiento: 1950, hijos: [2025], compartidos: false, ascendientes: [1945] }, CCAA.valencia.minimos);
  // 6.105 + 1.265 + 1.540; hijo: 2.640 + 3.080 (menor de 3); ascendiente: 1.265 + 1.540.
  assert.deepEqual([m.personal, m.descendientes, m.ascendientes], [8910, 5720, 2805]);
});

// ── Renta: inicio de actividad (art. 32.3) ──

test('renta: el 20 % por inicio de actividad es del primer año con rendimiento positivo desde el inicio y del siguiente', () => {
  const G = [gas('2023-05-01', 3000), gas('2024-05-01', 2000)];
  const F = [fac('2025-03-01', 20000), fac('2026-03-01', 30000)];
  // 2023 y 2024 con pérdidas: 2025 es el primero con beneficio y 2026 el siguiente → 20 % de 28.500 = 5.700.
  assert.equal(borradorRenta(F, G, 2026, {}, { personal: { inicio: 2023 } }).reduccionInicio, 5700);
  // Con beneficio en 2024, ya se aplicó en 2024 y 2025.
  const conBeneficio = borradorRenta([fac('2024-06-01', 9000), ...F], G, 2026, {}, { personal: { inicio: 2023 } });
  assert.deepEqual([conBeneficio.reduccionInicio, conBeneficio.inicioActividad.primero], [0, 2024]);
  // Sin datos de 2023 ni rendimiento apuntado no se sabe; con el rendimiento del 130 (−500), sí.
  assert.deepEqual(borradorRenta(F, [G[1]], 2026, {}, { personal: { inicio: 2023 } }).inicioActividad, { aplica: false, falta: 2023 });
  assert.equal(borradorRenta(F, [G[1]], 2026, {}, { personal: { inicio: 2023 }, rendimientos: { 2023: -500 } }).reduccionInicio, 5700);
});

// ── Renta: deducción por maternidad (art. 81) ──

test('renta: maternidad, 100 € por mes con un hijo menor de 3 años y la guardería hasta 1.000 €', () => {
  const p = { madre: true, hijos: [2025], hijosMes: [5] };
  // Nacido en mayo de 2025: 8 meses en 2025, 12 en 2026 y 2027, 4 en 2028 (de enero a abril).
  assert.deepEqual([2025, 2026, 2027, 2028, 2029].map((y) => deduccionMaternidad(y, p).maternidad), [800, 1200, 1200, 400, 0]);
  assert.deepEqual(deduccionMaternidad(2026, { ...p, guarderia: 1500 }), { importe: 2200, maternidad: 1200, guarderia: 1000, sinMes: 0 });
  // Sin el mes, el año de nacimiento no se cuenta; sin ser la madre, nada.
  assert.deepEqual(deduccionMaternidad(2025, { madre: true, hijos: [2025] }), { importe: 0, maternidad: 0, guarderia: 0, sinMes: 1 });
  assert.equal(deduccionMaternidad(2026, { hijos: [2025] }).importe, 0);
  // Dos hijos: 2024 (12 meses) y marzo de 2026 (10 meses); guardería 600 €, menos que el tope.
  assert.deepEqual(deduccionMaternidad(2026, { madre: true, hijos: [2024, 2026], hijosMes: [0, 3], guarderia: 600 }), { importe: 2800, maternidad: 2200, guarderia: 600, sinMes: 0 });
  // Resta del resultado aunque salga a devolver: rendimiento bajo, cuota 0.
  assert.equal(borradorRenta([fac('2026-03-01', 6000)], [], 2026, {}, { personal: p }).resultado, -1200);
});

test('ajustes: la comunidad, el mes de nacimiento de los hijos, la madre y la guardería se guardan limpios', () => {
  assert.deepEqual(limpiarRenta({ hijos: '2015, 05/2024', ccaa: 'madrid', madre: true, guarderia: '1.200,50' }),
    { hijos: [2015, 2024], hijosMes: [0, 5], compartidos: true, ccaa: 'madrid', madre: true, guarderia: 1200.5 });
  assert.deepEqual(limpiarRenta({ hijos: [2015, 2024], hijosMes: [0, 5], ccaa: 'navarra' }), { hijos: [2015, 2024], hijosMes: [0, 5], compartidos: true });
  assert.equal(limpiarRenta({ madre: true }), null); // sin hijos no hay deducción
});
