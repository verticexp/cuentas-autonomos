import test from 'node:test';
import assert from 'node:assert/strict';
import { icsPlazos } from '../lib/calendarioIcs.js';

const plazo = { fecha: '2026-12-31', modelo: '303', nombre: 'IVA', periodo: '3T 2026', hacienda: 'Agencia Tributaria', clientes: [{ id: 'a', nombre: 'Ángela', presentado: true }] };
const opciones = { nombre: 'Gestoría Álvarez', hoy: '2026-10-24' };
const desplegar = (s) => s.replace(/\r\n /g, '');
const uid = (s) => desplegar(s).match(/UID:(.+)\r\n/)[1];

test('Cabecera, nombre, día completo, alarma y exclusión de vencidos', () => {
  const s = desplegar(icsPlazos([plazo, { ...plazo, vencido: true }], opciones));
  for (const linea of ['VERSION:2.0', 'PRODID:-//Fisquo//Plazos//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Plazos · Gestoría Álvarez', 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:PT12H', 'X-PUBLISHED-TTL:PT12H', 'DTSTART;VALUE=DATE:20261231', 'DTEND;VALUE=DATE:20270101', 'SUMMARY:303 · IVA · 3T 2026 (1 cliente)', 'DTSTAMP:20261024T000000Z', 'BEGIN:VALARM', 'TRIGGER:-P3D', 'ACTION:DISPLAY']) assert.ok(s.includes(`${linea}\r\n`), linea);
  assert.equal(s.match(/BEGIN:VEVENT/g).length, 1);
  assert.ok(s.includes('DESCRIPTION:Agencia Tributaria\\nÁngela (presentado)'));
  assert.ok(s.endsWith('END:VCALENDAR\r\n'));
  assert.equal(icsPlazos([], opciones).includes('BEGIN:VEVENT'), false);
});

test('Escapa barras, comas, punto y coma y todos los saltos de línea', () => {
  const s = desplegar(icsPlazos([{ ...plazo, hacienda: 'A\\B;C,D\r\nE\rF\nG' }], { ...opciones, nombre: 'A;B,C\\D\nE' }));
  assert.ok(s.includes('DESCRIPTION:A\\\\B\\;C\\,D\\nE\\nF\\nG\\n'));
  assert.ok(s.includes('X-WR-CALNAME:Plazos · A\\;B\\,C\\\\D\\nE'));
});

test('Plega a 75 octetos UTF-8 sin romper acentos ni caracteres y usa CRLF', () => {
  const nombre = 'Áéñ😀'.repeat(100);
  const s = icsPlazos([{ ...plazo, nombre }], { ...opciones, nombre });
  assert.ok(s.includes('\r\n '));
  assert.equal(s.replaceAll('\r\n', '').includes('\n'), false);
  assert.equal(s.replaceAll('\r\n', '').includes('\r'), false);
  for (const linea of s.split('\r\n')) assert.ok(Buffer.byteLength(linea, 'utf8') <= 75);
  assert.ok(desplegar(s).includes(`X-WR-CALNAME:Plazos · ${nombre}\r\n`));
  assert.ok(!s.includes('\ufffd'));
});

test('UID estable al cambiar clientes, marcas, día de consulta y nombre del despacho', () => {
  const original = uid(icsPlazos([plazo], opciones));
  assert.match(original, /^[a-f0-9]+@fisquo$/);
  assert.equal(uid(icsPlazos([{ ...plazo, clientes: [] }], { nombre: 'Otro', hoy: '2026-10-25' })), original);
  for (const campo of ['fecha', 'modelo', 'periodo', 'hacienda', 'nombre']) {
    const valor = campo === 'fecha' ? '2027-01-01' : `${plazo[campo]} distinto`;
    assert.notEqual(uid(icsPlazos([{ ...plazo, [campo]: valor }], opciones)), original);
  }
});

test('Día siguiente en febrero bisiesto y plural de clientes', () => {
  const s = desplegar(icsPlazos([{ ...plazo, fecha: '2024-02-29', clientes: [...plazo.clientes, { nombre: 'Berta', presentado: false }] }], opciones));
  assert.ok(s.includes('DTEND;VALUE=DATE:20240301'));
  assert.ok(s.includes('(2 clientes)'));
  assert.ok(s.includes('Ángela (presentado)\\nBerta\r\n'));
});
