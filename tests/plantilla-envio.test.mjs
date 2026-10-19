import test from 'node:test';
import assert from 'node:assert/strict';
import { CAMPOS_PLANTILLA, rellenar, asuntoFactura, mensajeFactura } from '../lib/plantillaEnvio.js';

const f = { numero: 15, anio: 2026, fecha: '2026-10-01', cliente: { nombre: 'Cliente Ejemplo S.L.' }, base: 1000, ivaPct: 21, irpfPct: 0 };
const e = { nombre: 'Empresa Ejemplo', plazo: 30 };
const asunto = 'Factura 15-2026 de Empresa Ejemplo';
const mensaje = 'Hola,\n\nTe adjunto la factura 15-2026 por 1.210,00\u00a0€, con vencimiento el 31 de octubre.\n\nGracias,\nEmpresa Ejemplo';

test('sin plantilla conserva exactamente los textos anteriores', () => {
  for (const envio of [undefined, null, {}, { asunto: '', mensaje: '', firma: '' }, { asunto: '  ', mensaje: '\n', firma: ' ' }]) {
    assert.equal(asuntoFactura(f, e, envio), asunto);
    assert.equal(mensajeFactura(f, e, envio), mensaje);
  }
  assert.equal(asuntoFactura(f, { plazo: 30 }), 'Factura 15-2026 de');
  assert.equal(mensajeFactura(f, { plazo: 30 }), mensaje.replace(/Empresa Ejemplo$/, ''));
});

test('asunto, mensaje y firma propios rellenan todos los marcadores', () => {
  const envio = {
    asunto: '{empresa}: factura {numero} para {cliente}',
    mensaje: 'Hola {cliente},\nTotal: {total}. Vence el {vencimiento}.',
    firma: 'Saludos,\n{empresa} · {numero}',
  };
  assert.equal(asuntoFactura(f, e, envio), 'Empresa Ejemplo: factura 15-2026 para Cliente Ejemplo S.L.');
  assert.equal(mensajeFactura(f, e, envio), 'Hola Cliente Ejemplo S.L.,\nTotal: 1.210,00\u00a0€. Vence el 31 de octubre.\n\nSaludos,\nEmpresa Ejemplo · 15-2026');
  assert.equal(mensajeFactura(f, e, { mensaje: 'Texto propio' }), 'Texto propio');
  assert.equal(CAMPOS_PLANTILLA.length, 5);
});

test('conserva marcadores desconocidos y sustituye los repetidos sin interpretar el contenido', () => {
  assert.equal(rellenar('{numero} {desconocido} {numero} {constructor} {toString}', f, e), '15-2026 {desconocido} 15-2026 {constructor} {toString}');
  assert.equal(rellenar('{cliente}', { ...f, cliente: { nombre: '$& {empresa}' } }, e), '$& {empresa}');
  assert.equal(rellenar('', f, e), '');
});

test('firma sin mensaje propio sustituye la despedida por defecto', () => {
  assert.equal(mensajeFactura(f, e, { firma: 'Administración de {empresa}' }), mensaje.replace(/Empresa Ejemplo$/, 'Administración de Empresa Ejemplo'));
  assert.equal(asuntoFactura(f, e, { firma: 'Firma' }), asunto);
});

test('respeta la numeración y el vencimiento guardados en la factura', () => {
  assert.equal(rellenar('{numero}: {vencimiento}', { ...f, importada: '2026-015', vence: '2026-11-15' }, e), '2026-015: 15 de noviembre');
  assert.equal(rellenar('{numero}', { ...f, serie: 'R' }, e), 'R15-2026');
});
