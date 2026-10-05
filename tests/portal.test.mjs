import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { delCliente } from '../lib/portal.js';
import { facturaPdf } from '../lib/pdf.js';

const doc = (id, nombre, fecha, extra = {}) => ({ id, numero: Number(id.slice(-1)), fecha, cliente: { nombre, ...extra } });

test('el portal enseña los documentos del cliente por nombre o NIF, los más recientes primero', () => {
  const c = { id: 'SALA APOLO', nombre: 'Sala Apolo', nif: 'B-12345678' };
  const docs = [
    doc('F1', 'Sala Apolo', '2026-01-10'),
    doc('F2', 'sala apolo ', '2026-03-02'),
    doc('F3', 'Apolo SL', '2026-02-01', { nif: 'b12345678' }),
    doc('F4', 'Otra sala', '2026-04-01'),
    doc('F5', 'Otra sala', '2026-04-02', { nif: '' }),
  ];
  assert.deepEqual(delCliente(c, docs).map((d) => d.id), ['F2', 'F3', 'F1']);
  // Sin NIF, un documento sin NIF no se cuela por coincidir en vacío.
  assert.deepEqual(delCliente({ id: 'OTRA SALA' }, docs).map((d) => d.id), ['F5', 'F4']);
  assert.deepEqual(delCliente({ id: 'NADIE', nif: '' }, docs), []);
  assert.deepEqual(delCliente(c, null), []);
});

const hex = (s) => Buffer.from(s, 'latin1').toString('hex').toUpperCase();
// El texto de las páginas va comprimido: se descomprime cada «stream» para buscarlo.
const texto = (bytes) => {
  const b = Buffer.from(bytes), s = b.toString('latin1');
  let out = '';
  for (const m of s.matchAll(/stream\r?\n/g)) {
    const ini = m.index + m[0].length, fin = s.indexOf('endstream', ini);
    try { out += inflateSync(b.subarray(ini, fin)).toString('latin1'); } catch { /* no es texto */ }
  }
  return out;
};
test('el PDF de un presupuesto dice «Presupuesto» y hasta cuándo vale', async () => {
  const e = { nombre: 'Marc', nif: '11111111H', iban: 'ES00 0000', plazo: 30 };
  const p = { id: 'P2026-1', serie: 'P', numero: 1, anio: 2026, fecha: '2026-05-01', validez: 15, cliente: { nombre: 'Sala Apolo' }, concepto: 'Bolo', base: 1000, ivaPct: 21, irpfPct: 0 };
  const txt = texto(await facturaPdf(p, e, {}, { presupuesto: true }));
  assert.ok(txt.includes(hex('Presupuesto')) && txt.includes(hex('VÁLIDO HASTA')) && txt.includes(hex('16-05-2026')));
  assert.ok(!txt.includes(hex('FACTURAR A')));
  const f = texto(await facturaPdf({ ...p, serie: '', id: '1' }, e, {}));
  assert.ok(f.includes(hex('FACTURAR A')) && f.includes(hex('VENCIMIENTO')));
});
