// Estados y reparto señal / resto de los presupuestos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { baseResto, baseSenal, caduca, estadoDe, numeroPresupuesto } from '../lib/presupuestos.js';
import { textoEvento } from '../lib/formato.js';

const p = { numero: 3, anio: 2026, fecha: '2026-10-01', validez: 15, base: 2500, senalPct: 30, estado: 'pendiente', facturas: [] };

test('numeración y caducidad', () => {
  assert.equal(numeroPresupuesto(p), 'P2026-003');
  assert.equal(caduca(p), '2026-10-16');
  assert.equal(estadoDe(p, '2026-10-16'), 'pendiente');
  assert.equal(estadoDe(p, '2026-10-17'), 'caducado');
  assert.equal(estadoDe({ ...p, estado: 'aceptado' }, '2026-12-01'), 'aceptado');
});

test('la señal se descuenta del resto y el presupuesto queda facturado', () => {
  assert.equal(baseSenal(p), 750);
  const conSenal = { ...p, estado: 'aceptado', facturas: [{ id: 'x', tipo: 'senal', base: 750 }] };
  assert.equal(baseResto(conSenal), 1750);
  assert.equal(estadoDe(conSenal, '2026-10-02'), 'aceptado');
  assert.equal(estadoDe({ ...conSenal, facturas: [...conSenal.facturas, { tipo: 'resto', base: 1750 }] }, '2026-10-02'), 'facturado');
  assert.equal(baseResto({ ...p, senalPct: 0 }), 2500);
});

test('texto del evento', () => {
  assert.equal(textoEvento({ evento: { fecha: '2026-06-12', lugar: 'Hotel Arts' } }), 'Evento del 12-06-2026 en Hotel Arts');
  assert.equal(textoEvento({ evento: { fecha: '', lugar: '' } }), '');
  assert.equal(textoEvento({}), '');
});
