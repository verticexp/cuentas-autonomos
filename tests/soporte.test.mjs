import test from 'node:test';
import assert from 'node:assert/strict';
import { anadir, avisarEquipo, enHorario, historialIA, nuevaConversacion, pasarAPersona, proximaApertura, vistaCliente } from '../lib/soporte.js';

// Horas en UTC: en octubre-noviembre 2026 Madrid es UTC+2 hasta el 25-10 y UTC+1 después.
test('horario: de lunes a sábado, de 9:00 a 22:00 en Madrid', () => {
  assert.equal(enHorario(new Date('2026-11-02T08:00:00Z')), true); // lunes 9:00
  assert.equal(enHorario(new Date('2026-11-02T07:59:00Z')), false); // lunes 8:59
  assert.equal(enHorario(new Date('2026-11-07T20:59:00Z')), true); // sábado 21:59
  assert.equal(enHorario(new Date('2026-11-07T21:00:00Z')), false); // sábado 22:00
  assert.equal(enHorario(new Date('2026-11-08T11:00:00Z')), false); // domingo
  assert.equal(enHorario(new Date('2026-10-20T19:30:00Z')), true); // martes 21:30 en horario de verano
});

test('próxima apertura', () => {
  assert.equal(proximaApertura(new Date('2026-11-02T10:00:00Z')), 'ahora');
  assert.equal(proximaApertura(new Date('2026-11-03T06:00:00Z')), 'hoy a las 9:00'); // martes 7:00
  assert.equal(proximaApertura(new Date('2026-11-03T22:30:00Z')), 'mañana a las 9:00'); // martes 23:30
  assert.equal(proximaApertura(new Date('2026-11-07T22:00:00Z')), 'el lunes a las 9:00'); // sábado 23:00
  assert.equal(proximaApertura(new Date('2026-11-08T10:00:00Z')), 'mañana a las 9:00'); // domingo
});

test('conversación: añadir, pasar a persona y vista del cliente', () => {
  let c = nuevaConversacion({ id: 7, nombre: 'Ana', email: 'a@b.es', empresa: 'e1', empresaNombre: 'Ana SL' }, '2026-11-02T10:00:00.000Z');
  c = anadir(c, 'cliente', '  no me deja emitir  ', '2026-11-02T10:01:00.000Z');
  assert.equal(c.mensajes[0].texto, 'no me deja emitir');
  assert.equal(c.leidaEquipo, false);
  assert.equal(anadir(c, 'ia', '   '), c);
  c = pasarAPersona(c, 'Fallo al emitir');
  assert.equal(c.estado, 'persona');
  assert.equal(pasarAPersona(c, 'otro').motivo, 'Fallo al emitir');
  assert.equal('motivo' in vistaCliente(c), false);
  assert.equal(vistaCliente(null), null);
});

test('historial para la IA: alterna turnos y empieza por el cliente', () => {
  let c = nuevaConversacion({ id: 1 });
  c = anadir(c, 'equipo', 'Hola');
  c = anadir(c, 'cliente', 'uno');
  c = anadir(c, 'cliente', 'dos');
  c = anadir(c, 'ia', 'respuesta');
  assert.deepEqual(historialIA(c), [{ role: 'user', content: 'uno\ndos' }, { role: 'assistant', content: 'respuesta' }]);
});

test('aviso al equipo: al pasarla y luego como mucho cada 30 minutos', () => {
  const c = pasarAPersona(nuevaConversacion({ id: 1 }), 'x');
  const t = Date.parse('2026-11-02T10:00:00Z');
  assert.equal(avisarEquipo({ ...c, estado: 'ia' }, t), false);
  assert.equal(avisarEquipo(c, t), true);
  assert.equal(avisarEquipo({ ...c, avisada: '2026-11-02T09:45:00Z' }, t), false);
  assert.equal(avisarEquipo({ ...c, avisada: '2026-11-02T09:20:00Z' }, t), true);
});
