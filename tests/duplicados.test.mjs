import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNumero, posiblesDuplicados } from '../lib/duplicados.js';

const gasto = (datos = {}) => ({ id: 'guardado', fecha: '2026-03-03', concepto: 'Electricidad',
  proveedor: 'Endesa', base: 100, ivaPct: 21, irpfPct: 0, ...datos });
const nuevo = (datos = {}) => gasto({ id: 'nuevo', ...datos });

test('normalizarNumero: ignora mayúsculas, separadores y ceros iniciales de cada parte numérica', () => {
  assert.equal(normalizarNumero(' F-0012 / '), 'f12');
  assert.equal(normalizarNumero('AB-000/0020'), 'ab20');
  assert.equal(normalizarNumero('F000A0012'), 'f0a12');
  assert.equal(normalizarNumero(12), '12');
  for (const n of [undefined, null, '', ' - / ']) assert.equal(normalizarNumero(n), '');
});

test('mismo archivo: coincidencia segura incluso con otro proveedor, fecha e importe', () => {
  const huella = 'a'.repeat(64);
  const resultado = posiblesDuplicados(nuevo({ archivo: { huella } }), [
    gasto({ proveedor: 'Otro', fecha: '2026-01-01', base: 5, archivo: { huella } }),
  ]);
  assert.deepEqual(resultado, [{ id: 'guardado', motivo: 'Mismo archivo adjunto del 01/01/2026', certeza: 'segura' }]);
});

test('mismo proveedor y número con distinta escritura: coincidencia segura', () => {
  const resultado = posiblesDuplicados(nuevo({ proveedor: '  ÉNDESA ', numero: 'f12' }), [
    gasto({ numero: 'F-0012', base: 20, fecha: '2026-01-01' }),
  ]);
  assert.deepEqual(resultado, [{ id: 'guardado', motivo: 'Misma factura de Endesa (nº F-0012) del 01/01/2026', certeza: 'segura' }]);
});

test('mismo NIF permite nombres distintos tanto para número como para importe', () => {
  const n = nuevo({ proveedor: 'Nombre distinto', proveedorNif: 'b111', numero: 'F12' });
  const lista = [gasto({ id: 'numero', proveedorNif: 'B111', numero: 'F-0012' }),
    gasto({ id: 'importe', proveedorNif: 'B111', fecha: '2026-03-06' })];
  assert.deepEqual(posiblesDuplicados(n, lista).map((g) => [g.id, g.certeza]),
    [['numero', 'segura'], ['importe', 'probable']]);
});

test('mismo importe a tres días es probable y a diez días no coincide', () => {
  const lista = [gasto({ id: 'cerca', fecha: '2026-03-06' }), gasto({ id: 'lejos', fecha: '2026-03-13' })];
  assert.deepEqual(posiblesDuplicados(nuevo(), lista).map((g) => [g.id, g.certeza]), [['cerca', 'probable']]);
  assert.equal(posiblesDuplicados(nuevo(), [lista[1]], { dias: 10 }).length, 1);
  assert.equal(posiblesDuplicados(nuevo(), [lista[0]], { dias: 2 }).length, 0);
});

test('límite de días inclusivo, en ambas direcciones y atravesando un cambio de mes', () => {
  const n = nuevo({ fecha: '2026-04-01' });
  const lista = [gasto({ id: 'antes', fecha: '2026-03-25' }), gasto({ id: 'despues', fecha: '2026-04-08' })];
  assert.deepEqual(posiblesDuplicados(n, lista).map((g) => g.id), ['antes', 'despues']);
  assert.equal(posiblesDuplicados(n, lista, { dias: 0 }).length, 0);
});

test('proveedores distintos con el mismo número e importe no coinciden', () => {
  assert.deepEqual(posiblesDuplicados(nuevo({ numero: 'F12' }), [gasto({ proveedor: 'Otro', numero: 'F-0012' })]), []);
});

test('compara base más IVA en céntimos: admite uno, rechaza dos e ignora IRPF', () => {
  const n = nuevo({ base: 100, ivaPct: 0, irpfPct: 15 });
  const lista = [gasto({ id: 'uno', base: 100.01, ivaPct: 0 }), gasto({ id: 'dos', base: 100.02, ivaPct: 0 })];
  assert.deepEqual(posiblesDuplicados(n, lista).map((g) => [g.id, g.certeza]), [['uno', 'probable']]);
  assert.equal(posiblesDuplicados(nuevo({ irpfPct: 15 }), [gasto()])[0].certeza, 'probable');
  assert.deepEqual(posiblesDuplicados(nuevo({ ivaPct: 0 }), [gasto()]), []);
});

test('sin proveedor: mismo concepto normalizado, total y fecha', () => {
  const n = nuevo({ proveedor: '', concepto: '  Suscripción   MÚSICA ' });
  const lista = [gasto({ id: 'igual', proveedor: '', concepto: 'suscripcion musica' }),
    gasto({ id: 'fecha', proveedor: '', concepto: 'suscripcion musica', fecha: '2026-03-04' }),
    gasto({ id: 'concepto', proveedor: '', concepto: 'Otro' }),
    gasto({ id: 'con-proveedor', concepto: 'suscripcion musica' }),
    gasto({ id: 'con-nif', proveedor: '', proveedorNif: 'B111', concepto: 'suscripcion musica' }),
    gasto({ id: 'importe', proveedor: '', concepto: 'suscripcion musica', base: 101 })];
  assert.deepEqual(posiblesDuplicados(n, lista).map((g) => [g.id, g.certeza]), [['igual', 'probable']]);
  assert.deepEqual(posiblesDuplicados(nuevo({ proveedor: '', concepto: '' }), [gasto({ proveedor: '', concepto: '' })]), []);
});

test('no se compara consigo mismo aunque coincidan archivo y número', () => {
  const n = gasto({ numero: 'F12', archivo: { huella: 'a'.repeat(64) } });
  assert.deepEqual(posiblesDuplicados(n, [n, { ...n }]), []);
});

test('números y huellas vacíos no cuentan como seguros; pueden coincidir por importe', () => {
  for (const numero of [undefined, null, '', ' - / ']) {
    const n = nuevo({ numero, archivo: { huella: '' } });
    assert.deepEqual(posiblesDuplicados(n, [gasto({ numero, base: 20, archivo: { huella: '' } })]), []);
    assert.equal(posiblesDuplicados(n, [gasto({ numero })])[0].certeza, 'probable');
  }
});

test('seguras antes de probables, una coincidencia por gasto y sin modificar entradas', () => {
  const huella = 'a'.repeat(64);
  const n = nuevo({ numero: 'F12', archivo: { huella } });
  const lista = [gasto({ id: 'probable' }), gasto({ id: 'numero', numero: 'F-0012' }),
    gasto({ id: 'archivo', numero: 'F12', archivo: { huella } }), gasto({ id: 'probable2' })];
  const original = structuredClone({ n, lista });
  assert.deepEqual(posiblesDuplicados(n, lista).map((g) => [g.id, g.certeza]),
    [['numero', 'segura'], ['archivo', 'segura'], ['probable', 'probable'], ['probable2', 'probable']]);
  assert.deepEqual({ n, lista }, original);
  assert.equal(posiblesDuplicados(n, lista).find((g) => g.id === 'archivo').motivo, 'Mismo archivo adjunto del 03/03/2026');
});
