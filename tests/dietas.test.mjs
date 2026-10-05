import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularDieta, conceptoDieta, KM, MANUTENCION } from '../lib/dietas.js';

test('importes vigentes', () => {
  assert.equal(KM, 0.26);
  assert.deepEqual(MANUTENCION, { espana: { sin: 26.67, con: 53.34 }, extranjero: { sin: 48.08, con: 91.35 } });
});

test('kilometraje de un trabajador: exento a 0,26 €/km y el exceso aparte', () => {
  const a = calcularDieta({ tipo: 'km', quien: 'empleado', km: '120' });
  assert.deepEqual([a.exento, a.pagado, a.exceso, a.base, a.ivaPct], [31.2, 31.2, 0, 31.2, 0]);
  const b = calcularDieta({ tipo: 'km', quien: 'empleado', km: '100', pagado: '30' });
  assert.deepEqual([b.exento, b.exceso, b.base], [26, 4, 30]);
  assert.equal(conceptoDieta(b), 'Kilometraje: 100 km');
  assert.ok(calcularDieta({ tipo: 'km', quien: 'titular', km: '10' }).error);
  assert.ok(calcularDieta({ tipo: 'km', quien: 'empleado', km: '' }).error);
});

test('dietas de un trabajador: límite por día, con o sin noche, España o extranjero', () => {
  const a = calcularDieta({ tipo: 'manutencion', quien: 'empleado', dias: 3, pernocta: true });
  assert.deepEqual([a.limiteDia, a.exento, a.base, a.exceso], [53.34, 160.02, 160.02, 0]);
  const b = calcularDieta({ tipo: 'manutencion', quien: 'empleado', dias: 2, extranjero: true, pagado: '120' });
  assert.deepEqual([b.limiteDia, b.exento, b.exceso, b.base], [48.08, 96.16, 23.84, 120]);
  assert.equal(conceptoDieta(a), 'Dietas: 3 días con noche');
});

test('comidas del autónomo: hasta el límite, con su IVA, y solo con pago electrónico', () => {
  const a = calcularDieta({ tipo: 'manutencion', quien: 'titular', dias: 1, pagado: '40', ivaPct: 10, electronico: true });
  assert.deepEqual([a.deducible, a.exceso, a.base, a.ivaPct], [26.67, 13.33, 24.25, 10]);
  const b = calcularDieta({ tipo: 'manutencion', quien: 'titular', dias: 1, pagado: '22', ivaPct: 10, electronico: true });
  assert.deepEqual([b.deducible, b.base], [22, 20]);
  assert.ok(calcularDieta({ tipo: 'manutencion', quien: 'titular', dias: 1, pagado: '22', electronico: false }).error);
  assert.equal(conceptoDieta(calcularDieta({ tipo: 'manutencion', quien: 'titular', dias: 2, pernocta: true, extranjero: true, pagado: '300', electronico: true })), 'Comidas: 2 días con noche en el extranjero');
});
