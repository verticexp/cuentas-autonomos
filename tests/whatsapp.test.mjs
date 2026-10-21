import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { accionDe } from '../lib/whatsappIA.js';
import { aplicarCambios, buscarCliente, cuerpoFactura, firmaValida, mensajesDe, resumenBorrador, siNo, telefonosAutorizados } from '../lib/whatsapp.js';
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
    { id: 'w2', from: '34600111222', type: 'audio', audio: { id: 'm9', mime_type: 'audio/ogg; codecs=opus' } },
    { id: 'w3', from: '34600111222', type: 'image', image: {} },
  ], statuses: [{ id: 'x' }] } }] }] };
  assert.deepEqual(mensajesDe(aviso), [
    { id: 'w1', de: '34600111222', texto: 'Factura a Pepe' },
    { id: 'w2', de: '34600111222', audio: 'm9' },
    { id: 'w3', de: '34600111222', otro: true },
  ]);
  assert.deepEqual(mensajesDe({}), []);
});

test('sí / no al confirmar', () => {
  for (const t of ['SÍ', 'si', 'Sí, emítela', 'vale', 'ok!', 'siii 👍']) assert.equal(siNo(t), 'si', t);
  for (const t of ['No', 'cancela', 'déjalo']) assert.equal(siNo(t), 'no', t);
  // Con cambios o dudas decide la IA: un «sí, pero…» no puede emitir sin el cambio.
  for (const t of ['Factura a Bar Pepe de 300', 'sí pero cambia el NIF', 'si, aunque el importe es 350', 'no sé', 'nota']) assert.equal(siNo(t), null, t);
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
  assert.match(txt, /¿La emito así\?/);
});

test('fecha inventada o mal escrita: se usa la de hoy; IVA raro: el de la actividad', () => {
  const b = cuerpoFactura({ cliente: 'X', fecha: 'mañana', lineas: [{ concepto: 'a', precio: 10, ivaPct: 33 }] }, { actividad: { ivaPct: 21, irpfPct: 0 }, hoy: '2026-10-20' });
  assert.equal(b.fecha, '2026-10-20');
  assert.equal(b.lineas[0].ivaPct, 21);
  assert.equal(b.cliente.nombre, 'X');
});

test('corregir el borrador por el chat: solo cambia lo pedido', () => {
  const actividad = { id: 'dj', ivaPct: 21, irpfPct: 15 };
  const cuerpo = cuerpoFactura({ cliente: 'pepe', lineas: [{ concepto: 'Sesión', precio: 300 }] }, { ficha: { nombre: 'Bar Pepe S.L.', nif: '12345678Z', ciudad: 'Girona' }, actividad, hoy: '2026-10-21' });
  const b = { cuerpo, email: 'pepe@bar.es' };
  const r = aplicarCambios(b, { cliente: { nif: '87654321X', direccion: 'C/ Sol 3' } }, { actividad });
  assert.equal(r.cuerpo.cliente.nif, '87654321X');
  assert.equal(r.cuerpo.cliente.direccion, 'C/ Sol 3');
  assert.equal(r.cuerpo.cliente.ciudad, 'Girona');
  assert.equal(r.cuerpo.lineas[0].precio, 300);
  assert.equal(r.email, 'pepe@bar.es');
  assert.equal(cuerpo.cliente.nif, '12345678Z'); // el original no se toca
  const r2 = aplicarCambios(b, { lineas: [{ concepto: 'Sesión', precio: 350 }], fecha: '2026-10-18', email: '' }, { actividad });
  assert.equal(r2.cuerpo.lineas[0].precio, 350);
  assert.equal(r2.cuerpo.lineas[0].ivaPct, 21);
  assert.equal(r2.cuerpo.fecha, '2026-10-18');
  assert.equal(r2.email, '');
  const r3 = aplicarCambios(b, { otroCliente: 'Sala Apolo' }, { ficha: { nombre: 'Sala Apolo', nif: '11111111H', email: 'a@apolo.es' }, actividad });
  assert.equal(r3.cuerpo.cliente.nombre, 'Sala Apolo');
  assert.equal(r3.email, 'a@apolo.es');
  const r4 = aplicarCambios(b, { otroCliente: 'Nuevo' }, { actividad });
  assert.deepEqual([r4.cuerpo.cliente.nombre, r4.cuerpo.cliente.nif, r4.email], ['Nuevo', '', '']);
});

test('la respuesta de la IA se convierte en una acción segura', () => {
  const uso = (name, input) => [{ type: 'text', text: 'x' }, { type: 'tool_use', name, input }];
  assert.equal(accionDe(uso('emitir', { mensaje: '¡Allá va!' })).accion, 'emitir');
  assert.equal(accionDe(uso('cambiar_borrador', { cliente: { nif: 'X' } })).accion, 'cambiar');
  assert.equal(accionDe(uso('preparar_factura', { cliente: 'Pepe', lineas: [{ concepto: 'a', precio: 1 }] })).accion, 'preparar');
  // Sin cliente o sin líneas no es una factura: se responde.
  assert.equal(accionDe(uso('preparar_factura', { cliente: 'Pepe', lineas: [] })).accion, 'responder');
  assert.equal(accionDe(uso('responder', { texto: '¡Hola! ¿Qué factura hacemos?' })).mensaje, '¡Hola! ¿Qué factura hacemos?');
  assert.equal(accionDe(uso('borrar_todo', {})).accion, 'responder');
  assert.equal(accionDe([]).accion, 'responder');
});

test('presupuestos: la IA los marca y el resumen habla de presupuesto, validez y enlace', () => {
  const uso = (input) => [{ type: 'tool_use', name: 'preparar_factura', input }];
  const lineas = [{ concepto: 'Boda', precio: 900 }];
  assert.equal(accionDe(uso({ tipo: 'presupuesto', cliente: 'Ana', lineas })).datos.tipo, 'presupuesto');
  assert.equal(accionDe(uso({ cliente: 'Ana', lineas })).datos.tipo, 'factura');
  assert.equal(accionDe(uso({ tipo: 'cosa', cliente: 'Ana', lineas })).datos.tipo, 'factura');
  const actividad = { id: 'dj', ivaPct: 21, irpfPct: 15 };
  const b = cuerpoFactura({ cliente: 'Ana', lineas, validez: 30 }, { actividad, hoy: '2026-10-21' });
  assert.equal(b.validez, 30);
  const datos = { ...limpiar(b, [{ id: 'dj', nombre: 'DJ', serie: '', ivaPct: 21, irpfPct: 15 }]), validez: 30 };
  const txt = resumenBorrador(datos, 'ana@x.es', { nombre: 'Marc' }, 'presupuesto');
  assert.match(txt, /^Presupuesto con fecha 21\/10\/2026, válido 30 días/);
  assert.match(txt, /enlace/);
  assert.match(txt, /¿Lo creo así\?/);
  assert.doesNotMatch(txt, /Email:/);
  assert.equal(aplicarCambios({ cuerpo: b, email: '' }, { validez: 45 }, { actividad }).cuerpo.validez, 45);
});
