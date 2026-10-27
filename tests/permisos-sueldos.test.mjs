// Auditoría completa, decisiones aplicadas (22-10-2026): permiso «Contabilidad» (Codex H3) y sueldos que no se ven sin
// el permiso «Nóminas» (Codex H2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PERFILES, limpiarPermisos, perfilDe, permisosDe, puede } from '../lib/permisos.js';
import { agruparGastosNomina, agruparNominas, calculoNomina, gastoDeNomina, modelo111 } from '../lib/nominas.js';
import { generarAsientos } from '../lib/asientos.js';
import { plantillaMedia } from '../lib/cuentasAnuales.js';
import { prevision } from '../lib/tesoreria.js';
import { r2 } from '../lib/redondeo.js';

test('Contabilidad: incluye ver resumen, facturas y gastos; está en Administrador y Gestoría', () => {
  assert.deepEqual(limpiarPermisos(['contabilidad']), ['resumen', 'contabilidad', 'facturas', 'gastos']);
  assert.ok(PERFILES.find((p) => p.id === 'gestoria').permisos.includes('contabilidad'));
  assert.ok(puede({ rol: 'admin' }, 'contabilidad'));
  // Ver no basta: quien ve resumen, facturas y gastos ya no contabiliza.
  assert.ok(!puede({ rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos'], pv: 2 }, 'contabilidad'));
});

test('Contabilidad: la gestoría que ya existía la conserva; una nueva sin ella, no', () => {
  const antes = { rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos', 'nominas'] };
  assert.ok(puede(antes, 'contabilidad'));
  assert.equal(perfilDe(antes), 'Gestoría');
  const nueva = { ...antes, pv: 2 };
  assert.ok(!puede(nueva, 'contabilidad'));
  assert.equal(perfilDe(nueva), 'Personalizado');
  // Otras combinaciones de antes no ganan nada.
  assert.deepEqual(permisosDe({ rol: 'miembro', permisos: ['resumen', 'facturas', 'gastos'] }), ['resumen', 'facturas', 'gastos']);
});

const nom = (id, empleado, nombre, bruto, extra = {}) => ({ id, empleado, empleadoNombre: nombre, mes: '2026-10', bruto, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65, ...extra });
const N = [nom('n1', 'e1', 'Ana', 1800), nom('n2', 'e2', 'Luis', 2350.5), nom('n3', 'e3', 'Eva', 1200, { pagado: '2026-11-03' })];

test('nóminas agrupadas: un total por mes y día de pago, sin nombres; los importes cuadran', () => {
  const g = agruparNominas(N);
  assert.equal(g.length, 2);
  assert.deepEqual(g.map((x) => [x.empleadoNombre, x.empleados]), [['2 personas', ['e1', 'e2']], ['1 persona', ['e3']]]);
  const suma = (l, k) => r2(l.reduce((s, n) => s + calculoNomina(n)[k], 0));
  for (const k of ['bruto', 'irpf', 'ssTrabajador', 'ssEmpresa', 'neto', 'coste', 'seguros']) assert.equal(suma(g, k), suma(N, k), k);
  assert.deepEqual(modelo111(g, 2026, 4), modelo111(N, 2026, 4));
  assert.equal(plantillaMedia(g, 2026), plantillaMedia(N, 2026));
  assert.ok(!JSON.stringify(g).match(/Ana|Luis|Eva/));
});

test('gastos de nóminas agrupados: uno por mes y actividad, donde estaba el primero', () => {
  const G = [{ id: 'g1', fecha: '2026-10-05', concepto: 'Gestoría', base: 100, ivaPct: 21 }, gastoDeNomina(N[0], 'a'), { id: 'g2', fecha: '2026-10-31', concepto: 'Luz', base: 50, ivaPct: 21 }, gastoDeNomina(N[1], 'a'), gastoDeNomina(N[2], 'b')];
  const l = agruparGastosNomina(G);
  assert.deepEqual(l.map((g) => g.concepto), ['Gestoría', 'Nóminas de octubre 2026 · 2 personas', 'Luz', 'Nóminas de octubre 2026 · 1 persona']);
  assert.equal(l[1].base, r2(calculoNomina(N[0]).coste + calculoNomina(N[1]).coste));
  assert.ok(l[1].agrupado && l[1].nomina);
  assert.equal(r2(l.reduce((s, g) => s + g.base, 0)), r2(G.reduce((s, g) => s + g.base, 0)));
});

test('contabilidad con las nóminas agrupadas: mismos saldos, sin nombres', () => {
  const saldos = (as) => { const m = {}; for (const a of as) for (const l of a.lineas) m[l.cuenta] = r2((m[l.cuenta] || 0) + (l.debe || 0) - (l.haber || 0)); return m; };
  const fiscal = { tipo: 'sociedad', iva: 'general' };
  const raw = generarAsientos({ nominas: N, fiscal }, '2026-12-31'), agr = generarAsientos({ nominas: agruparNominas(N), fiscal }, '2026-12-31');
  assert.ok(raw.length > 0);
  assert.deepEqual(saldos(agr), saldos(raw));
  assert.ok(agr.some((a) => a.concepto === 'Nómina de 2 personas · 2026-10'));
  assert.ok(!agr.some((a) => /Ana|Luis|Eva/.test(a.concepto)));
});

test('tesorería sin el permiso de nóminas: una salida por mes, sin nombres ni enlaces', () => {
  const datos = { nominas: N.map((n) => ({ ...n, pagada: false })), empleados: [{ id: 'e1', nombre: 'Ana', alta: '2025-01-01', bruto: 1800, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 }], fiscal: { tipo: 'sociedad', iva: 'general' }, hoy: '2026-10-20', meses: 1 };
  const raw = prevision(datos), agr = prevision({ ...datos, agruparSueldos: true });
  const nomina = (p) => p.movimientos.filter((m) => /^(Nómina|Seguridad Social)/.test(m.concepto));
  assert.equal(r2(nomina(agr).reduce((s, m) => s + m.importe, 0)), r2(nomina(raw).reduce((s, m) => s + m.importe, 0)));
  assert.ok(nomina(agr).length < nomina(raw).length);
  assert.ok(!nomina(agr).some((m) => /Ana|Luis|Eva/.test(m.concepto) || m.url));
  assert.equal(agr.final, raw.final);
});
