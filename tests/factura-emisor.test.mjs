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

// Huellas obtenidas de los renderizadores anteriores al cambio, con esta misma factura.
const anteriores = {
  '': { html: '506c866e7bd52f84e48b8e977d2c107febfd38e920fba7f5bf0e97b1e0e87d54', pdf: '6dd18e0e1f04cd6376f3a7728d8a03335b2ac43f4199fee7e2e8cfe488a41b78' },
  P: { html: '07c4e572dcd384331a01f137228500ed43fd0327becbf924a4d6f39e9715f0f9', pdf: '79486d25344a3aae668f718fc805c23445644d3891405682ae0039356f23f188' },
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
    assert.ok(html.includes(serie ? 'Válido hasta: 03-11-2026' : 'Vencimiento: 18-11-2026'));
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
      ...(qr ? { verifactu: { modo: 'pruebas' } } : {}),
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
