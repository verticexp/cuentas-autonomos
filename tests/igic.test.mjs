import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPOS_IGIC, tipoIgicValido, casillas420, liquidaciones420, plazo420, modelo425 } from '../lib/igic.js';

const fac = (fecha, base, ivaPct, extra = {}) => ({ fecha, base, ivaPct, ...extra });
const gas = (fecha, base, ivaPct, extra = {}) => ({ fecha, base, ivaPct, ...extra });

test('tipos IGIC 2026 y validación', () => {
  assert.deepEqual(TIPOS_IGIC, [0, 1, 3, 5, 7, 9.5, 15, 20]);
  assert.equal(Object.isFrozen(TIPOS_IGIC), true);
  for (const p of TIPOS_IGIC) assert.equal(tipoIgicValido(p), true);
  assert.equal(tipoIgicValido(21), false);
});

test('420: seis casillas por tipo, cero, rectificación, deducciones, ISP, importación y compensación agraria', () => {
  const facturas = [fac('2026-02-02', 100, 7), fac('2026-02-03', 100, 7), fac('2026-02-04', 50, 3), fac('2026-02-05', 100, 0), fac('2026-03-01', -20, 7, { rectifica: { id: 'f1' } }), fac('2026-03-02', 200, 0, { operacion: 'exportacion' })];
  const gastos = [gas('2026-02-10', 100, 7), gas('2026-02-11', 4000, 7, { inversion: true }), gas('2026-02-12', 200, 5, { importacion: true }), gas('2026-02-13', 100, 3, { isp: true }), gas('2026-02-14', 100, 0, { compensacion: 12 })];
  const c = casillas420(facturas, gastos, 2026, 1);
  assert.deepEqual([c['01'], c['02'], c['03'], c['04'], c['05'], c['06']], [200, 7, 14, 50, 3, 1.5]);
  assert.deepEqual([c['07'], c['08'], c['09']], [100, 0, 0]);
  assert.deepEqual([c['19'], c['20'], c['21'], c['22'], c['25']], [100, 3, -20, -1.4, 17.1]);
  assert.deepEqual([c['26'], c['27'], c['28'], c['29'], c['30'], c['31'], c['32'], c['33']], [200, 10, 4000, 280, 200, 10, 0, 0]);
  assert.deepEqual([c['34'], c['35'], c['36'], c['40'], c['41']], [0, 0, 12, 312, -294.9]);
  assert.equal(c['46'], 200);
  assert.equal(c['47'], 0);
  for (const k of ['23','24','37','38','39','42','44']) assert.equal(c[k], 0);
});

test('420: inversión del sujeto pasivo deduce solo la parte permitida; operación no sujeta va a 47', () => {
  const c = casillas420([fac('2026-04-01', 300, 0, { operacion: 'isp' })], [gas('2026-04-02', 100, 3, { isp: true, deduciblePct: 50 })], 2026, 2);
  assert.deepEqual([c['19'], c['20'], c['27'], c['41'], c['47']], [100, 3, 1.5, 1.5, 300]);
});

test('liquidaciones: saldo negativo se arrastra y se compensa en el trimestre siguiente; 4T devuelve saldo restante', () => {
  const f = [fac('2026-05-01', 1000, 7)];
  const g = [gas('2026-02-01', 2000, 7)];
  const l = liquidaciones420(f, g, 2026);
  assert.deepEqual(l.map((x) => [x.bruto, x.anterior, x['43'], x['45'], x.pendiente]), [[-140, 0, 0, -140, 140], [70, 140, 140, -70, 70], [0, 70, 70, -70, 70], [0, 70, 70, -70, 70]]);
  const dev = liquidaciones420(f, g, 2026, { devolucion4T: true });
  assert.deepEqual([dev[3].devolucion, dev[3].pendiente, dev[3]['45']], [70, 0, -70]);
});

test('más de seis tipos conserva los restantes en otros e informa el exceso', () => {
  const f = [0, 1, 3, 5, 7, 9.5, 15, 20].map((p) => fac('2026-01-10', 100, p));
  const c = casillas420(f, [], 2026, 1);
  assert.equal(c.demasiadosTipos, true);
  assert.deepEqual(c.otros.map((x) => x.pct), [1, 0]);
  assert.deepEqual(c.otros.map((x) => x.base), [100, 100]);
  assert.equal(c['25'], 60.5);
});

test('plazos 420: días 20 y fin de semana del 31 de enero', () => {
  assert.equal(plazo420(2026, 1), '2026-04-20');
  assert.equal(plazo420(2026, 2), '2026-07-20');
  assert.equal(plazo420(2026, 3), '2026-10-20');
  assert.equal(plazo420(2025, 4), '2026-02-02');
});

test('425 resume devengado por tipo, deducciones y resultado de cada trimestre', () => {
  const m = modelo425([fac('2026-01-10', 100, 7), fac('2026-04-10', 200, 3)], [gas('2026-01-12', 50, 7)], 2026);
  assert.deepEqual(m.devengadoPorTipo, [{ pct: 7, base: 100, cuota: 7 }, { pct: 3, base: 200, cuota: 6 }]);
  assert.equal(m.totalDevengado, 13);
  assert.deepEqual(m.deducciones, { corrientes: 3.5, bienesInversion: 0, importacionesCorrientes: 0, importacionesInversion: 0, rectificaciones: 0, compensaciones: 0, total: 3.5 });
  assert.deepEqual(m.resultadosTrimestrales, [3.5, 6, 0, 0]);
});

// Esperados calculados sobre los expedientes de prueba y las instrucciones oficiales del 420:
// casillas 01-18 y 46-47 por operación/línea; 19-20 ISP; 26-35 bases sin prorratear;
// 43/45 saldo anterior y resultado. No se derivan de las funciones que comprobamos.
import { limpiarActividades, limpiarFiscal, modelosDe, reccDe, usa303, usaIgic } from '../lib/empresa.js';
import { validarFactura, validarGasto } from '../lib/validacion.js';
import { formatoDoc, IDIOMAS_FACTURA } from '../lib/idiomas.js';
import { plazosFiscales } from '../lib/avisos.js';
import { prevision, pagadosSinExtracto } from '../lib/tesoreria.js';
import { panelResumen } from '../lib/panel.js';
import { costeAfecto, ivaNoDeducible } from '../lib/ivaDeducible.js';
import { costeGasto, ivaGasto } from '../lib/calculos.js';
import { limpiar } from '../lib/facturas.js';
import { facturaHtml } from '../lib/facturaHtml.js';
import { facturaPdf } from '../lib/pdf.js';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

const fiscalCanarias = limpiarFiscal({ territorio: 'canarias', tipo: 'sociedad', iva: 'general' });
const actividad = { id: 'servicios', nombre: 'Servicios', ivaPct: 7, irpfPct: 0, serie: '' };
const documento = (extra = {}) => ({ id: '2026-1', numero: 1, anio: 2026, fecha: '2026-01-10', actividad: 'servicios', cliente: { nombre: 'Cliente' }, concepto: 'Servicios', base: 1000, ivaPct: 7, irpfPct: 0, ...extra });

test('420: solo las líneas al cero de una operación mixta van a 46/47', () => {
  for (const [operacion, casilla] of [['exportacion', '46'], ['isp', '47'], ['servicios-fuera', '47']]) {
    const c = casillas420([documento({ operacion, lineas: [{ concepto: 'Gravada', cantidad: 1, precio: 100, ivaPct: 7 }, { concepto: 'Cero', cantidad: 1, precio: 200, ivaPct: 0 }] })], [], 2026, 1);
    assert.deepEqual([c['01'], c['02'], c['03'], c['25'], c[casilla]], [100, 7, 7, 7, 200], operacion);
    assert.equal(c[casilla === '46' ? '47' : '46'], 0);
  }
});

test('420: proveedor extranjero sin IGIC no inventa un 21 %; cuota real, importación e ISP deducibles en parte', () => {
  const gastos = [gas('2026-01-01', 100, 0, { proveedor: 'Proveedor UE', proveedorNif: 'IE6388047V', origen: 'ue' }), gas('2026-01-02', 100, 7, { deduciblePct: 50 }), gas('2026-01-03', 200, 7, { importacion: true, deduciblePct: 50 }), gas('2026-01-04', 100, 7, { isp: true, deduciblePct: 50 })];
  const c = casillas420([], gastos, 2026, 1);
  assert.deepEqual([c['19'], c['20'], c['26'], c['27'], c['30'], c['31'], c['40'], c['41']], [100, 7, 300, 7, 200, 7, 14, -7]);
  const g = { ...gastos[0], impuesto: 'igic', deduciblePct: 0 };
  assert.equal(ivaGasto(g).auto, 0);
  assert.equal(costeGasto(g), 100);
  assert.equal(costeAfecto(g), 100);
  assert.equal(ivaNoDeducible(g), 0);
});

test('420: arrastra desde el primer ejercicio y respeta devolución de un 4T anterior en pres303', () => {
  const f = [fac('2026-01-10', 1000, 7)];
  const g = [gas('2023-02-01', 2000, 7)];
  const l = liquidaciones420(f, g, 2026);
  assert.deepEqual([l[0].anterior, l[0].compensado, l[0].ingresar, l[0].pendiente, l[0]['45']], [140, 70, 0, 70, -70]);
  const dev = liquidaciones420(f, g, 2026, { pres303: { 2023: { 4: 'devolucion' } } });
  assert.deepEqual([dev[0].anterior, dev[0].ingresar, dev[0].pendiente], [0, 70, 0]);
  const actual = liquidaciones420(f, g, 2026, { pres303: { 2026: { 4: 'devolucion' } } });
  assert.deepEqual([actual[3].devolucion, actual[3].pendiente], [70, 0]);
});

test('Canarias: conserva deducción, elimina opciones incompatibles y ofrece 420/425 con el resto de modelos AEAT', () => {
  const f = limpiarFiscal({ territorio: 'canarias', tipo: 'autonomo', iva: 'recargo', intracom: true, oss: true, recc: { desde: '2026-01-01' }, rebu: true, reav: true, trabajadores: true, alquiler: true });
  assert.equal(usaIgic(f), true);
  assert.equal(usa303(f), true);
  assert.equal(f.iva, 'general');
  assert.equal(f.intracom, false);
  for (const k of ['oss', 'recc', 'rebu', 'reav']) assert.equal(f[k], undefined);
  assert.equal(reccDe({ ...f, recc: { desde: '2026-01-01' } }), undefined);
  // El 415 (operaciones con terceros de la Agencia Tributaria Canaria) va junto al 347 (auditoría 23-10-2026, F1-16).
  assert.deepEqual(modelosDe(f).map((m) => m.id), ['420', '425', '130', '111', '190', '115', '180', '347', '415', '100']);
  assert.ok(modelosDe(f).filter((m) => ['420', '425'].includes(m.id)).every((m) => m.calcula));
  assert.deepEqual(modelosDe(fiscalCanarias).map((m) => m.id), ['420', '425', '347', '415', '200', '202', 'rm-libros', 'rm-cuentas']);
  assert.equal(usaIgic(limpiarFiscal({})), false);
  assert.equal(limpiarFiscal({}).territorio, undefined);
  assert.ok(modelosDe({}).some((m) => m.id === '303'));
});

test('Canarias: tipos permitidos en factura simple, líneas, gasto y actividades; rechaza 21 y no confía en impuesto del cuerpo', () => {
  for (const p of TIPOS_IGIC) {
    assert.equal(validarFactura(documento({ ivaPct: p }), { igic: true }).ok, true, `factura ${p}`);
    assert.equal(validarFactura(documento({ lineas: [{ concepto: 'Línea', cantidad: 1, precio: 100, ivaPct: p }] }), { igic: true }).ok, true, `línea ${p}`);
    assert.equal(validarGasto(gas('2026-01-10', 100, p, { concepto: 'Compra' }), { igic: true }).ok, true);
    assert.equal(limpiarActividades([{ ...actividad, ivaPct: p }], [], new Set(), { igic: true }).actividades[0].ivaPct, p);
  }
  assert.ok(validarFactura(documento({ ivaPct: 21 }), { igic: true }).errores.ivaPct);
  assert.ok(validarFactura(documento({ lineas: [{ concepto: 'X', cantidad: 1, precio: 100, ivaPct: 21 }] }), { igic: true }).errores['lineas.0.ivaPct']);
  assert.ok(validarGasto(gas('2026-01-10', 100, 21, { concepto: 'Compra' }), { igic: true }).errores.ivaPct);
  assert.ok(limpiarActividades([{ ...actividad, ivaPct: 21 }], [], new Set(), { igic: true }).error);
  assert.equal(validarFactura(documento({ impuesto: 'igic' })).ok, false);
  const f = limpiar(documento(), [actividad], true, { igic: true });
  assert.equal(f.impuesto, 'igic');
  assert.equal(f.ivaPct, 7);
  for (const extra of [{ recargo: true }, { oss: { pais: 'FR' } }, { margen: 'rebu' }]) assert.ok(limpiar(documento(extra), [actividad], true, { igic: true }).error);
});

test('Documentos: IGIC en todos los idiomas, sin alterar los textos IVA anteriores', async () => {
  const emisor = { nombre: 'Empresa Canaria', nif: 'B12345674' };
  for (const { id: idioma } of IDIOMAS_FACTURA) {
    const f = documento({ impuesto: 'igic', idioma });
    assert.equal(formatoDoc(f).t.iva, 'IGIC');
    assert.match(facturaHtml(f, emisor), /IGIC/);
    const pdf = await PDFDocument.load(await facturaPdf(f, emisor));
    const contenido = [...pdf.context.enumerateIndirectObjects()].filter(([, obj]) => obj instanceof PDFRawStream).map(([, obj]) => Buffer.from(decodePDFRawStream(obj).decode()).toString()).join('\n');
    // pdf-lib escribe las fuentes estándar en hexadecimal: IGIC = 49 47 49 43.
    assert.match(contenido, /49474943/);
    assert.notEqual(formatoDoc({ idioma }).t.iva, 'IGIC');
  }
});

test('Calendario Canarias: 420 trimestral y 425 en enero, sin 303/390/349/369 y sin mover los plazos de IRPF', () => {
  const f = limpiarFiscal({ territorio: 'canarias', tipo: 'autonomo', iva: 'general', trabajadores: true, intracom: true });
  const p = plazosFiscales(f, 2026);
  assert.match(p.find((p) => p.fecha === '2026-02-02').texto, /420 del 4T y 425/);
  assert.match(p.find((p) => p.fecha === '2026-01-30').texto, /130 del 4T/);
  assert.match(p.find((p) => p.fecha === '2026-01-20').texto, /111 del 4T/);
  for (const fecha of ['2026-04-20', '2026-07-20', '2026-10-20']) assert.match(p.find((p) => p.fecha === fecha).texto, /420/);
  assert.doesNotMatch(p.map((p) => p.texto).join(' '), /303|390|349|369/);
});

test('Tesorería y Resumen: liquidación 420 compensada, marca compartida y pagos sin extracto', () => {
  const facturas = [documento({ cobrada: true })];
  const gastos = [gas('2025-12-01', 200, 7, { impuesto: 'igic' })];
  const opciones = { facturas, gastos, fiscal: fiscalCanarias, hoy: '2026-04-01', meses: 0 };
  const p = prevision(opciones);
  assert.equal(p.hacienda, 56); // 70 de ventas menos 14 pendientes del año anterior.
  assert.deepEqual(p.movimientos.map((x) => [x.concepto, x.importe, x.fecha]), [['IGIC (420) del 1T', -56, '2026-04-20']]);
  assert.equal(prevision({ ...opciones, pres303: { 2026: { 1: true } } }).hacienda, 0);
  const saldo = { importe: 1000, fecha: '2026-04-01' };
  const pago = pagadosSinExtracto({ ...opciones, saldo, pagadosHacienda: { '2026-1-420': { fecha: '2026-04-20' } } });
  assert.deepEqual(pago.map((x) => [x.modelo, x.concepto, x.importe]), [['420', 'IGIC (420)', 56]]);
  const vencido = prevision({ ...opciones, hoy: '2026-04-21' }).movimientos[0];
  assert.equal(vencido.pregunta.modelo, '420');
  const panel = panelResumen({ ...opciones, anio: 2026, actividades: [actividad] });
  assert.equal(panel.impuesto, 'IGIC (420)');
  assert.equal(panel.r.trimestres[0].ivaIngresar, 56);
  assert.equal(panel.aPagar, 56);
});

test('Tesorería Canarias: 4T en febrero por el 31 de enero inhábil; el 130 conserva el 30', () => {
  const p = prevision({ fiscal: fiscalCanarias, facturas: [documento({ fecha: '2025-12-01', cobrada: true })], hoy: '2026-01-01', meses: 1 });
  assert.deepEqual(p.movimientos.map((m) => [m.fecha, m.concepto, m.importe]), [['2026-02-02', 'IGIC (420) del 4T', -70]]);
  const soloEnero = prevision({ fiscal: fiscalCanarias, facturas: [documento({ fecha: '2025-12-01', cobrada: true })], hoy: '2026-01-01', meses: 0 });
  assert.equal(soloEnero.hacienda, 0);
});

test('420: una exenta sin derecho a deducción no va en la 46 (solo las exportaciones)', () => {
  const c = casillas420([fac('2026-05-02', 300, 0, { operacion: 'exenta' }), fac('2026-05-03', 200, 0, { operacion: 'exportacion' })], [], 2026, 2);
  assert.equal(c['46'], 200);
  assert.deepEqual([c['01'], c['47']], [0, 0]);
});

test('Canarias: una venta a la UE no es intracomunitaria; Verifactu declara el IGIC con el impuesto 03', async () => {
  const { validarFactura } = await import('../lib/validacion.js');
  const { registroAlta } = await import('../lib/verifactu.js');
  const { xmlAlta } = await import('../lib/verifactuXml.js');
  const b = { fecha: '2026-05-02', cliente: { nombre: 'Client SARL', nif: 'FR12345678901' }, concepto: 'Diseño', base: 100, ivaPct: 0, irpfPct: 0 };
  assert.match(validarFactura({ ...b, operacion: 'servicios-ue' }, { igic: true }).errores.operacion, /exportación o una operación no sujeta/);
  assert.equal(validarFactura({ ...b, operacion: 'servicios-fuera' }, { igic: true }).ok, true);
  const sistema = { nombre: 'Empresa de Fisquo SL', nif: 'B12345674', version: '1.0', instalacion: 'emp1' };
  const f = { id: 'c1', numero: 1, anio: 2026, fecha: '2026-05-02', base: 100, ivaPct: 7, irpfPct: 0, concepto: 'Diseño', impuesto: 'igic', cliente: { nombre: 'Cliente SL', nif: 'B87654321' } };
  const xml = xmlAlta(registroAlta(f, 'B11111111', '', '2026-05-02T10:00:00+01:00'), { factura: f, emisorNombre: 'Canarias SL', anterior: null, sistema, fiscal: { iva: 'general', territorio: 'canarias' } });
  assert.match(xml, /<sum1:Impuesto>03<\/sum1:Impuesto>/);
  assert.ok(!xml.includes('<sum1:Impuesto>01</sum1:Impuesto>'));
});
