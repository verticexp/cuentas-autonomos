import test from 'node:test';
import assert from 'node:assert/strict';
import { diasPrueba, fiscalDeTipo, nuevoPlan, planDe } from '../lib/prueba.js';

const HOY = new Date('2026-03-15T00:00:00.000Z');

test('crea un plan válido y fija el último día: hoy es el día 1 de 30', () => {
  assert.deepEqual(nuevoPlan('aut', 'Esencial', HOY), {
    tipo: 'aut', nombre: 'Esencial', hasta: '2026-04-13',
  });
  assert.deepEqual(nuevoPlan('pym', 'Pro', HOY), {
    tipo: 'pym', nombre: 'Pro', hasta: '2026-04-13',
  });
});

test('rechaza tipos y planes inexistentes', () => {
  assert.equal(nuevoPlan('xyz', 'Esencial', HOY), null);
  assert.equal(nuevoPlan('aut', 'Inexistente', HOY), null);
});

test('calcula los días de prueba hasta el fin, incluido', () => {
  const plan = { tipo: 'aut', nombre: 'Esencial', hasta: '2026-04-13' };
  assert.equal(diasPrueba(plan, HOY), 30);
  // Recién creado, a cualquier hora del día, quedan 30.
  assert.equal(diasPrueba(nuevoPlan('aut', 'Pro', new Date('2026-03-15T21:30:00Z')), new Date('2026-03-15T21:30:00Z')), 30);
  assert.equal(diasPrueba(plan, new Date('2026-04-13T12:00:00.000Z')), 1);
  assert.equal(diasPrueba(plan, new Date('2026-04-14T00:00:00.000Z')), 0);
});

test('devuelve null si no hay prueba vigente o la fecha no es válida', () => {
  assert.equal(diasPrueba(null, HOY), null);
  assert.equal(diasPrueba({}, HOY), null);
  assert.equal(diasPrueba({ hasta: 'fecha-inválida' }, HOY), null);
  assert.equal(diasPrueba({ hasta: '2026-04-13', pagado: true }, HOY), null);
});

test('busca planes existentes y devuelve null para los que faltan', () => {
  assert.equal(planDe('aut', 'Esencial').n, 'Esencial');
  assert.equal(planDe('inexistente', 'Esencial'), null);
  assert.equal(planDe('aut', 'Inexistente'), null);
});

test('asigna el tipo fiscal según el tipo de cuenta', () => {
  assert.equal(fiscalDeTipo('aut'), 'autonomo');
  assert.equal(fiscalDeTipo('pym'), 'sociedad');
  assert.equal(fiscalDeTipo('gra'), 'sociedad');
});
