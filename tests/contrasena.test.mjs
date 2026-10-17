import test from 'node:test';
import assert from 'node:assert/strict';
import { validarContrasena as validar } from '../lib/contrasena.js';
test('contraseña: longitud, composición y frase larga', () => {
  for (const p of ['Sol72', 'solylunabosque', '918273645546']) assert.equal(validar(p).ok, false);
  for (const p of ['LunaBosque72', 'una frase larga sin cifras', 'Sol!Bosque73Nube']) assert.equal(validar(p).ok, true);
  assert.equal(validar('').nivel, 0);
  assert.equal(validar('una frase larga sin cifras').nivel, 4);
});
test('contraseña: datos personales normalizados', () => {
  assert.equal(validar('MARCOSbosque72', { nombre: 'Márcos Pérez' }).ok, false);
  assert.equal(validar('viajerobosque72', { email: 'viajero@correo.es' }).ok, false);
  assert.equal(validar('SolAnaBosque72', { nombre: 'Ana', email: 'ana@correo.es' }).ok, true);
});
test('contraseña: comunes, repeticiones y secuencias', () => {
  for (const p of ['password123', 'netto2026', 'aaaaaaaaaaaaaaaa', '1234567890', 'abcdefghij', 'jihgfedcba']) assert.equal(validar(p).ok, false, p);
  assert.ok(validar('password123').faltan.length);
});
