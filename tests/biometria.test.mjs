import test from 'node:test';
import assert from 'node:assert/strict';
import { nombreBiometria } from '../lib/biometria.js';

test('nombra la llave de acceso según el dispositivo', () => {
  assert.equal(nombreBiometria('Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) Mobile/15E148'), 'Face ID');
  assert.equal(nombreBiometria('Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X)'), 'Touch ID');
  assert.equal(nombreBiometria('Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Safari/605.1.15'), 'Touch ID');
  assert.equal(nombreBiometria('Mozilla/5.0 (Linux; Android 16; Pixel 10) Chrome/140.0'), 'huella');
  assert.equal(nombreBiometria('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0'), 'Windows Hello');
  assert.equal(nombreBiometria('Mozilla/5.0 (X11; Linux x86_64)'), 'llave de acceso');
  assert.equal(nombreBiometria(), 'llave de acceso');
});
