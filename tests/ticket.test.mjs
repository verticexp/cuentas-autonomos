import test from 'node:test';
import assert from 'node:assert/strict';
import { limpiarTicket } from '../lib/ticket.js';

const hoy = '2026-10-13';
const fecha = '2026-10-01';
const avisoImportes = 'Los importes leídos no cuadran con el total: revisa la base y el IVA';
const avisoFecha = 'No se ha podido leer la fecha: comprueba que es la del ticket';
const ticket = (datos) => limpiarTicket({ fecha, ...datos }, hoy);

test('ticket de un tipo: conserva los campos y los importes anteriores', () => {
  assert.deepEqual(ticket({ proveedor: 'Bauhaus', concepto: 'Cables', base: 82.64, ivaPct: 21, total: 100 }),
    { proveedor: 'Bauhaus', nif: '', fecha, concepto: 'Cables', base: 82.64, ivaPct: 21, lineas: [] });
  const t = ticket({ base: 82.64, total: 100, desglose: [{ ivaPct: 21, base: 82.64, cuota: 17.36 }] });
  assert.equal(t.base, 82.64);
  assert.equal(t.ivaPct, 21);
  assert.equal(t.cuadra, true);
  assert.equal(t.varios, false);
  assert.deepEqual(t.avisos, []);
});

test('dos tipos: suma 200 de base y 31 de IVA, agrupando tipos repetidos', () => {
  const t = ticket({ base: 999, total: 231, desglose: [
    { ivaPct: 21, base: 40, cuota: 8.4 },
    { ivaPct: 10, base: 100, cuota: 10 },
    { ivaPct: 21, base: 60, cuota: 12.6 },
  ] });
  assert.equal(t.base, 200);
  assert.equal(t.ivaPct, 21);
  assert.equal(t.varios, true);
  assert.equal(t.cuadra, true);
  assert.equal(t.desglose.reduce((s, l) => s + l.cuota, 0), 31);
  assert.deepEqual(t.desglose, [{ ivaPct: 21, base: 100, cuota: 21 }, { ivaPct: 10, base: 100, cuota: 10 }]);
  assert.equal(ticket({ desglose: [{ ivaPct: 21, base: 10, cuota: 2.1 }, { ivaPct: 10, base: 100, cuota: 10 }] }).ivaPct, 10);
});

test('la retención se resta como importe para comprobar el total', () => {
  const t = ticket({ total: '106,00', irpf: '15,00', desglose: [{ ivaPct: 21, base: '100,00', cuota: '21,00' }] });
  assert.equal(t.irpf, 15);
  assert.equal(t.cuadra, true);
  assert.deepEqual(t.avisos, []);
});

test('total incorrecto: avisa; admite hasta dos céntimos de diferencia', () => {
  const datos = { base: 100, ivaPct: 21, desglose: [{ ivaPct: 21, base: 100, cuota: 21 }] };
  const t = ticket({ ...datos, total: 142 });
  assert.equal(t.cuadra, false);
  assert.deepEqual(t.avisos, [avisoImportes]);
  assert.equal(ticket({ ...datos, total: 121.02 }).cuadra, true);
  assert.equal(ticket({ ...datos, total: 121.03 }).cuadra, false);
  assert.equal(ticket({ ...datos, total: null }).cuadra, null);
  assert.equal(ticket({ ...datos, total: 121, desglose: [{ ivaPct: 21, base: 100, cuota: null }] }).cuadra, null);
});

for (const fechaLeida of [null, '2030-01-01']) {
  test(`fecha ${fechaLeida === null ? 'no leída' : 'futura'}: usa hoy y avisa`, () => {
    const t = ticket({ fecha: fechaLeida, base: 100, ivaPct: 21, total: 121 });
    assert.equal(t.fecha, hoy);
    assert.equal(t.fechaDudosa, true);
    assert.deepEqual(t.avisos, [avisoFecha]);
  });
}

test('ignora tipos no admitidos y admite 21, 10, 5, 4, 2 y 0', () => {
  const t = ticket({ total: 207, desglose: [
    { ivaPct: 18, base: 999, cuota: 179.82 },
    { ivaPct: null, base: 999, cuota: 0 },
    { ivaPct: 'ilegible', base: 999, cuota: 0 },
    { ivaPct: 5, base: 100, cuota: 5 },
    { ivaPct: 2, base: 100, cuota: 2 },
  ] });
  assert.deepEqual(t.desglose.map((l) => l.ivaPct), [5, 2]);
  assert.equal(t.base, 200);
  assert.equal(t.cuadra, true);
  for (const ivaPct of [21, 10, 5, 4, 2, 0]) {
    assert.equal(ticket({ total: 100 + ivaPct, desglose: [{ ivaPct, base: 100, cuota: ivaPct }] }).cuadra, true);
  }
});

for (const pct of [7, 15]) {
  test(`valida IRPF ${pct} % por importe y base con tolerancia de céntimos`, () => {
    for (const extra of [{}, { irpfPct: `${pct} %` }]) {
      const t = ticket({ base: 100, ivaPct: 21, irpf: pct, total: 121 - pct, ...extra });
      assert.equal(t.irpfPct, pct);
      assert.equal(t.cuadra, true);
      assert.deepEqual(t.avisos, []);
    }
    assert.equal(ticket({ base: 100, irpf: pct + 0.02 }).irpfPct, pct);
    assert.equal(ticket({ base: 100, irpf: pct + 0.03 }).irpfPct, null);
  });
  test(`reconstruye la base desde el total neto retenido al ${pct} %`, () => {
    const t = ticket({ total: 121 - pct, ivaPct: 21, irpf: pct, irpfPct: pct });
    assert.equal(t.base, 100);
    assert.equal(t.irpfPct, pct);
    assert.equal(t.cuadra, true);
    assert.deepEqual(t.avisos, []);
  });
}

test('sin retención explícita valida cero sin confundir un dato ausente', () => {
  assert.equal(ticket({ base: 100, total: 121, irpf: 0 }).irpfPct, 0);
  assert.equal(ticket({ base: 100, total: 121, irpfPct: 0 }).irpfPct, 0);
  assert.equal(ticket({ base: 100, total: 121, desglose: [] }).irpfPct, null);
});

test('no infiere retenciones ambiguas, incoherentes o inválidas', () => {
  for (const datos of [
    { base: 0.1, irpf: 0.01 },
    { base: 0.1, irpf: 0.01, irpfPct: 7 },
    { base: 100, irpf: 10 },
    { base: 100, irpf: 0.01 },
    { base: 100, irpf: 15, irpfPct: 7 },
    { base: 100, irpfPct: 15 },
  ]) {
    const t = ticket(datos);
    assert.equal(t.irpfPct, null);
    assert.ok(t.avisos.some((a) => a.includes('IRPF')));
  }
});

test('avisa del tipo no soportado sin convertirlo a un tipo admitido', () => {
  for (const irpf of [19, 15]) {
    const t = ticket({ base: 100, total: 121 - irpf, irpf, irpfPct: 19 });
    assert.equal(t.irpfPct, null);
    assert.ok(t.avisos.some((a) => a.includes('no está soportado')));
  }
});

test('el desglose manda sobre el fallback del total neto', () => {
  const t = ticket({ total: 216, irpf: 15, desglose: [
    { ivaPct: 21, base: 100, cuota: 21 }, { ivaPct: 10, base: 100, cuota: 10 },
  ] });
  assert.equal(t.base, 200);
  assert.equal(t.irpfPct, null);
  assert.equal(t.cuadra, true);
});


test('extractos: conserva margen para las líneas de una página sin permitir salida ilimitada', async () => {
  const { leerExtracto } = await import('../lib/ticket.js');
  const original = globalThis.fetch;
  const limites = [];
  globalThis.fetch = async (_url, opciones) => {
    limites.push(JSON.parse(opciones.body).max_tokens);
    return Response.json({ model: 'claude-haiku-4-5-20251001', usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ text: '{"movimientos":[]}' }] });
  };
  try { for (const paginas of [1, 2, 10]) assert.ok((await leerExtracto('YQ==', paginas)).filas); }
  finally { globalThis.fetch = original; }
  assert.deepEqual(limites, [4000, 8000, 16000]);
});


test('Registro Mercantil: IRPF impreso con signo negativo conserva base y neto', () => {
  const t = ticket({ base: '22,54', ivaPct: 21, irpf: '-3,38 €', irpfPct: '15%', total: '23,89', desglose: [{ ivaPct: 21, base: '22,54', cuota: '4,73' }] });
  assert.equal(t.base, 22.54);
  assert.equal(t.irpf, 3.38);
  assert.equal(t.irpfPct, 15);
  assert.equal(t.cuadra, true);
  assert.deepEqual(t.avisos, []);
});

test('porcentaje explícito sin cuota: reconstruye desde el neto y valida contra el total', () => {
  for (const pct of [7, 15]) {
    const t = ticket({ ivaPct: 21, irpfPct: pct, total: 121 - pct });
    assert.equal(t.base, 100);
    assert.equal(t.irpfPct, pct);
    assert.equal(t.irpf, pct);
    assert.equal(t.cuadra, true);
    const directo = ticket({ base: 100, ivaPct: 21, irpfPct: pct, total: 121 - pct });
    assert.equal(directo.irpfPct, pct);
    assert.equal(ticket({ base: 100, ivaPct: 21, irpfPct: pct, total: 121 }).irpfPct, null);
  }
});


test('IVA no leído no se convierte en IVA cero al reconstruir una base', () => {
  for (const ivaPct of [null, undefined, '']) {
    const t = ticket({ ivaPct, total: 106, irpf: -15 });
    assert.equal(t.ivaPct, 21);
    assert.equal(t.base, 100);
    assert.equal(t.irpfPct, 15);
  }
  assert.equal(ticket({ ivaPct: 0, total: 85, irpf: 15 }).ivaPct, 0);
});
