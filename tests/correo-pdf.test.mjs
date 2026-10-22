import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { correoPdf } from '../lib/correoPdf.js';

const datos = { de: 'facturas@ejemplo.es', deNombre: 'Proveedor', asunto: 'Factura', fecha: '22/10/2026' };

test('el correo genera un PDF A4 con metadatos y una página', async () => {
  const bytes = await correoPdf({ ...datos, texto: 'Una factura breve' });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 595.28, height: 841.89 });
  assert.equal(doc.getTitle(), 'Factura');
  assert.equal(doc.getProducer(), 'Fisquo');
});

test('el correo se limita a diez páginas', async () => {
  const doc = await PDFDocument.load(await correoPdf({ ...datos, texto: 'Línea de factura\n'.repeat(2000) }));
  assert.equal(doc.getPageCount(), 10);
});

for (const texto of ['Importe: 20 € · España — recibido 😀', `https://ejemplo.es/${'a'.repeat(400)}`, '']) {
  test(`admite caracteres, URL o texto vacío: ${texto.slice(0, 35)}`, async () => {
    const doc = await PDFDocument.load(await correoPdf({ texto }));
    assert.equal(doc.getPageCount(), 1);
    assert.equal(doc.getTitle(), 'Correo recibido');
  });
}
