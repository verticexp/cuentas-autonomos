// Invariante: toda operación que entra en el 349 (ventas: claves E y S) aparece en la casilla 59 del 303 del mismo
// trimestre, y al revés. Las compras de la UE (clave I) van al 349 pero no a la 59 (son las casillas 10/11 y 36/37).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, r2 } from '../lib/calculos.js';
import { modelo349 } from '../lib/modelos.js';

const ventas349 = (facturas, anio, t, gastos) => r2(modelo349(facturas, anio, t, gastos).operadores.filter((o) => o.clave !== 'I').reduce((s, o) => s + o.base, 0));

const F = [
  // Servicios a la UE deducidos por el NIF-IVA y elegidos a mano.
  { fecha: '2026-01-10', base: 1000, ivaPct: 0, cliente: { nombre: 'Berlin GmbH', nif: 'DE123456789' } },
  { fecha: '2026-02-10', base: 300, ivaPct: 0, operacion: 'servicios-ue', cliente: { nombre: 'Paris SARL', nif: 'FR 12345678901' } },
  // Entrega de bienes a la UE (clave E).
  { fecha: '2026-03-05', base: 700, ivaPct: 0, operacion: 'intracomunitaria', cliente: { nombre: 'Roma SRL', nif: 'IT12345678901' } },
  // Factura con líneas: solo la parte sin IVA es intracomunitaria.
  { fecha: '2026-03-20', base: 600, ivaPct: 21, lineas: [{ cantidad: 1, precio: 400, ivaPct: 0 }, { cantidad: 2, precio: 100, ivaPct: 21 }], cliente: { nombre: 'Berlin GmbH', nif: 'DE123456789' } },
  // Rectificativa negativa de una venta a la UE.
  { fecha: '2026-03-25', base: -100, ivaPct: 0, cliente: { nombre: 'Berlin GmbH', nif: 'DE123456789' } },
  // Marcada como servicio a la UE pero sin NIF-IVA válido: ni 349 ni 59.
  { fecha: '2026-02-15', base: 500, ivaPct: 0, operacion: 'servicios-ue', cliente: { nombre: 'Sin NIF', nif: '' } },
  // Fuera de la UE, exportación, exenta, inversión del sujeto pasivo y nacional: nada de esto va al 349 ni a la 59.
  { fecha: '2026-01-20', base: 800, ivaPct: 0, cliente: { nombre: 'NY Inc', nif: 'US123456' } },
  { fecha: '2026-01-21', base: 900, ivaPct: 0, operacion: 'exportacion', cliente: { nombre: 'Mexico SA', nif: 'MX1234' } },
  { fecha: '2026-01-22', base: 200, ivaPct: 0, operacion: 'exenta', cliente: { nombre: 'Clínica', nif: '12345678Z' } },
  { fecha: '2026-01-23', base: 400, ivaPct: 0, operacion: 'isp', cliente: { nombre: 'Obras SL', nif: 'B12345678' } },
  { fecha: '2026-01-24', base: 1000, ivaPct: 21, cliente: { nombre: 'Ana', nif: '12345678Z' } },
  // Otro trimestre.
  { fecha: '2026-05-02', base: 250, ivaPct: 0, cliente: { nombre: 'Lisboa Lda', nif: 'PT123456789' } },
];
const G = [{ fecha: '2026-01-15', base: 120, ivaPct: 0, proveedor: 'Dublin Ltd', proveedorNif: 'IE1234567T' }];

test('349 ↔ casilla 59: cuadran en todos los trimestres', () => {
  for (const t of [1, 2, 3, 4]) assert.equal(casillas303(F, G, 2026, t)['59'], ventas349(F, 2026, t, G), `${t}T`);
  assert.equal(casillas303(F, G, 2026, 1)['59'], 2300); // 1000 + 300 + 700 + 400 − 100
  assert.equal(casillas303(F, G, 2026, 2)['59'], 250);
});

test('cada factura sin IVA en su casilla: fuera de la UE 120, exportación 60, inversión del sujeto pasivo 122', () => {
  const c = casillas303(F, G, 2026, 1);
  assert.deepEqual([c['60'], c['120'], c['122']], [900, 800, 400]);
  // La de «servicios a la UE» sin NIF-IVA no entra en ninguna: queda en el aviso de facturas sin motivo claro.
  assert.equal(r2(c.sinIva - c['59'] - c['60'] - c['120'] - c['122']), 700); // 500 sin NIF + 200 exenta
});

test('349 ↔ casilla 59 con datos al azar', () => {
  const nifs = ['DE123456789', 'FR12345678901', 'ES12345678Z', 'US999', '', 'B12345678'];
  const ops = [undefined, 'servicios-ue', 'intracomunitaria', 'exportacion', 'servicios-fuera', 'isp', 'exenta'];
  let semilla = 7;
  const azar = (n) => { semilla = (semilla * 16807) % 2147483647; return semilla % n; };
  const facturas = Array.from({ length: 300 }, (_, i) => ({
    fecha: `2026-${String(1 + azar(12)).padStart(2, '0')}-${String(1 + azar(28)).padStart(2, '0')}`,
    base: r2((azar(200000) - 20000) / 100), ivaPct: [0, 0, 21, 10][azar(4)], operacion: ops[azar(ops.length)],
    cliente: { nombre: `C${i % 9}`, nif: nifs[azar(nifs.length)] },
  }));
  for (const t of [1, 2, 3, 4]) assert.equal(casillas303(facturas, [], 2026, t)['59'], ventas349(facturas, 2026, t, []), `${t}T`);
});
