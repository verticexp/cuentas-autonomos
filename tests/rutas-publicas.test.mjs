import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLICO } from '../lib/rutasPublicas.js';

test('las rutas públicas siguen abiertas sin sesión', () => {
  for (const r of ['/', '/login', '/registro', '/precios', '/funciones/facturas', '/p/abc', '/portal/abc', '/pagar/abc', '/api/portal/pdf',
    '/api/abierta/abc', '/api/pagar', '/api/presupuestos/aceptar', '/api/stripe/webhook', '/api/buzon', '/api/trabajos', '/api/passkey', '/api/confirmar',
    '/api/invitacion/aceptar', '/sw', '/manifest.webmanifest', '/robots.txt', '/favicon.ico', '/apple-icon', '/.well-known/apple-app-site-association', '/correo/logo.png', '/inicio-ios/1179x2556.png']) {
    assert.ok(PUBLICO.test(r), r);
  }
});

test('un nombre que solo empieza como uno público no queda abierto (m7)', () => {
  for (const r of ['/loginx', '/registros', '/api/pagarx', '/api/trabajosx', '/swagger', '/sw-admin', '/api/passkeys', '/portal', '/api/presupuestos',
    '/facturas', '/api/facturas', '/admin', '/precios-internos', '/api/stripe-interno', '/api/buzonx', '/api/bandeja']) {
    assert.ok(!PUBLICO.test(r), r);
  }
});

test('M4: «Resumen e impuestos» solo no basta para el detalle (libros, banco, paquete)', async () => {
  const { DETALLE, PERFILES, puede } = await import('../lib/permisos.js');
  const solo = { rol: 'miembro', permisos: ['resumen'] };
  const gestoria = { rol: 'miembro', permisos: PERFILES.find((p) => p.id === 'gestoria').permisos };
  assert.equal(puede(solo, 'resumen'), true);
  assert.equal(puede(solo, DETALLE), false);
  assert.equal(puede(gestoria, DETALLE), true, 'la gestoría sigue viéndolo todo');
  assert.equal(puede({ rol: 'admin' }, DETALLE), true);
});
