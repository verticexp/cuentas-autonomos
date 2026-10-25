// Calendario de plazos (lib/calendarioFiscal.js): formato iCalendar, alarmas y fecha de domiciliación.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarioIcs } from '../lib/calendarioFiscal.js';
import { PUBLICO } from '../lib/rutasPublicas.js';

const autonomo = { tipo: 'autonomo', iva: 'general', irpf: 'directa', trabajadores: true };

test('un evento por plazo, de día entero, con dos alarmas y la domiciliación en la descripción', () => {
  const ics = calendarioIcs(autonomo, { anio: 2026, nombre: 'Taller, S.L.; pruebas', ahora: '2026-10-25T10:00:00.000Z' });
  assert.match(ics, /^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  // Comas y punto y coma escapados (RFC 5545, 3.3.11).
  assert.ok(ics.includes('X-WR-CALNAME:Plazos de Hacienda · Taller\\, S.L.\\; pruebas'));
  const eventos = ics.split('BEGIN:VEVENT').length - 1;
  assert.ok(eventos >= 8, `solo ${eventos} eventos`);
  assert.equal(ics.split('BEGIN:VALARM').length - 1, eventos * 2);
  // 3T de 2026: 20 de octubre, con domiciliación hasta el 15.
  const tercero = ics.split('BEGIN:VEVENT').find((e) => e.includes('DTSTART;VALUE=DATE:20261020'));
  assert.ok(tercero, 'falta el plazo del 3T');
  const desplegado = tercero.replace(/\r\n /g, '');
  assert.match(desplegado, /DTEND;VALUE=DATE:20261021/);
  assert.match(desplegado, /SUMMARY:Hacienda: 303\\, 130 y 111 del 3T/);
  assert.match(desplegado, /Si lo domicilias\\, hasta el 15 de octubre\./);
  // El 347 no se paga: sin domiciliación.
  const m347 = ics.split('BEGIN:VEVENT').find((e) => e.includes('347'));
  assert.doesNotMatch(m347.replace(/\r\n /g, ''), /domicilias/);
});

test('ninguna línea pasa de 75 octetos y las continuaciones empiezan por un espacio', () => {
  const ics = calendarioIcs({ ...autonomo, alquiler: true, capital: true, intracom: true }, { anio: 2026, nombre: 'Ñandú Producciones y Eventos Extraordinarios de Andalucía Oriental' });
  for (const linea of ics.split('\r\n')) assert.ok(Buffer.byteLength(linea) <= 75, linea);
  assert.ok(ics.includes('\r\n '));
});

test('la ruta del calendario con su token es pública; la que crea el enlace, no', () => {
  assert.equal(PUBLICO.test(`/api/calendario/${'a'.repeat(48)}.ics`), true);
  assert.equal(PUBLICO.test('/api/calendario'), false);
  assert.equal(PUBLICO.test('/api/calendariox/a'), false);
});
