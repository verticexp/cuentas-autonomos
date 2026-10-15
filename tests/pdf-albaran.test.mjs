import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { albaranPdf, datosAlbaran, nombreArchivo } from '../lib/pdfAlbaran.js';

const e = { nombre: 'Taller Ejemplo SL', nif: 'B12345678', direccion: 'Calle Mayor 1', ciudad: 'Madrid' };
const alb = { id: 'a1', tipo: 'albaran', anio: 2026, numero: 7, fecha: '2026-10-15', pedido: 'p1', cliente: { nombre: 'Cliente Ñandú, S.A.', nif: 'A1' }, lineas: [{ concepto: 'Tornillos', cantidad: 10, precio: 1.5, ivaPct: 21 }, { concepto: 'Libro', cantidad: 2, precio: 20, dto: 10, ivaPct: 4 }], nota: 'Dejar en recepción' };
const ped = { id: 'p1', tipo: 'pedido', anio: 2026, numero: 3, fecha: '2026-10-01', entrega: '2026-10-20', cliente: alb.cliente, lineas: alb.lineas };

test('datos del albarán: número, totales, recibí y pedido de origen', () => {
  const a = datosAlbaran(alb, ped);
  assert.equal(a.numero, 'ALB2026-007');
  assert.equal(a.total.base, 51);
  assert.equal(a.total.total, r(15 * 1.21 + 36 * 1.04));
  assert.equal(a.recibi, true);
  assert.deepEqual(a.fechas[1], ['Pedido', 'PED2026-003']);
  const p = datosAlbaran(ped);
  assert.equal(p.recibi, false);
  assert.equal(p.fechas[1][0], 'Entrega prevista');
  assert.equal(nombreArchivo(alb), 'ALB2026-007 CLIENTE ÑANDÚ SA.pdf');
});

test('genera el PDF valorado y sin valorar', async () => {
  for (const valorado of [true, false]) {
    const doc = await PDFDocument.load(await albaranPdf(alb, e, {}, { valorado, pedido: ped }));
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getTitle(), 'ALB2026-007');
  }
  const muchas = { ...alb, lineas: Array.from({ length: 60 }, (_, i) => ({ concepto: `Línea ${i}`, cantidad: 1, precio: 1, ivaPct: 21 })) };
  assert.ok((await PDFDocument.load(await albaranPdf(muchas, e))).getPageCount() > 1);
});

function r(n) { return Math.round(n * 100) / 100; }
