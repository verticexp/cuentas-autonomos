import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validarContrasena as validar } from '../lib/contrasena.js';
import { contrasenaFiltrada, validarContrasenaSegura } from '../lib/contrasenaFiltrada.js';
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
  for (const p of ['password123', 'fisquo2026', 'fisquo123456', 'netto2026', 'netto123456', 'aaaaaaaaaaaaaaaa', '1234567890', 'abcdefghij', 'jihgfedcba']) assert.equal(validar(p).ok, false, p);
  assert.ok(validar('password123').faltan.length);
});


function hashPass(pass) {
  return createHash('sha1').update(pass, 'utf8').digest('hex').toUpperCase();
}

function respuesta(sufijo, conteo) {
  return { ok: true, text: async () => `${sufijo}:${conteo}\nFFFF${'0'.repeat(31)}:0` };
}

test('HIBP k-anonimato: detecta sufijo con conteo positivo y solo envía el prefijo', async () => {
  const pass = 'LunaBosque72';
  const hash = hashPass(pass);
  let url, opciones;
  const encontrada = await contrasenaFiltrada(pass, {
    fetch: async (...args) => { [url, opciones] = args; return respuesta(hash.slice(5), 42); },
  });
  assert.equal(encontrada, true);
  assert.equal(url, `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
  assert.equal(url.split('/').at(-1).length, 5);
  assert.equal(url.includes(hash), false);
  assert.equal(opciones.headers['Add-Padding'], 'true');
});

test('HIBP k-anonimato: devuelve false si no está filtrada o el conteo es cero', async () => {
  const hash = hashPass('LunaBosque72');
  assert.equal(await contrasenaFiltrada('LunaBosque72', { fetch: async () => respuesta('A'.repeat(35), 3) }), false);
  assert.equal(await contrasenaFiltrada('LunaBosque72', { fetch: async () => respuesta(hash.slice(5), 0) }), false);
});

test('HIBP k-anonimato: un fallo de red falla abierto', async () => {
  assert.equal(await contrasenaFiltrada('LunaBosque72', { fetch: async () => { throw new Error('sin red'); } }), false);
});

test('HIBP k-anonimato: timeout falla abierto aunque fetch no respete AbortSignal', async () => {
  const nunca = new Promise(() => {});
  assert.equal(await contrasenaFiltrada('LunaBosque72', { fetch: () => nunca, timeoutMs: 10 }), false);
});

test('validarContrasenaSegura conserva la forma y rechaza una contraseña filtrada', async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const hash = hashPass('LunaBosque72');
    const validacion = await validarContrasenaSegura('LunaBosque72', {}, {
      fetch: async () => respuesta(hash.slice(5), 1),
    });
    assert.deepEqual(validacion, {
      ok: false,
      error: 'Esa contraseña aparece en filtraciones de datos conocidas. Elige otra.',
      nivel: 2,
      faltan: ['Esa contraseña aparece en filtraciones de datos conocidas. Elige otra.'],
    });
  } finally {
    if (original === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = original;
  }
});
