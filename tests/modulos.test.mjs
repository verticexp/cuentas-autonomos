import test from 'node:test';
import assert from 'node:assert/strict';
import { planesQueFaltan, PARA_AUTONOMO, soloSociedad, vistasContabilidad } from '../lib/modulos.js';
import { nuevoPlan } from '../lib/prueba.js';

const pagado = (tipo, nombre) => ({ ...nuevoPlan(tipo, nombre), pagado: true });
const AUT = { tipo: 'autonomo' }, SOC = { tipo: 'sociedad' };

test('el autónomo solo ve libros registro, amortizaciones y resultados en contabilidad', () => {
  assert.deepEqual(vistasContabilidad(AUT).map(([v]) => v), ['libros', 'bienes', 'pyg']);
  assert.deepEqual(vistasContabilidad({}).map(([v]) => v), ['libros', 'bienes', 'pyg'], 'sin datos fiscales cuenta como autónomo');
  const soc = vistasContabilidad(SOC).map(([v]) => v);
  for (const v of ['diario', 'mayor', 'balance', 'sumas', 'anuales', 'libros']) assert.ok(soc.includes(v), v);
  assert.equal(PARA_AUTONOMO['/contabilidad'].nombre, 'Libros registro');
});

test('las remesas SEPA no existen para un autónomo', () => {
  assert.equal(soloSociedad(AUT, '/tesoreria/remesas'), true);
  assert.equal(soloSociedad(AUT, '/tesoreria/remesas/nueva'), true);
  assert.equal(soloSociedad(AUT, '/tesoreria'), false);
  assert.equal(soloSociedad(AUT, '/tesoreria/remesas-x'), false);
  assert.equal(soloSociedad(SOC, '/tesoreria/remesas'), false);
});

test('el menú dice qué plan incluye lo que el suyo no tiene', () => {
  assert.deepEqual(planesQueFaltan(pagado('aut', 'Esencial')), {
    '/inventario': 'Pro', '/albaranes': 'Pro', '/cartera': 'Pro', '/tesoreria': 'Pro', '/analisis': 'Pro', '/proyectos': 'Plus', '/nominas': 'Plus', '/jornada': 'Plus', '/asistente': 'Pro',
  });
  assert.deepEqual(planesQueFaltan(pagado('aut', 'Pro')), { '/proyectos': 'Plus', '/nominas': 'Plus', '/jornada': 'Plus' });
  assert.deepEqual(planesQueFaltan(pagado('aut', 'Plus')), {});
  const pymEsencial = planesQueFaltan(pagado('pym', 'Esencial'));
  assert.equal(pymEsencial['/tesoreria'], 'Pro'); assert.equal(pymEsencial['/nominas'], undefined);
  assert.deepEqual(planesQueFaltan(pagado('pym', 'Pro')), {});
  // En prueba, Fundador o sin plan no se enseña nada: lo tienen todo.
  for (const plan of [nuevoPlan('aut', 'Esencial'), { ...pagado('aut', 'Esencial'), fundador: true }, undefined]) assert.deepEqual(planesQueFaltan(plan), {});
});
