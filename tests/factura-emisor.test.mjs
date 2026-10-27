import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';
import { facturaHtml } from '../lib/facturaHtml.js';
import { facturaPdf } from '../lib/pdf.js';

const emisor = { nombre: 'Empresa Ejemplo SL', nif: 'B12345678', direccion: 'Calle Mayor 1', ciudad: 'Madrid', iban: 'ES12 3456 7890 1234 5678 9012', plazo: 30 };
const factura = {
  anio: 2026, numero: 7, serie: '', fecha: '2026-10-19', concepto: 'Servicio de prueba', base: 100, ivaPct: 21, irpfPct: 15,
  cliente: { nombre: 'Cliente Ejemplo', nif: 'A12345678', direccion: 'Calle Norte 2', ciudad: 'Barcelona', email: 'cliente@example.com', telefono: '900000000', web: 'cliente.example.com' },
};
const campos = {
  email: 'empresa@example.com', telefono: '600123456', web: 'www.empresa.example.com',
  registro: 'Registro Mercantil de Madrid, tomo 1234, folio 56, hoja M-78901',
  bizum: '611222333', otroPago: 'Efectivo o domiciliación', pie: 'Aviso <b>legal</b> & condiciones\nSegunda línea "legal".',
};
const completo = { ...emisor, ...campos };
const hash = (s) => createHash('sha256').update(s).digest('hex');
const comandos = (pagina) => {
  const streams = pagina.node.Contents();
  return Array.from({ length: streams.size() }, (_, i) => Buffer.from(decodePDFRawStream(streams.lookup(i)).decode()).toString('latin1')).join('\n');
};
// Operadores de texto reales del PDF: permiten comprobar contenido y separación del pie.
const textos = (pagina) => [...comandos(pagina).matchAll(/\/[^\s]+ ([\d.]+) Tf\n[^\n]+ TL\n1 0 0 1 ([\d.-]+) ([\d.-]+) Tm\n<([A-Fa-f\d]*)> Tj/g)]
  .map(([, size, x, y, hex]) => ({ size: Number(size), x: Number(x), y: Number(y), texto: Buffer.from(hex, 'hex').toString('latin1') }));

// Huellas obtenidas de los renderizadores anteriores al cambio, con esta misma factura (rehechas el 20-10-2026 al pasar
// las fechas a 15/10/2026 y el % a «21 %»).
const anteriores = {
  '': { html: 'b758b5beae0293a40a188ff4ba63789e592dbb1b2fcabceaa219ef887fc67f78', pdf: '51808cc54d7709eddbb4600af6b41eeb8e932dd50521b58c7f3b4a06b904e894' },
  P: { html: '062e7d2fa12f2f5ebe4e8ea1c114a1bbbbc196957f096104ee5c65b983f7012d', pdf: '2aabaf278d0b8d95e58f6aecbe865bae1fed021124fcc623f126fb7244f248cb' },
};

for (const serie of ['', 'P']) {
  const f = { ...factura, serie };
  const nombre = serie ? 'presupuesto' : 'factura';

  test(`${nombre}: sin campos nuevos, HTML y dibujo PDF idénticos a los anteriores`, async () => {
    for (const e of [emisor, { ...emisor, ...Object.fromEntries(Object.keys(campos).map((k) => [k, ''])) }]) {
      const html = facturaHtml(f, e);
      assert.equal(hash(html), anteriores[serie].html);
      assert.doesNotMatch(html, /Bizum|Registro Mercantil|Aviso|cliente@example\.com|900000000|cliente\.example\.com/);
      assert.doesNotMatch(html, /Madrid ·/);
      const pdf = await PDFDocument.load(await facturaPdf(f, e));
      assert.equal(pdf.getPageCount(), 1);
      assert.equal(hash(comandos(pdf.getPage(0))), anteriores[serie].pdf);
    }
  });

  test(`${nombre}: contacto solo en DE, pagos y pie escapados en HTML`, () => {
    const html = facturaHtml(f, completo);
    assert.ok(html.includes('Madrid<br>empresa@example.com · 600123456 · www.empresa.example.com'));
    for (const s of [emisor.iban, 'Transferencia bancaria', `Bizum: ${campos.bizum}`, campos.otroPago, campos.registro]) assert.ok(html.includes(s), s);
    assert.ok(html.includes('Aviso &lt;b&gt;legal&lt;/b&gt; &amp; condiciones\nSegunda línea &quot;legal&quot;.'));
    assert.doesNotMatch(html, /<b>legal<\/b>|cliente@example\.com|900000000|cliente\.example\.com/);
    assert.ok(html.indexOf('Aviso &lt;b&gt;') < html.indexOf(`${emisor.nombre} · NIF`));
    assert.ok(html.includes(serie ? 'Válido hasta: 03/11/2026' : 'Vencimiento: 18/11/2026'));
    for (const k of Object.keys(campos)) {
      const ataque = facturaHtml(f, { ...emisor, [k]: '<script>"&</script>' });
      assert.ok(ataque.includes('&lt;script&gt;&quot;&amp;&lt;/script&gt;'), k);
      assert.doesNotMatch(ataque, /<script>/);
    }
  });

  test(`${nombre}: Bizum y otro pago funcionan sin IBAN ni separadores vacíos`, async () => {
    for (const extra of [{ bizum: campos.bizum }, { otroPago: campos.otroPago }, { bizum: campos.bizum, otroPago: campos.otroPago }]) {
      const e = { ...emisor, iban: '', ...extra, email: campos.email };
      const html = facturaHtml(f, e);
      assert.doesNotMatch(html, /Transferencia bancaria|<b style="color:#0F1F1B"><\/b>/);
      assert.ok(html.includes(`Madrid<br>${campos.email}</span>`));
      if (extra.bizum) assert.ok(html.includes(`Bizum: ${campos.bizum}`));
      if (extra.otroPago) assert.ok(html.includes(campos.otroPago));
      const pdf = await PDFDocument.load(await facturaPdf(f, e));
      const texto = textos(pdf.getPage(0)).map((l) => l.texto).join('\n');
      assert.doesNotMatch(texto, /Transferencia bancaria/);
      if (extra.bizum) assert.ok(texto.includes(`Bizum: ${campos.bizum}`));
      if (extra.otroPago) assert.ok(texto.includes(campos.otroPago));
    }
  });
}

test('PDF válido con todos los campos, pie de 500 caracteres y varias páginas, con y sin QR', async () => {
  const pie = ('LEGAL Inicio <b>aviso</b>.\n\n' + 'Condiciones legales de la empresa para este documento. '.repeat(20)).slice(0, 500);
  assert.equal(pie.length, 500);
  for (const cantidad of [1, 85]) for (const qr of [false, true]) {
    const f = {
      ...factura,
      lineas: Array.from({ length: cantidad }, (_, i) => ({ concepto: `Servicio ${i + 1}`, cantidad: 1, precio: 100, ivaPct: 21 })),
      ...(qr ? { verifactu: { modo: 'real' } } : {}),
    };
    const e = { ...completo, pie };
    const bytes = await facturaPdf(f, e);
    assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
    const pdf = await PDFDocument.load(bytes);
    if (cantidad > 1) assert.ok(pdf.getPageCount() > 1);
    const todos = pdf.getPages().flatMap(textos).map((l) => l.texto).join('\n');
    for (const s of [e.email, e.telefono, e.web, `Bizum: ${e.bizum}`, e.otroPago, `Servicio ${cantidad}`]) assert.ok(todos.includes(s), s);
    if (qr) assert.ok(todos.includes('VERI*FACTU'));
    for (const pagina of pdf.getPages()) {
      const ls = textos(pagina);
      const piePdf = ls.filter((l) => l.size === 7.5);
      const textoPie = piePdf.map((l) => l.texto).join(' ');
      assert.ok(textoPie.includes('LEGAL Inicio <b>aviso</b>.'));
      assert.ok(textoPie.includes(e.registro));
      assert.ok(textoPie.includes(pie.slice(-20).trim()));
      assert.ok(piePdf.some((l) => l.texto === ''), 'conserva la línea en blanco');
      assert.ok(piePdf.every((l) => l.y >= 32 && l.x >= 40));
      const techoPie = Math.max(...piePdf.map((l) => l.y));
      assert.ok(ls.filter((l) => l.size !== 7.5).every((l) => l.y > techoPie + 16), 'contenido y rótulo del QR separados del pie en cada página');
    }
  }
});

// Auditoría 23-10-2026 (P-02): el IBAN es opcional. Sin él, la factura sale sin «Transferencia» y con los demás pagos;
// lo que sí necesita toda factura es nombre, NIF y dirección (art. 6.1 del Reglamento de facturación).
test('sin IBAN: ni «Transferencia» ni hueco vacío, y se generan HTML y PDF', async () => {
  const { iban, ...sinIban } = emisor;
  for (const e of [sinIban, { ...sinIban, bizum: '611222333' }]) {
    const html = facturaHtml(factura, e);
    assert.doesNotMatch(html, /Transferencia/);
    assert.ok(html.includes('Vencimiento: 18/11/2026'));
    const pdf = await PDFDocument.load(await facturaPdf(factura, e));
    assert.ok(!textos(pdf.getPage(0)).some((t) => /Transferencia/.test(t.texto)));
  }
  assert.ok(facturaHtml(factura, { ...sinIban, bizum: '611222333' }).includes('Bizum: 611222333'));
});

test('datos de factura: faltan nombre, NIF o dirección; el IBAN no cuenta', async () => {
  const { faltanDatosFactura } = await import('../lib/empresa.js');
  assert.deepEqual(faltanDatosFactura(emisor), []);
  assert.deepEqual(faltanDatosFactura({ ...emisor, iban: '' }), []);
  assert.deepEqual(faltanDatosFactura({ nombre: ' ', nif: 'B12345678' }), ['nombre', 'dirección']);
  assert.deepEqual(faltanDatosFactura(), ['nombre', 'NIF', 'dirección']);
});

// Auditoría 23-10-2026 (F1-32): la leyenda «VERI*FACTU», «Factura verificable…» y el QR solo van cuando los registros se
// envían de verdad a la AEAT (art. 6.5 RD 1619/2012); en modo pruebas las facturas de los clientes salen sin ellos.
test('Verifactu en pruebas: ni QR ni leyenda en la factura; en real, sí', async () => {
  const pruebas = { ...factura, verifactu: { modo: 'pruebas' } }, real = { ...factura, verifactu: { modo: 'real' } };
  assert.doesNotMatch(facturaHtml(pruebas, emisor), /VERI\*FACTU|QR de Verifactu/);
  assert.match(facturaHtml(real, emisor), /VERI\*FACTU/);
  const texto = async (f) => textos((await PDFDocument.load(await facturaPdf(f, emisor))).getPage(0)).map((t) => t.texto).join(' ');
  assert.doesNotMatch(await texto(pruebas), /verificable/);
  assert.match(await texto(real), /verificable/);
});

// Auditoría 23-10-2026 (F1-09 y D3-80): la parte sin IVA lleva sola su mención legal (art. 6.1.j y 6.1.m del Reglamento de
// facturación): exención con su artículo o «inversión del sujeto pasivo»; en otro idioma, la fórmula de la Directiva.
test('menciones de la operación sin IVA: exención o inversión del sujeto pasivo, sin repetir la nota', async () => {
  const sinIva = { ...factura, ivaPct: 0, irpfPct: 0 };
  const ue = { ...sinIva, cliente: { nombre: 'Kultur GmbH', nif: 'DE123456789' }, operacion: 'servicios-ue' };
  assert.match(facturaHtml(ue, emisor), /Inversión del sujeto pasivo\./);
  assert.match(facturaHtml({ ...ue, idioma: 'de' }, emisor), /Steuerschuldnerschaft des Leistungsempfängers/);
  assert.match(facturaHtml({ ...sinIva, operacion: 'exenta' }, emisor), /exenta de IVA \(art\. 20/);
  assert.match(facturaHtml({ ...sinIva, cliente: { nombre: 'Client Ltd', nif: 'GB123456789' }, operacion: 'exportacion' }, emisor), /Exportación exenta/);
  assert.equal((facturaHtml({ ...ue, nota: 'Operación con inversión del sujeto pasivo' }, emisor).match(/sujeto pasivo/g) || []).length, 1);
  assert.doesNotMatch(facturaHtml(factura, emisor), /sujeto pasivo|exenta/);
  const pdf = await PDFDocument.load(await facturaPdf(ue, emisor));
  assert.ok(textos(pdf.getPage(0)).some((t) => /sujeto pasivo/.test(t.texto)));
});

test('validación (auditoría F1-10): una factura de más de 3.000 € a un cliente de España sin NIF lo pide; un presupuesto no', async () => {
  const { validarFactura } = await import('../lib/validacion.js');
  const b = (extra = {}) => ({ fecha: '2026-03-10', cliente: { nombre: 'Particular' }, base: 3000, ivaPct: 21, irpfPct: 0, ...extra });
  // Aun en los sectores del art. 4.1.c (límite de 3.000 €), por encima se pide el NIF.
  assert.match(validarFactura(b(), { limiteSimplificada: 3000 }).errores['cliente.nif'], /3\.000 €/);
  assert.equal(validarFactura(b({ base: 2000 }), { limiteSimplificada: 3000 }).ok, true);
  assert.equal(validarFactura(b(), { presupuesto: true }).ok, true);
  assert.equal(validarFactura(b({ cliente: { nombre: 'Particular', nif: '12345678Z' } })).ok, true);
  assert.equal(validarFactura(b({ cliente: { nombre: 'Client', pais: 'US' } })).ok, true);
});
