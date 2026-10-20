import test from 'node:test';
import assert from 'node:assert/strict';
import { sumarMeses, requisitosIncobrable } from '../lib/incobrables.js';

const original = { fechaOriginal: '2026-01-15', base: 100 };

test('incobrable dentro de plazo y en ambos extremos', () => {
  for (const fechaRectificativa of ['2026-07-15', '2026-10-20', '2027-01-15']) {
    const r = requisitosIncobrable({ ...original, fechaRectificativa });
    assert.deepEqual(r.errores, []);
    assert.deepEqual(r.avisos, []);
    assert.equal(r.desde, '2026-07-15');
    assert.equal(r.hasta, '2027-01-15');
    assert.deepEqual(r.requisitos, [
      'Haber reclamado el cobro al cliente por vía judicial o con requerimiento notarial (o por otro medio fehaciente cuando la ley lo admite).',
      'Que el impago conste en los libros registro.',
      'Enviar la rectificativa al cliente.',
      'Comunicarlo a Hacienda con el modelo 952 en un mes, con copia de la rectificativa y de la reclamación.',
    ]);
  }
});

test('incobrable antes de tiempo o fuera de plazo', () => {
  assert.deepEqual(requisitosIncobrable({ ...original, fechaRectificativa: '2026-07-14' }).errores, [
    'Aún no es un crédito incobrable: hasta el 15/07/2026 no pasan seis meses desde la factura (art. 80.Cuatro de la Ley del IVA).',
  ]);
  assert.deepEqual(requisitosIncobrable({ ...original, fechaRectificativa: '2027-01-16' }).errores, [
    'Fuera de plazo: la rectificativa por impago se emite entre el 15/07/2026 y el 15/01/2027 (los seis meses siguientes, art. 80.Cuatro).',
  ]);
});

test('gran empresa espera un año', () => {
  const r = requisitosIncobrable({ ...original, fechaRectificativa: '2027-01-14', grande: true });
  assert.equal(r.desde, '2027-01-15');
  assert.equal(r.hasta, '2027-07-15');
  assert.deepEqual(r.errores, ['Aún no es un crédito incobrable: hasta el 15/01/2027 no pasan un año desde la factura (art. 80.Cuatro de la Ley del IVA).']);
  assert.deepEqual(requisitosIncobrable({ ...original, fechaRectificativa: '2027-01-15', grande: true }).errores, []);
});

test('sumar meses ajusta el fin de mes y los años bisiestos', () => {
  assert.equal(sumarMeses('2026-08-31', 6), '2027-02-28');
  assert.equal(sumarMeses('2023-08-31', 6), '2024-02-29');
  assert.equal(sumarMeses('2024-02-29', 12), '2025-02-28');
  const r = requisitosIncobrable({ fechaOriginal: '2026-08-31', fechaRectificativa: '2027-02-28', base: 100 });
  assert.equal(r.desde, '2027-02-28');
  assert.equal(r.hasta, '2027-08-28');
  assert.deepEqual(r.errores, []);
});

test('aviso para particulares y límite de comunicación del modelo 952', () => {
  for (const base of [0, 49.99, 50]) {
    assert.deepEqual(requisitosIncobrable({ ...original, base, fechaRectificativa: '2026-08-31' }).avisos, [
      'Si el cliente es un particular, solo se puede si la base de la factura pasa de 50 €.',
    ]);
  }
  const r = requisitosIncobrable({ ...original, base: 50.01, fechaRectificativa: '2026-08-31' });
  assert.deepEqual(r.avisos, []);
  assert.equal(r.limite952, '2026-09-30');
  assert.equal(requisitosIncobrable({ ...original, fechaRectificativa: '2027-01-15' }).limite952, '2027-02-15');
});
