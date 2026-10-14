// Atajos del «+» del móvil: orden por tipo de empresa, permisos e inventario.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ATAJOS, atajosDe, perfilAtajos } from '../lib/navegacion.js';

const TODOS = ['resumen', 'facturas', 'facturar', 'gastos', 'gastar', 'empresa', 'nominas', 'usuarios'];
const ids = (x) => atajosDe(x).map((a) => a.id);

test('el perfil sale de la situación fiscal', () => {
  assert.equal(perfilAtajos({}), 'autonomo');
  assert.equal(perfilAtajos({ tipo: 'autonomo' }), 'autonomo');
  assert.equal(perfilAtajos({ tipo: 'sociedad' }), 'sociedad');
  assert.equal(perfilAtajos({ tipo: 'autonomo', iva: 'recargo' }), 'tienda');
  assert.equal(perfilAtajos({ tipo: 'sociedad', inventario: true }), 'tienda');
});

test('una tienda empieza por el cierre; un autónomo, por el ticket; una sociedad, por la factura', () => {
  assert.equal(ids({ permisos: TODOS, fiscal: { iva: 'recargo' } })[0], 'cierre');
  assert.equal(ids({ permisos: TODOS, fiscal: { tipo: 'autonomo' } })[0], 'ticket');
  assert.equal(ids({ permisos: TODOS, fiscal: { tipo: 'sociedad' } })[0], 'factura');
});

test('el albarán solo sale con inventario', () => {
  assert.ok(!ids({ permisos: TODOS, fiscal: { tipo: 'autonomo' } }).includes('albaran'));
  assert.ok(ids({ permisos: TODOS, fiscal: { tipo: 'autonomo', inventario: true } }).includes('albaran'));
  assert.ok(ids({ permisos: TODOS, fiscal: {}, inventario: true }).includes('albaran'));
});

test('cada atajo pide su permiso', () => {
  assert.deepEqual(ids({ permisos: ['facturas', 'facturar'], fiscal: {} }), ['factura', 'presupuesto', 'cierre']);
  assert.deepEqual(ids({ permisos: ['gastos', 'gastar'], fiscal: {} }), ['ticket']);
  assert.deepEqual(ids({ permisos: ['resumen', 'facturas', 'gastos'], fiscal: {} }), []);
  assert.deepEqual(ids({}), []);
});

test('en presupuestos, el presupuesto va primero; en el resto, el orden normal', () => {
  assert.equal(ids({ permisos: TODOS, fiscal: {}, en: '/presupuestos' })[0], 'presupuesto');
  assert.equal(ids({ permisos: TODOS, fiscal: {}, en: '/presupuestos/abc' })[0], 'presupuesto');
  assert.equal(ids({ permisos: TODOS, fiscal: {}, en: '/facturas' })[0], 'ticket');
  // Sin permiso para presupuestos no aparece ni pasa a primero
  assert.ok(!ids({ permisos: ['gastos', 'gastar'], fiscal: {}, en: '/presupuestos' }).includes('presupuesto'));
});

test('no repite atajos y todos tienen destino', () => {
  for (const f of [{}, { tipo: 'sociedad' }, { iva: 'recargo', inventario: true }]) {
    const lista = ids({ permisos: TODOS, fiscal: f, en: '/presupuestos' });
    assert.equal(new Set(lista).size, lista.length);
  }
  for (const a of Object.values(ATAJOS)) assert.ok(a.href.startsWith('/') && a.nombre && a.permiso);
});
