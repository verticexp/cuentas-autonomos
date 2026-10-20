import test from 'node:test';
import assert from 'node:assert/strict';
import { cambioDeForma, MENSAJES, pareceSociedad, tiposContratables } from '../lib/formaJuridica.js';
import { datosFiscalesRegistro, nuevoPlan } from '../lib/prueba.js';

const PERSONA = '12345678Z', CIF = 'B12345674';
const antes = { tipo: 'autonomo', nif: PERSONA, nombre: 'Ana López García' };

test('reconoce el nombre de una sociedad solo como forma jurídica al final', () => {
  for (const n of ['Fisquo SL', 'FISQUO, S.L.', 'Fisquo S.L.U.', 'Acme SLU', 'Acme S.A.', 'Acme SAU', 'Talleres SLL', 'Nueva S.L.N.E.', 'Huerta S.Coop.', 'Huerta S. Coop. Andaluza', 'Obras Sociedad Limitada', 'Obras (S.L.)'])
    assert.ok(pareceSociedad(n), n);
  for (const n of ['Ana López García', 'José Sala', 'Marta Salas', 'Slava Petrov', 'Estudio Sauce', 'Clínica Dental Ana', ''])
    assert.equal(pareceSociedad(n), false, n);
});

test('un autónomo no puede poner un CIF ni un nombre de sociedad', () => {
  const plan = nuevoPlan('aut', 'Pro');
  assert.equal(cambioDeForma(plan, antes, { ...antes, nif: CIF }).error, MENSAJES.nifSociedad);
  assert.equal(cambioDeForma(plan, antes, { ...antes, nombre: 'Ana López SL' }).error, MENSAJES.nombreSociedad);
  assert.equal(cambioDeForma(plan, antes, { ...antes, nif: 'X1234567L' }).plan, plan, 'un NIE vale');
  assert.equal(cambioDeForma(plan, antes, { ...antes, nombre: 'Ana López García (DJ)' }).plan, plan);
  assert.equal(cambioDeForma(plan, { ...antes, tipo: 'sociedad', nif: CIF }, { tipo: 'sociedad', nif: PERSONA, nombre: 'X' }).error, MENSAJES.nifPersona);
});

test('una cuenta antigua que no cuadra puede seguir editando lo que no cambia', () => {
  const vieja = { tipo: 'autonomo', nif: CIF, nombre: 'Antigua SL' };
  assert.ok(cambioDeForma(nuevoPlan('aut', 'Pro'), vieja, { ...vieja }).plan);
  assert.equal(cambioDeForma(undefined, antes, { ...antes, nif: CIF }).error, MENSAJES.nifSociedad, 'sin plan también se frena el cambio');
});

test('pasar a sociedad: en prueba el plan pasa a Pymes; pagado necesita antes un plan de Pymes', () => {
  const sociedad = { tipo: 'sociedad', nif: CIF, nombre: 'Ana López SL' };
  const prueba = nuevoPlan('aut', 'Pro');
  assert.deepEqual(cambioDeForma(prueba, antes, sociedad).plan, { ...prueba, tipo: 'pym' });
  assert.equal(cambioDeForma({ ...prueba, pagado: true }, antes, sociedad).error, MENSAJES.planAutonomo);
  const pymePagado = { ...nuevoPlan('pym', 'Pro'), pagado: true };
  assert.equal(cambioDeForma(pymePagado, antes, sociedad).plan, pymePagado);
  const fundador = { ...prueba, fundador: true };
  assert.equal(cambioDeForma(fundador, antes, sociedad).plan, fundador);
  // De sociedad a autónomo: en prueba vuelve a Autónomos; pagando una pyme puede quedarse con ella.
  assert.equal(cambioDeForma(nuevoPlan('pym', 'Esencial'), sociedad, antes).plan.tipo, 'aut');
  assert.equal(cambioDeForma(pymePagado, sociedad, antes).plan, pymePagado);
});

test('una sociedad solo contrata Pymes; un autónomo puede contratar los dos', () => {
  assert.deepEqual(tiposContratables('sociedad'), ['pym']);
  assert.deepEqual(tiposContratables('autonomo'), ['aut', 'pym']);
  assert.deepEqual(tiposContratables(undefined), ['aut', 'pym']);
});

test('el registro de autónomo rechaza el nombre de una sociedad', () => {
  const datos = { tipo: 'aut', razon: 'Fisquo Software SL', nif: PERSONA, direccion: 'Calle Mayor 1', cp: '08001', ciudad: 'Barcelona', provincia: 'Barcelona', telefono: '' };
  assert.equal(datosFiscalesRegistro(datos).campo, 'razon');
  assert.ok(datosFiscalesRegistro({ ...datos, razon: 'Ana López García' }).emisor);
  assert.ok(datosFiscalesRegistro({ ...datos, tipo: 'pym', nif: CIF }).emisor, 'en Pymes sí vale');
});
