import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { delCliente } from '../lib/portal.js';
import { facturaPdf } from '../lib/pdf.js';
import { limpio } from '../lib/pdf.js';
import { facturaHtml } from '../lib/facturaHtml.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';

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
  assert.ok(txt.includes(hex('Presupuesto')) && txt.includes(hex('VÁLIDO HASTA')) && txt.includes(hex('16/05/2026')));
  assert.ok(!txt.includes(hex('VENCIMIENTO')));
  const f = texto(await facturaPdf({ ...p, serie: '', id: '1' }, e, {}));
  assert.ok(f.includes(hex('PARA')) && f.includes(hex('VENCIMIENTO')) && !f.includes(hex('VÁLIDO HASTA')));
});

const emisorPdf = { nombre: 'Marc Ramírez · Música', nif: '11111111H', direccion: 'Carrer de la Música, 3º 2ª', ciudad: 'Barcelona', iban: 'ES00 1234 5678 9012 3456 7890', plazo: 30 };
const ejemploPdf = { numero: 18, anio: 2026, fecha: '2026-10-14', cliente: { nombre: 'Producción Ñandú', nif: 'B12345678' }, concepto: 'Sesión musical', base: 1000, ivaPct: 21, irpfPct: 15 };
// Coordenadas y texto real por página, también para detectar invasiones entre columnas.
async function paginasPdf(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const normal = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  return pdf.getPages().map((page) => {
    const stream = page.node.Contents().asArray().map((ref) => inflateSync(pdf.context.lookup(ref).getContents()).toString('latin1')).join('\n');
    return [...stream.matchAll(/BT\n([\s\S]*?)\nET/g)].map((m) => {
      const [, font, size] = m[1].match(/\/([^\s]+) ([\d.]+) Tf/);
      const [, x, y] = m[1].match(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/);
      const texto = new TextDecoder('windows-1252').decode(Buffer.from(m[1].match(/<([\dA-F]*)> Tj/)[1], 'hex'));
      return { texto, x: +x, y: +y, size: +size, ancho: (font.includes('Bold') ? bold : normal).widthOfTextAtSize(texto, +size) };
    });
  });
}
function dentroDeMargenes(paginas) {
  for (const runs of paginas) {
    for (const r of runs) {
      assert.ok(r.x >= 39.99 && r.x + r.ancho <= 555.29, `fuera del margen: ${r.texto}`);
      assert.ok(r.y >= 31.99 && r.y + r.size <= 818, `fuera de la hoja: ${r.texto}`);
      assert.ok(r.y <= 42 || r.y >= 76, `invade el pie: ${r.texto}`);
    }
    for (const a of runs) for (const b of runs) {
      if (a !== b && a.x < b.x && Math.abs(a.y - b.y) < 1) assert.ok(a.x + a.ancho <= b.x + .01, `solapamiento: ${a.texto} / ${b.texto}`);
    }
  }
}

test('rectificativas: IRPF con un solo signo y sin cero negativo en PDF y HTML', async () => {
  const f = { ...ejemploPdf, serie: 'R', base: -1000 };
  const pages = await paginasPdf(await facturaPdf(f, emisorPdf));
  const retencion = pages.flat().find((r) => r.texto === 'Retención IRPF 15,00\u00a0%');
  const valor = pages.flat().find((r) => r.x > retencion.x && r.y === retencion.y);
  assert.equal(valor.texto, '150,00\u00a0€');
  assert.ok(!facturaHtml(f, emisorPdf).includes('--150'));
  assert.ok(!facturaHtml({ ...f, base: 0 }, emisorPdf).includes('-0,00'));
  dentroDeMargenes(pages);
});

test('cuarenta líneas: cabecera repetida y últimas filas con totales, pago y QR', async () => {
  const lineas = Array.from({ length: 40 }, (_, i) => ({ concepto: `Servicio ${i + 1} de producción y montaje del escenario principal`, cantidad: 2, precio: 100, dto: i % 2 ? 10 : 0, ivaPct: i % 2 ? 10 : 21 }));
  const f = { ...ejemploPdf, lineas, base: 7600, verifactu: { modo: 'pruebas' }, nota: 'Gracias por su confianza.' };
  const pages = await paginasPdf(await facturaPdf(f, emisorPdf));
  assert.ok(pages.length > 1);
  for (const runs of pages) assert.ok(runs.some((r) => r.texto === 'CONCEPTO'));
  const ultima = pages.at(-1).map((r) => r.texto).join(' ');
  assert.match(ultima, /Servicio 39/);
  assert.match(ultima, /Servicio 40/);
  assert.match(ultima, /Base imponible/);
  assert.match(ultima, /FORMA DE PAGO/);
  assert.match(ultima, /VERI\*FACTU/);
  dentroDeMargenes(pages);
});

test('descripción mayor que una página, identidades largas y total grande caben sin solaparse', async () => {
  const e = { ...emisorPdf, nombre: 'Producciones Musicales y Coordinación Integral de Festivales del Mediterráneo '.repeat(3), direccion: 'Avenida de los Espectáculos y las Artes Escénicas, edificio tres, oficina veintidós '.repeat(3) };
  const f = { ...ejemploPdf, concepto: 'Montaje y producción musical. '.repeat(160), base: 9876543210.99, irpfPct: 0, nota: 'Tildes: áéíóú ü Ñ ç · º ª œ Œ Š Ž …' };
  const pages = await paginasPdf(await facturaPdf(f, e));
  assert.ok(pages.length > 1);
  assert.ok(pages.at(-1).some((r) => r.texto === 'Total'));
  assert.ok(pages.at(-1).some((r) => r.texto === 'FORMA DE PAGO'));
  assert.ok(pages.flat().some((r) => r.texto.includes('œ Œ Š Ž')));
  assert.ok(!pages.flat().some((r) => r.texto === '€'));
  dentroDeMargenes(pages);
  assert.equal(limpio('Ramírez Ñandú œ Œ Š Ž — “música”'), 'Ramírez Ñandú œ Œ Š Ž - "música"');
});

test('HTML: presupuesto con validez y QR con cuatro módulos de margen blanco', async () => {
  const p = { ...ejemploPdf, serie: 'P', validez: 15 };
  const html = facturaHtml(p, emisorPdf);
  assert.match(html, /Presupuesto/);
  assert.match(html, /VÁLIDO HASTA/);
  assert.match(html, /29\/10\/2026/);
  assert.ok(!html.includes('VENCIMIENTO') && !html.includes('Vencimiento:'));
  const hqr = facturaHtml({ ...ejemploPdf, verifactu: { modo: 'pruebas' } }, emisorPdf);
  const png = Buffer.from(hqr.match(/alt="QR de Verifactu" src="data:image\/png;base64,([^"]+)"/)[1], 'base64');
  const w = png.readUInt32BE(16);
  const idat = png.indexOf('IDAT');
  const pixeles = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    if (x < 16 || y < 16 || x >= w - 16 || y >= w - 16) assert.equal(pixeles[y * (w + 1) + 1 + x], 255);
  }
});
