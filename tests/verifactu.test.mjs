// Huella y QR de Verifactu con los ejemplos de la AEAT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { horaMadrid, huella, registroAlta, urlQr } from '../lib/verifactu.js';

test('huella del primer registro igual que el ejemplo de la AEAT', () => {
  assert.equal(huella({
    IDEmisorFactura: '89890001K', NumSerieFactura: '12345678/G33', FechaExpedicionFactura: '01-01-2024',
    TipoFactura: 'F1', CuotaTotal: '12.35', ImporteTotal: '123.45', Huella: '', FechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  }), '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60');
});

test('cada registro se encadena con el anterior', () => {
  const f = { numero: 1, anio: 2026, serie: 'V', fecha: '2026-10-01', base: 100, ivaPct: 21, irpfPct: 15 };
  const a = registroAlta(f, '12345678Z', '', '2026-10-01T10:00:00+02:00');
  assert.equal(a.CuotaTotal, '21.00');
  assert.equal(a.ImporteTotal, '121.00'); // sin restar el IRPF
  const b = registroAlta({ ...f, numero: 2 }, '12345678Z', a.Huella, '2026-10-01T10:05:00+02:00');
  assert.equal(b.HuellaAnterior, a.Huella);
  assert.notEqual(b.Huella, a.Huella);
  assert.equal(registroAlta({ ...f, serie: 'R', base: -100 }, '12345678Z').TipoFactura, 'R4');
});

test('QR y hora de Madrid', () => {
  const f = { numero: 1, anio: 2026, serie: 'V', fecha: '2026-10-01', base: 100, ivaPct: 21 };
  assert.equal(urlQr('pruebas', '12345678Z', f), 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=12345678Z&numserie=V2026-001&fecha=01-10-2026&importe=121.00');
  assert.equal(horaMadrid(new Date('2026-07-01T10:00:00Z')), '2026-07-01T12:00:00+02:00');
  assert.equal(horaMadrid(new Date('2026-01-15T10:00:00Z')), '2026-01-15T11:00:00+01:00');
});
