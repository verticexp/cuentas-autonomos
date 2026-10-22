import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import './apoyo/cargador.mjs';
import { arrancar } from './apoyo/upstash-mem.mjs';

// La bandeja por correo (lib/buzon.js y lib/buzonEntrante.js) con Redis y el almacén en memoria, y Resend y la IA
// simulados con fetch.
let srv, J, R, B, Z, E, CE;
const fetchAntes = globalThis.fetch;
let correos = {}, adjuntos = {}, descargas = {}, respuestaIA;
const SECRETO = `whsec_${Buffer.from('secreto de pruebas del buzón').toString('base64')}`;
before(async () => {
  srv = await arrancar();
  Object.assign(process.env, { KV_REST_API_URL: srv.url, KV_REST_API_TOKEN: 'pruebas', ANTHROPIC_API_KEY: 'x', ANTHROPIC_URL: 'http://ia.test/v1/messages', LIMITES: 'off',
    RESEND_API_KEY: 're_pruebas', RESEND_WEBHOOK_SECRET: SECRETO, RESEND_RECEPCION_URL: 'http://resend.test/emails/receiving' });
  globalThis.fetch = async (url, opciones) => {
    const u = String(url);
    if (u === 'http://ia.test/v1/messages/count_tokens') return Response.json({ input_tokens: 1200 });
    if (u === 'http://ia.test/v1/messages') return Response.json({ model: 'claude-haiku-5-5', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(respuestaIA) }] });
    let m = u.match(/^http:\/\/resend\.test\/emails\/receiving\/([^/]+)\/attachments$/);
    if (m) return Response.json({ object: 'list', has_more: false, data: adjuntos[m[1]] || [] });
    m = u.match(/^http:\/\/resend\.test\/emails\/receiving\/([^/]+)$/);
    if (m) return correos[m[1]] ? Response.json(correos[m[1]]) : Response.json({ message: 'no' }, { status: 404 });
    if (descargas[u]) return new Response(descargas[u]);
    return fetchAntes(url, opciones);
  };
  J = await import('../lib/justificantes.js');
  R = await import('../lib/redis.js');
  B = await import('../lib/buzon.js');
  Z = await import('../lib/buzonEntrante.js');
  E = await import('../lib/bandejaServidor.js');
  CE = await import('../lib/correoEntrante.js');
});
after(async () => {
  globalThis.fetch = fetchAntes;
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_URL', 'LIMITES', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'RESEND_RECEPCION_URL']) delete process.env[k];
  await srv?.cerrar();
});
let almacen;
beforeEach(() => {
  almacen = J.almacenMemoria(); J.ponerAlmacen(almacen);
  respuestaIA = { proveedor: 'Movistar', nif: 'A82018474', numero: 'M-1', fecha: '2026-10-05', concepto: 'Fibra', base: 50, ivaPct: 21, total: 60.5, desglose: [{ ivaPct: 21, base: 50, cuota: 10.5 }], irpf: null, irpfPct: 0, lineas: [] };
});

let n = 0;
async function empresa() {
  n += 1;
  const id = `e-buz-${n}`;
  await R.redis.hset('empresas', { [id]: { id, nombre: 'Sonora Eventos SL', emisor: { nombre: 'Sonora Eventos SL' }, actividades: [{ id: 'servicios', nombre: 'Servicios' }], fiscal: { tipo: 'sociedad' } } });
  const usuario = { id: `u-buz-${n}`, email: `ana${n}@sonora.test`, empresa: id, rol: 'admin' };
  await R.redis.hset('usuarios', { [usuario.id]: usuario });
  await R.redis.hset('emails', { [usuario.email]: usuario.id });
  const u = { ...usuario, empresa: id };
  const { buzon } = await B.crearBuzon(u);
  return { u, buzon, direccion: B.direccionDe(buzon) };
}
const uuid = () => crypto.randomUUID();
async function pdf(texto) { const d = await PDFDocument.create(); d.addPage().drawText(texto); return Buffer.from(await d.save()); }
// Un correo en el Resend simulado → el aviso que mandaría al webhook.
function correo({ para, de, asunto = 'Factura octubre', texto = '', html = '', archivos = [], dmarc = 'pass' }) {
  const id = uuid();
  correos[id] = { object: 'email', id, to: [para], from: de, subject: asunto, text: texto, html, headers: { from: `Movistar <${de}>` }, authentication: { spf: 'pass', dkim: 'pass', dmarc }, attachments: [] };
  adjuntos[id] = archivos.map((a, i) => {
    const url = `https://inbound-cdn.resend.com/${id}/attachments/${i}?signature=x`;
    descargas[url] = a.bytes;
    return { id: uuid(), filename: a.nombre, size: a.bytes.length, content_type: a.tipo, content_disposition: a.inline ? 'inline' : 'attachment', content_id: a.inline ? 'img1' : null, download_url: url, expires_at: '2099-01-01T00:00:00Z' };
  });
  return { type: 'email.received', created_at: new Date().toISOString(), data: { email_id: id, created_at: new Date().toISOString(), from: de, to: [para], cc: [], bcc: [], received_for: [], message_id: '<x@y>', subject: asunto, attachments: [] } };
}
const avisoDe = (c) => CE.leerAviso(JSON.stringify(c));
// Aquí la empresa existe: la cola de trabajos lee en segundo plano (como en producción). Se espera a que termine.
async function leida(u, id) {
  for (let i = 0; i < 100; i++) {
    const d = await R.leerUno(u, 'bandeja', id);
    if (d?.estado !== 'leyendo') return d;
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.fail('la lectura no ha terminado');
}

test('la dirección: una por empresa, con su índice; cambiarla deja la anterior sin efecto', async () => {
  const { u, buzon, direccion } = await empresa();
  assert.match(direccion, /^sonora-eventos-[a-z0-9]{10}@fisqal\.com$/, 'sin la forma jurídica');
  for (const [nombre, limpio] of [['Sonora Eventos, S.L.', 'Sonora Eventos'], ['Talleres López SLU', 'Talleres López'], ['Marc Ramírez', 'Marc Ramírez'], ['Construcciones SA', 'Construcciones']]) assert.equal(B.nombreParaAlias(nombre), limpio);
  assert.equal((await B.empresaDeAlias(buzon.alias)).empresa, u.empresa);
  assert.equal((await B.crearBuzon(u)).buzon.alias, buzon.alias, 'crear dos veces no cambia nada');
  const { buzon: otro } = await B.crearBuzon(u, { nueva: true });
  assert.notEqual(otro.alias, buzon.alias);
  assert.equal(await B.empresaDeAlias(buzon.alias), null);
  assert.equal((await B.empresaDeAlias(otro.alias)).empresa, u.empresa);
  await B.revocarBuzon(u.empresa);
  assert.equal(await B.empresaDeAlias(otro.alias), null, 'de baja: deja de recibir');
});

test('de alguien de la empresa: los adjuntos útiles entran y se leen; los logos incrustados no', async () => {
  const { u, direccion } = await empresa();
  const c = correo({ para: `Facturas <${direccion}>`, de: u.email, archivos: [
    { nombre: 'factura.pdf', tipo: 'application/pdf', bytes: await pdf('Movistar') },
    { nombre: 'logo.png', tipo: 'image/png', bytes: Buffer.alloc(20000, 1), inline: true },
  ] });
  const r = await Z.recibirCorreo(avisoDe(c));
  assert.deepEqual(r, { entrados: 1, cuarentena: false, fallidos: [] });
  const [d] = (await R.leer(u, 'bandeja'));
  assert.equal(d.estado, 'leyendo'); assert.equal(d.origen, 'correo'); assert.equal(d.correo.de, u.email); assert.equal(d.correo.deNombre, 'Movistar');
  assert.equal((await leida(u, d.id)).propuesta.proveedor, 'Movistar');
});

test('de un desconocido o con DMARC suspenso, a cuarentena; al aprobar una suya, queda conocido', async () => {
  const { u, direccion } = await empresa();
  const factura = { nombre: 'f.pdf', tipo: 'application/pdf', bytes: await pdf('desconocido') };
  const r = await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: 'facturacion@movistar.es', archivos: [factura] })));
  assert.equal(r.cuarentena, true);
  const [d] = await R.leer(u, 'bandeja');
  assert.equal(d.estado, 'cuarentena');
  assert.deepEqual(await E.leerDocumento(u, d.id), { nada: true }, 'no gasta lecturas');
  // Quien se hace pasar por alguien de la empresa (DMARC suspenso) tampoco entra directo.
  const falso = await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: u.email, dmarc: 'fail', archivos: [{ ...factura, bytes: await pdf('suplantado') }] })));
  assert.equal(falso.cuarentena, true);
  // «Permitir siempre»: se leen todas las suyas en cuarentena y las siguientes ya no esperan.
  assert.deepEqual(await E.permitir(u, d.id), { ok: true, leidas: 1 });
  assert.equal((await leida(u, d.id)).estado, 'revisar');
  assert.ok((await R.redis.hget('empresas', u.empresa)).buzon.remitentes.includes('facturacion@movistar.es'));
  const otra = await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: 'FACTURACION@movistar.es', archivos: [{ ...factura, bytes: await pdf('otra') }] })));
  assert.equal(otra.cuarentena, false);
});

test('la confirmación de Gmail se guarda para enseñarla; un correo sin adjunto con la factura en el texto entra como PDF', async () => {
  const { u, direccion } = await empresa();
  const gmail = await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: 'forwarding-noreply@google.com', asunto: '(#123456789) Confirmación de reenvío de Gmail',
    texto: 'Para confirmar, haz clic: https://mail-settings.google.com/mail/vf-%5BANGjdJ%5D-abc' })));
  assert.deepEqual(gmail, { confirmacion: true });
  const c = B.confirmacionVigente((await R.redis.hget('empresas', u.empresa)).buzon);
  assert.equal(c.codigo, '123456789'); assert.match(c.enlace, /^https:\/\/mail-settings\.google\.com\//);
  assert.equal((await R.leer(u, 'bandeja')).length, 0);
  const texto = 'Gracias por viajar con nosotros.\nFactura simplificada nº U-998\nTrayecto Atocha - Chamartín\nBase imponible 9,09 €\nIVA 10 % 0,91 €\nTotal 10,00 €\nCIF B87654321';
  const r = await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: u.email, asunto: 'Tu recibo de Uber', texto })));
  assert.equal(r.entrados, 1);
  const [d] = await R.leer(u, 'bandeja');
  assert.equal(d.archivo.tipo, 'application/pdf'); assert.match(d.nombre, /^correo-Tu-recibo-de-Uber/);
  const corto = await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: u.email, texto: 'Te la reenvío' })));
  assert.equal(corto.entrados, 0, 'un «te la reenvío» sin adjunto no es una factura');
});

test('lo que no es para ninguna empresa se ignora, y la firma del aviso se comprueba', async () => {
  assert.deepEqual(await Z.recibirCorreo(avisoDe(correo({ para: 'nadie-abcdefghjk@fisqal.com', de: 'x@y.com' }))), { ignorado: 'sin empresa' });
  const cuerpo = JSON.stringify({ type: 'email.received', data: { email_id: uuid(), to: ['x@fisqal.com'] } });
  const t = String(Math.floor(Date.now() / 1000));
  const firma = createHmac('sha256', Buffer.from(SECRETO.slice(6), 'base64')).update(`msg_1.${t}.${cuerpo}`).digest('base64');
  assert.equal(CE.firmaResend(cuerpo, new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': t, 'svix-signature': `v1,${firma}` })), true);
  assert.equal(CE.firmaResend(cuerpo + ' ', new Headers({ 'svix-id': 'msg_1', 'svix-timestamp': t, 'svix-signature': `v1,${firma}` })), false);
  const id = uuid();
  assert.equal(await Z.primeraVez(id), true);
  assert.equal(await Z.primeraVez(id), false, 'el mismo correo reintentado por Resend no se procesa dos veces');
});

test('proveedor de confianza: lo que cuadra se aprueba solo, se ve como aprobado y se puede deshacer', async () => {
  const { u, direccion } = await empresa();
  await E.ponerConfianza(u, { clave: 'A82018474', proveedor: 'Movistar', proveedorNif: 'A82018474' }, true);
  await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: u.email, archivos: [{ nombre: 'f.pdf', tipo: 'application/pdf', bytes: await pdf('confianza') }] })));
  const [d] = await R.leer(u, 'bandeja');
  const ap = await leida(u, d.id);
  assert.equal(ap.estado, 'aprobado', 'aprobada sola');
  const r = { aprobado: ap.gasto };
  const g = await R.leerUno(u, 'gastos', r.aprobado);
  assert.equal(g.archivo.clave, d.archivo.clave);
  // Lo que no cuadra no se aprueba solo, aunque sea de confianza.
  respuestaIA = { ...respuestaIA, numero: 'M-2', total: 99 };
  await Z.recibirCorreo(avisoDe(correo({ para: direccion, de: u.email, archivos: [{ nombre: 'g.pdf', tipo: 'application/pdf', bytes: await pdf('no cuadra') }] })));
  const otra = (await R.leer(u, 'bandeja')).find((x) => x.id !== d.id);
  assert.equal((await leida(u, otra.id)).estado, 'revisar');
  // Deshacer: el gasto se borra, el archivo se queda y la factura vuelve a revisarse.
  assert.deepEqual(await E.deshacer(u, d.id), { ok: true });
  assert.equal(await R.leerUno(u, 'gastos', r.aprobado), null);
  assert.equal((await R.leerUno(u, 'bandeja', d.id)).estado, 'revisar');
  assert.ok(almacen.datos.has(d.archivo.clave));
  await E.ponerConfianza(u, { clave: 'A82018474' }, false);
  assert.equal(await E.deConfianza(u, { proveedorNif: 'A82018474' }), null);
});
