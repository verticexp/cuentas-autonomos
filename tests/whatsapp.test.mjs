import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { buscarCliente, cuerpoFactura, firmaValida, mensajesDe, resumenBorrador, siNo, telefonosAutorizados } from '../lib/whatsapp.js';
import { limpiar } from '../lib/facturas.js';

test('firma de Meta: vale la buena, no la manipulada ni sin secreto', () => {
  const cuerpo = '{"a":1}';
  const ok = `sha256=${createHmac('sha256', 's3cr3t').update(cuerpo).digest('hex')}`;
  assert.ok(firmaValida(cuerpo, ok, 's3cr3t'));
  assert.ok(!firmaValida('{"a":2}', ok, 's3cr3t'));
  assert.ok(!firmaValida(cuerpo, ok, ''));
  assert.ok(!firmaValida(cuerpo, 'sha256=abc', 's3cr3t'));
  assert.ok(!firmaValida(cuerpo, null, 's3cr3t'));
});

test('teléfonos autorizados y mensajes de texto del aviso', () => {
  const m = telefonosAutorizados('+34 600 111 222=u1, 0034611222333=u2,malo');
  assert.equal(m.get('34600111222'), 'u1');
  assert.equal(m.get('34611222333'), 'u2');
  assert.equal(m.size, 2);
  const aviso = { entry: [{ changes: [{ value: { messages: [
    { id: 'w1', from: '34600111222', type: 'text', text: { body: 'Factura a Pepe' } },
    { id: 'w2', from: '34600111222', type: 'image', image: {} },
  ], statuses: [{ id: 'x' }] } }] }] };
  assert.deepEqual(mensajesDe(aviso), [{ id: 'w1', de: '34600111222', texto: 'Factura a Pepe' }]);
  assert.deepEqual(mensajesDe({}), []);
});

test('sí / no al confirmar', () => {
  for (const t of ['SÍ', 'si', 'Sí, emítela', 'vale', 'ok!']) assert.equal(siNo(t), 'si', t);
  for (const t of ['No', 'cancela', 'no gracias']) assert.equal(siNo(t), 'no', t);
  for (const t of ['Factura a Bar Pepe de 300', 'sinfonía', 'nota']) assert.equal(siNo(t), null, t);
});

test('busca el cliente sin acentos ni forma jurídica y avisa si hay dudas', () => {
  const cs = [{ nombre: 'Bar Pepe S.L.', nif: 'B12345678' }, { nombre: 'Sala Apolo' }, { nombre: 'Apolo Eventos SL' }];
  assert.equal(buscarCliente(cs, 'bar pepe').cliente.nif, 'B12345678');
  assert.equal(buscarCliente(cs, 'Sala Apolo').cliente.nombre, 'Sala Apolo');
  assert.deepEqual(buscarCliente(cs, 'apolo').varios, ['Sala Apolo', 'Apolo Eventos SL']);
  assert.deepEqual(buscarCliente(cs, 'Desconocido'), {});
  assert.deepEqual(buscarCliente(cs, ''), {});
});

test('del pedido de la IA a una factura válida con los tipos de la actividad', () => {
  const actividad = { id: 'dj', ivaPct: 21, irpfPct: 15 };
  const ficha = { nombre: 'Bar Pepe S.L.', nif: '12345678Z', email: 'pepe@bar.es' };
  const b = cuerpoFactura({ cliente: 'pepe', lineas: [{ concepto: 'Sesión DJ sábado', precio: 300 }] }, { ficha, actividad, hoy: '2026-10-20' });
  assert.equal(b.fecha, '2026-10-20');
  assert.equal(b.lineas[0].ivaPct, 21);
  assert.equal(b.irpfPct, 15);
  const datos = limpiar(b, [{ id: 'dj', nombre: 'DJ', serie: '', ivaPct: 21, irpfPct: 15 }]);
  assert.ok(!datos.error, datos.error);
  assert.equal(datos.base, 300);
  const txt = resumenBorrador(datos, 'pepe@bar.es', { nombre: 'Marc DJ', nif: '87654321X', direccion: 'C/ Mayor 1', ciudad: 'Barcelona' });
  assert.match(txt, /Bar Pepe S\.L\./);
  assert.match(txt, /De:\* Marc DJ\nNIF: 87654321X\nDirección: C\/ Mayor 1, Barcelona/);
  assert.match(txt, /NIF: 12345678Z/);
  assert.match(txt, /Para:[\s\S]*sin dirección/); // al cliente le falta la dirección: se avisa
  assert.match(txt, /318/); // 300 + 63 − 45
  assert.match(txt, /pepe@bar\.es/);
  assert.match(txt, /SÍ/);
});

test('fecha inventada o mal escrita: se usa la de hoy; IVA raro: el de la actividad', () => {
  const b = cuerpoFactura({ cliente: 'X', fecha: 'mañana', lineas: [{ concepto: 'a', precio: 10, ivaPct: 33 }] }, { actividad: { ivaPct: 21, irpfPct: 0 }, hoy: '2026-10-20' });
  assert.equal(b.fecha, '2026-10-20');
  assert.equal(b.lineas[0].ivaPct, 21);
  assert.equal(b.cliente.nombre, 'X');
});
