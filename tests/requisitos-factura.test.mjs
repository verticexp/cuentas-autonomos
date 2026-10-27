// Requisitos de la factura del Reglamento de facturación (RD 1619/2012): límite de la simplificada según el sector (art.
// 4), su título, la causa de la rectificativa (art. 15) y la fecha de la operación (art. 6.1.f).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, decodePDFRawStream } from 'pdf-lib';
import { esSimplificada, validarFactura } from '../lib/validacion.js';
import { limiteSimplificada, limpiarFiscal } from '../lib/empresa.js';
import { IDIOMAS_FACTURA, formatoDoc, notaAparte, textoRectifica, textosFactura, tituloDoc } from '../lib/idiomas.js';
import { facturaHtml } from '../lib/facturaHtml.js';
import { facturaPdf } from '../lib/pdf.js';
import { limpiarCierre } from '../lib/caja.js';

const emisor = { nombre: 'Tienda Ejemplo', nif: '11111111H', direccion: 'Calle Mayor 1', ciudad: 'Madrid', iban: 'ES12 3456 7890 1234 5678 9012', plazo: 30 };
const doc = (extra = {}) => ({ anio: 2026, numero: 5, serie: '', fecha: '2026-03-20', concepto: 'Venta', base: 100, ivaPct: 21, irpfPct: 0, cliente: { nombre: 'Ana' }, ...extra });
const b = (extra = {}) => ({ fecha: '2026-03-20', cliente: { nombre: 'Ana' }, base: 400, ivaPct: 21, irpfPct: 0, ...extra });
// Todo el texto del PDF, en el orden en que se dibuja (las líneas partidas vuelven a unirse con un espacio).
async function textoPdf(f) {
  const pdf = await PDFDocument.load(await facturaPdf(f, emisor));
  return pdf.getPages().map((p) => {
    const s = p.node.Contents();
    const cmds = Array.from({ length: s.size() }, (_, i) => Buffer.from(decodePDFRawStream(s.lookup(i)).decode()).toString('latin1')).join('\n');
    return [...cmds.matchAll(/<([A-Fa-f\d]*)> Tj/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join(' ');
  }).join(' ');
}

test('simplificada (art. 4): sin NIF, hasta 400 € IVA incluido; 3.000 € en los sectores del art. 4.1.c y en recargo', () => {
  assert.equal(limiteSimplificada(limpiarFiscal({})), 400);
  assert.equal(limiteSimplificada(limpiarFiscal({ minorista: true })), 3000);
  assert.equal(limiteSimplificada(limpiarFiscal({ iva: 'recargo' })), 3000);
  assert.equal(limpiarFiscal({}).minorista, undefined);
  // 400 € de base con el 21 %: 484 € IVA incluido.
  const e = validarFactura(b()).errores['cliente.nif'];
  assert.match(e, /400 € IVA incluido \(art\. 4 del Reglamento de facturación\)/);
  assert.match(e, /Ajustes › Actividades e impuestos/);
  assert.equal(validarFactura(b({ base: 330 })).ok, true);
  assert.equal(validarFactura(b(), { limiteSimplificada: 3000 }).ok, true);
  const e3000 = validarFactura(b({ base: 2500 }), { limiteSimplificada: 3000 }).errores['cliente.nif'];
  assert.match(e3000, /3\.000 € IVA incluido/);
  assert.doesNotMatch(e3000, /Ajustes/);
  // Exclusiones: rectificativas (art. 4.1.b), presupuestos, ventanilla única y clientes de otro país.
  assert.equal(validarFactura(b({ base: -2000 }), { rectificativa: true }).ok, true);
  assert.equal(validarFactura(b(), { presupuesto: true }).ok, true);
  assert.equal(validarFactura(b({ ivaPct: 20, oss: { pais: 'FR' } })).ok, true);
  assert.equal(validarFactura(b({ cliente: { nombre: 'Client', pais: 'US' } })).ok, true);
  assert.equal(validarFactura(b({ cliente: { nombre: 'Ana', nif: '12345678Z', direccion: 'C/ Sol 2' } })).ok, true);
  // Los cierres de caja (tiques del TPV) no pasan por aquí: su total del día no tiene límite.
  assert.equal(limpiarCierre({ fecha: '2026-03-20', porIva: [{ pct: 21, total: 5000 }] }).simplificada, true);
});

test('domicilio del destinatario (art. 6.1.e): a una empresa siempre; a un particular no es obligatorio', () => {
  // «Cuando el destinatario sea una persona física que no actúe como empresario o profesional, no será obligatoria la
  // consignación de su domicilio» (Manual práctico de IVA 2026 de la AEAT): con un DNI, la factura completa no lo pide.
  assert.equal(validarFactura(b({ base: 5000, cliente: { nombre: 'Ana', nif: '12345678Z' } })).ok, true);
  assert.match(validarFactura(b({ base: 10, cliente: { nombre: 'Empresa SL', nif: 'B12345674' } })).errores['cliente.direccion'], /empresa/);
  assert.equal(validarFactura(b({ base: -500, cliente: { nombre: 'Empresa SL', nif: 'B12345674' } }), { rectificativa: true }).ok, true);
});

test('título: sin ningún NIF del cliente es «Factura simplificada» (y su rectificativa, «rectificativa simplificada»)', async () => {
  const es = textosFactura('es');
  assert.equal(tituloDoc(doc(), es), 'Factura simplificada');
  assert.equal(tituloDoc(doc({ cliente: { nombre: 'Ana', nif: '12345678Z' } }), es), 'Factura');
  assert.equal(tituloDoc(doc({ serie: 'R' }), es), 'Factura rectificativa simplificada');
  assert.equal(tituloDoc(doc({ serie: 'R', cliente: { nombre: 'Ana', nif: '12345678Z' } }), es), 'Factura rectificativa');
  assert.equal(tituloDoc(doc({ serie: 'P' }), es, true), 'Presupuesto');
  // Con identificación de su país (o fuera de España, o por la ventanilla única), la factura es completa.
  for (const extra of [{ cliente: { nombre: 'Studio', nif: 'FR12345678901', pais: 'FR' } }, { cliente: { nombre: 'Client', pais: 'US' } }, { oss: { pais: 'FR' } }]) {
    assert.equal(esSimplificada(doc(extra)), false, JSON.stringify(extra));
  }
  assert.equal(esSimplificada({ simplificada: true, cliente: { nombre: 'Ventas del día', nif: '' } }), true);
  assert.equal(tituloDoc(doc({ idioma: 'en' }), textosFactura('en')), 'Simplified invoice');
  assert.match(facturaHtml(doc(), emisor), />Factura simplificada</);
  assert.match(facturaHtml({ ...doc({ serie: 'R', base: -100 }), rectifica: { id: '5', numero: '2026-5', fecha: '2026-03-01' } }, emisor), />Factura rectificativa simplificada</);
  assert.doesNotMatch(facturaHtml(doc({ cliente: { nombre: 'Ana', nif: '12345678Z', direccion: 'C/ Sol 2' } }), emisor), /simplificada/);
  assert.match(await textoPdf(doc()), /Factura simplificada/);
  assert.doesNotMatch(await textoPdf(doc({ cliente: { nombre: 'Ana', nif: '12345678Z' } })), /simplificada/);
});

test('rectificativa (art. 15): su condición, la factura que rectifica con su fecha y la causa, en PDF y HTML', async () => {
  const r = (rectifica, extra = {}) => doc({ serie: 'R', base: -100, cliente: { nombre: 'Ana', nif: '12345678Z' }, rectifica: { id: '5', numero: '2026-5', fecha: '2026-03-01', ...rectifica }, ...extra });
  const L = formatoDoc(r({}));
  assert.equal(textoRectifica(r({ motivo: 'devolucion' }), L), 'Rectifica la factura nº 2026-5 de fecha 01/03/2026. Motivo: devolución, descuento, anulación o cambio de precio de la operación (art. 80 de la Ley 37/1992).');
  assert.match(textoRectifica(r({ motivo: 'errorFactura' }), L), /Motivo: error en la factura rectificada/);
  assert.match(textoRectifica(r({ motivo: 'incobrable' }), L), /Motivo: crédito incobrable \(art\. 80\.Cuatro/);
  assert.match(textoRectifica(r({}), L), /Motivo: otras causas\.$/);
  // Sin motivo concreto, la nota es la causa y no se repite.
  const conNota = r({}, { nota: 'Cambio del domicilio del cliente' });
  assert.match(textoRectifica(conNota, L), /Motivo: Cambio del domicilio del cliente\.$/);
  assert.equal(notaAparte(conNota), '');
  assert.equal(notaAparte(r({ motivo: 'devolucion' }, { nota: 'Gracias' })), 'Gracias');
  assert.equal(textoRectifica(doc(), L), '');
  assert.match(textoRectifica(r({ motivo: 'devolucion' }, { idioma: 'en' }), formatoDoc({ idioma: 'en' })), /Corrects invoice no\. 2026-5 dated 01\/03\/2026\. Reason: return/);
  const html = facturaHtml(conNota, emisor);
  assert.match(html, />Factura rectificativa</);
  assert.match(html, /Rectifica la factura nº 2026-5 de fecha 01\/03\/2026\. Motivo: Cambio del domicilio del cliente\./);
  assert.equal(html.match(/Cambio del domicilio/g).length, 1);
  assert.match(await textoPdf(r({ motivo: 'devolucion' })), /Rectifica la factura nº 2026-5 de fecha 01\/03\/2026\. Motivo: devolución, descuento/);
});

test('fecha de la operación (art. 6.1.f): si no es la de la factura, con el lugar, en todos los idiomas', async () => {
  const f = doc({ cliente: { nombre: 'Ana', nif: '12345678Z' }, evento: { fecha: '2026-03-12', lugar: 'Madrid' } });
  assert.equal(formatoDoc(f).evento(f), 'Fecha de la operación: 12/03/2026 · Lugar: Madrid');
  assert.equal(formatoDoc(f).evento({ ...f, evento: { fecha: f.fecha, lugar: 'Madrid' } }), 'Lugar: Madrid');
  assert.equal(formatoDoc(f).evento({ ...f, evento: { fecha: '2026-03-12', lugar: '' } }), 'Fecha de la operación: 12/03/2026');
  assert.equal(formatoDoc(f).evento(doc()), '');
  assert.equal(formatoDoc({ idioma: 'en' }).evento(f), 'Date of supply: 12/03/2026 · Place: Madrid');
  assert.match(facturaHtml(f, emisor), /Fecha de la operación: 12\/03\/2026 · Lugar: Madrid/);
  assert.match(await textoPdf(f), /Fecha de la operación: 12\/03\/2026 · Lugar: Madrid/);
  // Cada idioma de la factura tiene sus textos (sin ellos saldría «undefined»).
  for (const { id } of IDIOMAS_FACTURA) {
    const t = textosFactura(id);
    for (const k of ['simplificada', 'rectificativaSimplificada', 'fechaOperacion', 'lugar', 'motivo']) assert.ok(t[k], `${id}: ${k}`);
    for (const m of ['devolucion', 'error', 'errorFactura', 'errorDerecho', 'concurso', 'incobrable', 'otros']) assert.ok(t.motivos[m], `${id}: motivos.${m}`);
    assert.doesNotMatch(formatoDoc({ idioma: id }).evento(f), /undefined/);
  }
});
