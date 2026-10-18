import test from 'node:test';
import assert from 'node:assert/strict';
import { preparar, subir } from '../lib/justificanteCliente.js';

test('el PDF conserva sus bytes y huella al preparar el justificante', async () => {
  const pdf = new Blob(['%PDF-1.7\nFactura con IVA e IRPF\n%%EOF'], { type: 'application/pdf' });
  const j = await preparar(pdf);
  assert.equal(j.blob, pdf);
  assert.equal(await j.blob.text(), await pdf.text());
  assert.match(j.huella, /^[a-f0-9]{64}$/);
});

test('la subida informa de almacén ausente incluso al guardar el gasto', async (t) => {
  const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
  t.mock.method(globalThis, 'fetch', async (url, opciones) => {
    assert.equal(url, '/api/gastos/justificante?id=gasto%201');
    assert.equal(opciones.method, 'PUT');
    assert.equal(opciones.body, pdf);
    return Response.json({ error: 'Almacén no configurado' }, { status: 503 });
  });
  assert.equal(await subir('gasto 1', pdf, { alGuardar: true }), 'Almacén no configurado');
});

test('subida confirmada, error de tamaño y desconexión se distinguen', async (t) => {
  const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 200 }));
  assert.equal(await subir('g', pdf), '');
  mock.mock.mockImplementation(async () => new Response(null, { status: 413 }));
  assert.match(await subir('g', pdf), /demasiado grande/);
  mock.mock.mockImplementation(async () => { throw new Error('offline'); });
  assert.match(await subir('g', pdf), /sin conexión/);
});
