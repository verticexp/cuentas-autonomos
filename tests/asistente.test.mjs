import test from 'node:test';
import assert from 'node:assert/strict';
import { cifrasDe, cifrasInventadas, definiciones, ejecutar, euros, limpiarHistorial } from '../lib/asistente.js';
import { importes, resumenAnual } from '../lib/calculos.js';

const admin = { rol: 'admin', actividades: [{ id: 'a', nombre: 'Eventos', serie: '', ivaPct: 21, irpfPct: 15 }], fiscal: { tipo: 'autonomo', iva: 'general' }, emisor: { plazo: 30 } };
const soloGastos = { ...admin, rol: 'miembro', permisos: ['gastos', 'gastar'] };
const F = [
  { id: '1', numero: 1, anio: 2026, fecha: '2026-07-10', actividad: 'a', cliente: { nombre: 'Ana López' }, base: 1000, ivaPct: 21, irpfPct: 15, cobrada: true },
  { id: '2', numero: 2, anio: 2026, fecha: '2026-08-20', actividad: 'a', cliente: { nombre: 'Bea Ruiz' }, base: 500, ivaPct: 21, irpfPct: 15, cobrada: false },
  { id: '3', numero: 3, anio: 2026, fecha: '2026-10-02', actividad: 'a', cliente: { nombre: 'Ana López' }, base: 200, ivaPct: 21, irpfPct: 15, cobrada: false },
];
const G = [
  { id: 'g1', fecha: '2026-07-15', actividad: 'a', concepto: 'Cables', proveedor: 'Ferretería Sol', base: 100, ivaPct: 21 },
  { id: 'g2', fecha: '2026-10-01', actividad: 'a', concepto: 'Gestoría', base: 50, ivaPct: 21, pendiente: true },
];
const HOY = '2026-10-05';

test('asistente: cada uno solo tiene las herramientas de lo que puede ver', () => {
  assert.deepEqual(definiciones(admin).map((h) => h.name), ['impuestos', 'resumen_anio', 'facturas', 'clientes', 'gastos', 'tesoreria', 'nominas']);
  assert.deepEqual(definiciones(soloGastos).map((h) => h.name), ['gastos']);
  assert.ok(definiciones(admin).every((h) => h.name && h.description && h.input_schema && !h.permiso));
  // Aunque la IA pida otra, la herramienta comprueba el permiso.
  assert.deepEqual(ejecutar(soloGastos, 'impuestos', {}, { facturas: F, gastos: G }, HOY), { error: 'No tienes permiso para ver estos datos' });
  assert.ok(ejecutar(admin, 'borrar_todo', {}, {}, HOY).error);
});

test('asistente: impuestos con las mismas cifras que el resto de la app', () => {
  const q3 = resumenAnual(F, G, 2026, {}, ['a']).trimestres[2];
  const r = ejecutar(admin, 'impuestos', { trimestre: 3 }, { facturas: F, gastos: G }, HOY);
  assert.deepEqual([r.trimestre, r.iva_a_pagar_303, r.irpf_a_pagar_130, r.plazo, r.en_curso], ['3T 2026', euros(q3.m303), euros(q3.m130), 'hasta el 20 de octubre de 2026', 'no']);
  const hoyT = ejecutar(admin, 'impuestos', {}, { facturas: F, gastos: G }, HOY);
  assert.deepEqual([hoyT.trimestre, hoyT.iva_a_pagar_303], ['4T 2026', euros(42 - 10.5)]);
  assert.match(hoyT.en_curso, /^sí/);
  const soc = ejecutar({ ...admin, fiscal: { tipo: 'sociedad', iva: 'exento' } }, 'impuestos', {}, { facturas: F, gastos: G }, HOY);
  assert.ok(!('irpf_a_pagar_130' in soc) && soc.iva === 'Esta empresa no presenta el 303');
});

test('asistente: facturas, clientes y gastos con sus totales', () => {
  const p = ejecutar(admin, 'facturas', { estado: 'pendientes' }, { facturas: F }, HOY);
  assert.deepEqual([p.numero_de_facturas, p.total_a_cobrar], [2, euros(importes(F[1]).total + importes(F[2]).total)]);
  const v = ejecutar(admin, 'facturas', { estado: 'vencidas' }, { facturas: F }, HOY);
  assert.deepEqual([v.numero_de_facturas, v.recientes[0].estado], [1, 'vencida desde el 2026-09-19']);
  assert.equal(ejecutar(admin, 'facturas', { cliente: 'ana lopez' }, { facturas: F }, HOY).numero_de_facturas, 2);
  const c = ejecutar(admin, 'clientes', {}, { facturas: F }, HOY);
  assert.deepEqual(c.mas_facturado_sin_iva[0], { cliente: 'Ana López', facturado: euros(1200) });
  const g = ejecutar(admin, 'gastos', { desde: '2026-10-01', hasta: '2026-10-31' }, { gastos: G }, HOY);
  assert.deepEqual([g.numero_de_gastos, g.total_con_iva, g.pendiente_de_pagar], [1, euros(60.5), euros(60.5)]);
  assert.equal(ejecutar(admin, 'gastos', { texto: 'ferreteria' }, { gastos: G }, HOY).numero_de_gastos, 1);
});

test('asistente: no deja pasar cifras que no salen de las herramientas', () => {
  assert.deepEqual(cifrasDe('Llevas 1.234,56 € de IVA, 350 euros de gastos y 12,5 de algo; en 2026 y 3T, 21 %.'), [1234.56, 350, 12.5]);
  const res = [{ iva_a_pagar_303: '1.234,56 €', gastos: '350,00 €' }];
  assert.deepEqual(cifrasInventadas('Llevas 1.234,56 € de IVA y 350 € de gastos.', res), []);
  assert.deepEqual(cifrasInventadas('En total, 1.584,56 €.', res), ['1584.56']);
  assert.deepEqual(cifrasInventadas('Llevas 9.999,99 €.', []), ['9999.99']);
});

test('asistente: el historial del navegador se limpia', () => {
  assert.deepEqual(limpiarHistorial([{ role: 'assistant', content: 'hola' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'system', content: 'x' }, { role: 'assistant', content: [1] }, { role: 'user', content: 'último' }]),
    [{ role: 'user', content: 'a\nb' }, { role: 'assistant', content: '1' }]);
  assert.deepEqual(limpiarHistorial('nada'), []);
});
