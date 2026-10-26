// El 202 en el paquete de la gestoría (lib/paquete.js): el de abril en el 1T, el de octubre en el 3T y el de diciembre en
// el 4T, con el mismo cálculo que Impuestos (lib/modelos.js modelo202, art. 40.2: el 18 % de la cuota apuntada).
import test from 'node:test';
import assert from 'node:assert/strict';
import { datosPaquete } from '../lib/paquete.js';
import { paqueteXlsx } from '../lib/paquete.js';

const sociedad = (cuotaIS) => ({ fiscal: { tipo: 'sociedad', iva: 'general' }, actividades: [{ id: 'x', nombre: 'Servicios' }], emisor: { nombre: 'Prueba SL', nif: 'B12345674' }, cuotaIS });
const de = (d) => d.modelos.find((m) => m.id === '202');

test('sociedad: 202 en el 1T (cuota de hace dos años), en el 3T y el 4T (la del año pasado), y nunca en el 2T', () => {
  // Cuotas a ingresar de 2024 (abril de 2026) y de 2025 (octubre y diciembre de 2026).
  const u = sociedad({ 2024: 10000, 2025: 20000 });
  const datos = { facturas: [], gastos: [] };
  assert.deepEqual([de(datosPaquete(u, datos, 2026, 1)).resultado, de(datosPaquete(u, datos, 2026, 3)).resultado, de(datosPaquete(u, datos, 2026, 4)).resultado], [1800, 3600, 3600]);
  assert.equal(de(datosPaquete(u, datos, 2026, 2)), undefined);
  const abril = de(datosPaquete(u, datos, 2026, 1));
  assert.match(abril.nombre, /1P, abril/);
  assert.deepEqual(abril.casillas, [['—', 'Cuota de 2024 (menos retenciones)', 10000], ['Total', '18 % · A ingresar', 1800]]);
  // Va también en el Excel.
  assert.ok(paqueteXlsx(datosPaquete(u, datos, 2026, 1)).length > 0);
});

test('sociedad sin cuota apuntada o con cuota cero: lo dice; un autónomo no lleva 202', () => {
  const sin = de(datosPaquete(sociedad({}), { facturas: [], gastos: [] }, 2026, 3));
  assert.equal(sin.resultado, 0);
  assert.match(sin.casillas[0][1], /Falta la cuota del Impuesto sobre Sociedades de 2025/);
  const cero = de(datosPaquete(sociedad({ 2025: 0 }), { facturas: [], gastos: [] }, 2026, 3));
  assert.match(cero.casillas.at(-1)[1], /fue cero: no se presenta/);
  const aut = datosPaquete({ fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: [{ id: 'x', nombre: 'Servicios' }] }, { facturas: [], gastos: [] }, 2026, 1);
  assert.equal(de(aut), undefined);
});
