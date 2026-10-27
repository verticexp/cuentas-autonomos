// Regímenes especiales del IVA: bienes usados (REBU), agencias de viajes (REAV) y agricultura (REAGP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, desglose, importes } from '../lib/calculos.js';
import { limpiar } from '../lib/facturas.js';
import { filasTotales, formatoDoc, menciones } from '../lib/idiomas.js';
import { generarAsientos } from '../lib/asientos.js';
import { librosRegistro } from '../lib/librosRegistro.js';

const ACTS = [{ id: 'a', nombre: 'Tienda', serie: '', ivaPct: 21, irpfPct: 0 }];
// Una tienda vende al por menor (art. 4.1.c del Reglamento de facturación): sin NIF del cliente, simplificada hasta 3.000 €.
const pedir = (extra, op) => limpiar({ fecha: '2026-03-10', actividad: 'a', cliente: { nombre: 'Ana Cliente' }, irpfPct: 0, ...extra }, ACTS, false, { limiteSimplificada: 3000, ...op });
const linea = (precio, coste, cantidad = 1, ivaPct = 21) => ({ concepto: 'Reloj antiguo', cantidad: String(cantidad), precio: String(precio), coste: String(coste), ivaPct });

test('REBU: el IVA va dentro del margen (venta − coste) y la base guardada es la venta sin ese IVA', () => {
  const f = pedir({ margen: 'rebu', lineas: [linea(1210, 1000)] });
  assert.equal(f.margen, 'rebu');
  // Margen 210 → base 173,55 y cuota 36,45; lo demás (1.000) queda fuera de la base.
  assert.deepEqual(desglose(f), [{ pct: 21, base: 173.55, iva: 36.45, margen: true }, { pct: 0, base: 1000, iva: 0, fueraBase: true }]);
  assert.equal(f.base, 1173.55);
  assert.equal(importes(f).total, 1210);
  const c = casillas303([{ ...f, id: 'f1' }], [], 2026, 1);
  assert.deepEqual([c['07'], c['09'], c.sinIva], [173.55, 36.45, 0]);
  // Sin margen (vendido por menos de lo que costó) no hay IVA.
  const p = pedir({ margen: 'rebu', lineas: [linea(800, 1000)] });
  assert.deepEqual([importes(p).iva, importes(p).total], [0, 800]);
  // Una rectificativa que anula la venta resta su margen.
  const r = pedir({ margen: 'rebu', lineas: [linea(1210, 1000, -1)] }, { rectificativa: true });
  assert.deepEqual(desglose(r)[0], { pct: 21, base: -173.55, iva: -36.45, margen: true });
});

test('REBU y REAV: la factura no desglosa el IVA, lleva la mención y, si la pide una empresa, las cuotas incluidas (6 %)', () => {
  const f = { ...pedir({ margen: 'reav', cuotasIncluidas: true, lineas: [linea(2000, 1500)] }), id: 'v1', numero: 1, anio: 2026 };
  const L = formatoDoc(f);
  assert.deepEqual(filasTotales(f, L), [['Cuotas de IVA incluidas en el precio', '120,00\u00a0€']]);
  assert.deepEqual(menciones(f, L), ['Régimen especial de las agencias de viajes']);
  // Las cuotas incluidas solo en el de agencias de viajes; un régimen de margen no va con recargo ni en otra moneda.
  assert.equal(pedir({ margen: 'rebu', cuotasIncluidas: true, lineas: [linea(100, 50)] }).cuotasIncluidas, undefined);
  assert.match(pedir({ margen: 'rebu', lineas: [linea(100, 50)], divisa: { moneda: 'USD', cambio: '1,1' } }).error, /en euros/);
  // Sin margen, el coste no se guarda en las líneas.
  assert.equal(pedir({ lineas: [linea(100, 50)] }).lineas[0].coste, undefined);
});

test('REAGP: quien está en el régimen cobra la compensación sin IVA; quien le compra se la deduce en la casilla 42', () => {
  const venta = pedir({ compensacion: 12, lineas: [{ concepto: 'Naranjas', cantidad: '1', precio: '1000', ivaPct: 0 }] }, { reagp: true });
  assert.deepEqual([venta.compensacion, importes(venta).compensacion, importes(venta).total], [12, 120, 1120]);
  assert.deepEqual(filasTotales(venta, formatoDoc(venta)), [['Base imponible', '1.000,00\u00a0€'], ['Compensación REAGP 12\u00a0%', '120,00\u00a0€']]);
  assert.match(pedir({ compensacion: 12, lineas: [{ concepto: 'Naranjas', cantidad: '1', precio: '1000', ivaPct: 0 }] }).error, /agricultura/);
  assert.match(pedir({ compensacion: 12, lineas: [{ concepto: 'Naranjas', cantidad: '1', precio: '1000', ivaPct: 10 }] }, { reagp: true }).error, /sin IVA/);
  const compra = { id: 'g1', fecha: '2026-02-01', concepto: 'Corderos', base: 1000, ivaPct: 0, compensacion: 10.5 };
  const c = casillas303([], [compra], 2026, 1);
  assert.deepEqual([c.base42, c['42'], c['45'], c['46']], [1000, 105, 105, -105]);
  const A = generarAsientos({ gastos: [compra], fiscal: { tipo: 'sociedad', iva: 'general' } }, '2026-02-15');
  const asiento = A.find((a) => a.origen?.id === 'g1' && a.concepto.startsWith('Corderos'));
  assert.ok(asiento.lineas.some((x) => x.cuenta === '472' && x.debe === 105));
  for (const a of A) assert.equal(Math.round(a.lineas.reduce((s, x) => s + x.debe - x.haber, 0) * 100), 0, a.concepto);
});

test('libros registro: clave 03 con el margen como base y el ingreso entero en la primera línea', () => {
  const f = { ...pedir({ margen: 'rebu', lineas: [linea(1210, 1000)] }), id: 'r1', numero: 7, anio: 2026 };
  const L = librosRegistro({ facturas: [f], fiscal: { tipo: 'autonomo', iva: 'general' }, actividades: ACTS, empresa: { nombre: 'X', nif: '12345678Z' } }, 2026, '2026-12-31');
  const filas = L.hojas[0].filas.map((x) => x.join('|'));
  assert.equal(filas.length, 1);
  assert.ok(filas[0].includes('|1173,55|') && filas[0].includes('|03|S1||1210,00|173,55|21,00|36,45|'), filas[0]);
});
