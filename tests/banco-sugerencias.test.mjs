import test from 'node:test';
import assert from 'node:assert/strict';
import { sugerencias, opciones } from '../lib/banco.js';

const factura = (extra = {}) => ({ id: 'f', importada: 'A2026-01', fecha: '2026-06-15',
  cliente: { nombre: 'Hotel Mirador' }, base: 100, ivaPct: 0, irpfPct: 0, cobrada: false, ...extra });
const gasto = (extra = {}) => ({ id: 'g', numero: 'P2026-01', fecha: '2026-06-15',
  proveedor: 'Hotel Mirador', concepto: 'Material', base: 100, ivaPct: 0, pendiente: true, ...extra });
const movimiento = (extra = {}) => ({ id: 'm', fecha: '2026-06-17', importe: 100,
  concepto: 'TRANSFERENCIA', estado: 'pendiente', ...extra });
const ingreso = (m = {}, f = {}) => sugerencias([movimiento(m)], [factura(f)], []).m;
const cargo = (m = {}, g = {}) => sugerencias([movimiento({ importe: -100, ...m })], [], [gasto(g)]).m;
const fechaMas = (n) => new Date(Date.parse('2026-06-15T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

test('1: importe y dos días no acreditan identidad de un gasto pendiente', () => {
  const s = cargo();
  assert.equal(s.puntos, 75);
  assert.equal(s.segura, false);
  assert.equal(s.porNumero, false);
  assert.equal(s.porNombre, false);
  assert.equal(cargo({ concepto: 'Hotel Mirador' }).segura, true);
  assert.equal(ingreso().segura, false);
  assert.equal(ingreso({ concepto: 'A2026-01' }).segura, true);
});

test('2: una palabra compartida no confirma al cliente ni al proveedor equivocado', () => {
  for (const sugerir of [ingreso, cargo]) {
    const s = sugerir({ concepto: 'Transferencia Hotel Central' });
    assert.equal(s.segura, false);
    assert.equal(s.porNombre, false);
    assert.equal(sugerir({ concepto: 'Hotel Mirador' }).segura, true);
  }
  assert.equal(cargo({ concepto: 'Material' }).segura, false);
  assert.equal(cargo({ concepto: 'Material' }).porNombre, false);
  assert.equal(cargo({ concepto: 'Hotel Mirador Material' }).segura, true);
});

test('2: todas las palabras o dos distintivas, y nombre único de al menos cinco letras', () => {
  assert.equal(ingreso({ concepto: 'Mirador Port' }, { cliente: { nombre: 'Hotel Mirador del Port S.A.' } }).segura, true);
  assert.equal(ingreso({ concepto: 'Iberdrola' }, { cliente: { nombre: 'Iberdrola' } }).segura, true);
  assert.equal(cargo({ concepto: 'Iberdrola' }, { proveedor: 'Iberdrola' }).segura, true);
  assert.equal(ingreso({ concepto: 'Luna' }, { cliente: { nombre: 'Luna' } }).segura, false);
  assert.equal(cargo({ concepto: 'Hotel' }, { proveedor: 'Hotel Hotel Mirador' }).segura, false);
  assert.equal(ingreso({ concepto: 'Transferencia' }, { cliente: { nombre: 'Servicios Eventos' } }).segura, false);
  assert.equal(cargo({ concepto: '', contraparte: 'HÓTEL MIRADOR' }).segura, true);
});

test('2: los nombres distintivos cortos evitan confundir apellidos y comercios', () => {
  assert.equal(ingreso({ concepto: 'Bea López' }, { cliente: { nombre: 'Ana López' } }).segura, false);
  assert.equal(ingreso({ concepto: 'Ana López' }, { cliente: { nombre: 'Ana López' } }).segura, true);
  assert.equal(cargo({ concepto: 'Ferretería Central' }, { proveedor: 'Ferretería Sol' }).segura, false);
  assert.equal(cargo({ concepto: 'Ferretería Sol' }, { proveedor: 'Ferretería Sol' }).segura, true);
});

test('3: referencia exacta permite cobrar parcialmente o revisar un importe distinto', () => {
  const f = { base: 100, ivaPct: 21 };
  const parcial = ingreso({ importe: 50, concepto: 'A2026-01 Hotel Mirador' }, f);
  assert.deepEqual([parcial.id, parcial.importe, parcial.segura, parcial.motivo, parcial.porNumero], ['f', 121, false, 'parcial', true]);
  assert.equal(ingreso({ importe: 50, concepto: 'Hotel Mirador' }, f), undefined);
  const distinto = ingreso({ importe: 150, concepto: 'A2026-01 Hotel Mirador' }, f);
  assert.deepEqual([distinto.segura, distinto.motivo], [false, 'importe-distinto']);
  assert.equal(ingreso({ importe: 121, concepto: 'A2026-01 Hotel Mirador' }, f).segura, true);
  assert.equal(ingreso({ importe: 50, concepto: 'A2026-01' }, { ...f, cobrada: true }), undefined);
  assert.equal(ingreso({ concepto: 'A2026-01' }, { pagos: [{ importe: 100 }] }), undefined);
  assert.equal(sugerencias([movimiento({ importe: -50, concepto: 'A2026-01' })], [factura()], []).m, undefined);
});

test('3: los cargos con número de proveedor admiten pagos parciales o distintos', () => {
  for (const [importe, motivo] of [[-50, 'parcial'], [-150, 'importe-distinto']]) {
    assert.deepEqual([cargo({ importe, concepto: 'P2026-01' }).segura, cargo({ importe, concepto: 'P2026-01' }).motivo], [false, motivo]);
    assert.equal(cargo({ importe, concepto: 'Hotel Mirador' }), undefined);
  }
  assert.equal(cargo({ concepto: 'P2026-01' }).segura, true);
  assert.equal(cargo({ importe: -50, concepto: 'P2026-01' }, { banco: 'ya' }), undefined);
  assert.equal(sugerencias([movimiento({ importe: 50, concepto: 'P2026-01' })], [], [gasto()]).m, undefined);
});

test('4: dos movimientos con la misma referencia conservan sugerencias en conflicto en ambos órdenes', () => {
  for (const importe of [100, 50]) {
    const ms = [movimiento({ id: 'uno', concepto: 'A2026-01' }), movimiento({ id: 'dos', importe, concepto: 'A2026-01' })];
    for (const lista of [ms, [...ms].reverse()]) {
      const s = sugerencias(lista, [factura()], []);
      for (const id of ['uno', 'dos']) assert.deepEqual([s[id].id, s[id].segura, s[id].motivo], ['f', false, 'conflicto']);
    }
  }
  assert.equal(ingreso({ concepto: 'A2026-01' }).segura, true);
});

test('4: misma mejor candidata por nombre tampoco es segura; incluye gastos', () => {
  for (const importe of [100, -100]) {
    const ms = ['uno', 'dos'].map((id) => movimiento({ id, importe, concepto: 'Hotel Mirador' }));
    const s = sugerencias(ms, [factura()], [gasto()]);
    for (const id of ['uno', 'dos']) assert.deepEqual([s[id].segura, s[id].motivo], [false, 'conflicto']);
  }
  assert.equal(cargo({ concepto: 'Hotel Mirador' }).segura, true);
});

test('4: una alternativa de menos puntos nunca se eleva a segura', () => {
  const fs = [factura(), factura({ id: 'otra', importada: 'A2026-02' })];
  const ms = ['uno', 'dos'].map((id) => movimiento({ id, concepto: 'A2026-01 Hotel Mirador' }));
  const s = sugerencias(ms, fs, []);
  assert.deepEqual([s.uno.id, s.uno.segura, s.uno.motivo], ['f', false, 'conflicto']);
  assert.deepEqual([s.dos.id, s.dos.puntos, s.dos.segura, s.dos.motivo], ['otra', 80, false, 'alternativa']);
  assert.equal(ingreso({ concepto: 'Hotel Mirador' }, fs[1]).segura, true);
  const independientes = sugerencias([movimiento({ id: 'uno', concepto: 'A2026-01' }), movimiento({ id: 'dos', concepto: 'A2026-02' })], fs, []);
  assert.equal(independientes.uno.segura, true);
  assert.equal(independientes.dos.segura, true);
});

test('4: una referencia disputada impide seguridad incluso si no es la mejor candidata', () => {
  const fs = [factura(), factura({ id: 'otra', importada: 'A2026-02', base: 50 })];
  const s = sugerencias([movimiento({ id: 'uno', concepto: 'A2026-01' }),
    movimiento({ id: 'dos', importe: 50, concepto: 'A2026-01 A2026-02' })], fs, []);
  assert.equal(s.uno.motivo, 'conflicto');
  assert.equal(s.dos.motivo, 'conflicto');
  assert.equal(s.dos.segura, false);
});

test('5: céntimos enteros, ±1 céntimo uniforme, sin ingreso exacto por encima del saldo', () => {
  for (const importe of [99.99, 99.989999999, 100]) {
    assert.equal(ingreso({ importe, concepto: 'Hotel Mirador' }).segura, true);
    assert.equal(cargo({ importe: -importe, concepto: 'Hotel Mirador' }).segura, true);
  }
  // La tolerancia conserva un céntimo por debajo como exacto; nunca permite exceder el saldo.
  assert.equal(ingreso({ importe: 99.99, concepto: 'A2026-01' }).segura, true);
  assert.equal(ingreso({ importe: 100.01, concepto: 'Hotel Mirador' }), undefined);
  assert.equal(ingreso({ importe: 100.01, concepto: 'A2026-01' }).motivo, 'importe-distinto');
  assert.equal(cargo({ importe: -100.010000001, concepto: 'Hotel Mirador' }).segura, true);
  assert.equal(cargo({ importe: -100.02, concepto: 'Hotel Mirador' }), undefined);
  assert.equal(ingreso({ importe: 99.98, concepto: 'Hotel Mirador' }), undefined);
  assert.equal(ingreso({ importe: 99.98, concepto: 'A2026-01' }).motivo, 'parcial');
  assert.equal(ingreso({ importe: 0, concepto: 'A2026-01' }), undefined);
});

test('6: gasto con retención casa con el neto; pagar también la retención exige revisión', () => {
  const s = cargo({ importe: -106, concepto: 'Hotel Mirador' }, { ivaPct: 21, irpfPct: 15 });
  assert.deepEqual([s.importe, s.segura], [106, true]);
  assert.ok(!cargo({ importe: -121, concepto: 'Hotel Mirador' }, { ivaPct: 21, irpfPct: 15 })?.segura);
  assert.equal(cargo({ importe: -50, concepto: 'P2026-01' }, { ivaPct: 21, irpfPct: 15 }).importe, 106);
  assert.equal(cargo({ importe: -121, concepto: 'Hotel Mirador' }, { ivaPct: 21 }).segura, true);
  // Dos variantes dentro de la tolerancia no generan un empate con el mismo gasto.
  assert.equal(cargo({ concepto: 'Hotel Mirador' }, { irpfPct: 0.01 }).segura, true);
});

test('7: anticipos de factura hasta 15 días solo con referencia exacta', () => {
  for (const n of [-15, -4]) {
    assert.equal(ingreso({ fecha: fechaMas(n), concepto: 'A2026-01' }).segura, true);
    assert.equal(ingreso({ fecha: fechaMas(n), concepto: 'Hotel Mirador' }), undefined);
  }
  assert.equal(ingreso({ fecha: fechaMas(-16), concepto: 'A2026-01' }), undefined);
  assert.equal(ingreso({ fecha: fechaMas(-3), concepto: 'Hotel Mirador' }).segura, true);
  assert.equal(ingreso({ fecha: fechaMas(-15), importe: 50, concepto: 'A2026-01' }).motivo, 'parcial');
});

test('7: gastos no pendientes hasta ±120 días solo con referencia exacta', () => {
  for (const n of [-120, -61, 61, 120]) {
    assert.equal(cargo({ fecha: fechaMas(n), concepto: 'P2026-01' }, { pendiente: false }).segura, true);
    assert.equal(cargo({ fecha: fechaMas(n), concepto: 'Hotel Mirador' }, { pendiente: false }), undefined);
  }
  for (const n of [-121, 121]) assert.equal(cargo({ fecha: fechaMas(n), concepto: 'P2026-01' }, { pendiente: false }), undefined);
  for (const n of [-60, 60]) assert.equal(cargo({ fecha: fechaMas(n), concepto: 'Hotel Mirador' }, { pendiente: false }).segura, true);
  assert.equal(cargo({ fecha: fechaMas(-120), concepto: 'P2026-01' }).segura, true);
  assert.equal(cargo({ fecha: fechaMas(-6), concepto: 'Hotel Mirador' }), undefined);
  assert.equal(cargo({ fecha: fechaMas(-5), concepto: 'Hotel Mirador' }).segura, true);
  assert.equal(cargo({ fecha: fechaMas(200), concepto: 'Hotel Mirador' }).segura, true);
});

test('8: referencia completa con límites, nunca subcadena alfanumérica', () => {
  for (const concepto of ['A2026-019', 'XA2026-01', 'A2026-01Z', '072026']) {
    const s = ingreso({ concepto });
    assert.equal(s.porNumero, false);
    assert.equal(s.segura, false);
    assert.equal(ingreso({ concepto, importe: 50 }), undefined);
  }
  for (const concepto of ['Pago (A2026-01).', 'A2026/01', 'a2026 01']) assert.equal(ingreso({ concepto }).segura, true);
  assert.equal(ingreso({ concepto: 'FRA 07-2026' }, { importada: undefined, numero: 7, anio: 2026 }).segura, true);
  assert.equal(cargo({ concepto: 'P2026-019' }).porNumero, false);
  assert.equal(cargo({ concepto: '(P2026-01)' }).segura, true);
  // La referencia se acredita en el concepto; la contraparte acredita el nombre.
  assert.equal(ingreso({ concepto: 'Pago', contraparte: 'A2026-01', importe: 50 }), undefined);
});

test('9: opciones exponen total y saldo de la factura, e importe del gasto', () => {
  const f = factura({ base: 100, ivaPct: 21, pagos: [{ importe: 50 }] });
  const o = opciones(movimiento(), [f], [])[0];
  assert.deepEqual([o.importe, o.total, o.saldo, o.total - o.saldo], [71, 121, 71, 50]);
  const g = opciones(movimiento({ importe: -106 }), [], [gasto({ ivaPct: 21, irpfPct: 15 })])[0];
  assert.deepEqual([g.importe, g.total, g.saldo], [106, 106, 106]);
  assert.deepEqual(opciones(movimiento(), [factura() ], []).map((x) => [x.total, x.saldo]), [[100, 100]]);
});

test('10: todas las sugerencias incluyen importe y pistas booleanas, también las no seguras', () => {
  const ejemplos = [ingreso(), ingreso({ concepto: 'A2026-01' }), ingreso({ importe: 50, concepto: 'A2026-01' }),
    cargo(), cargo({ concepto: 'Hotel Mirador' }), cargo({ importe: -150, concepto: 'P2026-01' })];
  for (const s of ejemplos) {
    for (const k of ['tipo', 'id', 'puntos', 'segura', 'importe', 'porNumero', 'porNombre']) assert.ok(k in s, k);
    assert.equal(typeof s.porNumero, 'boolean');
    assert.equal(typeof s.porNombre, 'boolean');
    assert.equal(typeof s.importe, 'number');
  }
  assert.equal(ejemplos[1].motivo, undefined);
  assert.equal(ejemplos[4].motivo, undefined);
});

test('un recibo domiciliado sin proveedor se reconoce por su concepto entero, no por una palabra suelta', () => {
  const g = { id: 'g1', fecha: '2026-10-01', base: 950, ivaPct: 21, concepto: 'Alquiler del almacén', pendiente: false };
  const exacto = { id: 'm1', fecha: '2026-10-01', importe: -1149.5, concepto: 'RECIBO ALQUILER DEL ALMACÉN', contraparte: '' };
  const suelta = { id: 'm2', fecha: '2026-10-01', importe: -1149.5, concepto: 'RECIBO ALMACENAJE', contraparte: '' };
  assert.equal(sugerencias([exacto], [], [g]).m1.segura, true);
  assert.equal(sugerencias([suelta], [], [g]).m2?.segura ?? false, false);
});

// Conciliación de liquidaciones que ya se cobraron por Stripe, remesa o tarjeta.
test('ya cobrada: sugiere por el importe del cobro externo, con identidad e importe exactos', () => {
  for (const metodo of ['stripe', 'remesa', 'tarjeta']) {
    const f = { cobrada: true, cobro: { metodo, importe: 90 } };
    const s = ingreso({ importe: 90, concepto: 'A2026-01' }, f);
    assert.deepEqual([s.yaCobrada, s.importe, s.segura], [true, 90, true]);
    assert.equal(ingreso({ importe: 90, concepto: 'Hotel Mirador' }, f).segura, true);
    assert.equal(ingreso({ importe: 90 }, f).segura, false);
    for (const importe of [89.99, 90.01]) assert.equal(ingreso({ importe, concepto: 'A2026-01' }, f).segura, true);
    for (const importe of [89.98, 90.02, 100]) assert.equal(ingreso({ importe, concepto: 'A2026-01' }, f), undefined);
  }
  assert.equal(ingreso({ concepto: 'A2026-01' }, { cobrada: true }).yaCobrada, true);
  // Sin flag cobrada pero con todos los pagos registrados por otra vía.
  const pagos = [{ metodo: 'stripe', importe: 30 }, { metodo: 'tarjeta', importe: 70 }];
  assert.equal(ingreso({ concepto: 'A2026-01' }, { pagos }).yaCobrada, true);
  assert.equal(ingreso({ importe: 95, concepto: 'A2026-01' }, { cobro: { metodo: 'remesa', importe: 95 } }).yaCobrada, true);
});

test('ya cobrada: excluye cualquier vínculo bancario y respeta la ventana de ±45 días', () => {
  const f = { cobrada: true, cobro: { metodo: 'stripe', importe: 100 } };
  for (const extra of [{ banco: 'b' }, { cobro: { ...f.cobro, banco: 'b' } },
    { pagos: [{ importe: 100, metodo: 'banco', banco: 'b' }] }, { pagos: [{ importe: 100, metodo: 'banco' }] }]) {
    assert.equal(ingreso({ concepto: 'A2026-01' }, { ...f, ...extra }), undefined);
  }
  for (const n of [-45, 45]) assert.equal(ingreso({ fecha: fechaMas(n), concepto: 'A2026-01' }, f).segura, true);
  for (const n of [-46, 46]) assert.equal(ingreso({ fecha: fechaMas(n), concepto: 'A2026-01' }, f), undefined);
  const ms = [movimiento(), movimiento({ id: 'enlazado', estado: 'emparejado', enlace: { tipo: 'factura', id: 'f', yaCobrada: true } })];
  assert.equal(sugerencias(ms, [factura(f)], []).m, undefined);
  const conflicto = sugerencias(['a', 'b'].map((id) => movimiento({ id, concepto: 'A2026-01' })), [factura(f)], []);
  for (const id of ['a', 'b']) assert.deepEqual([conflicto[id].yaCobrada, conflicto[id].segura, conflicto[id].motivo], [true, false, 'conflicto']);
});

test('esAutomatica exige seguridad, importe exacto e identidad adecuada; respeta descartes', async () => {
  const { esAutomatica, importeExacto } = await import('../lib/banco.js');
  const m = movimiento({ concepto: 'A2026-01' });
  const s = ingreso({ concepto: 'A2026-01' });
  assert.equal(esAutomatica(s, m), true);
  assert.equal(esAutomatica(ingreso({ concepto: 'Hotel Mirador' }), m), false);
  for (const campo of [{ segura: false }, { motivo: 'conflicto' }, { motivo: 'parcial' }, { importe: 99.98 }, { tipo: 'otro' }]) {
    assert.equal(esAutomatica({ ...s, ...campo }, m), false);
  }
  for (const extra of [{ autoDescartada: true }, { estado: 'ignorado' }, { estado: 'emparejado' }, { importe: -100 }]) {
    assert.equal(esAutomatica(s, { ...m, ...extra }), false);
  }
  assert.equal(esAutomatica(undefined, m), false);
  for (const concepto of ['Hotel Mirador', 'P2026-01']) assert.equal(esAutomatica(cargo({ concepto }), movimiento({ importe: -100 })), true);
  assert.equal(esAutomatica(cargo(), movimiento({ importe: -100 })), false);
  for (const importe of [99.99, 100, 100.01]) assert.equal(importeExacto(100, importe), true);
  assert.equal(importeExacto(100, 100.02), false);
  assert.equal(importeExacto(undefined, 100), false);
  assert.equal(esAutomatica(ingreso({ concepto: 'A2026-01' }, { cobrada: true }), m), true);
});

test('liquidación de pagos externos parciales: solo enlace por lo cobrado y cobro nuevo por el saldo restante', () => {
  const f = { base: 100, ivaPct: 21, pagos: [{ metodo: 'stripe', importe: 50 }] };
  assert.deepEqual([ingreso({ importe: 50, concepto: 'A2026-01' }, f).yaCobrada,
    ingreso({ importe: 50, concepto: 'A2026-01' }, f).importe], [true, 50]);
  const restante = ingreso({ importe: 71, concepto: 'A2026-01' }, f);
  assert.deepEqual([restante.importe, restante.segura, restante.yaCobrada], [71, true, undefined]);
  assert.equal(ingreso({ importe: 40, concepto: 'A2026-01' }, f).motivo, 'parcial');
});
