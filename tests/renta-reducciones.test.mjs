// Borrador de la renta con las reducciones del art. 32.2 LIRPF y los mínimos familiares (auditoría 19-10-2026, punto 5).
// Cuantías del manual práctico de Renta 2025 de la AEAT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { borradorRenta, cuotaEscala, minimosRenta, reduccionActividad } from '../lib/modelos.js';
import { limpiarFiscal, limpiarRenta } from '../lib/empresa.js';

const fac = (base, irpfPct = 0) => [{ fecha: '2026-03-01', base, ivaPct: 21, irpfPct, actividad: 'dj' }];

test('reducción general por rentas bajas (32.2.3.º): 1.620 € hasta 8.000 y decreciente hasta 12.000', () => {
  assert.equal(reduccionActividad(7000), 1620);
  assert.equal(reduccionActividad(10000), 810); // 1.620 − 0,405 × 2.000
  assert.equal(reduccionActividad(12000), 0);
  // Las otras rentas cuentan para el límite.
  assert.equal(reduccionActividad(7000, { otrasRentas: 3000 }), 810);
  // Nunca más que el rendimiento.
  assert.equal(reduccionActividad(1000), 1000);
  assert.equal(reduccionActividad(-5), 0);
});

test('autónomo dependiente o con cliente único (32.2.1.º): 2.000 € + 6.498 € decreciente hasta 19.747,50', () => {
  assert.equal(reduccionActividad(12000, { dependiente: true }), 8498);
  assert.equal(reduccionActividad(16000, { dependiente: true }), 2000 + 6498 - 1.14 * (16000 - 14047.5));
  assert.equal(reduccionActividad(25000, { dependiente: true }), 2000);
  // Con más de 6.500 € de otras rentas, solo los 2.000.
  assert.equal(reduccionActividad(12000, { dependiente: true, otrasRentas: 7000 }), 2000);
});

test('mínimos: personal por edad, hijos (a medias si declaran los dos) y ascendientes', () => {
  assert.equal(minimosRenta(2026).total, 5550);
  assert.equal(minimosRenta(2026, { nacimiento: 1955 }).personal, 5550 + 1150);
  assert.equal(minimosRenta(2026, { nacimiento: 1945 }).personal, 5550 + 1150 + 1400);
  // Dos hijos, uno de 1 año: (2.400 + 2.700 + 2.800) / 2.
  assert.equal(minimosRenta(2026, { hijos: [2015, 2025] }).descendientes, 3950);
  assert.equal(minimosRenta(2026, { hijos: [2015, 2025], compartidos: false }).descendientes, 7900);
  // Un hijo de 25 o más no cuenta; un ascendiente de 80, 1.150 + 1.400.
  assert.equal(minimosRenta(2026, { hijos: [2000] }).descendientes, 0);
  assert.equal(minimosRenta(2026, { ascendientes: [1946] }).ascendientes, 2550);
  // Quien cumple 65 (o 75) en el año ya tiene el incremento; el ascendiente que cumple 65, también.
  assert.equal(minimosRenta(2026, { nacimiento: 1961 }).personal, 5550 + 1150);
  assert.equal(minimosRenta(2026, { nacimiento: 1951 }).personal, 5550 + 1150 + 1400);
  assert.equal(minimosRenta(2026, { nacimiento: 1962 }).personal, 5550);
  assert.equal(minimosRenta(2026, { ascendientes: [1961] }).ascendientes, 1150);
});

test('borrador: un autónomo pequeño paga menos con la reducción y los hijos', () => {
  const sin = borradorRenta(fac(10000), [], 2026, {});
  // 10.000 − 5 % = 9.500; reducción 1.620 − 0,405 × 1.500 = 1.012,50 → 8.487,50.
  assert.equal(sin.reduccion, 1012.5);
  assert.equal(sin.rendimiento, 8487.5);
  assert.equal(sin.cuota, Math.round((cuotaEscala(8487.5) - cuotaEscala(5550)) * 100) / 100);
  const conHijos = borradorRenta(fac(10000), [], 2026, {}, { personal: { hijos: [2018, 2020], compartidos: false } });
  assert.ok(conHijos.cuota < sin.cuota);
  // Mínimos por encima del rendimiento: cuota cero.
  assert.equal(conHijos.cuota, 0);
});

test('borrador: con cliente único elige lo que más reduce (difícil justificación o la reducción de dependiente)', () => {
  const r = borradorRenta(fac(15000, 15), [], 2026, {}, { personal: { dependiente: true } });
  assert.equal(r.tipoReduccion, 'dependiente');
  assert.equal(r.difJust, 0);
  assert.equal(r.reduccion, 2000 + 6498 - Math.round(1.14 * (15000 - 14047.5) * 100) / 100);
  // Rendimiento alto: 2.000 € pierden frente a la difícil justificación (2.000 € como máximo, igual), y se queda la general.
  const alto = borradorRenta(fac(60000), [], 2026, {}, { personal: { dependiente: true } });
  assert.equal(alto.rendimiento, 58000);
});

test('ajustes: los datos de la renta se guardan limpios y solo para autónomos', () => {
  assert.deepEqual(limpiarRenta({ nacimiento: '1980', hijos: '2015, 2019 ; x', compartidos: false, ascendientes: [], dependiente: true, otrasRentas: '1.500,50' }),
    { nacimiento: 1980, hijos: [2015, 2019], compartidos: false, dependiente: true, otrasRentas: 1500.5 });
  assert.equal(limpiarRenta({}), null);
  assert.deepEqual(limpiarFiscal({ tipo: 'autonomo', renta: { nacimiento: 1980 } }).renta, { nacimiento: 1980 });
  assert.equal(limpiarFiscal({ tipo: 'sociedad', renta: { nacimiento: 1980 } }).renta, undefined);
});

test('renta: reducción del 20 % por inicio de actividad (art. 32.3) el año de alta y el siguiente, salvo ex empleador', () => {
  const F = [{ fecha: '2026-03-01', base: 30000, ivaPct: 21, irpfPct: 0 }];
  const sin = borradorRenta(F, [], 2026, {}, { personal: {} });
  const con = borradorRenta(F, [], 2026, {}, { personal: { inicio: 2025 } });
  assert.equal(sin.reduccionInicio, 0);
  // 30.000 − 5 % de difícil justificación (1.500) = 28.500 → 20 % = 5.700.
  assert.deepEqual([con.reduccionInicio, con.rendimiento], [5700, 22800]);
  assert.equal(borradorRenta(F, [], 2026, {}, { personal: { inicio: 2024 } }).reduccionInicio, 0);
  assert.equal(borradorRenta(F, [], 2026, {}, { personal: { inicio: 2026, exEmpleador: true } }).reduccionInicio, 0);
  assert.deepEqual(limpiarRenta({ inicio: '2025', exEmpleador: true }), { inicio: 2025, exEmpleador: true });
});
