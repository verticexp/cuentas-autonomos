// Auditoría de octubre de 2026 (N06, N11, N12): validación de gastos, identificadores extranjeros y edición de bienes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validarGasto, validarNif, validarFactura } from '../lib/validacion.js';
import { acumulada, inversionEditada } from '../lib/amortizaciones.js';

const gasto = (extra = {}) => ({ fecha: '2026-03-10', concepto: 'Material', base: 100, ivaPct: 21, ...extra });

test('N11: un gasto con fecha imposible o IVA del 99 % se rechaza', () => {
  assert.equal(validarGasto(gasto()).ok, true);
  const f = validarGasto(gasto({ fecha: '2026-02-31' }));
  assert.equal(f.ok, false); assert.ok(f.errores.fecha);
  const i = validarGasto(gasto({ ivaPct: 99 }));
  assert.equal(i.ok, false); assert.ok(i.errores.ivaPct);
  for (const fecha of ['2026-13-01', '2026-00-10', '1999-01-01', '2026-4-1', '', undefined, 20260310]) assert.equal(validarGasto(gasto({ fecha })).ok, false, String(fecha));
  for (const base of [0, 'abc', NaN, Infinity, 2e9, undefined]) assert.equal(validarGasto(gasto({ base })).ok, false, String(base));
  for (const ivaPct of [-1, 100, 3, 'x']) assert.equal(validarGasto(gasto({ ivaPct })).ok, false, String(ivaPct));
  assert.equal(validarGasto(gasto({ concepto: '  ' })).ok, false);
  assert.equal(validarGasto(gasto({ irpfPct: 10 })).ok, false);
  assert.equal(validarGasto(gasto({ irpfPct: 15, base: '1.234,56', ivaPct: '10' })).ok, true);
  // Un IVA antiguo ya guardado se respeta si no se toca; uno nuevo raro, no.
  assert.equal(validarGasto(gasto({ ivaPct: 12 }), { antes: { ivaPct: 12 } }).ok, true);
  assert.equal(validarGasto(gasto({ ivaPct: 12 }), { antes: { ivaPct: 21 } }).ok, false);
});

test('N12: el EIN de EE. UU. se acepta con su país; sin país sigue el control español', () => {
  assert.equal(validarNif('12-3456789').ok, false, 'sin país, un NIF español mal escrito sigue fallando');
  assert.deepEqual(validarNif('12-3456789', { pais: 'US' }), { ok: true, tipo: 'otro', pais: 'US' });
  assert.equal(validarNif('12345678Z', { pais: 'ES' }).tipo, 'es');
  assert.equal(validarNif('12345678A', { pais: 'ES' }).ok, false);
  assert.equal(validarNif('12345678A').ok, false);
  // UE: prefijo opcional; el error nombra el país.
  const pt = validarNif('501964843', { pais: 'PT' });
  assert.equal(pt.ok, true); assert.equal(pt.tipo, 'ue'); assert.equal(pt.nif, 'PT501964843');
  const mal = validarNif('!!', { pais: 'FR' });
  assert.equal(mal.ok, false); assert.match(mal.error, /FR/);
  assert.match(validarNif('!!', { pais: 'US' }).error, /US/);
  // En la factura: el error cuelga del campo cliente.nif y la jurisdicción de cliente.pais.
  const base = { fecha: '2026-03-10', cliente: { nombre: 'Acme Inc', nif: '12-3456789' }, base: 100, ivaPct: 0, irpfPct: 0 };
  assert.ok(validarFactura(base).errores['cliente.nif']);
  assert.equal(validarFactura({ ...base, cliente: { ...base.cliente, pais: 'US' } }).ok, true);
  assert.ok(validarFactura({ ...base, cliente: { ...base.cliente, pais: 'USA' } }).errores['cliente.pais']);
});

test('N06: editar un bien migrado conserva lo amortizado, la fecha de corte y el coeficiente', () => {
  const migrado = { fecha: '2025-01-10', base: 3000, ivaPct: 21, inversion: { tipo: 'maquinaria', acumulada: 600, desde: '2026-07-01', coef: 10 } };
  assert.equal(acumulada(migrado, '2026-12-31'), 751.23);
  // El formulario manda solo el tipo (aunque mande más, no cuenta): se parte de lo guardado.
  const editado = { ...migrado, inversion: inversionEditada({ tipo: 'maquinaria' }, migrado.inversion) };
  assert.deepEqual(editado.inversion, migrado.inversion);
  assert.equal(acumulada(editado, '2026-12-31'), 751.23);
  // Un cambio de tipo es un cambio de criterio: cambia el tipo y conserva el resto.
  assert.deepEqual(inversionEditada({ tipo: 'mobiliario' }, migrado.inversion), { ...migrado.inversion, tipo: 'mobiliario' });
  // Sin lo anterior, es un bien nuevo.
  assert.deepEqual(inversionEditada({ tipo: 'mobiliario' }, undefined), { tipo: 'mobiliario' });
  assert.equal(inversionEditada(undefined, migrado.inversion), undefined);
});
