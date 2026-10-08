// Actividades propias, series de facturas y modelos según la situación fiscal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVIDADES_ANTIGUAS, actividadesDe, limpiarActividades, limpiarFiscal, modelosDe, serieDeActividad } from '../lib/empresa.js';
import { numeroFactura, resumenAnual } from '../lib/calculos.js';
import { panelResumen } from '../lib/panel.js';

test('las cuentas de antes siguen con DJ y Vértice y su numeración', () => {
  assert.deepEqual(actividadesDe({}), ACTIVIDADES_ANTIGUAS);
  assert.equal(serieDeActividad(ACTIVIDADES_ANTIGUAS, 'vertice'), 'V');
  assert.equal(numeroFactura({ numero: 1, anio: 2026, serie: 'V' }), 'V2026-001');
  assert.equal(numeroFactura({ numero: 7, anio: 2026, serie: '' }), '07-2026');
  assert.equal(numeroFactura({ numero: 3, anio: 2026, serie: 'R' }), 'R03-2026');
});

test('actividades nuevas: la primera sin letra, las demás con letras distintas y nunca la R', () => {
  const { actividades } = limpiarActividades([{ nombre: 'Diseño gráfico', ivaPct: 21, irpfPct: 15 }, { nombre: 'Formación', ivaPct: 0, irpfPct: 0 }]);
  assert.deepEqual(actividades.map((a) => [a.id, a.serie, a.ivaPct, a.irpfPct]), [['diseno-grafico', '', 21, 15], ['formacion', 'A', 0, 0]]);
  assert.equal(numeroFactura({ numero: 1, anio: 2026, serie: 'A' }), 'A2026-001');
  assert.ok(limpiarActividades([{ nombre: 'X', serie: 'R' }]).error);
  assert.ok(limpiarActividades([]).error);
  assert.ok(limpiarActividades([{ nombre: ' ' }]).error);
});

test('una actividad con facturas no cambia de serie ni se puede quitar', () => {
  const con = new Set(['vertice']);
  const r = limpiarActividades([{ id: 'dj', nombre: 'DJ', serie: 'Z' }, { id: 'vertice', nombre: 'Vértice Experiences', serie: 'Q' }], ACTIVIDADES_ANTIGUAS, con);
  assert.deepEqual(r.actividades.map((a) => [a.id, a.nombre, a.serie]), [['dj', 'DJ', 'Z'], ['vertice', 'Vértice Experiences', 'V']]);
  assert.ok(limpiarActividades([{ id: 'dj', nombre: 'DJ' }], ACTIVIDADES_ANTIGUAS, con).error);
});

test('modelos según cómo trabaja', () => {
  const ids = (f) => modelosDe(limpiarFiscal(f)).map((m) => m.id);
  assert.deepEqual(ids({ tipo: 'autonomo' }), ['303', '390', '130', '347', '100']);
  assert.deepEqual(ids({ tipo: 'autonomo', retenidas: true }), ['303', '390', '347', '100']);
  assert.deepEqual(ids({ tipo: 'autonomo', iva: 'exento' }), ['130', '347', '100']);
  assert.deepEqual(ids({ tipo: 'sociedad', trabajadores: true, alquiler: true, intracom: true }), ['303', '390', '349', '111', '190', '115', '180', '347', '200', '202']);
  assert.equal(limpiarFiscal({ tipo: 'sociedad', iva: 'recargo', retenidas: true }).iva, 'general');
  assert.equal(limpiarFiscal({ tipo: 'sociedad', retenidas: true }).retenidas, false);
});

test('plazos: el 111 y el 115 del 4T, hasta el 20 de enero; el 303, el 130 y el 349, hasta el 30', () => {
  const m = Object.fromEntries(modelosDe(limpiarFiscal({ tipo: 'autonomo', trabajadores: true, alquiler: true, intracom: true })).map((x) => [x.id, x]));
  for (const id of ['111', '115']) assert.equal(m[id].cuando, '1 al 20 de abril, julio, octubre y enero');
  for (const id of ['303', '130', '349']) assert.ok(m[id].cuando.endsWith('1 al 30 de enero'));
  assert.ok(m['111'].calcula);
});

const F = [{ id: 'a', fecha: '2026-04-10', actividad: 'x', base: 1000, ivaPct: 21, irpfPct: 15, cobrada: true, cliente: { nombre: 'A' } }];
const G = [{ id: 'g', fecha: '2026-04-11', actividad: 'x', base: 100, ivaPct: 21 }];
const ACT = [{ id: 'x', nombre: 'X', serie: '', ivaPct: 21, irpfPct: 15 }];

test('Hacienda solo suma los modelos que presenta', () => {
  // 2T: 303 = 210 − 21 = 189; 130 = 20 % de (900 − 45) − 150 = 21.
  const hoy = '2026-07-05';
  const aut = panelResumen({ facturas: F, gastos: G, hoy, actividades: ACT, fiscal: limpiarFiscal({ tipo: 'autonomo' }) });
  assert.deepEqual([aut.debe.m303, aut.debe.m130, aut.aPagar], [189, 21, 210]);
  const soc = panelResumen({ facturas: F, gastos: G, hoy, actividades: ACT, fiscal: limpiarFiscal({ tipo: 'sociedad' }) });
  assert.equal(soc.aPagar, 189);
  const ret = panelResumen({ facturas: F, gastos: G, hoy, actividades: ACT, fiscal: limpiarFiscal({ tipo: 'autonomo', retenidas: true }) });
  assert.equal(ret.aPagar, 189);
  const exe = panelResumen({ facturas: F, gastos: G, hoy, actividades: ACT, fiscal: limpiarFiscal({ tipo: 'sociedad', iva: 'exento' }) });
  assert.deepEqual([exe.debe, exe.aPagar, exe.apartado], [null, 0, 0]);
});

test('una actividad borrada sigue contando: ningún euro se queda fuera', () => {
  const r = resumenAnual([...F, { ...F[0], id: 'b', actividad: 'vieja', base: 500 }], G, 2026, {}, ['x']);
  assert.deepEqual(r.porActividad.map((a) => [a.actividad, a.ingresos]), [['x', 1000], ['vieja', 500]]);
});
