import test from 'node:test';
import assert from 'node:assert/strict';
import { activaDe, conMembresia, enEmpresa, membresias } from '../lib/membresias.js';
import { permisosDe } from '../lib/permisos.js';

test('membresías: las cuentas de antes tienen su única empresa con su rol', () => {
  assert.deepEqual(membresias({ id: 'u1' }), { u1: { rol: 'admin' } });
  assert.deepEqual(membresias({ id: 'u2', empresa: 'e1', rol: 'miembro', permisos: ['gastos'] }), { e1: { rol: 'miembro', permisos: ['gastos'] } });
  assert.ok(enEmpresa({ id: 'u2', empresa: 'e1' }, 'e1') && !enEmpresa({ id: 'u2', empresa: 'e1' }, 'e2'));
});

test('membresías: añadir otra empresa no cambia la principal ni su rol', () => {
  const antes = { id: 'u2', empresa: 'e1', rol: 'miembro', permisos: ['gastos', 'gastar'] };
  const u = conMembresia(antes, 'e2', { rol: 'admin' });
  assert.deepEqual(u.empresas, { e1: { rol: 'miembro', permisos: ['gastos', 'gastar'] }, e2: { rol: 'admin' } });
  assert.deepEqual([u.empresa, u.rol, u.permisos], ['e1', 'miembro', ['gastos', 'gastar']]);
  // Permisos distintos en cada empresa.
  assert.deepEqual(permisosDe(membresias(u).e1), ['gastos', 'gastar']);
  assert.equal(permisosDe(membresias(u).e2).length, 8);
  const v = conMembresia(u, 'e1', { rol: 'miembro', permisos: ['facturas'] });
  assert.deepEqual([v.rol, v.permisos, v.empresas.e1], ['miembro', ['facturas'], { rol: 'miembro', permisos: ['facturas'] }]);
});

test('membresías: quitar la principal pasa a la otra', () => {
  const u = conMembresia(conMembresia({ id: 'u3', empresa: 'e1', rol: 'admin' }, 'e2', { rol: 'miembro', permisos: ['resumen'] }), 'e1', null);
  assert.deepEqual([u.empresa, u.rol, u.permisos, Object.keys(u.empresas)], ['e2', 'miembro', ['resumen'], ['e2']]);
});

test('membresías: la empresa activa solo puede ser una suya', () => {
  const u = conMembresia({ id: 'u4', empresa: 'e1', rol: 'admin' }, 'e2', { rol: 'admin' });
  assert.equal(activaDe(u, 'e2'), 'e2');
  assert.equal(activaDe(u, 'ajena'), 'e1');
  assert.equal(activaDe(u, undefined), 'e1');
  assert.equal(activaDe({ id: 'u5' }, 'e2'), 'u5');
});
