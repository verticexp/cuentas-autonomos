// Plan para llegar a 9,5 (26-10-2026): libros registro con cada cobro del criterio de caja en su línea (C1-13) y los
// recibos del REAGP en recibidas (C1-14).
import test from 'node:test';
import assert from 'node:assert/strict';
import { librosRegistro } from '../lib/librosRegistro.js';

const recc = { desde: '2026-01-01' };
const datos = (facturas, gastos = [], fiscal = { tipo: 'autonomo', iva: 'general', recc }) => ({ facturas, gastos, fiscal, actividades: [{ id: 'a', irpfPct: 0 }], empresa: { nombre: 'X', nif: '12345678Z' } });
const factura = (extra) => ({ id: 'f1', numero: 1, anio: 2026, serie: '', fecha: '2026-02-10', actividad: 'a', cliente: { nombre: 'Cliente SL', nif: 'B12345674' }, concepto: 'x', base: 1000, ivaPct: 21, irpfPct: 0, ...extra });

test('criterio de caja: cada cobro en su línea y en el periodo en que se cobra, también el del año siguiente', () => {
  const f = factura({ pagos: [{ fecha: '2026-03-01', importe: 400, metodo: 'transferencia' }, { fecha: '2026-08-20', importe: 300, metodo: 'efectivo' }, { fecha: '2027-02-15', importe: 510, metodo: 'transferencia' }] });
  const L26 = librosRegistro(datos([f]), 2026, '2027-12-31').hojas[0].filas.map((x) => x.join('|'));
  // La factura con su primer cobro (1T) y una línea solo con el segundo (3T, en efectivo: medio 04).
  assert.ok(L26.some((x) => x.startsWith('2026|1T|') && x.includes('|07|S1|') && x.includes('01/03/2026|400,00|01')));
  assert.ok(L26.some((x) => x.startsWith('2026|3T|') && x.includes('|07|') && x.includes('20/08/2026|300,00|04')));
  assert.ok(!L26.some((x) => x.includes('15/02/2027')));
  // En el libro de 2027, el cobro de febrero con la identificación de la factura de 2026.
  const L27 = librosRegistro(datos([f]), 2027, '2027-12-31').hojas[0].filas.map((x) => x.join('|'));
  assert.ok(L27.some((x) => x.startsWith('2027|1T|') && x.includes('10/02/2026') && x.includes('15/02/2027|510,00|01')));
});

test('criterio de caja: lo no cobrado el 31 de diciembre del año siguiente se devenga ese día (medio 03)', () => {
  const f = factura({ pagos: [{ fecha: '2026-03-01', importe: 210, metodo: 'transferencia' }] });
  const L27 = librosRegistro(datos([f]), 2027, '2028-01-15').hojas[0].filas.map((x) => x.join('|'));
  assert.ok(L27.some((x) => x.startsWith('2027|4T|') && x.includes('31/12/2027|1000,00|03')));
});

test('REAGP: el recibo de un agricultor va con la compensación como tipo y cuota y clave de operación 02', () => {
  const g = { id: 'g1', fecha: '2026-04-05', actividad: 'a', concepto: 'Naranjas', proveedor: 'Agricultor', proveedorNif: '12345678Z', base: 1000, ivaPct: 0, compensacion: 12 };
  const filas = librosRegistro(datos([], [g], { tipo: 'autonomo', iva: 'general' }), 2026, '2026-12-31').hojas[1].filas.map((x) => x.join('|'));
  const linea = filas.find((x) => x.includes('NARANJAS') || x.includes('Naranjas'));
  assert.ok(linea, filas.join('\n'));
  assert.ok(linea.includes('|02|N|N|'), linea);
  assert.ok(linea.includes('|1000,00|12,00|120,00|120,00|'), linea);
});
