import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { filasRecibo, reciboNominaPdf } from '../lib/reciboNomina.js';
import { nominaCompleta, calculoNomina, conceptosRed } from '../lib/nominas.js';

const empleado = { nombre: 'María López', nif: '12345678Z', naf: '281234567890', puesto: 'Administrativa', alta: '2024-01-10', bruto: 2000, irpfPct: 12, cotizacion: { grupo: 7, temporal: false, pagas: 2, prorrateadas: true, atPct: 1.5 } };
const empresa = { nombre: 'Empresa SL', nif: 'B12345678', direccion: 'Calle Mayor 1', ciudad: 'Madrid', ccc: '28123456789' };
const completa = (e = empleado, opciones = { bruto: 2000 }) => ({ mes: '2026-02', empleadoNombre: e.nombre, ...nominaCompleta(e, opciones) });

test('recibo completo: identidad, periodo, cuotas e importes guardados', () => {
  const n = completa(), r = filasRecibo(n, empleado, empresa);
  // Sin cotización de solidaridad (el sueldo no pasa de la base máxima), no sale su fila.
  assert.deepEqual(r.aportacionTrabajador.map((f) => f.importe), [94, 31, 2, 3, 0]);
  assert.deepEqual(r.aportacionTrabajador.slice(0, 4).map((f) => f.porcentaje), [4.7, 1.55, .1, .15]);
  assert.deepEqual(r.aportacionEmpresa.map((f) => f.importe), [472, 110, 12, 15, 0, 4, 30]);
  // Pagas prorrateadas: de los 2.000 €, 2/14 son la prorrata de las dos pagas extra (como el concepto 0004 de RED).
  assert.deepEqual(r.devengos.map((f) => f.importe), [1714.29, 0, 285.71]);
  assert.equal(conceptosRed(n, empleado).find(([c]) => c === '0004')[2], 285.71);
  assert.deepEqual([r.bases.remuneracionMensual, r.bases.prorrata], [1714.29, 285.71]);
  assert.equal(r.totalEmpresa, 643);
  assert.equal(r.totalDevengado, 2000);
  assert.equal(r.totalDeducir, 370);
  assert.equal(r.liquido, 2000 - 240 - 130);
  assert.equal(r.liquido, calculoNomina(n).neto);
  assert.equal(r.cabecera.trabajador.grupoNombre, 'Auxiliares administrativos');
  assert.equal(r.cabecera.trabajador.naf, empleado.naf);
  assert.equal(r.cabecera.empresa.ccc, empresa.ccc);
  assert.deepEqual(r.cabecera.periodo, { desde: '2026-02-01', hasta: '2026-02-28', dias: 30, nombre: 'febrero 2026' });
  assert.equal(r.bases.contingenciasComunes, 2000);
  assert.equal(r.bases.irpf, 2000);
  assert.deepEqual(r.percepcionesNoSalariales, []);
});

test('paga extra y horas extra: separa devengos y bases con prorrata', () => {
  const e = { ...empleado, cotizacion: { ...empleado.cotizacion, temporal: true, prorrateadas: false } };
  const n = completa(e, { bruto: 4200, pagaExtra: 2000, horasExtra: 200 }), r = filasRecibo(n, e, empresa);
  assert.deepEqual(r.devengos.map((f) => f.importe), [2000, 200, 2000]);
  assert.equal(r.bases.remuneracionMensual, 2000);
  assert.equal(r.bases.prorrata, 333.33);
  assert.equal(r.bases.contingenciasComunes, 2333.33);
  assert.equal(r.bases.contingenciasProfesionales, 2533.33);
  assert.equal(r.bases.horasExtra, 200);
  assert.equal(r.bases.irpf, 4200);
  assert.equal(r.aportacionTrabajador[1].porcentaje, 1.6);
  assert.equal(r.aportacionTrabajador[4].importe, 9.4);
  assert.equal(r.liquido, calculoNomina(n).neto);
});

test('antigua por porcentajes y empleado eliminado', () => {
  const n = { mes: '2024-02', empleadoNombre: 'Nombre histórico', bruto: 2000, irpfPct: 12, ssTrabajadorPct: 6.5, ssEmpresaPct: 31.65 };
  const r = filasRecibo(n, null, empresa);
  assert.equal(r.cabecera.trabajador.nombre, 'Nombre histórico');
  assert.equal(r.cabecera.periodo.hasta, '2024-02-29');
  // El recibo simplificado desglosa la cuota sin cambiar sus importes históricos.
  assert.deepEqual(r.aportacionTrabajador.map((f) => [f.porcentaje, f.importe]), [[4.7, 94], [1.55, 31], [.1, 2], [.15, 3]]);
  assert.equal(r.aportacionEmpresa.length, 1);
  assert.equal(r.aportacionEmpresa[0].importe, 633);
  assert.equal(r.bases.contingenciasComunes, 2000);
  assert.equal(r.liquido, 1630);
  const historica = filasRecibo(completa(), null, empresa);
  assert.equal(historica.aportacionEmpresa.find((f) => f.concepto.startsWith('Accidentes')).porcentaje, 1.5);
});

test('PDF válido A4 de una página y rechazo de agrupadas', async () => {
  for (const n of [completa(), completa({ ...empleado, cotizacion: { ...empleado.cotizacion, prorrateadas: false } }, { bruto: 4200, pagaExtra: 2000, horasExtra: 200 })]) {
    const bytes = await reciboNominaPdf({ nomina: n, empleado, empresa });
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getPage(0).getWidth(), 595.28);
    assert.equal(pdf.getPage(0).getHeight(), 841.89);
  }
  assert.throws(() => filasRecibo({ ...completa(), agrupada: true }), /individual/);
});
