// Vender con recargo de equivalencia (auditoría 19-10-2026, punto 2): a un cliente comerciante minorista en ese régimen se
// le cobra, además del IVA, el recargo (art. 161 LIVA). Va al 303 (168-170 y 19-26), a Verifactu, a Facturae, al 347 y a los asientos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { casillas303, desglose, importes, liquidaciones303 } from '../lib/calculos.js';
import { fichero303, importe } from '../lib/ficheroAeat.js';
import { registroAlta } from '../lib/verifactu.js';
import { xmlAlta } from '../lib/verifactuXml.js';
import { facturae } from '../lib/facturae.js';
import { modelo347 } from '../lib/modelos.js';
import { generarAsientos } from '../lib/asientos.js';
import { limpiar } from '../lib/facturas.js';

const cliente = { nombre: 'Ultramarinos Pepa', nif: '12345678Z' };
const fac = (extra = {}) => ({ id: 'f1', fecha: '2026-02-10', anio: 2026, numero: 1, serie: '', actividad: 'a', cliente, irpfPct: 0, recargo: true,
  base: 1110, ivaPct: 21, lineas: [{ concepto: 'Aceite', cantidad: 10, precio: 100, dto: 0, ivaPct: 21 }, { concepto: 'Pan', cantidad: 10, precio: 10, dto: 0, ivaPct: 10 }, { concepto: 'Leche', cantidad: 10, precio: 1, dto: 0, ivaPct: 4 }], ...extra });

test('importes: el recargo por tipo (5,2 / 1,4 / 0,5 %) suma al total, no a la base ni al IVA', () => {
  const f = fac();
  assert.deepEqual(desglose(f).map((d) => [d.pct, d.re, d.recargo]), [[21, 5.2, 52], [10, 1.4, 1.4], [4, 0.5, 0.05]]);
  assert.deepEqual(importes(f), { base: 1110, iva: 220.4, recargo: 53.45, irpf: 0, total: 1383.85 });
  // Sin la marca, como siempre (y sin el campo recargo).
  assert.deepEqual(importes({ ...f, recargo: undefined }), { base: 1110, iva: 220.4, irpf: 0, total: 1330.4 });
  // Al 0 % no hay recargo.
  assert.equal(importes({ base: 100, ivaPct: 0, recargo: true }).total, 100);
});

test('303: recargo en las casillas 168-170 (0,5 %), 19-21 y 22-24, rectificativas en la 25-26 y todo dentro de la 27', () => {
  const rect = fac({ id: 'r1', serie: 'R', numero: 1, rectifica: { numero: '01-2026', fecha: '2026-02-10' }, base: -100, lineas: [{ concepto: 'Devolución', cantidad: 1, precio: -100, dto: 0, ivaPct: 21 }] });
  const c = casillas303([fac(), rect], [], 2026, 1);
  assert.deepEqual([c['168'], c['170'], c['19'], c['21'], c['22'], c['24']], [10, 0.05, 100, 1.4, 1000, 52]);
  assert.deepEqual([c['25'], c['26']], [-100, -5.2]);
  assert.equal(c['27'], 247.65); // 220,40 − 21 de IVA y 53,45 − 5,20 de recargo
  assert.equal(c['46'], c['27']);
});

test('fichero del 303: el recargo en sus posiciones del diseño DR303e26v101 (168-170, 19-24; la 16-18 vacía con tipo 0)', () => {
  const F = [fac()];
  const c = casillas303(F, [], 2026, 1);
  const { contenido } = fichero303({ nif: '12345678Z', nombre: 'Prueba' }, 2026, 1, c, liquidaciones303(F, [], 2026)[0]);
  const p1 = contenido.slice(contenido.indexOf('<T30301000>'));
  const campo = (pos, n) => p1.slice(pos - 1, pos - 1 + n);
  assert.equal(campo(506, 17), importe(10)); // 168
  assert.equal(campo(523, 5), '00050'); // 169
  assert.equal(campo(528, 17), importe(0.05)); // 170
  assert.equal(campo(545, 17), importe(0)); // 16: sin uso desde 2023
  assert.equal(campo(562, 5), '00000'); // 17
  assert.equal(campo(567, 17), importe(0)); // 18
  assert.equal(campo(584, 17), importe(100)); // 19
  assert.equal(campo(606, 17), importe(1.4)); // 21
  assert.equal(campo(623, 17), importe(1000)); // 22
  assert.equal(campo(645, 17), importe(52)); // 24
});

test('Verifactu: tipo y cuota del recargo en cada desglose, y en la cuota y el importe total', () => {
  const f = fac();
  const r = registroAlta(f, 'B12345674', '');
  assert.equal(r.CuotaTotal, '273.85');
  assert.equal(r.ImporteTotal, '1383.85');
  const xml = xmlAlta(r, { factura: f, emisorNombre: 'E', anterior: null, sistema: { nombre: 'N', nif: 'B12345674', version: '1', instalacion: 'x' }, fiscal: { iva: 'general' } });
  assert.match(xml, /<sum1:CuotaRepercutida>210.00<\/sum1:CuotaRepercutida><sum1:TipoRecargoEquivalencia>5.2<\/sum1:TipoRecargoEquivalencia><sum1:CuotaRecargoEquivalencia>52.00<\/sum1:CuotaRecargoEquivalencia>/);
});

test('Facturae: EquivalenceSurcharge por tipo y en cada línea, con totales que cuadran', () => {
  const xml = facturae(fac(), { nombre: 'Distribuciones SL', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: 'Madrid', cp: '28001' }, { sociedad: true });
  assert.match(xml, /<EquivalenceSurcharge>5.20<\/EquivalenceSurcharge><EquivalenceSurchargeAmount><TotalAmount>52.00<\/TotalAmount>/);
  assert.match(xml, /<TotalTaxOutputs>273.85<\/TotalTaxOutputs>/);
  assert.match(xml, /<InvoiceTotal>1383.85<\/InvoiceTotal>/);
});

test('347 con el recargo dentro del total y asientos que cuadran con él en la 477', () => {
  const f = fac({ base: 2600, lineas: [{ concepto: 'X', cantidad: 1, precio: 2600, dto: 0, ivaPct: 21 }] });
  // 2.600 + 546 + 135,20 = 3.281,20 €: pasa del umbral solo con el recargo dentro.
  assert.equal(modelo347([f], [], 2026).ventas[0].total, 3281.2);
  const A = generarAsientos({ facturas: [f], gastos: [], fiscal: { tipo: 'autonomo', iva: 'general' } }, '2026-12-31');
  const asiento = A.find((a) => a.concepto.startsWith('Factura'));
  const linea = (c) => asiento.lineas.find((l) => l.cuenta === c);
  assert.equal(linea('477').haber, 681.2);
  assert.equal(linea('430').debe, 3281.2);
});

test('solo en el régimen general: quien está en recargo o exento no lo cobra', () => {
  const b = { fecha: '2026-02-10', actividad: 'a', cliente, lineas: [{ concepto: 'X', cantidad: '1', precio: '100', ivaPct: 21 }], irpfPct: 0, recargo: true };
  assert.equal(limpiar(b, [{ id: 'a' }], true, { conRecargo: true }).recargo, true);
  assert.match(limpiar(b, [{ id: 'a' }], true, { conRecargo: false }).error, /régimen general/);
  assert.equal(limpiar({ ...b, recargo: false }, [{ id: 'a' }], true).recargo, undefined);
});
