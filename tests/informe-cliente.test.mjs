import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { informePdf } from '../lib/informeCliente.js';

for (const [nombre, iva, irpf] of [
  ['IVA a pagar', { importe: 1234.56, compensar: 0, devolver: 0 }, { importe: 300 }],
  ['IVA a compensar sin IRPF', { importe: 0, compensar: 200, devolver: 0 }, null],
  ['IVA a devolver', { importe: 0, compensar: 0, devolver: 200 }, { importe: 0 }],
]) {
  test(`Informe de una página: ${nombre}`, async () => {
    const datos = {
      empresa: 'Peña “Música” y José — 100 €', nif: 'B12345678', anio: 2026, t: 2, fecha: '2026-07-01',
      trimestre: { ventas: 10000, gastos: 4000, beneficio: 6000, facturas: 12, nGastos: 8, iva, irpf },
      acumulado: { ventas: 18000, gastos: 7000, beneficio: 11000 },
      trimestres: [{ t: 1, ventas: 8000, gastos: 3000 }, { t: 2, ventas: 10000, gastos: 4000 }], sinJustificante: 2,
    };
    const bytes = await informePdf(datos, { despacho: 'Gestoría Muñoz “Àgil” €', color: '#245A48' });
    assert.ok(bytes instanceof Uint8Array);
    assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF');
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 1);
    assert.equal(pdf.getPage(0).getWidth(), 595.28);
    assert.equal(pdf.getPage(0).getHeight(), 841.89);
  });
}
