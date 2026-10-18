import test from 'node:test';
import assert from 'node:assert/strict';
import { desvioApp, esApp } from '../lib/app.js';

const APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NettoApp/1';
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';

test('reconoce la app solo por su marca', () => {
  assert.equal(esApp(APP), true);
  assert.equal(esApp(SAFARI), false);
  assert.equal(esApp(''), false);
  assert.equal(esApp(null), false);
  assert.equal(esApp('Mozilla/5.0 NoNettoApp/1'), false);
});

test('en el navegador no cambia nada', () => {
  for (const ruta of ['/', '/business', '/precios', '/contacto', '/funciones/facturas']) {
    assert.equal(desvioApp({ ua: SAFARI, ruta, conSesion: false }), null);
  }
});

test('en la app, la web pública manda al login o al panel', () => {
  assert.equal(desvioApp({ ua: APP, ruta: '/', conSesion: false }), '/login');
  assert.equal(desvioApp({ ua: APP, ruta: '/precios', conSesion: false }), '/login');
  assert.equal(desvioApp({ ua: APP, ruta: '/funciones/facturas', conSesion: false }), '/login');
  assert.equal(desvioApp({ ua: APP, ruta: '/contacto', conSesion: true }), '/');
  assert.equal(desvioApp({ ua: APP, ruta: '/business', conSesion: false }), '/login');
  assert.equal(desvioApp({ ua: APP, ruta: '/business', conSesion: true }), '/');
});

test('en la app, el panel, el login y lo legal siguen igual', () => {
  assert.equal(desvioApp({ ua: APP, ruta: '/', conSesion: true }), null);
  for (const ruta of ['/login', '/privacidad', '/condiciones', '/facturas', '/ajustes/seguridad', '/preciosx']) {
    assert.equal(desvioApp({ ua: APP, ruta, conSesion: false }), null);
  }
});
