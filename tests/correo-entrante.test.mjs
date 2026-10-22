import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  DOMINIO_ENTRANTE, correoEntranteListo, firmaResend, leerAviso, aliasDe, nuevoAlias,
  leerCorreo, listarAdjuntos, adjuntosUtiles, descargarAdjunto, confirmacionGmail, textoPlano,
} from '../lib/correoEntrante.js';
import { MAX_BYTES } from '../lib/justificantes.js';

const EMAIL_ID = '56761188-7520-42d8-8898-ff6fc54ce618';
const ADJUNTO_ID = '2a0c9ce0-3112-4728-976e-47ddcd16a318';
const AHORA = 1792663200000;
const CLAVE = Buffer.from('secreto de prueba para los avisos de Resend');
const SECRETO = `whsec_${CLAVE.toString('base64')}`;
const PDF = Buffer.from('%PDF-1.7\nfactura\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const ALIAS = 'marc-7k3p9xq2ab';
const URL_ADJUNTO = 'https://inbound-cdn.resend.com/correo/attachments/factura?signature=prueba';
const aviso = {
  type: 'email.received', created_at: '2026-02-22T23:41:12.126Z',
  data: {
    email_id: EMAIL_ID, created_at: '2026-02-22T23:41:11.894Z', from: 'onboarding@resend.dev',
    to: ['delivered@resend.dev'], bcc: [], cc: [], received_for: ['forwarded@example.com'],
    message_id: '<111-222-333@email.example.com>', subject: 'Sending this example',
    attachments: [{ id: ADJUNTO_ID, filename: 'avatar.png', content_type: 'image/png', content_disposition: 'inline', content_id: 'img001' }],
  },
};
const cuerpo = JSON.stringify(aviso);

function cabeceras(cuerpoFirmado = cuerpo, timestamp = AHORA / 1000) {
  const id = 'msg_prueba';
  const firma = createHmac('sha256', CLAVE).update(`${id}.${timestamp}.${cuerpoFirmado}`).digest('base64');
  return new Headers({ 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${firma}` });
}
function restaurarEntorno(antes) {
  for (const [clave, valor] of Object.entries(antes)) {
    if (valor === undefined) delete process.env[clave];
    else process.env[clave] = valor;
  }
}

test('dominio en minúsculas y configuración de las dos claves', () => {
  const antes = Object.fromEntries(['CORREO_ENTRANTE_DOMINIO', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET'].map((k) => [k, process.env[k]]));
  try {
    delete process.env.CORREO_ENTRANTE_DOMINIO;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_WEBHOOK_SECRET;
    assert.equal(DOMINIO_ENTRANTE(), 'fisqal.com');
    assert.equal(correoEntranteListo(), false);
    process.env.CORREO_ENTRANTE_DOMINIO = 'ENTRADA.FISQAL.COM';
    process.env.RESEND_API_KEY = 're_prueba';
    assert.equal(correoEntranteListo(), false);
    process.env.RESEND_WEBHOOK_SECRET = SECRETO;
    assert.equal(correoEntranteListo(), true);
    assert.equal(DOMINIO_ENTRANTE(), 'entrada.fisqal.com');
    assert.equal(firmaResend(cuerpo, cabeceras(), undefined, AHORA), true);
    delete process.env.RESEND_API_KEY;
    assert.equal(correoEntranteListo(), false);
  } finally { restaurarEntorno(antes); }
});

test('Svix acepta la firma válida y cualquiera de las entradas v1', () => {
  const h = cabeceras();
  assert.equal(firmaResend(cuerpo, h, SECRETO, AHORA), true);
  const firma = h.get('svix-signature');
  h.set('svix-signature', `v1,corta v2,${firma.slice(3)} ${firma} v1,otra`);
  assert.equal(firmaResend(cuerpo, h, SECRETO, AHORA), true);
  h.set('svix-signature', `v2,${firma.slice(3)}`);
  assert.equal(firmaResend(cuerpo, h, SECRETO, AHORA), false);
});

test('Svix rechaza la firma manipulada, otro cuerpo y cambios de id o timestamp', () => {
  const h = cabeceras();
  const firma = h.get('svix-signature');
  h.set('svix-signature', `v1,${firma[3] === 'A' ? 'B' : 'A'}${firma.slice(4)}`);
  assert.equal(firmaResend(cuerpo, h, SECRETO, AHORA), false);
  assert.equal(firmaResend(`${cuerpo}\n`, cabeceras(), SECRETO, AHORA), false);
  const otroId = cabeceras();
  otroId.set('svix-id', 'msg_otro');
  assert.equal(firmaResend(cuerpo, otroId, SECRETO, AHORA), false);
  const otroTiempo = cabeceras();
  otroTiempo.set('svix-timestamp', String(AHORA / 1000 + 1));
  assert.equal(firmaResend(cuerpo, otroTiempo, SECRETO, AHORA), false);
});

test('Svix caduca a los cinco minutos en pasado y futuro, incluidos los límites', () => {
  for (const diferencia of [-301, 301]) assert.equal(firmaResend(cuerpo, cabeceras(cuerpo, AHORA / 1000 + diferencia), SECRETO, AHORA), false);
  for (const diferencia of [-300, 300]) assert.equal(firmaResend(cuerpo, cabeceras(cuerpo, AHORA / 1000 + diferencia), SECRETO, AHORA), true);
});

test('Svix nunca lanza con cabeceras ausentes, timestamps inválidos o secretos mal formados', () => {
  for (const nombre of ['svix-id', 'svix-timestamp', 'svix-signature']) {
    const h = cabeceras();
    h.delete(nombre);
    assert.equal(firmaResend(cuerpo, h, SECRETO, AHORA), false);
  }
  for (const h of [undefined, null, {}, { get() { throw new Error('cabecera rota'); } }]) assert.equal(firmaResend(cuerpo, h, SECRETO, AHORA), false);
  for (const secreto of ['', null, 'otro_secreto', 'whsec_', 'whsec_@@@@', 'whsec_Z', 'whsec_Zg=', 'whsec_Zh==']) {
    assert.equal(firmaResend(cuerpo, cabeceras(), secreto, AHORA), false);
  }
  for (const tiempo of ['', 'NaN', 'Infinity', '1e9', '1.2', '99999999999999999999999']) {
    const h = cabeceras();
    h.set('svix-timestamp', tiempo);
    assert.equal(firmaResend(cuerpo, h, SECRETO, AHORA), false);
  }
  assert.equal(firmaResend(cuerpo, cabeceras(), SECRETO, NaN), false);
});

test('interpreta el aviso real y normaliza sus adjuntos', () => {
  assert.deepEqual(leerAviso(cuerpo), {
    emailId: EMAIL_ID, de: 'onboarding@resend.dev', para: ['delivered@resend.dev', 'forwarded@example.com'], asunto: 'Sending this example',
    adjuntos: [{ id: ADJUNTO_ID, nombre: 'avatar.png', tipo: 'image/png', disposicion: 'inline', contentId: 'img001', tamano: null }],
  });
  const data = { ...aviso.data, from: ' ACME@EXAMPLE.COM ', to: ['A@FISQAL.COM', 12, null], cc: ['a@fisqal.com', 'B@FISQAL.COM'], bcc: ['c@fisqal.com'], received_for: ['D@FISQAL.COM', 'b@fisqal.com'] };
  const leido = leerAviso(JSON.stringify({ ...aviso, data }));
  assert.equal(leido.de, 'acme@example.com');
  assert.deepEqual(leido.para, ['a@fisqal.com', 'b@fisqal.com', 'c@fisqal.com', 'd@fisqal.com']);
});

test('ignora otros eventos, JSON roto e identificadores que no parecen UUID', () => {
  for (const texto of ['{roto', 'null', '[]', JSON.stringify({ ...aviso, type: 'email.sent' }), JSON.stringify({ type: 'email.received' })]) assert.equal(leerAviso(texto), null);
  for (const id of ['otro', `${EMAIL_ID}/attachments`, null, 123]) assert.equal(leerAviso(JSON.stringify({ ...aviso, data: { email_id: id } })), null);
});

test('encuentra el primer alias válido con nombre visible, mayúsculas y subdirección', () => {
  assert.equal(aliasDe([`Marc <${ALIAS}@fisqal.com>`], 'fisqal.com'), ALIAS);
  assert.equal(aliasDe([`${ALIAS.toUpperCase()}@FISQAL.COM`], 'FISQAL.COM'), ALIAS);
  assert.equal(aliasDe([`${ALIAS}+facturas@fisqal.com`], 'fisqal.com'), ALIAS);
  assert.equal(aliasDe([`${ALIAS}@otro.com`, `Nombre <${ALIAS}@fisqal.com>`], 'fisqal.com'), ALIAS);
  assert.equal(aliasDe([`${ALIAS}@fisqal.com`, 'otra-abcdefghjk@fisqal.com'], 'fisqal.com'), ALIAS);
  for (const direccion of [`${ALIAS}@otro.com`, 'marc@fisqal.com', 'marc-123@fisqal.com', '-abc-abcdefghjk@fisqal.com', `${ALIAS}@fisqal.com.evil.test`, 42]) {
    assert.equal(aliasDe([direccion], 'fisqal.com'), null);
  }
  assert.equal(aliasDe(null), null);
});

test('genera alias con slug limpio de 3 a 20 caracteres y diez caracteres aleatorios', () => {
  for (const nombre of ['Ácme & Hijós, S.L.', '🧾 💥', ' A ', '', null, '---Año---2026---', 'Empresa con un nombre muy largo para el alias']) {
    for (let i = 0; i < 20; i++) {
      const alias = nuevoAlias(nombre);
      assert.match(alias, /^[a-z0-9][a-z0-9-]{2,40}-[a-z0-9]{10}$/);
      const slug = alias.slice(0, -11);
      assert.ok(slug.length >= 3 && slug.length <= 20);
      assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.match(alias.slice(-10), /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
      assert.equal(aliasDe([`${alias}@fisqal.com`], 'fisqal.com'), alias);
    }
  }
  assert.match(nuevoAlias('Ácme & Hijós'), /^acme-hijos-/);
  assert.match(nuevoAlias('!!!'), /^facturas-/);
  assert.match(nuevoAlias('ab'), /^facturas-/);
});

test('selecciona PDF, imágenes y XML, omitiendo logos y tamaños excesivos', () => {
  const lista = [
    { nombre: 'logo.png', tipo: 'image/png', disposicion: 'inline', tamano: 20000 },
    { nombre: 'firma.jpg', tipo: 'image/jpeg', contentId: 'firma', tamano: 20000 },
    { nombre: 'factura.pdf', tipo: 'application/pdf', tamano: MAX_BYTES },
    { nombre: 'factura.XML', tipo: 'application/octet-stream' },
    { nombre: 'factura.xsig', tipo: 'application/octet-stream' },
    { nombre: 'factura.PDF', tipo: 'application/octet-stream' },
    { nombre: 'pequena.jpg', tipo: 'image/jpeg', tamano: 14999 },
    { nombre: 'grande.pdf', tipo: 'application/pdf', tamano: MAX_BYTES + 1 },
    { nombre: 'foto.webp', tipo: 'image/webp', tamano: 15000 },
    { nombre: 'foto.png', tipo: 'image/png', tamano: null },
    { nombre: 'factura', tipo: 'application/xml' },
    { nombre: 'factura', tipo: 'text/xml' },
    { nombre: 'archivo.bin', tipo: 'application/octet-stream' },
    { nombre: 'imagen.svg', tipo: 'image/svg+xml' }, null,
  ];
  const utiles = adjuntosUtiles(lista);
  assert.deepEqual(utiles.map((a) => [a.nombre, a.clase]), [
    ['factura.pdf', 'pdf'], ['factura.XML', 'xml'], ['factura.xsig', 'xml'], ['factura.PDF', 'pdf'],
    ['foto.webp', 'imagen'], ['foto.png', 'imagen'], ['factura', 'xml'], ['factura', 'xml'],
  ]);
  assert.equal(lista[2].clase, undefined);
  const muchos = Array.from({ length: 15 }, (_, i) => ({ id: i, tipo: 'application/pdf' }));
  assert.deepEqual(adjuntosUtiles(muchos).map((a) => a.id), Array.from({ length: 10 }, (_, i) => i));
  assert.deepEqual(adjuntosUtiles(null), []);
});

test('descargar rechaza hosts ajenos y protocolos inseguros sin llamar a fetch', async () => {
  let llamadas = 0;
  const fetch = async () => { llamadas++; throw new Error('no debe llamarse'); };
  for (const url of ['https://example.com/f.pdf', 'https://resend.com.evil.test/f', 'https://evilresend.com/f', 'https://resend.com@evil.test/f', 'http://resend.com/f', 'file:///tmp/f', 'no es una URL', undefined, 'https://user@resend.com/f']) {
    assert.ok((await descargarAdjunto({ url, clase: 'pdf' }, { fetch })).error);
  }
  assert.equal(llamadas, 0);
});

test('descargar corta y cancela al exceder el límite aunque content-length mienta', async () => {
  let lecturas = 0, cancelado = false;
  const trozos = [PDF.subarray(0, 9), Buffer.alloc(9), Buffer.alloc(1000)];
  const stream = new ReadableStream({
    pull(controller) { controller.enqueue(trozos[lecturas++]); },
    cancel() { cancelado = true; },
  }, { highWaterMark: 0 });
  const r = await descargarAdjunto({ url: URL_ADJUNTO, clase: 'pdf' }, {
    maxBytes: 10,
    fetch: async (_, op) => {
      assert.equal(op.redirect, 'error');
      assert.ok(op.signal instanceof AbortSignal);
      return new Response(stream, { headers: { 'content-length': '1' } });
    },
  });
  assert.match(r.error, /tamaño máximo/);
  assert.equal(lecturas, 2);
  assert.equal(cancelado, true);
});

test('descargar comprueba la clase real y devuelve los bytes del PDF correcto', async () => {
  const descargar = (bytes, clase, url = URL_ADJUNTO) => descargarAdjunto({ url, clase }, { fetch: async () => new Response(bytes) });
  assert.match((await descargar(PNG, 'pdf')).error, /no coincide/);
  assert.match((await descargar(PDF, 'imagen')).error, /no coincide/);
  assert.match((await descargar('<html>no es PDF</html>', 'pdf')).error, /no coincide/);
  const pdf = await descargar(PDF, 'pdf', 'https://resend.com/f.pdf');
  assert.ok(pdf instanceof Uint8Array);
  assert.deepEqual(Buffer.from(pdf), PDF);
  assert.deepEqual(Buffer.from(await descargar(PNG, 'imagen')), PNG);
  const justo = await descargarAdjunto({ url: URL_ADJUNTO, tipo: 'application/octet-stream', nombre: 'factura.pdf' }, { maxBytes: PDF.length, fetch: async () => new Response(PDF) });
  assert.deepEqual(Buffer.from(justo), PDF);
});

test('descargar admite XML con espacios y BOM, y devuelve errores de red o contenido', async () => {
  for (const texto of ['  \n<Factura/>', '\ufeff \n<?xml version="1.0"?><Factura/>']) {
    const bytes = await descargarAdjunto({ url: URL_ADJUNTO, clase: 'xml' }, { fetch: async () => new Response(texto) });
    assert.deepEqual(Buffer.from(bytes), Buffer.from(texto));
  }
  assert.match((await descargarAdjunto({ url: URL_ADJUNTO, clase: 'xml' }, { fetch: async () => new Response('no es xml') })).error, /XML/);
  for (const fetch of [async () => { throw new Error('sin conexión'); }, async () => new Response('', { status: 404 }), async () => new Response(null)]) {
    assert.ok((await descargarAdjunto({ url: URL_ADJUNTO, clase: 'pdf' }, { fetch })).error);
  }
});

test('leerCorreo y listarAdjuntos usan la API de recepción, autorización y normalización común', async () => {
  const antes = { RESEND_API_KEY: process.env.RESEND_API_KEY, RESEND_RECEPCION_URL: process.env.RESEND_RECEPCION_URL };
  const fetchAnterior = globalThis.fetch;
  const llamadas = [];
  const adjunto = { id: ADJUNTO_ID, filename: `../carpeta\\factura\u0000\u007f${'x'.repeat(130)}.pdf`, content_type: 'APPLICATION/PDF; charset=utf-8', content_disposition: null, content_id: null, size: 13264 };
  try {
    process.env.RESEND_API_KEY = 're_prueba';
    delete process.env.RESEND_RECEPCION_URL;
    globalThis.fetch = async (url, op) => {
      llamadas.push({ url, op });
      const d = url.endsWith('/attachments')
        ? { object: 'list', has_more: false, data: [{ ...adjunto, download_url: URL_ADJUNTO, expires_at: '2026-10-17T14:29:41.521Z' }] }
        : { object: 'email', id: EMAIL_ID, from: 'ACME@EXAMPLE.COM', subject: 'Factura del mes', html: '<p>Factura</p>', text: null,
          headers: { From: '"Acme" <acme@example.com>' }, authentication: { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, attachments: [adjunto] };
      return Response.json(d);
    };
    const correo = await leerCorreo(EMAIL_ID);
    const nombre = adjunto.filename.replace(/[/\\\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 120);
    const normalizado = { id: ADJUNTO_ID, nombre, tipo: 'application/pdf', disposicion: null, contentId: null, tamano: 13264 };
    assert.deepEqual(correo, { de: 'acme@example.com', deNombre: 'Acme', asunto: 'Factura del mes', texto: '', html: '<p>Factura</p>', autenticacion: { spf: 'pass', dkim: 'pass', dmarc: 'pass' }, adjuntos: [normalizado] });
    assert.equal(correo.adjuntos[0].nombre.length, 120);
    assert.doesNotMatch(correo.adjuntos[0].nombre, /[/\\\u0000-\u001f\u007f-\u009f]/);
    assert.deepEqual(await listarAdjuntos(EMAIL_ID), [{ ...normalizado, url: URL_ADJUNTO }]);
    assert.deepEqual(llamadas.map((l) => l.url), [`https://api.resend.com/emails/receiving/${EMAIL_ID}`, `https://api.resend.com/emails/receiving/${EMAIL_ID}/attachments`]);
    for (const { op } of llamadas) {
      assert.equal(op.method, 'GET');
      assert.equal(op.headers.Authorization, 'Bearer re_prueba');
      assert.ok(op.signal instanceof AbortSignal);
    }
    process.env.RESEND_RECEPCION_URL = 'https://recepcion.test/emails///';
    await leerCorreo(EMAIL_ID);
    assert.equal(llamadas.at(-1).url, `https://recepcion.test/emails/${EMAIL_ID}`);
  } finally { globalThis.fetch = fetchAnterior; restaurarEntorno(antes); }
});

test('la lectura admite campos opcionales ausentes y rechaza UUID o clave ausentes antes de llamar a la API', async () => {
  const antes = { RESEND_API_KEY: process.env.RESEND_API_KEY, RESEND_RECEPCION_URL: process.env.RESEND_RECEPCION_URL };
  const fetchAnterior = globalThis.fetch;
  let llamadas = 0;
  try {
    process.env.RESEND_API_KEY = 're_prueba';
    delete process.env.RESEND_RECEPCION_URL;
    globalThis.fetch = async () => { llamadas++; return Response.json({ from: 'acme@example.com' }); };
    assert.deepEqual(await leerCorreo(EMAIL_ID), { de: 'acme@example.com', deNombre: '', asunto: '', texto: '', html: '', autenticacion: null, adjuntos: [] });
    assert.deepEqual(await listarAdjuntos(EMAIL_ID), []);
    for (const fn of [leerCorreo, listarAdjuntos]) {
      for (const id of ['no es uuid', `${EMAIL_ID}/../otro`, null]) await assert.rejects(() => fn(id), /UUID válido/);
    }
    delete process.env.RESEND_API_KEY;
    for (const fn of [leerCorreo, listarAdjuntos]) await assert.rejects(() => fn(EMAIL_ID), /falta RESEND_API_KEY/);
    assert.equal(llamadas, 2);
  } finally { globalThis.fetch = fetchAnterior; restaurarEntorno(antes); }
});

test('extrae la confirmación de Gmail en castellano y decodifica el enlace HTML', () => {
  const correo = { de: 'forwarding-noreply@google.com', asunto: '(#123456789) Confirmación de reenvío de Gmail', texto: 'Visita https://example.com/ignorar para más información.', html: '<p>Confirma el reenvío:</p><a href="https://mail.google.com/mail/uf?token=abc&amp;confirm=1">Confirmar</a>' };
  assert.deepEqual(confirmacionGmail(correo), { codigo: '123456789', enlace: 'https://mail.google.com/mail/uf?token=abc&confirm=1' });
  assert.equal(confirmacionGmail({ ...correo, de: 'otra@google.com' }), null);
  for (const host of ['mail.google.com', 'mail-settings.google.com', 'isolated.mail.google.com']) {
    assert.deepEqual(confirmacionGmail({ de: correo.de, texto: `El código de confirmación es 123456.\nhttps://${host}/confirmar` }), { codigo: '123456', enlace: `https://${host}/confirmar` });
  }
});

test('Gmail exige código completo y enlace de un host permitido', () => {
  const de = 'forwarding-noreply@google.com';
  for (const url of ['http://mail.google.com/x', 'https://mail.google.com.evil.test/x', 'https://evilmail.google.com/x', 'https://mail.google.com@evil.test/x']) {
    assert.equal(confirmacionGmail({ de, asunto: 'Código 123456', texto: url }), null);
  }
  for (const codigo of ['12345', '1234567890123', 'sin código']) assert.equal(confirmacionGmail({ de, asunto: codigo, texto: 'https://mail.google.com/x' }), null);
  assert.equal(confirmacionGmail({ de, asunto: 'Código 123456' }), null);
  assert.deepEqual(confirmacionGmail({ de, asunto: 'Confirmación', html: '<p>Código: <b>123456789012</b></p><a href="https://mail-settings.google.com/confirmar">Sí</a>' }), { codigo: '123456789012', enlace: 'https://mail-settings.google.com/confirmar' });
});

test('textoPlano quita scripts, estilos y etiquetas, conserva saltos y decodifica entidades', () => {
  const html = '<style>p { color: red; }</style><script>alert("no")</script><!-- oculto --><div>Factura&nbsp;&amp;&nbsp;gastos<br>Cliente: &quot;Acme&quot;</div><p>Base: &#49;&#x30; &lt; 20 &gt; 5 &apos;ok&apos;</p><table><tr><td>Total</td><td>12,10 €</td></tr></table>';
  assert.equal(textoPlano(html), 'Factura & gastos\nCliente: "Acme"\nBase: 10 < 20 > 5 \'ok\'\nTotal 12,10 €');
  assert.equal(textoPlano('<p>Visible</p><script>sin cierre'), 'Visible');
  assert.equal(textoPlano(null), '');
  assert.equal(textoPlano(`<p>${'x'.repeat(21000)}</p>`).length, 20000);
  assert.doesNotThrow(() => textoPlano('&#99999999999999999999; &#xD800;'));
});
