// Nóminas completas (lib/nominas.js): bases y cuotas de 2026, pagas extra, jornada parcial, solidaridad e IRPF del 145.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculoNomina, conceptosRed, limpiarCotizacion, limpiarDatos145, nominaCompleta } from '../lib/nominas.js';

const empleado = (extra = {}) => ({
  id: 'e1', nombre: 'Ana', nif: '12345678Z', bruto: 2000, horasSemana: 40, irpfPct: 10,
  cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: true, atPct: 1.5 }),
  datos145: limpiarDatos145({ nacimiento: 1990, situacionFamiliar: 3 }, '12345678Z'),
  ...extra,
});

test('nómina completa: cuotas por concepto de 2026 y el IRPF del algoritmo de la AEAT', () => {
  const n = nominaCompleta(empleado(), { bruto: 2000 });
  assert.deepEqual(n.importes, { bruto: 2000, irpf: 270.2, ssTrabajador: 130, ssEmpresa: 643 });
  assert.equal(n.irpfPct, 13.51);
  const t = n.detalle.cuotas.trabajador, e = n.detalle.cuotas.empresa;
  assert.deepEqual([t.contingenciasComunes, t.desempleo, t.formacion, t.mei], [94, 31, 2, 3]);
  assert.deepEqual([e.contingenciasComunes, e.desempleo, e.fogasa, e.formacion, e.mei, e.at], [472, 110, 4, 12, 15, 30]);
  // calculoNomina usa los importes guardados: neto y coste.
  const c = calculoNomina({ ...n, completa: true });
  assert.deepEqual([c.neto, c.coste], [1599.8, 2643]);
});

test('pagas sin prorratear: la del mes no sube la base (su prorrata cotiza cada mes)', () => {
  const e = empleado({ bruto: 1500, cotizacion: limpiarCotizacion({ grupo: 7, pagas: 2, prorrateadas: false, atPct: 1.5 }) });
  const normal = nominaCompleta(e, { bruto: 1500 });
  const junio = nominaCompleta(e, { bruto: 3000, pagaExtra: 1500 });
  assert.equal(normal.detalle.base, 1750); // 1.500 + 3.000 / 12
  assert.equal(junio.detalle.base, 1750);
  assert.equal(junio.importes.ssTrabajador, normal.importes.ssTrabajador);
  // El IRPF va sobre todo lo cobrado ese mes.
  assert.equal(junio.importes.irpf, Math.round(3000 * junio.irpfPct) / 100);
});

test('jornada parcial, base máxima con solidaridad, horas extra y un tipo de IRPF a mano', () => {
  // Media jornada del grupo 1: la base mínima (1.989,30) se reduce a la mitad.
  const parcial = nominaCompleta(empleado({ bruto: 900, horasSemana: 20, cotizacion: limpiarCotizacion({ grupo: 1 }) }), { bruto: 900 });
  assert.equal(parcial.detalle.base, 994.65);
  const alto = nominaCompleta(empleado({ bruto: 6000 }), { bruto: 6000 });
  assert.equal(alto.detalle.base, 5101.2);
  assert.equal(alto.detalle.exceso, 898.8);
  assert.ok(alto.detalle.cuotas.empresa.solidaridad > 0 && alto.detalle.cuotas.trabajador.solidaridad > 0);
  const extra = nominaCompleta(empleado(), { bruto: 2200, horasExtra: 200 });
  assert.equal(extra.detalle.base, 2000); // las horas extra no van a la base de comunes
  assert.equal(extra.detalle.baseAT, 2200);
  const manual = nominaCompleta(empleado(), { bruto: 2000, irpfPct: 18 });
  assert.deepEqual([manual.irpfPct, manual.importes.irpf, manual.detalle.irpf.manual], [18, 360, true]);
  // Sin modelo 145, el tipo de la ficha.
  assert.equal(nominaCompleta(empleado({ datos145: undefined }), { bruto: 2000 }).irpfPct, 10);
});

test('datos del empleado: cotización y 145 validados; conceptos para RED', () => {
  assert.match(limpiarCotizacion({ grupo: 0 }).error, /grupo/);
  assert.match(limpiarCotizacion({ grupo: 7, pagas: 6 }).error, /pagas/);
  assert.deepEqual(limpiarCotizacion({ grupo: '5', pagas: '2', atPct: '2,1', prorrateadas: false, temporal: true }), { grupo: 5, temporal: true, pagas: 2, prorrateadas: false, atPct: 2.1 });
  assert.match(limpiarDatos145({ nacimiento: 1990, situacionFamiliar: 2 }, '12345678Z').error, /cónyuge/i);
  assert.match(limpiarDatos145({ nacimiento: 1990 }, 'B12345674').error, /persona física/);
  const e = empleado();
  const n = { ...nominaCompleta(e, { bruto: 2200, horasExtra: 200 }), mes: '2026-05', completa: true };
  // Con las pagas prorrateadas, 2.000 al mes llevan 2.000 × 2 / 14 de prorrateo.
  assert.deepEqual(conceptosRed(n, e), [['0001', 'Retribución no incluida en otros apartados', 1714.29], ['0002', 'Horas extraordinarias', 200], ['0004', 'Prorrateo de las pagas extraordinarias', 285.71]]);
});
