// 130: revisión fiscal del 25-10-2026 (instrucciones del 130 de la AEAT; arts. 28, 30.2.4.ª, 109 y 110 RIRPF).
// Esperados calculados a mano.
import test from 'node:test';
import assert from 'node:assert/strict';
import { minoracion130, opciones130, resumenAnual } from '../lib/calculos.js';
import { fichero130 } from '../lib/ficheroAeat.js';
import { avisosFiscales } from '../lib/revisionFiscal.js';

const fac = (id, fecha, base, actividad = 'a', x = {}) => ({ id, fecha, actividad, cliente: { nombre: 'C', nif: 'B12345674' }, base, ivaPct: 21, irpfPct: 0, ...x });
const gas = (id, fecha, base, actividad = 'a') => ({ id, fecha, actividad, concepto: id, proveedor: 'P', base, ivaPct: 21 });

test('difícil justificación por actividad: una con pérdidas no le quita el 5 % a la otra (art. 30.2.4.ª RIRPF)', () => {
  // DJ +30.000 y Vértice −10.000: 5 % de 30.000 = 1.500 (no el 5 % de 20.000).
  const F = [fac('dj', '2026-02-01', 40000, 'dj'), fac('v', '2026-02-02', 5000, 'v')];
  const G = [gas('gdj', '2026-02-10', 10000, 'dj'), gas('gv', '2026-02-11', 15000, 'v')];
  const q = resumenAnual(F, G, 2026, {}, ['dj', 'v']).trimestres[0];
  assert.equal(q.difJust, 1500);
  assert.equal(q.rendAcum, 18500);
  assert.equal(q.c07, 3700);
});

test('estimación directa normal: sin el 5 % de difícil justificación', () => {
  const F = [fac('f', '2026-02-01', 40000)], G = [gas('g', '2026-02-10', 10000)];
  assert.equal(resumenAnual(F, G, 2026, {}, ['a']).trimestres[0].rendAcum, 28500);
  const q = resumenAnual(F, G, 2026, {}, ['a'], opciones130({ irpf: 'normal' }, {}, 2026)).trimestres[0];
  assert.deepEqual([q.difJust, q.rendAcum, q.c07], [0, 30000, 6000]);
});

test('casilla 13: el año de inicio de la actividad, el rendimiento anterior es cero y se restan 100 €', () => {
  assert.equal(minoracion130(undefined, { inicio: 2026, anio: 2026 }), 100);
  assert.equal(minoracion130(undefined, { inicio: 2025, anio: 2026 }), 0);
  assert.equal(minoracion130(20000, { inicio: 2025, anio: 2026 }), 0);
  assert.equal(opciones130({ renta: { inicio: 2026 } }, {}, 2026).minoracion, 100);
  assert.equal(opciones130({ renta: { inicio: 2026 } }, {}, 2026, false).minoracion, 0);
  // 1T con casilla 12 de 500 €: 400 € a ingresar.
  const F = [fac('f', '2026-02-01', 3500)], G = [gas('g', '2026-02-10', 868.42)];
  const q = resumenAnual(F, G, 2026, {}, ['a'], opciones130({ renta: { inicio: 2026 } }, {}, 2026)).trimestres[0];
  assert.equal(q.c12, 500);
  assert.equal(q.m130, 400);
});

test('actividades agrícolas (apartado II): el 2 % de los ingresos del trimestre menos sus retenciones', () => {
  // 1T: ingresos 30.000, gastos 25.000: 2 % × 30.000 = 600 (no el 20 % de 5.000 = 1.000).
  const F = [fac('f', '2026-02-01', 30000, 'a', { ivaPct: 0, irpfPct: 2, base: 30000 })];
  const G = [gas('g', '2026-02-10', 25000)];
  const op = opciones130({ iva: 'reagp' }, {}, 2026);
  assert.equal(op.agricola, true);
  const q = resumenAnual([{ ...F[0], irpfPct: 0 }], G, 2026, {}, ['a'], op).trimestres[0];
  assert.deepEqual([q.c07, q.c08, q.c09, q.c10, q.c11, q.c12, q.m130], [0, 30000, 600, 0, 600, 600, 600]);
  // Con un 2 % de retención (600 € sobre 30.000): 600 − 600 = 0.
  const r = resumenAnual(F, G, 2026, {}, ['a'], op).trimestres[0];
  assert.deepEqual([r.c10, r.c11, r.m130], [600, 0, 0]);
  // 2T sin ingresos: no se acumula (cada trimestre por su cuenta).
  assert.equal(resumenAnual([{ ...F[0], irpfPct: 0 }], G, 2026, {}, ['a'], op).trimestres[1].m130, 0);
  const linea = fichero130({ nif: '12345678Z', nombre: 'Ana Pérez' }, 2026, q).contenido;
  assert.ok(linea.includes('<T13001000>'));
  assert.equal(fichero130({ nif: '12345678Z', nombre: 'Ana Pérez' }, 2026, q).resultado, 600);
});

test('exoneración del 130: aviso según el 70 % facturado con retención el año anterior (art. 109 RIRPF)', () => {
  const F = [fac('a', '2025-03-01', 8000, 'a', { irpfPct: 15 }), fac('b', '2025-04-01', 2000)];
  const ids = (l) => l.map((x) => x.id);
  assert.ok(ids(avisosFiscales({ facturas: F, anio: 2026, hoy: '2026-03-01', c303: false, retenidas: false })).includes('exonerado-130'));
  assert.ok(!ids(avisosFiscales({ facturas: F, anio: 2026, hoy: '2026-03-01', c303: false, retenidas: true })).includes('no-exonerado-130'));
  const pocas = [fac('a', '2025-03-01', 6000, 'a', { irpfPct: 15 }), fac('b', '2025-04-01', 4000)];
  assert.ok(ids(avisosFiscales({ facturas: pocas, anio: 2026, hoy: '2026-03-01', c303: false, retenidas: true })).includes('no-exonerado-130'));
  assert.equal(avisosFiscales({ facturas: F, anio: 2026, hoy: '2026-03-01', c303: false }).some((a) => a.id.includes('exonerado')), false);
});
