// Criterio de caja (RECC) y ventanilla única (OSS) en el 303 y en la contabilidad (lib/calculos.js, lib/asientos.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, liquidaciones303, pendienteCaja } from '../lib/calculos.js';
import { generarAsientos } from '../lib/asientos.js';
import { fichero303 } from '../lib/ficheroAeat.js';

const recc = { desde: '2026-01-01' };
const iva = { recc };
const fac = (id, fecha, base, extra = {}) => ({ id, fecha, numero: 1, anio: Number(fecha.slice(0, 4)), actividad: 'a', cliente: { nombre: 'Cliente', nif: '12345678Z' }, base, ivaPct: 21, irpfPct: 0, ...extra });
const gasto = (id, fecha, base, extra = {}) => ({ id, fecha, concepto: 'Material', proveedor: 'Proveedor', proveedorNif: 'B12345674', base, ivaPct: 21, ...extra });
const q = (c, ...k) => k.map((x) => c[x]);

test('criterio de caja: el IVA se devenga al cobrar, en proporción a lo cobrado (62 y 63, por la regla general)', () => {
  const f = fac('f1', '2026-02-10', 1000, { pagos: [{ fecha: '2026-05-15', importe: 605 }, { fecha: '2026-08-01', importe: 605 }] });
  const t1 = casillas303([f], [], 2026, 1, iva), t2 = casillas303([f], [], 2026, 2, iva), t3 = casillas303([f], [], 2026, 3, iva);
  assert.deepEqual(q(t1, '07', '09', '62', '63'), [0, 0, 1000, 210]);
  assert.equal(t1.criterioCaja, true);
  assert.deepEqual(q(t2, '07', '09', '62', '63'), [500, 105, 0, 0]);
  assert.deepEqual(q(t3, '07', '09'), [500, 105]);
  // Sin el régimen, como siempre: todo en el trimestre de la factura.
  assert.deepEqual(q(casillas303([f], [], 2026, 1), '07', '09', '62'), [1000, 210, 0]);
});

test('criterio de caja: lo que no se cobra se devenga el 31 de diciembre del año siguiente', () => {
  const f = fac('f1', '2026-11-10', 1000);
  assert.deepEqual(q(casillas303([f], [], 2026, 4, iva), '07', '09', '62'), [0, 0, 1000]);
  assert.deepEqual(q(casillas303([f], [], 2027, 3, iva), '07', '09'), [0, 0]);
  assert.deepEqual(q(casillas303([f], [], 2027, 4, iva), '07', '09'), [1000, 210]);
  assert.equal(pendienteCaja([f], recc, '2027-06-30'), 210);
  assert.equal(pendienteCaja([f], recc, '2027-12-31'), 0);
  // Lo de antes del régimen (o tras salir de él) va por la regla general; lo facturado dentro sigue al cobro.
  const antes = fac('f0', '2025-12-20', 100);
  assert.deepEqual(q(casillas303([antes], [], 2025, 4, iva), '07', '09'), [100, 21]);
  const fuera = { recc: { desde: '2026-01-01', hasta: '2026-06-30' } };
  assert.deepEqual(q(casillas303([fac('f2', '2026-07-01', 100)], [], 2026, 3, fuera), '07', '62'), [100, 0]);
  assert.deepEqual(q(casillas303([fac('f3', '2026-06-30', 100, { pagos: [{ fecha: '2026-09-01', importe: 121 }] })], [], 2026, 3, fuera), '07', '09'), [100, 21]);
});

test('criterio de caja: con retención, cobrar el líquido es cobrarla entera', () => {
  const f = fac('f1', '2026-01-10', 1000, { irpfPct: 15, pagos: [{ fecha: '2026-02-01', importe: 530 }] });
  assert.deepEqual(q(casillas303([f], [], 2026, 1, iva), '07', '09'), [500, 105]);
  const cobrada = fac('f2', '2026-01-10', 1000, { irpfPct: 15, cobrada: true, cobro: { fecha: '2026-04-02' } });
  assert.deepEqual(q(casillas303([cobrada], [], 2026, 1, iva), '07', '09'), [0, 0]);
  assert.deepEqual(q(casillas303([cobrada], [], 2026, 2, iva), '07', '09'), [1000, 210]);
});

test('criterio de caja: una rectificativa antes del cobro reduce lo que se devenga; después, es una modificación (14 y 15)', () => {
  const f = fac('f1', '2026-03-01', 1000, { pagos: [{ fecha: '2026-05-01', importe: 968 }] });
  const r = fac('r1', '2026-04-10', -200, { serie: 'R', rectifica: { id: 'f1', numero: '1', fecha: '2026-03-01' } });
  const t2 = casillas303([f, r], [], 2026, 2, iva);
  assert.deepEqual(q(t2, '07', '09', '14', '15', '62', '63'), [800, 168, 0, 0, -200, -42]);
  // Cobrada entera en enero y rectificada en abril: el IVA ya devengado baja en el 2T, en las casillas de modificación.
  const g = fac('f2', '2026-01-10', 1000, { cobrada: true, cobro: { fecha: '2026-01-20' } });
  const rg = fac('r2', '2026-04-05', -200, { serie: 'R', rectifica: { id: 'f2', numero: '2', fecha: '2026-01-10' } });
  assert.deepEqual(q(casillas303([g, rg], [], 2026, 1, iva), '07', '09'), [1000, 210]);
  assert.deepEqual(q(casillas303([g, rg], [], 2026, 2, iva), '07', '09', '14', '15'), [0, 0, -200, -42]);
});

test('criterio de caja: los gastos se deducen al pagarlos (74 y 75 por la fecha); también los de un proveedor acogido', () => {
  const g = gasto('g1', '2026-02-01', 100, { pendiente: true });
  const t1 = casillas303([], [g], 2026, 1, iva);
  assert.deepEqual(q(t1, '28', '29', '74', '75'), [0, 0, 100, 21]);
  const pagado = { ...g, pendiente: undefined, pagado: '2026-04-03' };
  assert.deepEqual(q(casillas303([], [pagado], 2026, 2, iva), '28', '29', '74'), [100, 21, 0]);
  // Sin pagar al acabar el año siguiente: se deduce el 31 de diciembre.
  assert.deepEqual(q(casillas303([], [g], 2027, 4, iva), '28', '29'), [100, 21]);
  // Empresa fuera del régimen con un proveedor que sí está: espera al pago y marca «destinatario».
  const p = gasto('g2', '2026-02-01', 100, { recc: true, pagado: '2026-03-15' });
  const c = casillas303([], [p, gasto('g3', '2026-02-02', 50)], 2026, 1);
  assert.deepEqual(q(c, '28', '29', '74', '75'), [150, 31.5, 100, 21]);
  assert.equal(c.destinatarioCaja, true);
  assert.equal(c.criterioCaja, false);
  assert.deepEqual(q(casillas303([], [{ ...p, pagado: '2026-04-01' }], 2026, 1), '28', '29'), [0, 0]);
  // Lo autoliquidado (proveedor de fuera) no entra en el régimen.
  const ue = gasto('g4', '2026-02-01', 100, { ivaPct: 0, proveedorNif: 'FR12345678901', origen: 'ue', pendiente: true });
  assert.equal(casillas303([], [ue], 2026, 1, iva)['37'], 21);
});

test('criterio de caja: el saldo a compensar y el fichero de la Sede llevan lo devengado y las marcas', () => {
  const f = fac('f1', '2026-02-10', 1000, { pagos: [{ fecha: '2026-05-15', importe: 1210 }] });
  const l = liquidaciones303([f], [], 2026, undefined, iva);
  assert.deepEqual(l.map((x) => x.bruto), [0, 210, 0, 0]);
  const c = casillas303([f], [], 2026, 1, iva);
  const fichero = fichero303({ nif: '12345678Z', nombre: 'PRUEBA' }, 2026, 1, c, liquidaciones303([f], [], 2026, undefined, iva)[0]);
  // Sin nada que ingresar en el 1T (N) y con la marca de criterio de caja (1) tras foral, devolución mensual, régimen y conjunta.
  assert.equal(fichero.tipo, 'N');
  assert.ok(fichero.contenido.includes('20261T22321'), 'marca de criterio de caja');
  // 62 y 63 en la página 3, tras 59, 60, 120, 122, 123 y 124 (17 posiciones cada una).
  const p3 = fichero.contenido.split('<T30303000>')[1];
  assert.equal(Number(p3.slice(17 * 6, 17 * 7)) / 100, 1000);
  assert.equal(Number(p3.slice(17 * 7, 17 * 8)) / 100, 210);
});

test('ventanilla única: la venta con el IVA de otro país no va en las 01-09; su base, en la 123', () => {
  const oss = fac('o1', '2026-05-02', 100, { cliente: { nombre: 'Jean', nif: '' }, ivaPct: 20, oss: { pais: 'FR' } });
  const c = casillas303([oss, fac('f1', '2026-05-03', 200)], [], 2026, 2);
  assert.deepEqual(q(c, '07', '09', '123', '27'), [200, 42, 100, 42]);
  assert.deepEqual(c.otros, []);
});

test('contabilidad: el IVA del criterio de caja espera en la 4779 y pasa a la 477 al devengarse; el de la OSS, a la 4750', () => {
  const f = fac('f1', '2026-02-10', 1000, { pagos: [{ fecha: '2026-05-15', importe: 605 }] });
  const oss = fac('o1', '2026-02-11', 100, { cliente: { nombre: 'Jean', nif: '' }, ivaPct: 20, oss: { pais: 'FR' } });
  const g = gasto('g1', '2026-02-01', 100, { pendiente: true });
  const A = generarAsientos({ facturas: [f, oss], gastos: [g], fiscal: { tipo: 'sociedad', iva: 'general', recc }, pres369: { 2026: { 1: true } } }, '2026-08-15');
  const saldo = (cuenta, hasta) => Math.round(A.filter((a) => a.fecha <= hasta).flatMap((a) => a.lineas).filter((x) => x.cuenta === cuenta).reduce((s, x) => s + x.haber - x.debe, 0) * 100) / 100;
  assert.equal(saldo('4779', '2026-03-31'), 210);
  assert.equal(saldo('4779', '2026-06-30'), 105);
  assert.equal(saldo('4729', '2026-06-30'), -21);
  // El 303 del 2T solo liquida lo devengado (105) y nada de lo deducible (el gasto sigue sin pagar).
  const liq2 = A.find((a) => a.concepto === 'Liquidación del IVA (303) del 2T 2026');
  assert.equal(liq2.lineas.find((x) => x.cuenta === '4750').haber, 105);
  // El IVA francés se debe por el 369 y se paga en su plazo (30 de abril) al marcarlo como presentado.
  assert.equal(saldo('4750', '2026-03-31'), 20);
  assert.ok(A.some((a) => a.fecha === '2026-04-30' && a.concepto.includes('(369)') && a.lineas.some((x) => x.cuenta === '4750' && x.debe === 20)));
  for (const a of A) assert.equal(Math.round(a.lineas.reduce((s, x) => s + x.debe - x.haber, 0) * 100), 0, a.concepto);
});

test('contabilidad: dividendos e intereses pagados, su retención y el pago del 123', () => {
  const capital = [
    { id: 'c1', fecha: '2026-05-10', tipo: 'dividendos', perceptor: { nombre: 'Ana', nif: '12345678Z' }, bruto: 1000, retencionPct: 19, retencion: 190, liquido: 810 },
    { id: 'c2', fecha: '2026-06-01', tipo: 'intereses', perceptor: { nombre: 'Luis', nif: '87654321X' }, bruto: 200, retencionPct: 19, retencion: 38, liquido: 162 },
  ];
  const A = generarAsientos({ fiscal: { tipo: 'sociedad', iva: 'general' }, capital, pres123: { 2026: { 2: true } } }, '2026-08-01');
  const div = A.find((a) => a.origen?.id === 'c1');
  assert.deepEqual(div.lineas, [{ cuenta: '120', debe: 1000, haber: 0 }, { cuenta: '4751', debe: 0, haber: 190 }, { cuenta: '572', debe: 0, haber: 810 }]);
  assert.equal(A.find((a) => a.origen?.id === 'c2').lineas[0].cuenta, '662');
  const pago = A.find((a) => a.concepto.includes('(123) del 2T 2026'));
  assert.equal(pago.fecha, '2026-07-20');
  assert.equal(pago.lineas[0].debe, 228);
});

test('libros registro: clave 07 con su cobro y su pago; ventanilla única con clave 17 y sin cuota española', async () => {
  const { librosRegistro } = await import('../lib/librosRegistro.js');
  const f = fac('f1', '2026-02-10', 1000, { pagos: [{ fecha: '2026-05-15', importe: 1210, banco: 'b1' }] });
  const oss = fac('o1', '2026-02-11', 100, { cliente: { nombre: 'Jean', nif: '' }, ivaPct: 20, oss: { pais: 'FR' } });
  const g = gasto('g1', '2026-02-01', 100, { pendiente: true });
  const L = librosRegistro({ facturas: [f, oss], gastos: [g], fiscal: { tipo: 'autonomo', iva: 'general', recc }, actividades: [{ id: 'a', irpfPct: 15 }], empresa: { nombre: 'X', nif: '12345678Z' } }, 2026, '2026-06-30');
  const filas = L.hojas[0].filas.map((x) => x.join('|'));
  // Clave 07 y el cobro por transferencia del 15/05/2026 (1.210 €); la venta OSS, clave 17 y N2, sin tipo ni cuota.
  assert.ok(filas.some((x) => x.includes('|07|S1|') && x.includes('15/05/2026|1210,00|01')));
  assert.ok(filas.some((x) => x.includes('|17|N2|') && x.includes('|120,00|100,00|||')));
  const gastosL = L.hojas[1].filas.map((x) => x.join('|'));
  assert.ok(gastosL.some((x) => x.includes('|07|N|N|')));
});

test('calendario: 369 a fin de mes (sin pasar al lunes), 123 con las retenciones y 193 en enero', async () => {
  const { plazosFiscales } = await import('../lib/avisos.js');
  const p = plazosFiscales({ tipo: 'sociedad', iva: 'general', oss: true, capital: true }, 2026);
  const en = (fecha) => p.find((x) => x.fecha === fecha)?.texto || '';
  assert.match(en('2026-01-20'), /123 del 4T/);
  assert.match(en('2026-02-02'), /193/); // el 31 de enero de 2026 es sábado: el 193 pasa al lunes
  assert.match(en('2026-01-31'), /369 del 4T/); // el 369, no
  assert.match(en('2026-04-30'), /369 del 1T/);
  assert.match(en('2026-10-31'), /369 del 3T/);
  assert.match(en('2026-07-20'), /123 del 2T/);
});
