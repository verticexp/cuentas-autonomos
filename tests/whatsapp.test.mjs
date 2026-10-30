import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { accionDe } from '../lib/whatsappIA.js';
import { cambiarGasto, resumenGasto } from '../lib/whatsapp.js';
import { aplicarCambios, buscarCliente, cuerpoFactura, elegirDocumento, entregaDe, firmaValida, lineasDeUltima, mensajesDe, resumenBorrador, separarDireccion, siNo, telefonosAutorizados, textoEmitido } from '../lib/whatsapp.js';
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
  const m = telefonosAutorizados('+34 600 111 222=u1, 0034611222333=ana@fisquo.com,malo');
  assert.equal(m.get('34600111222'), 'u1');
  assert.equal(m.get('34611222333'), 'ana@fisquo.com');
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
  assert.match(txt, /a nombre de Marc DJ \(87654321X\)/);
  assert.match(txt, /\*Bar Pepe S\.L\.\* · 12345678Z/);
  assert.match(txt, /Me falta su dirección\./); // al cliente le falta la dirección: se avisa, con naturalidad
  assert.match(resumenBorrador(datos, 'pepe@bar.es', {}), /En Ajustes te falta tu NIF y tu dirección\./);
  assert.doesNotMatch(txt, /🎙️|De:|Para:/); // sin formulario ni transcripción
  assert.match(txt, /318/); // 300 + 63 − 45
  assert.match(txt, /pepe@bar\.es/);
  assert.match(txt, /¿Está bien\? ¿La emito y se la envío\?$/);
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
  // «Sí, y pásamela a mí también»: se emite con la entrega nueva, sin volver a enseñarla; lo que no vale se ignora.
  assert.deepEqual(accionDe(uso('emitir', { entrega: 'ambos', email: ' Otro@Correo.es ' })).datos, { entrega: 'ambos', email: 'otro@correo.es' });
  assert.deepEqual(accionDe(uso('emitir', { entrega: 'paloma' })).datos, {});
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
  const limpio = limpiar(b, [{ id: 'dj', nombre: 'DJ', serie: '', ivaPct: 21, irpfPct: 15 }], false, { presupuesto: true });
  assert.ok(!limpio.error, limpio.error);
  const datos = { ...limpio, validez: 30 };
  const txt = resumenBorrador(datos, 'ana@x.es', { nombre: 'Marc' }, 'presupuesto');
  assert.match(txt, /21\/10\/2026 · válido 30 días/);
  assert.match(txt, /Se lo mando a ana@x\.es para que lo acepte/);
  assert.match(txt, /¿Está bien así\?$/);
  assert.match(resumenBorrador(datos, 'ana@x.es', {}, 'presupuesto', 'whatsapp'), /Te paso el PDF por aquí para que se lo reenvíes\. ¿Lo hago así\?/);
  assert.match(resumenBorrador(datos, 'ana@x.es', {}, 'factura', 'ambos'), /Se la mando a ana@x\.es y a ti te paso el PDF/);
  assert.match(resumenBorrador(datos, '', {}, 'factura', 'whatsapp'), /(no tengo su email)/);
  assert.equal(aplicarCambios({ cuerpo: b, email: '' }, { validez: 45 }, { actividad }).cuerpo.validez, 45);
});

test('entrega: por correo si hay email, PDF por WhatsApp si lo piden o no hay email', () => {
  assert.equal(entregaDe(undefined, 'a@b.es'), 'correo');
  assert.equal(entregaDe(undefined, ''), 'whatsapp');
  assert.equal(entregaDe('whatsapp', 'a@b.es'), 'whatsapp');
  assert.equal(entregaDe('ambos', 'a@b.es'), 'ambos');
  assert.equal(entregaDe('correo', ''), 'whatsapp'); // sin email no se puede mandar por correo
  assert.equal(entregaDe('ambos', ''), 'whatsapp');
  assert.equal(entregaDe('fax', 'a@b.es'), 'correo');
});

test('planes: WhatsApp no va en Esencial; tope de documentos al mes según el plan', async () => {
  const { planConFuncion, sinFuncion, topeWhatsapp, TOPE_WHATSAPP_LIBRE } = await import('../lib/planes.js');
  const pagado = (tipo, nombre) => ({ tipo, nombre, pagado: true, version: 3 });
  assert.match(sinFuncion(pagado('aut', 'Esencial'), 'whatsapp'), /Fisquo por WhatsApp no va en el plan Esencial/);
  assert.equal(sinFuncion(pagado('aut', 'Pro'), 'whatsapp'), null);
  assert.equal(sinFuncion(pagado('pym', 'Plus'), 'whatsapp'), null);
  assert.ok(sinFuncion(pagado('pym', 'Esencial'), 'whatsapp'));
  assert.equal(planConFuncion(pagado('aut', 'Esencial'), 'whatsapp').n, 'Pro');
  assert.equal(planConFuncion(pagado('pym', 'Esencial'), 'whatsapp').n, 'Pro');
  assert.equal(topeWhatsapp(pagado('aut', 'Esencial')), 0);
  assert.equal(topeWhatsapp(pagado('aut', 'Pro')), 100);
  assert.equal(topeWhatsapp(pagado('aut', 'Plus')), 300);
  assert.equal(topeWhatsapp(pagado('pym', 'Pro')), 300);
  assert.equal(topeWhatsapp({ fundador: true }), TOPE_WHATSAPP_LIBRE);
  // Las suscripciones de antes no pierden nada y ganan WhatsApp donde tenían el asistente.
  assert.equal(sinFuncion({ tipo: 'aut', nombre: 'Pro', pagado: true }, 'whatsapp'), null);
});

test('factura sin NIF del cliente por encima de 400 €: se avisa y se pide el NIF, como en el formulario', () => {
  const b = cuerpoFactura({ cliente: 'Ana', lineas: [{ concepto: 'Boda', precio: 900 }] }, { actividad: { id: 'dj', ivaPct: 21, irpfPct: 15 }, hoy: '2026-10-27' });
  assert.match(limpiar(b, [{ id: 'dj', nombre: 'DJ', serie: '', ivaPct: 21, irpfPct: 15 }]).error, /NIF/);
});

test('con IGIC se aceptan sus tipos (7 %) y no los del IVA (21 %)', async () => {
  const { TIPOS_IGIC } = await import('../lib/igic.js');
  const lineas = [{ concepto: 'a', precio: 10, ivaPct: 7 }, { concepto: 'b', precio: 10, ivaPct: 21 }];
  const b = cuerpoFactura({ cliente: 'X', lineas }, { actividad: { ivaPct: 7, irpfPct: 0 }, hoy: '2026-10-27', tipos: TIPOS_IGIC });
  assert.deepEqual(b.lineas.map((l) => l.ivaPct), [7, 7]);
});

test('fotos y PDF de gastos llegan como archivo; otros documentos no', () => {
  const aviso = { entry: [{ changes: [{ value: { messages: [
    { id: 'f1', from: '34600111222', type: 'image', image: { id: 'img1', caption: 'el de la gasolinera' } },
    { id: 'f2', from: '34600111222', type: 'document', document: { id: 'doc1', mime_type: 'application/pdf', filename: 'Factura Endesa.pdf' } },
    { id: 'f3', from: '34600111222', type: 'document', document: { id: 'doc2', mime_type: 'application/zip', filename: 'x.zip' } },
  ] } }] }] };
  assert.deepEqual(mensajesDe(aviso), [
    { id: 'f1', de: '34600111222', archivo: { id: 'img1', nombre: 'ticket-whatsapp.jpg' }, texto: 'el de la gasolinera' },
    { id: 'f2', de: '34600111222', archivo: { id: 'doc1', nombre: 'Factura Endesa.pdf' } },
    { id: 'f3', de: '34600111222', otro: true },
  ]);
});

test('resumen del gasto leído: importes, pagado o no, avisos y posibles repetidos', () => {
  const p = { proveedor: 'Repsol', proveedorNif: 'A12345678', concepto: 'Gasolina', fecha: '2026-10-26', base: 50, ivaPct: 21, irpfPct: null, avisos: [] };
  const t = resumenGasto(p);
  assert.match(t, /\*Repsol\* · A12345678/);
  assert.match(t, /26\/10\/2026/);
  assert.match(t, /60,50/); // 50 + 10,50
  assert.match(t, /como pagado/);
  assert.doesNotMatch(t, /🧾|⚠️/);
  const t2 = resumenGasto({ ...p, pendiente: true, avisos: ['Los importes leídos no cuadran'] }, { duplicados: [{}] });
  assert.match(t2, /pendiente de pagar/);
  assert.match(t2, /Ojo: los importes leídos no cuadran/);
  assert.match(t2, /ya lo tienes apuntado \(hay uno muy parecido\)/);
  assert.match(resumenGasto({ ...p, base: null }), /no consigo ver el importe[\s\S]*¿Cuánto es, sin IVA\?/);
  // Varios tipos de IVA: se suman por tipo.
  assert.match(resumenGasto({ ...p, base: 100, desglose: [{ ivaPct: 21, base: 60 }, { ivaPct: 10, base: 40 }] }), /116,60/);
});

test('corregir el gasto por el chat: solo lo pedido, y lo corregido ya no avisa', () => {
  const p = { proveedor: 'Repsol', concepto: 'Gasolina', fecha: '2026-10-26', fechaDudosa: true, base: 50, ivaPct: 21, desglose: [{ ivaPct: 21, base: 50 }], avisos: ['x'] };
  const n = cambiarGasto(p, { base: 45.5, fecha: '2026-10-25', pendiente: true });
  assert.deepEqual([n.base, n.fecha, n.pendiente, n.fechaDudosa, n.desglose, n.avisos], [45.5, '2026-10-25', true, undefined, undefined, []]);
  assert.equal(n.proveedor, 'Repsol');
  assert.equal(cambiarGasto(p, { ivaPct: 10 }).ivaPct, 10);
  assert.equal(cambiarGasto(p, { ivaPct: 33 }).ivaPct, 21);
  assert.equal(cambiarGasto(p, { base: -3 }).base, 50);
  assert.equal(cambiarGasto(p, { proveedor: '  ' }).proveedor, 'Repsol');
  assert.equal(p.base, 50); // la propuesta original no se toca
});

test('la IA puede consultar cifras y corregir gastos', () => {
  const uso = (name, input) => [{ type: 'tool_use', name, input }];
  assert.deepEqual(accionDe(uso('consultar', { pregunta: '¿Quién me debe dinero?' })).datos, { pregunta: '¿Quién me debe dinero?' });
  assert.equal(accionDe(uso('consultar', { pregunta: '  ' })).accion, 'responder');
  assert.equal(accionDe(uso('cambiar_gasto', { base: 40 })).accion, 'cambiar_gasto');
});

test('conversación natural: sin herramienta, el texto es la respuesta; con herramienta, acompaña a la acción', () => {
  const texto = (t) => ({ type: 'text', text: t });
  assert.deepEqual(accionDe([texto('¡Buenas, Marc! ¿Qué te preparo hoy?')]), { accion: 'responder', mensaje: '¡Buenas, Marc! ¿Qué te preparo hoy?' });
  // Pregunta para aclarar algo: también es texto.
  assert.equal(accionDe([texto('¿Los 300 € son con IVA o sin IVA?')]).mensaje, '¿Los 300 € son con IVA o sin IVA?');
  // Texto + herramienta: la frase acompaña, salvo que la herramienta traiga la suya.
  const lineas = [{ concepto: 'Sesión', precio: 300 }];
  assert.equal(accionDe([texto('Hecho, mira:'), { type: 'tool_use', name: 'preparar_factura', input: { tipo: 'factura', cliente: 'Pepe', lineas } }]).mensaje, 'Hecho, mira:');
  assert.equal(accionDe([texto('x'), { type: 'tool_use', name: 'preparar_factura', input: { tipo: 'factura', cliente: 'Pepe', lineas, mensaje: 'Ahí va 👇' } }]).mensaje, 'Ahí va 👇');
  // Sin nada útil, una repregunta amable.
  assert.match(accionDe([]).mensaje, /no te he pillado/);
});

test('dirección del cliente: el código postal y la población van en «ciudad», no detrás de la calle', () => {
  const s = (direccion, ciudad = '', pais) => { const r = separarDireccion({ direccion, ciudad, ...(pais ? { pais } : {}) }); return [r.direccion, r.ciudad]; };
  assert.deepEqual(s('C/ Major 12, 3º 2ª, 08301 Mataró'), ['C/ Major 12, 3º 2ª', '08301 Mataró']);
  assert.deepEqual(s('C/ Major 12 3º 2ª 08301 Mataró (Barcelona)'), ['C/ Major 12 3º 2ª', '08301 Mataró (Barcelona)']);
  assert.deepEqual(s('C/ Major 12, 3º 2ª, Mataró 08301'), ['C/ Major 12, 3º 2ª', '08301 Mataró']);
  assert.deepEqual(s('C/ Major 12, 3º 2ª, 08301', 'Mataró'), ['C/ Major 12, 3º 2ª', '08301 Mataró']);
  assert.deepEqual(s('C/ Major 12, 3º 2ª, 08301', '08301 Mataró'), ['C/ Major 12, 3º 2ª', '08301 Mataró']);
  assert.deepEqual(s('C/ Major 12', 'Mataró, 08301'), ['C/ Major 12', '08301 Mataró']);
  // Ya bien, números de calle normales y direcciones extranjeras: sin tocar.
  assert.deepEqual(s('C/ Major 12, 3º 2ª', '08301 Mataró'), ['C/ Major 12, 3º 2ª', '08301 Mataró']);
  assert.deepEqual(s('Avda. Diagonal 640', 'Barcelona'), ['Avda. Diagonal 640', 'Barcelona']);
  assert.deepEqual(s('10 Downing St, SW1A 2AA', 'London', 'GB'), ['10 Downing St, SW1A 2AA', 'London']);
});

test('los datos del cliente del primer mensaje van al borrador, y al corregir también se ordena la dirección', () => {
  const actividad = { id: 'dj', ivaPct: 21, irpfPct: 15 };
  const b = cuerpoFactura({ cliente: 'Joan Puig', datosCliente: { nif: '12345678Z', direccion: 'C/ Riera 5, 1º, 08302 Mataró' }, lineas: [{ concepto: 'Sesión', precio: 300 }] }, { actividad, hoy: '2026-10-30' });
  assert.deepEqual([b.cliente.nif, b.cliente.direccion, b.cliente.ciudad], ['12345678Z', 'C/ Riera 5, 1º', '08302 Mataró']);
  const r = aplicarCambios({ cuerpo: b, email: '' }, { cliente: { direccion: 'C/ Sol 3, 2º 1ª, 08001 Barcelona' } }, { actividad });
  assert.deepEqual([r.cuerpo.cliente.direccion, r.cuerpo.cliente.ciudad], ['C/ Sol 3, 2º 1ª', '08001 Barcelona']);
});

test('aviso de emitida: si ya ha salido por correo, el PDF es «por si lo quieres», no «para que se la reenvíes»', () => {
  const base = { pres: false, num: 'F-7', email: 'a@b.es' };
  assert.equal(textoEmitido({ ...base, entrega: 'correo', envio: { ok: true } }), '✅ Factura F-7 emitida y enviada a a@b.es.');
  const ambos = textoEmitido({ ...base, entrega: 'ambos', envio: { ok: true } });
  assert.match(ambos, /enviada a a@b\.es\. Aquí tienes también el PDF, por si la quieres/);
  assert.doesNotMatch(ambos, /reenv|mandes tú/);
  assert.match(textoEmitido({ ...base, entrega: 'ambos', envio: { error: 'buzón lleno' } }), /no se ha podido enviar a a@b\.es: buzón lleno\. Aquí tienes el PDF para que se la mandes tú/);
  const p = textoEmitido({ pres: true, num: 'P-2', email: '', entrega: 'whatsapp', envio: null, enlace: 'https://x/p/t' });
  assert.match(p, /^✅ Presupuesto P-2 creado\. Aquí tienes el PDF para que se lo mandes tú 👇\nSi se lo reenvías, también puede verlo y aceptarlo aquí: https:\/\/x\/p\/t$/);
});

test('facturas ya hechas: por número («la 12»), por cliente y, para cobrar, solo las pendientes', () => {
  const f = (numero, cliente, fecha, extra = {}) => ({ id: `2026-${numero}`, serie: 'F', anio: 2026, numero, fecha, cliente: { nombre: cliente }, base: 100, ivaPct: 21, irpfPct: 0, ...extra });
  const docs = [f(12, 'Bar Pepe S.L.', '2026-10-01'), f(13, 'Bar Pepe S.L.', '2026-10-20'), f(14, 'Ana López', '2026-10-21', { cobrada: true })];
  assert.equal(elegirDocumento(docs, { numero: 'F2026-012' }).doc.numero, 12);
  assert.equal(elegirDocumento(docs, { numero: 'la 12' }).doc.numero, 12);
  // Reenviar o pasar el PDF: la más reciente de ese cliente.
  assert.equal(elegirDocumento(docs, { cliente: 'bar pepe' }).doc.numero, 13);
  // Cobrar: si hay dos pendientes, pregunta cuál.
  assert.deepEqual(elegirDocumento(docs, { cliente: 'Pepe' }, { pendientes: true }).varios, ['F2026-013', 'F2026-012']);
  assert.deepEqual(elegirDocumento(docs, { cliente: 'Ana' }, { pendientes: true }), {});
  assert.deepEqual(elegirDocumento(docs, { numero: '99' }), {});
});

test('«lo de siempre»: las líneas de la última factura a ese cliente', () => {
  const facturas = [
    { serie: 'F', anio: 2026, numero: 3, fecha: '2026-09-05', cliente: { nombre: 'Bar Pepe' }, concepto: 'Sesión DJ', base: 300, ivaPct: 21 },
    { serie: 'F', anio: 2026, numero: 8, fecha: '2026-10-04', cliente: { nombre: 'Bar Pepe S.L.' }, lineas: [{ concepto: 'Sesión DJ', cantidad: 1, precio: 320, ivaPct: 21 }, { concepto: 'Luces', cantidad: 2, precio: 40 }], ivaPct: 21 },
  ];
  const u = lineasDeUltima(facturas, 'bar pepe');
  assert.equal(u.numero, 'F2026-008');
  assert.deepEqual(u.lineas, [{ concepto: 'Sesión DJ', cantidad: 1, precio: 320, ivaPct: 21 }, { concepto: 'Luces', cantidad: 2, precio: 40, ivaPct: 21 }]);
  assert.deepEqual(lineasDeUltima(facturas.slice(0, 1), 'Bar Pepe').lineas, [{ concepto: 'Sesión DJ', cantidad: 1, precio: 300, ivaPct: 21 }]);
  assert.equal(lineasDeUltima(facturas, 'Otro'), null);
});

test('la IA puede repetir la última, actuar sobre documentos hechos, guardar clientes y mandar fotos a gastos', () => {
  const uso = (name, input) => [{ type: 'tool_use', name, input }];
  assert.equal(accionDe(uso('preparar_factura', { tipo: 'factura', cliente: 'Pepe', repetir: true })).accion, 'preparar');
  assert.equal(accionDe(uso('preparar_factura', { tipo: 'factura', cliente: 'Pepe' })).accion, 'responder');
  assert.deepEqual(accionDe(uso('documento', { que: 'cobrada', numero: ' 12 ', cliente: '' })).datos, { que: 'cobrada', doc: 'factura', numero: '12' });
  assert.equal(accionDe(uso('documento', { que: 'facturar_presupuesto', cliente: 'Ana' })).datos.doc, 'presupuesto');
  assert.equal(accionDe(uso('documento', { que: 'borrar' })).accion, 'responder');
  assert.equal(accionDe(uso('guardar_cliente', { nombre: 'Joan Puig', nif: '12345678Z' })).accion, 'guardar_cliente');
  assert.equal(accionDe(uso('guardar_cliente', { nombre: ' ' })).accion, 'responder');
  assert.equal(accionDe(uso('apuntar_gasto', {})).accion, 'apuntar_gasto');
});

test('factura de un presupuesto: la misma que el botón de la pantalla (resto tras la señal) y no si ya está facturado', async () => {
  const { facturaDePresupuesto } = await import('../lib/presupuestosServidor.js');
  const p = { id: 'P2026-1', numero: 1, anio: 2026, serie: 'P', fecha: '2026-10-01', validez: 90, actividad: 'dj', cliente: { nombre: 'Ana' }, concepto: 'Boda', base: 1000, ivaPct: 21, irpfPct: 15, senalPct: 30, estado: 'aceptado', facturas: [{ id: 'f1', numero: 'F2026-003', tipo: 'senal', base: 300 }] };
  const r = facturaDePresupuesto(p, 'resto', '2026-10-30');
  assert.equal(r.base, 700);
  assert.match(r.datos.concepto, /descontada la señal de la factura F2026-003\) · Presupuesto P2026-001/);
  assert.match(facturaDePresupuesto({ ...p, facturas: [...p.facturas, { tipo: 'resto' }] }, 'resto', '2026-10-30').error, /facturado/);
});

test('«factura a Pepe»: el cliente por su persona de contacto o por cómo lo llama la persona; si no, nada', () => {
  const cs = [{ nombre: 'Restaurant Can Joan SL', contacto: 'Pepe García' }, { nombre: 'Sala Apolo' }, { nombre: 'Bar Pepe S.L.' }, { nombre: 'Hotel Mar', contacto: 'Pepa' }];
  assert.equal(buscarCliente(cs, 'Sala Apolo').cliente.nombre, 'Sala Apolo');
  // «Pepe» puede ser el contacto de Can Joan o el Bar Pepe: pregunta, y dice quién es quién.
  assert.deepEqual(buscarCliente(cs, 'pepe').varios, ['Restaurant Can Joan SL (Pepe García)', 'Bar Pepe S.L.']);
  assert.equal(buscarCliente(cs, 'Pepe García').cliente.nombre, 'Restaurant Can Joan SL');
  assert.equal(buscarCliente(cs, 'pepa').cliente.nombre, 'Hotel Mar');
  // Lo que ya ha aclarado por WhatsApp manda.
  assert.equal(buscarCliente(cs, 'Pepe', { pepe: 'Restaurant Can Joan SL' }).cliente.nombre, 'Restaurant Can Joan SL');
  assert.equal(buscarCliente(cs, 'el de mataro', { 'el de mataro': 'Restaurant Can Joan SL' }).cliente.nombre, 'Restaurant Can Joan SL');
  assert.deepEqual(buscarCliente(cs, 'Jordi'), {});
});

test('saludo del correo de la factura con la persona de contacto', async () => {
  const { mensajeFactura } = await import('../lib/plantillaEnvio.js');
  const f = { serie: 'F', anio: 2026, numero: 7, fecha: '2026-10-30', cliente: { nombre: 'Can Joan' }, base: 100, ivaPct: 21, irpfPct: 0 };
  assert.match(mensajeFactura(f, { nombre: 'Fisquo' }, {}, 'Pepe'), /^Hola, Pepe:\n\nTe adjunto la factura F2026-007/);
  assert.match(mensajeFactura(f, { nombre: 'Fisquo' }, {}), /^Hola,\n\nTe adjunto/);
  assert.match(mensajeFactura({ ...f, idioma: 'en' }, { nombre: 'Fisquo' }, {}, 'Pepe'), /^Hello Pepe,/);
});

test('WhatsApp no mezcla idiomas: la IA contesta en el idioma del perfil, como los resúmenes de Fisquo', async () => {
  const fuente = await (await import('node:fs/promises')).readFile(new URL('../lib/whatsappIA.js', import.meta.url), 'utf8');
  assert.match(fuente, /Siempre en \$\{lengua\}, también si te escriben en otro idioma/);
});

test('WhatsApp en el idioma del perfil: catalán e inglés en el resumen, el aviso de emitida y el gasto', async () => {
  const { traductorDe } = await import('../lib/textos/index.js');
  const datos = { fecha: '2026-10-30', cliente: { nombre: 'Can Joan SL', nif: 'B12345678', direccion: 'C/ Riera 5', ciudad: '08302 Mataró' }, lineas: [{ concepto: 'Sesión', cantidad: 1, precio: 100, ivaPct: 21 }], ivaPct: 21, irpfPct: 0, base: 100 };
  const emisor = { nombre: 'Fisquo', nif: 'B05814041', direccion: 'C/ Aragó 6' };
  const ca = resumenBorrador(datos, 'a@b.cat', emisor, 'factura', 'correo', { tr: traductorDe('ca') });
  assert.match(ca, /D'acord, aquesta seria la factura:|T'ho deixo així:|Mira, quedaria així:/);
  assert.match(ca, /L'envio a a@b\.cat\. Està bé\? L'emeto i l'hi envio\?/);
  assert.match(ca, /a nom de Fisquo/);
  const en = resumenBorrador(datos, '', emisor, 'factura', 'whatsapp', { tr: traductorDe('en') });
  assert.match(en, /\+ VAT /);
  assert.match(en, /I'll send you the PDF here so you can send it yourself\. \(I don't have their email\) Is it OK\? Shall I issue it\?/);
  assert.equal(textoEmitido({ pres: false, num: 'F-7', email: 'a@b.cat', entrega: 'correo', envio: { ok: true }, tr: traductorDe('ca') }), '✅ Factura F-7 emesa i enviada a a@b.cat.');
  assert.match(resumenGasto({ proveedor: 'Repsol', base: 50, ivaPct: 21 }, { tr: traductorDe('en') }), /VAT 21% /);
  // Sin idioma (o castellano): exactamente como antes.
  assert.match(resumenBorrador(datos, 'a@b.cat', emisor, 'factura', 'correo'), /Se la mando a a@b\.cat\. ¿Está bien\? ¿La emito y se la envío\?/);
});
