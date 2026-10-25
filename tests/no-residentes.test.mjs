// Modelos 216 y 296: retenciones a no residentes sin establecimiento permanente (lib/noResidentes.js, lib/modelos.js).
// Esperados hechos a mano con los tipos del art. 25 TRLIRNR (24 %, 19 % en la UE y el EEE) y las casillas del diseño de
// registro del 216 (2024 y siguientes) y del 296.
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelo115, modelo180, modelo190, modelo216, modelo296, modelo347, retencionesProfesionales } from '../lib/modelos.js';
import { importes } from '../lib/calculos.js';
import { nuevoGasto, gastoEditado } from '../lib/gastoCuerpo.js';
import { validarGasto } from '../lib/validacion.js';
import { errorNoResidente, nifExtranjero, paisDeNif, propuestaNoResidente, subclave296, tipoGeneral } from '../lib/noResidentes.js';
import { modelosAPresentar } from '../lib/presentar.js';
import { modelosDe } from '../lib/empresa.js';
import { prevision, pagadosSinExtracto } from '../lib/tesoreria.js';
import { generarAsientos } from '../lib/asientos.js';
import { datosPaquete } from '../lib/paquete.js';

// Alquiler del local a un arrendador que vive en Francia (19 %): 1.000 € al mes, enero a marzo.
const frances = (mes) => ({ id: `fr${mes}`, fecha: `2026-0${mes}-01`, base: 1000, ivaPct: 0, origen: 'ue', alquiler: true, concepto: 'Alquiler local', proveedor: 'Jean Dupont', proveedorNif: 'FR40303265045', noResidente: { pais: 'FR', clave: 14, pct: 19 } });
// Diseñadora de EE. UU. (24 %), facturada el 10 y pagada el 15 de febrero. Un irpfPct antiguo no la lleva al 111.
const eeuu = { id: 'us', fecha: '2026-02-10', pagado: '2026-02-15', base: 2000, ivaPct: 0, origen: 'fuera', irpfPct: 15, concepto: 'Diseño web', proveedor: 'Acme Design LLC', proveedorNif: '12-3456789', noResidente: { pais: 'US', clave: 19, pct: 24 } };
// Empresa alemana con certificado de residencia: el convenio deja exentos sus beneficios empresariales (0 %). Facturada en
// marzo, pagada el 2 de abril: va al 216 del 2T (fecha de pago).
const aleman = { id: 'de', fecha: '2026-03-20', pagado: '2026-04-02', base: 1500, ivaPct: 0, origen: 'ue', concepto: 'Licencias', proveedor: 'Software GmbH', proveedorNif: 'DE123456789', noResidente: { pais: 'DE', clave: 15, pct: 0, motivo: 'convenio' } };
// Lo de siempre, que sigue en el 111 y el 115.
const gestoria = { id: 'ge', fecha: '2026-03-05', base: 300, ivaPct: 21, irpfPct: 15, concepto: 'Gestoría', proveedor: 'Gestoría SL', proveedorNif: 'B12345674' };
const casero = { id: 'ca', fecha: '2026-01-31', base: 600, ivaPct: 21, alquiler: true, concepto: 'Almacén', proveedor: 'Casero SL', proveedorNif: 'B76543214' };
// Sin pagar: aún no va en ningún 216.
const pendiente = { ...eeuu, id: 'us2', fecha: '2026-03-28', pagado: undefined, pendiente: true };
const G = [frances(1), frances(2), frances(3), eeuu, aleman, gestoria, casero, pendiente];

test('importes: la retención del no residente (24 %), también en el alquiler (no el 19 % del 115)', () => {
  assert.deepEqual(importes(eeuu), { base: 2000, iva: 0, irpf: 480, total: 1520 });
  assert.equal(importes({ ...frances(1), noResidente: { pais: 'US', clave: 14, pct: 24 } }).irpf, 240);
  assert.equal(importes(aleman).irpf, 0);
});

test('216 del 1T: alquiler del francés (3 × 190) y la diseñadora de EE. UU. (480), en «resto de rentas»', () => {
  const m = modelo216(G, 2026, 1);
  assert.deepEqual(m.c, { '05': 0, '06': 4, '07': 4, '08': 0, '09': 5000, 10: 5000, 11: 0, 12: 1050, 13: 1050, 14: 0, 15: 0, 16: 0, 17: 0, 18: 0, 19: 0, 20: 0, 21: 1050 });
  assert.deepEqual([m.rentas, m.perceptores, m.base, m.retenciones, m.negativa], [4, 2, 5000, 1050, false]);
});

test('216 del 2T: la renta exenta por convenio va sin retención (casillas 15, 16, 18 y 19) y la declaración es negativa', () => {
  const m = modelo216(G, 2026, 2);
  assert.deepEqual([m.c['07'], m.c['13'], m.c['15'], m.c['16'], m.c['18'], m.c['19'], m.c['21']], [0, 0, 1, 1, 1500, 1500, 0]);
  assert.deepEqual([m.rentas, m.negativa], [1, true]);
  assert.deepEqual([modelo216(G, 2026, 3).rentas, modelo216(G, 2026, 3).negativa], [0, false]);
});

test('216: los dividendos van aparte (casillas 05, 08 y 11)', () => {
  const div = { id: 'dv', fecha: '2026-05-10', base: 1000, ivaPct: 0, concepto: 'Dividendo', proveedor: 'Socio', noResidente: { pais: 'PT', clave: 1, pct: 19 } };
  const m = modelo216([div, eeuu, { ...eeuu, id: 'u3', fecha: '2026-05-11', pagado: undefined }], 2026, 2);
  assert.deepEqual([m.c['05'], m.c['08'], m.c['11'], m.c['06'], m.c['09'], m.c['12'], m.c['13']], [1, 1000, 190, 1, 2000, 480, 670]);
});

test('296: por perceptor, con su país, clave, subclave y porcentaje; lo exento por convenio, al 0 % (subclave 04)', () => {
  const m = modelo296(G, 2026);
  assert.deepEqual(m.perceptores.map((p) => [p.nombre, p.nif, p.nifResidencia, p.pais, p.clave, p.subclave, p.pct, p.rentas, p.base, p.retenciones, p.devengo]), [
    ['Acme Design LLC', '', '12-3456789', 'US', 19, '01', 24, 1, 2000, 480, '2026-02-10'],
    ['Jean Dupont', '', 'FR40303265045', 'FR', 14, '01', 19, 3, 3000, 570, '2026-03-01'],
    ['Software GmbH', '', 'DE123456789', 'DE', 15, '04', 0, 1, 1500, 0, '2026-03-20'],
  ]);
  assert.deepEqual([m.base, m.retenciones], [6500, 1050]);
  assert.equal(modelo296(G, 2025).perceptores.length, 0);
});

test('los no residentes no van en el 111, el 115, el 180, el 190 ni el 347', () => {
  assert.deepEqual(retencionesProfesionales(G, 2026, 1), { perceptores: 1, base: 300, retenciones: 45 });
  assert.deepEqual(modelo115(G, 2026, 1), { perceptores: 1, base: 600, retenciones: 114 });
  assert.deepEqual(modelo180(G, 2026).arrendadores.map((a) => a.nombre), ['Casero SL']);
  assert.deepEqual(modelo190([], [], 2026, G).perceptores.map((p) => p.nombre), ['Gestoría SL']);
  // Un profesional con NIE que factura con IVA: sin la marca iría en el 347; con ella, va en el 296.
  const nie = { id: 'ni', fecha: '2026-06-01', base: 4000, ivaPct: 21, concepto: 'Consultoría', proveedor: 'John Smith', proveedorNif: 'X1234567L' };
  assert.equal(modelo347([], [nie], 2026).compras.length, 1);
  assert.equal(modelo347([], [{ ...nie, noResidente: { pais: 'GB', clave: 19, pct: 24 } }], 2026).compras.length, 0);
});

test('tipos, subclaves y la propuesta del formulario', () => {
  assert.deepEqual([tipoGeneral('FR', 14), tipoGeneral('NO', 19), tipoGeneral('LI', 19), tipoGeneral('US', 19), tipoGeneral('GB', 19), tipoGeneral('US', 2)], [19, 19, 19, 24, 24, 19]);
  assert.deepEqual([subclave296(eeuu), subclave296(aleman), subclave296({ noResidente: { pct: 10, motivo: 'convenio' } }), subclave296({ noResidente: { pct: 0, motivo: 'exenta' } })], ['01', '04', '02', '03']);
  assert.deepEqual([nifExtranjero('FR40303265045'), nifExtranjero('12-3456789'), nifExtranjero('B12345674'), nifExtranjero('ESX1234567L'), nifExtranjero('')], [true, true, false, false, false]);
  assert.deepEqual([paisDeNif('EL123456789'), paisDeNif('fr40303265045'), paisDeNif('12-3456789')], ['GR', 'FR', '']);
  assert.deepEqual(propuestaNoResidente({ proveedorNif: 'FR40303265045', alquiler: true }), { pais: 'FR', clave: 14, pct: 19 });
  assert.deepEqual(propuestaNoResidente({ proveedorNif: '12-3456789', irpfPct: 15 }), { pais: '', clave: 19, pct: 24 });
});

test('al guardar: se valida y se normaliza, y quita la retención del IRPF', () => {
  const u = { actividades: [{ id: 'a', nombre: 'Tienda' }], fiscal: { tipo: 'autonomo', iva: 'general' } };
  const b = { fecha: '2026-05-03', actividad: 'a', concepto: 'Diseño', proveedor: 'Acme', proveedorNif: '12-3456789', base: '2000', ivaPct: 0, irpfPct: 15, noResidente: { pais: 'us', clave: '19', pct: '24' } };
  const { gasto } = nuevoGasto(u, b);
  assert.deepEqual(gasto.noResidente, { pais: 'US', clave: 19, pct: 24 });
  assert.equal(gasto.irpfPct, undefined);
  assert.deepEqual(nuevoGasto(u, { ...b, noResidente: { pais: 'DE', clave: 15, pct: '10,5', motivo: 'convenio' } }).gasto.noResidente, { pais: 'DE', clave: 15, pct: 10.5, motivo: 'convenio' });
  assert.deepEqual(nuevoGasto(u, { ...b, noResidente: { pais: 'DE', clave: 2, pct: '19', motivo: 'exenta' } }).gasto.noResidente, { pais: 'DE', clave: 2, pct: 0, motivo: 'exenta' });
  // Desmarcado (false): vuelve a ser un gasto normal, con su retención del 111.
  const { gasto: editado } = gastoEditado(u, { ...b, noResidente: false }, gasto);
  assert.deepEqual([editado.noResidente, editado.irpfPct], [undefined, 15]);
  assert.match(validarGasto({ ...b, noResidente: { pais: 'ES', clave: 19, pct: 24 } }).errores.noResidente, /país/);
  assert.match(validarGasto({ ...b, noResidente: { pais: 'US', clave: 99, pct: 24 } }).errores.noResidente, /clave/);
  assert.match(validarGasto({ ...b, noResidente: { pais: 'US', clave: 19, pct: 15 } }).errores.noResidente, /24 %/);
  assert.match(validarGasto({ ...b, noResidente: { pais: 'US', clave: 19, pct: 30, motivo: 'convenio' } }).errores.noResidente, /convenio/);
  assert.match(validarGasto({ ...b, noResidente: { pais: 'US', clave: 19, pct: '', motivo: 'convenio' } }).errores.noResidente, /porcentaje/);
  assert.equal(errorNoResidente({ pais: 'DE', clave: 15, pct: 0, motivo: 'convenio' }), '');
  assert.equal(validarGasto({ ...b, noResidente: { pais: 'US', clave: 19, pct: 24 } }).ok, true);
});

test('modelos que tocan y «Toca presentar»: el 216 con su plazo de las retenciones; negativo si solo hay exentas', () => {
  const ids = modelosDe({ tipo: 'autonomo', iva: 'general', noResidentes: true }).map((m) => m.id);
  assert.ok(ids.includes('216') && ids.includes('296'));
  assert.ok(!modelosDe({ tipo: 'autonomo', iva: 'general' }).some((m) => m.id === '216'));
  assert.deepEqual(modelosAPresentar(4, { m216: 1050 }).map((m) => [m.num, m.importe, m.dia]), [['216', 1050, 20]]);
  assert.match(modelosAPresentar(2, { m216: 0, negativa216: true })[0].texto, /Negativa/);
  assert.equal(modelosAPresentar(2, { m216: 0 }).length, 0);
});

test('tesorería: el 216 del trimestre hasta el día 20, fuera del 111, hasta que se marca presentado', () => {
  const fiscal = { tipo: 'autonomo', iva: 'general' };
  const disenio = { ...eeuu, id: 'u3', fecha: '2026-08-10', pagado: '2026-08-10' };
  const hacienda = (p) => p.movimientos.filter((m) => m.tipo === 'hacienda');
  const p = prevision({ gastos: [disenio], fiscal, hoy: '2026-10-05', meses: 1, actividades: [] });
  assert.deepEqual(hacienda(p).filter((m) => m.concepto.includes('216')).map((m) => [m.fecha, m.importe]), [['2026-10-20', -480]]);
  assert.ok(!hacienda(p).some((m) => m.concepto.includes('111')));
  assert.ok(!hacienda(prevision({ gastos: [disenio], fiscal, hoy: '2026-10-05', meses: 1, actividades: [], pres216: { 2026: { 3: true } } })).some((m) => m.concepto.includes('216')));
  const marcado = pagadosSinExtracto({ gastos: [disenio], fiscal, pagadosHacienda: { '2026-3-216': { fecha: '2026-10-15' } }, saldo: { fecha: '2026-10-10', importe: 0 }, actividades: [] });
  assert.deepEqual(marcado.map((x) => [x.modelo, x.importe]), [['216', 480]]);
});

test('contabilidad: el pago del 216 marcado salda la 4751 de esas retenciones', () => {
  const gastos = [frances(1), eeuu];
  const saldo4751 = (A) => Math.round(A.flatMap((a) => a.lineas).filter((l) => l.cuenta === '4751').reduce((s, l) => s + l.haber - l.debe, 0) * 100) / 100;
  const sin = generarAsientos({ gastos, fiscal: { tipo: 'sociedad', iva: 'general' } }, '2026-05-31');
  assert.equal(saldo4751(sin), 670);
  const con = generarAsientos({ gastos, fiscal: { tipo: 'sociedad', iva: 'general' }, pagadosHacienda: { '2026-1-216': { fecha: '2026-04-15' } } }, '2026-05-31');
  assert.equal(saldo4751(con), 0);
  assert.ok(con.some((a) => a.fecha === '2026-04-15' && a.concepto === 'Pago de retenciones de no residentes (216) del 1T 2026'));
});

test('paquete de la gestoría: el 216 del trimestre con sus casillas', () => {
  const u = { emisor: { nombre: 'Tienda SL', nif: 'B12345674' }, fiscal: { tipo: 'sociedad', iva: 'general' }, actividades: [{ id: 'a', nombre: 'Tienda' }] };
  const d = datosPaquete(u, { facturas: [], gastos: G }, 2026, 1);
  const m = d.modelos.find((x) => x.id === '216');
  assert.equal(m.resultado, 1050);
  assert.deepEqual(m.casillas.map(([c, , v]) => [c, v]), [['06', 4], ['07', 4], ['09', 5000], ['10', 5000], ['12', 1050], ['13', 1050], ['21', 1050]]);
  assert.equal(d.modelos.find((x) => x.id === '111').resultado, 45);
});
