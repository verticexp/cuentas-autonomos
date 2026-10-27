import test from 'node:test';
import assert from 'node:assert/strict';
import { prevision, pagadosSinExtracto } from '../lib/tesoreria.js';
import { plazosFiscales, proximoPlazoDe, avisosDelDia } from '../lib/avisos.js';
import { panelResumen } from '../lib/panel.js';
import { FISCAL_BASE } from '../lib/empresa.js';

const fiscalDe = (territorio, mas = {}) => ({ ...FISCAL_BASE, territorio, trabajadores: true, alquiler: true, ...mas });
const factura = (fecha = '2026-03-10', mas = {}) => ({ id: `f-${fecha}`, fecha, base: 10000, ivaPct: 21, irpfPct: 0, cobrada: true, actividad: 'otra', cliente: { nombre: 'Cliente' }, ...mas });
const gastos = [
  { id: 'profesional', fecha: '2026-03-10', base: 1000, ivaPct: 21, irpfPct: 15, actividad: 'otra', proveedor: 'Profesional' },
  { id: 'alquiler', fecha: '2026-03-11', base: 1000, ivaPct: 21, irpfPct: 19, actividad: 'otra', proveedor: 'Arrendador', alquiler: true },
];
// El 2T de 2026: en el País Vasco el pago fraccionado del IRPF del 1T está exonerado (normas forales de abril de 2026).
const gastos2T = gastos.map((g) => ({ ...g, fecha: g.fecha.replace('-03-', '-06-') }));
const datos2T = (territorio, mas = {}) => datos(territorio, { facturas: [factura('2026-06-10')], gastos: gastos2T, hoy: '2026-07-10', ...mas });
const datos = (territorio, mas = {}) => ({ fiscal: fiscalDe(territorio), facturas: [factura()], gastos, rend130: { 2024: 20000 }, anio: 2026, hoy: '2026-04-10', meses: 2, ...mas });
const hacienda = (d) => prevision(d).movimientos.filter((m) => m.tipo === 'hacienda');
const movimiento = (d, concepto) => {
  const m = hacienda(d).find((m) => m.concepto === concepto);
  assert.ok(m, `Falta ${concepto}`);
  return m;
};
const aviso = (fiscal, anio, fecha) => plazosFiscales(fiscal, anio).find((p) => p.fecha === fecha)?.texto || '';

test('Bizkaia: IVA, IRPF, retenciones y alquiler del 2T vencen el 27 de julio de 2026; el IRPF del 1T, exonerado', () => {
  const d = datos2T('bizkaia');
  for (const [concepto, importe] of [['IVA (303) del 2T', -1680], ['IRPF (130) del 2T', -1000], ['Retenciones (110) del 2T', -150], ['Alquiler (115) del 2T', -190]]) {
    const m = movimiento(d, concepto);
    assert.equal(m.fecha, '2026-07-27');
    assert.equal(m.importe, importe);
  }
  const texto = aviso(d.fiscal, 2026, '2026-07-27');
  for (const modelo of ['303', '130', '110', '115']) assert.match(texto, new RegExp(`${modelo}.*del 2T`));
  assert.doesNotMatch(texto, /111/);
  const p = panelResumen(d);
  assert.equal(p.plazo.fecha, '2026-07-27');
  assert.equal(p.debe.m130, 1000);
  assert.equal(p.aPagar, 2680);
  assert.equal(p.r.trimestres[0].modeloIva, 'Modelo 303');
  assert.equal(p.qAhora.m130, 1000);
  assert.equal(proximoPlazoDe(d.fiscal, '111', d.hoy), '2026-07-27');
  // 1T de 2026: sin pago fraccionado del IRPF ni aviso del 130; el resto, el 27 de abril.
  const t1 = datos('bizkaia');
  assert.ok(hacienda(t1).every((m) => m.concepto !== 'IRPF (130) del 1T'));
  assert.equal(movimiento(t1, 'IVA (303) del 1T').fecha, '2026-04-27');
  assert.doesNotMatch(aviso(t1.fiscal, 2026, '2026-04-27'), /130/);
});

test('Bizkaia: el IVA del 4T es el 390 y vence el 1 de febrero de 2027', () => {
  const d = datos('bizkaia', { facturas: [factura('2026-12-10')], gastos: [], hoy: '2027-01-27', meses: 1, pagos130: { 2026: { 4: 1000 } }, pres303: { 2026: { 4: false } } });
  const m = movimiento(d, 'IVA del 4T (390)');
  assert.equal(m.fecha, '2027-02-01');
  assert.equal(m.importe, -2100);
  const texto = aviso(d.fiscal, 2027, '2027-02-01');
  assert.match(texto, /390 del 4T/);
  assert.doesNotMatch(texto, /303/);
  assert.match(texto, /190 y 180/);
  const p = panelResumen(d);
  assert.equal(p.plazo.fecha, '2027-02-01');
  assert.equal(p.debe.modeloIva, 'Modelo 390');
  assert.equal(p.debe.pend130, false);
  assert.equal(proximoPlazoDe(d.fiscal, '303', d.hoy), '2027-02-01');
});

test('Gipuzkoa: IVA 300 del 2T el 27 de julio e IRPF el 10 de agosto de 2026', () => {
  const d = datos2T('gipuzkoa');
  assert.equal(movimiento(d, 'IVA (300) del 2T').fecha, '2026-07-27');
  assert.equal(movimiento(d, 'IRPF (130) del 2T').fecha, '2026-08-10');
  assert.equal(movimiento(d, 'IRPF (130) del 2T').importe, -1000);
  assert.match(aviso(d.fiscal, 2026, '2026-07-27'), /300 del 2T/);
  assert.doesNotMatch(aviso(d.fiscal, 2026, '2026-07-27'), /130/);
  assert.match(aviso(d.fiscal, 2026, '2026-08-10'), /130 del 2T/);
  const julio = panelResumen(d);
  assert.equal(julio.plazo.fecha, '2026-07-27');
  assert.equal(julio.aPagar, 1680);
  assert.equal(julio.debe.pend130, false);
  assert.equal(julio.debe.plazoIrpf, '2026-08-10');
  assert.equal(julio.debe.modeloIva, 'Modelo 300');
  const agosto = panelResumen({ ...d, hoy: '2026-08-01' });
  assert.equal(agosto.plazo.fecha, '2026-08-10');
  assert.equal(agosto.debe.pend303, false);
  assert.equal(agosto.debe.m130, 1000);
  assert.equal(agosto.aPagar, 1000);
  // Presentar el IVA antes de su vencimiento permite ver ya el siguiente pago.
  assert.equal(panelResumen({ ...d, pres303: { 2026: { 2: true } } }).plazo.fecha, '2026-08-10');
});

test('Álava: IRPF de oficio del 2T el 10 de agosto, sin aviso de presentar el 130', () => {
  const d = datos2T('alava');
  const m = movimiento(d, 'IRPF (pago de oficio) del 2T');
  assert.equal(m.fecha, '2026-08-10');
  assert.equal(m.importe, -1000);
  assert.equal(movimiento(d, 'Alquiler (115-A) del 2T').fecha, '2026-07-27');
  assert.ok(plazosFiscales(d.fiscal, 2026).every((p) => !p.texto.includes('130')));
  assert.ok(avisosDelDia({ fiscal: d.fiscal }, '2026-08-09').every((a) => !a.titulo.includes('130')));
  assert.equal(proximoPlazoDe(d.fiscal, '130', d.hoy), null);
  const p = panelResumen({ ...d, hoy: '2026-08-01' });
  assert.equal(p.plazo.fecha, '2026-08-10');
  assert.equal(p.debe.modeloIrpf, 'IRPF (pago de oficio)');
  assert.equal(p.debe.m130, 1000);
  assert.equal(p.aPagar, 1000);
});

test('Navarra: F-69 e IRPF del 2T el 5 de agosto; retenciones 715 y alquiler 759 el 20 de julio', () => {
  const d = datos('navarra', { facturas: [factura('2026-06-10')], gastos: gastos.map((g) => ({ ...g, fecha: g.fecha.replace('-03-', '-06-') })), hoy: '2026-07-15' });
  assert.equal(movimiento(d, 'IVA (F-69) del 2T').fecha, '2026-08-05');
  assert.equal(movimiento(d, 'IRPF (130) del 2T').fecha, '2026-08-05');
  assert.equal(movimiento(d, 'IRPF (130) del 2T').importe, -600);
  assert.equal(movimiento(d, 'Retenciones (715) del 2T').fecha, '2026-07-20');
  assert.equal(movimiento(d, 'Alquiler (759) del 2T').fecha, '2026-07-20');
  assert.match(aviso(d.fiscal, 2026, '2026-08-05'), /F-69 del 2T; 130 del 2T/);
  assert.match(aviso(d.fiscal, 2026, '2026-07-20'), /715 y 759 del 2T/);
  const p = panelResumen(d);
  assert.equal(p.plazo.fecha, '2026-08-05');
  assert.equal(p.debe.modeloIva, 'Modelo F-69');
  assert.equal(p.debe.m130, 600);
  assert.equal(p.aPagar, 2280);
  assert.equal(p.qAhora.m130, 600);
});

test('Navarra: S-91 del 30 % de la cuota anterior el 20 de octubre, sin 202 en abril o diciembre', () => {
  const d = datos('navarra', { fiscal: fiscalDe('navarra', { tipo: 'sociedad' }), facturas: [], gastos: [], cuotaIS: { 2025: 10000 }, hoy: '2026-01-01', meses: 11 });
  const m = movimiento(d, 'Impuesto sobre Sociedades (S-91) de octubre');
  assert.equal(m.fecha, '2026-10-20');
  assert.equal(m.importe, -3000);
  assert.ok(hacienda(d).every((m) => !m.concepto.includes('(202)')));
  const plazos = plazosFiscales(d.fiscal, 2026, { cuotaIS: d.cuotaIS });
  assert.match(plazos.find((p) => p.fecha === '2026-10-20').texto, /S-91/);
  assert.ok(plazos.every((p) => !p.texto.includes('202')));
  assert.equal(proximoPlazoDe(d.fiscal, '202', '2026-04-01', { cuotaIS: d.cuotaIS }), '2026-10-20');
  assert.ok(hacienda({ ...d, pagos202: { 2026: { 2: 3000 } } }).every((m) => !m.concepto.includes('S-91')));
  assert.ok(hacienda({ ...d, cuotaIS: { 2025: -100 } }).every((m) => !m.concepto.includes('S-91')));
  assert.ok(plazosFiscales(d.fiscal, 2026, { cuotaIS: {} }).every((p) => !p.texto.includes('S-91')));
});

test('País Vasco: no inventa una previsión de Sociedades ni usa el 202; avisa del 203 en octubre', () => {
  for (const territorio of ['alava', 'bizkaia', 'gipuzkoa']) {
    for (const base of [100000, 10000000, 12000000]) {
      const d = datos(territorio, { fiscal: fiscalDe(territorio, { tipo: 'sociedad' }), facturas: [factura('2025-03-10', { base })], gastos: [], cuotaIS: { 2025: 10000 }, hoy: '2026-01-01', meses: 11 });
      assert.ok(hacienda(d).every((m) => !m.concepto.includes('Sociedades')));
      assert.match(aviso(d.fiscal, 2026, '2026-10-26'), /203/);
      assert.ok(plazosFiscales(d.fiscal, 2026).every((p) => !p.texto.includes('202')));
    }
  }
});

test('Forales: conserva las marcas 303/130/111/115 y sus claves de pagos', () => {
  const d = datos('alava', { pres303: { 2026: { 1: true } }, pagos130: { 2026: { 1: 1000 } }, pres111: { 2026: { 1: true } }, pres115: { 2026: { 1: true } } });
  assert.equal(hacienda({ ...d, meses: 1 }).length, 0);
  assert.equal(panelResumen(d).debe, null);
  const pagados = pagadosSinExtracto({ ...d, saldo: { fecha: '2026-04-01' }, pagadosHacienda: {
    '2026-1-303': { fecha: '2026-04-27' }, '2026-1-130': { fecha: '2026-05-11' },
    '2026-1-111': { fecha: '2026-04-27' }, '2026-1-115': { fecha: '2026-04-27' },
  } });
  assert.deepEqual(pagados.map((p) => [p.modelo, p.importe]), [['303', 1680], ['130', 1000], ['111', 150], ['115', 190]]);
  const vencido = movimiento(datos('bizkaia', { hoy: '2026-05-01', meses: 0 }), 'Retenciones (110) del 1T');
  assert.deepEqual(vencido.pregunta, { modelo: '111', anio: 2026, t: 1 });
  assert.equal(vencido.fecha, '2026-05-01');
  assert.match(vencido.detalle, /27\/04/);
});

test('Forales: si el pago es desconocido no se prevé ni se sustituye por el 130 de la AEAT', () => {
  // Álava, el año siguiente al inicio: lo liquida la Diputación con los pagos del primer año.
  const d = datos('alava', { facturas: [factura('2025-03-10'), factura()], rend130: {} });
  assert.ok(hacienda(d).every((m) => !m.concepto.includes('IRPF')));
  const p = panelResumen({ ...d, hoy: '2026-05-01' });
  assert.equal(p.debe.m130, null);
  assert.equal(p.r.trimestres[0].m130, null);
  assert.equal(p.qAhora.m130, null);
  assert.equal(p.debe.irpfForal.deOficio, true);
});

test('Forales: el rendimiento del penúltimo año en las facturas prevalece sobre el escrito', () => {
  const d = datos2T('bizkaia', { facturas: [factura('2024-03-10', { base: 20000 }), factura('2026-06-10')], gastos: [] });
  // Rendimiento neto de 2024: 20.000 menos 1.000 de difícil justificación; 5 % = 950 por trimestre.
  assert.equal(movimiento(d, 'IRPF (130) del 2T').importe, -950);
  const p = panelResumen(d);
  assert.equal(p.debe.m130, 950);
  assert.equal(p.debe.irpfForal.origen, 'fisquo');
  assert.equal(p.qAhora.m130, 950);
});

test('Forales: los primeros años usan el cálculo territorial de cada trimestre', () => {
  const d = datos('bizkaia', { facturas: [factura(), factura('2026-06-10', { base: 2000 })], gastos: [], rend130: {}, hoy: '2026-07-10', meses: 0 });
  assert.equal(movimiento(d, 'IRPF (130) del 2T').importe, -400);
  const p = panelResumen(d);
  assert.equal(p.debe.m130, 400);
  assert.equal(p.r.trimestres[0].m130, 0); // 1T de 2026 exonerado (sin él serían 2.000: el 20 % de 10.000)
  assert.equal(p.r.trimestres[1].m130, 400);
});

test('Forales: no añade avisos 349 ni 369 aunque estén activados', () => {
  for (const territorio of ['navarra', 'alava', 'bizkaia', 'gipuzkoa']) {
    const fiscal = fiscalDe(territorio, { intracom: true, oss: true });
    assert.ok(plazosFiscales(fiscal, 2026).every((p) => !/349|369/.test(p.texto)));
  }
  const comun = plazosFiscales(fiscalDe('comun', { intracom: true, oss: true }), 2026);
  assert.ok(comun.some((p) => p.texto.includes('349')));
  assert.ok(comun.some((p) => p.texto.includes('369')));
});

test('Territorio común: conserva modelos, importes y plazos de abril y enero', () => {
  const d = datos('comun');
  assert.equal(movimiento(d, 'IVA (303) del 1T').fecha, '2026-04-20');
  assert.equal(movimiento(d, 'IRPF (130) del 1T').fecha, '2026-04-20');
  assert.equal(movimiento(d, 'IRPF (130) del 1T').importe, -1520);
  assert.match(aviso(d.fiscal, 2026, '2026-04-20'), /303, 130, 111 y 115 del 1T/);
  assert.match(aviso(d.fiscal, 2026, '2026-01-20'), /111 y 115 del 4T/);
  assert.match(aviso(d.fiscal, 2026, '2026-01-30'), /303 y 130 del 4T/);
  const p = panelResumen(d);
  assert.equal(p.plazo.fecha, '2026-04-20');
  assert.equal(p.debe.m130, 1520);
  assert.equal(p.aPagar, 3200);
  const enero = datos('comun', { hoy: '2026-01-22', facturas: [factura('2025-12-10')], gastos: [], meses: 1 });
  assert.equal(movimiento(enero, 'IVA (303) del 4T').fecha, '2026-01-30');
  assert.equal(panelResumen(enero).plazo.fecha, '2026-01-30');
});

test('Canarias: conserva el 420 y separa su plazo de enero del 130', () => {
  const d = datos('canarias', { facturas: [factura('2025-12-10', { ivaPct: 7, impuesto: 'igic' })], gastos: [], hoy: '2026-01-22', meses: 1 });
  assert.equal(movimiento(d, 'IGIC (420) del 4T').fecha, '2026-02-02');
  assert.equal(movimiento(d, 'IRPF (130) del 4T').fecha, '2026-01-30');
  assert.match(aviso(d.fiscal, 2026, '2026-01-30'), /130 del 4T/);
  assert.match(aviso(d.fiscal, 2026, '2026-02-02'), /420 del 4T y 425/);
  const p = panelResumen(d);
  assert.equal(p.plazo.fecha, '2026-01-30');
  assert.equal(p.igic, true);
  assert.equal(p.foral, false);
});
