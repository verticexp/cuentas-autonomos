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

test('autoliquidación rectificativa del 303: falta por pagar, devolución de lo ingresado de más y fichero', async () => {
  const { rectificativa303 } = await import('../lib/calculos.js');
  // Se ingresaron 1.000 € y ahora sale 1.300 €: faltan 300.
  let r = rectificativa303(1300, { ingresado: 1000, justificante: '3031234567890' });
  assert.deepEqual([r.c70, r.c71, r.c111, r.aPagar, r.error], [1000, 300, 0, 300, undefined]);
  // Ahora sale 700: se piden 300 de lo ingresado.
  r = rectificativa303(700, { ingresado: 1000, justificante: '3031234567890' });
  assert.deepEqual([r.c71, r.c111, r.aDevolver, r.aCompensar], [-300, 300, 300, 0]);
  // Ahora sale -200 (a compensar): se piden los 1.000 ingresados y quedan 200 a compensar.
  r = rectificativa303(-200, { ingresado: 1000, justificante: '3031234567890' });
  assert.deepEqual([r.c71, r.c111, r.aCompensar], [-1200, 1000, 200]);
  assert.match(rectificativa303(100, { justificante: '12' }).error, /13 cifras/);

  const { fichero303 } = await import('../lib/ficheroAeat.js');
  const c = { '01': 0, '03': 0, '04': 0, '06': 0, '07': 1000, '09': 210, '27': 210, '28': 0, '29': 0, '45': 0, '46': 210, '59': 0, '60': 0, '120': 0, '122': 0, otros: [], reOtros: [] };
  const f = fichero303({ nif: 'B12345674', nombre: 'Taller SL' }, 2026, 2, c, { anterior: 0, compensado: 0 }, rectificativa303(210, { ingresado: 100, justificante: '3031234567890' }));
  const p3 = f.contenido.slice(f.contenido.indexOf('<T30303000>'), f.contenido.indexOf('</T30303000>') + 12);
  assert.equal(p3.length, 1017);
  assert.equal(p3.slice(356, 373), '00000000000010000'); // 70: ingresado
  assert.equal(p3.slice(407, 424), '00000000000011000'); // 71: 210 - 100
  assert.equal(p3[425], 'X'); // rectificativa
  assert.equal(p3.slice(426, 439), '3031234567890'); // justificante
  assert.equal(p3[457], 'X'); // motivo: rectificaciones
  assert.equal(f.tipo, 'I');
});
