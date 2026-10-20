import test from 'node:test';
import assert from 'node:assert/strict';
import { desvioApp, esApp, mensajePlan } from '../lib/app.js';

const APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FisquoApp/1';
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1';

test('reconoce la app solo por su marca', () => {
  assert.equal(esApp(APP), true);
  assert.equal(esApp('Mozilla/5.0 NettoApp/1'), false);
  assert.equal(esApp(SAFARI), false);
  assert.equal(esApp(''), false);
  assert.equal(esApp(null), false);
  assert.equal(esApp('Mozilla/5.0 NoFisquoApp/1'), false);
});

test('en el navegador no cambia nada', () => {
  for (const ruta of ['/', '/business', '/precios', '/contacto', '/funciones/facturas', '/registro', '/registro?nueva=1', '/registro?plan=Pro&periodo=anio', '/ajustes/plan', '/ajustes/plan?sesion=123', '/ajustes/recomienda', '/ajustes/avisos']) {
    for (const conSesion of [false, true]) assert.equal(desvioApp({ ua: SAFARI, ruta, conSesion }), null, ruta);
  }
});

test('en la app, registro redirige con y sin query, según la sesión', () => {
  for (const ruta of ['/registro', '/registro?nueva=1', '/registro?plan=Pro&periodo=anio', '/registro/']) {
    assert.equal(desvioApp({ ua: APP, ruta, conSesion: false }), '/login', ruta);
    assert.equal(desvioApp({ ua: APP, ruta, conSesion: true }), '/', ruta);
  }
});

test('en la app con sesión, plan, recomendaciones y avisos vuelven a Ajustes', () => {
  for (const ruta of ['/ajustes/plan', '/ajustes/plan?sesion=123', '/ajustes/recomienda', '/ajustes/recomienda/', '/ajustes/avisos']) {
    assert.equal(desvioApp({ ua: APP, ruta, conSesion: true }), '/ajustes', ruta);
    assert.equal(desvioApp({ ua: APP, ruta, conSesion: false }), null, ruta);
  }
  for (const ruta of ['/registrox', '/ajustes/planificacion', '/ajustes/seguridad', '/ajustes/avisos-extra']) {
    assert.equal(desvioApp({ ua: APP, ruta, conSesion: true }), null, ruta);
  }
});

test('los errores de plan son neutros solo para la app', () => {
  const texto = 'El plan Esencial admite 1 usuarios. Puedes cambiar de plan en Ajustes › Tu plan.';
  assert.equal(mensajePlan(texto, APP), 'Esta acción no está disponible en tu cuenta.');
  assert.equal(mensajePlan(texto, SAFARI), texto);
  assert.equal(mensajePlan(texto, null), texto);
  assert.equal(mensajePlan(null, APP), null);
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
