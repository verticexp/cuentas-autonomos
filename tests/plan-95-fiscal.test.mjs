// Plan para llegar a 9,5 (26-10-2026): deducciones autonómicas en el borrador de la renta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { borradorRenta } from '../lib/modelos.js';
import { limpiarRenta } from '../lib/empresa.js';

const facturas = [{ id: 'f1', numero: 1, anio: 2026, serie: '', fecha: '2026-03-10', actividad: 'servicios', cliente: { nombre: 'C', nif: 'B12345674' }, base: 40000, ivaPct: 21, irpfPct: 0 }];

test('las deducciones autonómicas restan de la cuota autonómica, sin dejarla en negativo', () => {
  const base = borradorRenta(facturas, [], 2026, {}, { personal: { ccaa: 'madrid', nacimiento: 1985 } });
  const con = borradorRenta(facturas, [], 2026, {}, { personal: { ccaa: 'madrid', nacimiento: 1985, deduccionesAutonomicas: 300 } });
  assert.equal(con.deduccionesAutonomicas, 300);
  assert.equal(con.resultado, Math.round((base.resultado - 300) * 100) / 100);
  const tope = borradorRenta(facturas, [], 2026, {}, { personal: { ccaa: 'madrid', nacimiento: 1985, deduccionesAutonomicas: 1e6 } });
  assert.equal(tope.deduccionesAutonomicas, base.cuotaAutonomica);
});

test('limpiarRenta guarda el importe de las deducciones autonómicas', () => {
  assert.equal(limpiarRenta({ deduccionesAutonomicas: '1.234,50' }).deduccionesAutonomicas, 1234.5);
  assert.equal(limpiarRenta({ deduccionesAutonomicas: '' }), null);
});
