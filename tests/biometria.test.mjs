import test from 'node:test';
import assert from 'node:assert/strict';
import { esOrdenador, nombreBiometria } from '../lib/biometria.js';
import { toca } from '../lib/sesion.js';
import './apoyo/cargador.mjs';

const { bloqueoDe } = await import('../lib/auth.js');

test('nombra la llave de acceso según el dispositivo', () => {
  assert.equal(nombreBiometria('Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Mobile/15E148'), 'Face ID');
  assert.equal(nombreBiometria('Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X)'), 'Touch ID');
  assert.equal(nombreBiometria('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Safari/605.1.15'), 'Touch ID');
  assert.equal(nombreBiometria('Mozilla/5.0 (Linux; Android 16; Pixel 10) Chrome/140.0'), 'huella');
  assert.equal(nombreBiometria('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0'), 'Windows Hello');
  assert.equal(nombreBiometria('Mozilla/5.0 (X11; Linux x86_64)'), 'llave de acceso');
  assert.equal(nombreBiometria(), 'llave de acceso');
});

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const APP = `${IPHONE} FisquoApp/1.4`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36';

test('el ordenador es Mac, Windows o Linux; nunca el móvil, la tablet ni la app de iOS', () => {
  assert.equal(esOrdenador(MAC), true);
  assert.equal(esOrdenador(WINDOWS), true);
  assert.equal(esOrdenador('Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0'), true);
  assert.equal(esOrdenador(IPHONE), false);
  assert.equal(esOrdenador(APP), false);
  assert.equal(esOrdenador(ANDROID), false);
  assert.equal(esOrdenador('Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X)'), false);
  // Desconocido o sin user agent (scripts, pruebas): no cuenta como ordenador y el bloqueo sigue.
  assert.equal(esOrdenador('node'), false);
  assert.equal(esOrdenador(), false);
});

test('en el ordenador no hay bloqueo de pantalla; en el móvil y en la app, el de siempre', () => {
  const antes = process.env.BLOQUEO_SERVIDOR;
  process.env.BLOQUEO_SERVIDOR = 'activo';
  try {
    const u = { bloqueoPantalla: true };
    assert.equal(bloqueoDe(u, MAC), 'off');
    assert.equal(bloqueoDe(u, WINDOWS), 'off');
    assert.equal(bloqueoDe(u, IPHONE), 'activo');
    assert.equal(bloqueoDe(u, APP), 'activo');
    assert.equal(bloqueoDe(u, ANDROID), 'activo');
    assert.equal(bloqueoDe(u), 'activo');
    assert.equal(bloqueoDe({}, IPHONE), 'off');
  } finally {
    if (antes === undefined) delete process.env.BLOQUEO_SERVIDOR; else process.env.BLOQUEO_SERVIDOR = antes;
  }
});

test('la sesión se alarga solo en el ordenador, con sesión y una vez al día', () => {
  assert.equal(toca({ ua: MAC, token: 'x' }), true);
  assert.equal(toca({ ua: MAC, token: 'x', renovada: '1' }), false);
  assert.equal(toca({ ua: MAC }), false);
  assert.equal(toca({ ua: IPHONE, token: 'x' }), false);
  assert.equal(toca({ ua: APP, token: 'x' }), false);
});
