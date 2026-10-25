// Auditoría del 23-10-2026, nóminas y cotización: días reales de los grupos 8 a 11, meses incompletos, consejeros y
// administradores, y la cotización adicional de los contratos de menos de 30 días. Esperados calculados a mano con la
// Orden PJC/297/2026 (base mínima diaria 47,48 €; mensual 1.424,40 €; contingencias comunes 23,60 + 4,70 %).
import test from 'node:test';
import assert from 'node:assert/strict';
import { diasDeAlta, limpiarCotizacion, limpiarDatos145, nominaCompleta } from '../lib/nominas.js';
import { filasRecibo } from '../lib/reciboNomina.js';

const empleado = (cot = {}, extra = {}) => ({
  id: 'e1', nombre: 'Luis', nif: '12345678Z', bruto: 1200, horasSemana: 40, irpfPct: 10,
  cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: true, ...cot }),
  datos145: limpiarDatos145({ nacimiento: 1990, situacionFamiliar: 3 }, '12345678Z'),
  ...extra,
});

test('días de alta en el mes, extremos incluidos', () => {
  assert.deepEqual(diasDeAlta({}, '2026-02'), { dias: 28, total: 28, entero: true });
  assert.deepEqual(diasDeAlta({ alta: '2026-03-16' }, '2026-03'), { dias: 16, total: 31, entero: false });
  assert.deepEqual(diasDeAlta({ alta: '2025-01-01', baja: '2026-01-10' }, '2026-01'), { dias: 10, total: 31, entero: false });
});

test('grupos 8 a 11: la base mínima va por los días naturales del mes (31 en enero, 28 en febrero)', () => {
  const e = empleado({ grupo: 8 });
  const enero = nominaCompleta(e, { bruto: 1200, mes: '2026-01' });
  assert.deepEqual([enero.detalle.dias, enero.detalle.base, enero.detalle.baseAT], [31, 1471.88, 1471.88]);
  assert.equal(enero.detalle.cuotas.trabajador.contingenciasComunes, 69.18);
  const febrero = nominaCompleta(e, { bruto: 1200, mes: '2026-02' });
  assert.deepEqual([febrero.detalle.dias, febrero.detalle.base], [28, 1329.44]);
  // En los demás grupos el mes entero cuenta como 30 días, sea cual sea.
  assert.equal(nominaCompleta(empleado(), { bruto: 1200, mes: '2026-01' }).detalle.base, 1424.4);
});

test('mes incompleto en los grupos mensuales: mínimo en proporción a los días de alta (/30)', () => {
  const e = empleado({}, { alta: '2026-03-16' });
  const n = nominaCompleta(e, { bruto: 700, mes: '2026-03' });
  assert.deepEqual([n.detalle.dias, n.detalle.base], [16, 759.68]); // 1.424,40 × 16 / 30
  assert.equal(filasRecibo({ ...n, id: 'n1', mes: '2026-03', empleado: 'e1', empleadoNombre: 'Luis' }, e).cabecera.periodo.dias, 16);
});

test('administrador asimilado: sin desempleo, FOGASA ni formación, y retención del 35 % (19 % si factura menos de 100.000 €)', () => {
  const e = empleado({ grupo: 1, administrador: 'asimilado' }, { bruto: 3000 });
  const n = nominaCompleta(e, { bruto: 3000, mes: '2026-05' });
  const { empresa, trabajador } = n.detalle.cuotas;
  assert.deepEqual([empresa.desempleo, empresa.fogasa, empresa.formacion, trabajador.desempleo, trabajador.formacion], [0, 0, 0, 0, 0]);
  assert.equal(empresa.total, 775.5); // 708 + 22,50 MEI + 45 AT
  assert.equal(trabajador.total, 145.5); // 141 + 4,50 MEI
  assert.deepEqual([n.irpfPct, n.importes.irpf, n.detalle.irpf.calculado], [35, 1050, 35]);
  assert.equal(nominaCompleta(empleado({ grupo: 1, administrador: 'asimilado', pequena: true }, { bruto: 3000 }), { bruto: 3000, mes: '2026-05' }).importes.irpf, 570);
  const recibo = filasRecibo({ ...n, id: 'n1', mes: '2026-05', empleado: 'e1', empleadoNombre: 'Luis' }, e);
  assert.ok(!recibo.deducciones.some((f) => f.concepto === 'Desempleo'));
});

test('administrador con el control (autónomo): la nómina no lleva Seguridad Social, sí la retención del 35 %', () => {
  const e = empleado({ administrador: 'autonomo', grupo: '' }, { bruto: 2500 });
  assert.equal(e.cotizacion.grupo, 1);
  const n = nominaCompleta(e, { bruto: 2500, mes: '2026-05' });
  assert.deepEqual([n.importes.ssTrabajador, n.importes.ssEmpresa, n.importes.irpf], [0, 0, 875]);
});

test('contrato temporal de menos de 30 días: 33,62 € más de la empresa en el mes de la baja, salvo sustitución', () => {
  const corto = empleado({ temporal: true }, { alta: '2026-03-02', baja: '2026-03-20' });
  const n = nominaCompleta(corto, { bruto: 800, mes: '2026-03' });
  assert.equal(n.detalle.cuotas.empresa.contratoCorto, 33.62);
  const { total, ...partes } = n.detalle.cuotas.empresa;
  assert.equal(total, Math.round(Object.values(partes).reduce((s, v) => s + v, 0) * 100) / 100);
  assert.equal(nominaCompleta(empleado({ temporal: true, sustitucion: true }, { alta: '2026-03-02', baja: '2026-03-20' }), { bruto: 800, mes: '2026-03' }).detalle.cuotas.empresa.contratoCorto, undefined);
  assert.equal(nominaCompleta(empleado({ temporal: true }, { alta: '2026-03-01', baja: '2026-03-30' }), { bruto: 800, mes: '2026-03' }).detalle.cuotas.empresa.contratoCorto, undefined);
  const recibo = filasRecibo({ ...n, id: 'n1', mes: '2026-03', empleado: 'e1', empleadoNombre: 'Luis' }, corto);
  assert.ok(recibo.aportacionEmpresa.some((f) => f.concepto.includes('menos de 30 días') && f.importe === 33.62));
});
