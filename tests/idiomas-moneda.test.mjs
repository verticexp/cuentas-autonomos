// Factura en otro idioma y en otra moneda (decisión de la auditoría, 22-10-2026): lo fiscal en euros al tipo de cambio,
// (Intl separa el código de la moneda con un espacio no separable: «USD\u00a01,234.50».)
// lo que ve el cliente en su moneda y su idioma, y el contravalor en euros (art. 10 del Reglamento de facturación).
import test from 'node:test';
import assert from 'node:assert/strict';
import { limpiar, limpiarDivisa } from '../lib/facturas.js';
import { importes } from '../lib/calculos.js';
import { enDivisa, formatoDoc } from '../lib/idiomas.js';
import { eur, fechaCorta, pct } from '../lib/formato.js';
import { facturaHtml } from '../lib/facturaHtml.js';
import { facturaPdf } from '../lib/pdf.js';
import { asuntoFactura, mensajeFactura } from '../lib/plantillaEnvio.js';
import { plantillaDe } from '../lib/recurrentes.js';

const ACTS = [{ id: 'a', nombre: 'A', serie: '', ivaPct: 21, irpfPct: 0 }];
const datos = (extra = {}) => ({ fecha: '2026-10-21', actividad: 'a', cliente: { nombre: 'Client Ltd', nif: 'GB123456789', pais: 'GB', direccion: '1 High St' }, ...extra });
const E = { nombre: 'Prueba SL', nif: 'B12345674', direccion: 'C/ Mayor 1', ciudad: 'Madrid', iban: 'ES91 2100 0418 4502 0005 1332', plazo: 30 };

test('en otra moneda se guardan los precios escritos y su valor en euros, con el que se calcula todo lo fiscal', () => {
  const f = limpiar(datos({ lineas: [{ concepto: 'Consulting', cantidad: 3, precio: '100', ivaPct: 21 }], divisa: { moneda: 'USD', cambio: '1,0812', fecha: '2026-10-20', fuente: 'BCE' }, idioma: 'en' }), ACTS);
  assert.deepEqual([f.base, f.lineas[0].precioDivisa, f.lineas[0].precio, f.idioma], [277.47, 100, 92.489826, 'en']);
  assert.deepEqual(f.divisa, { moneda: 'USD', cambio: 1.0812, fecha: '2026-10-20', fuente: 'BCE' });
  assert.deepEqual(importes(enDivisa(f)), { base: 300, iva: 63, irpf: 0, total: 363 });
  assert.deepEqual(importes(f), { base: 277.47, iva: 58.27, irpf: 0, total: 335.74 });
  // Sin líneas: la base escrita es la de la moneda.
  const g = limpiar(datos({ base: '1000', ivaPct: 21, divisa: { moneda: 'GBP', cambio: 0.86 } }), ACTS);
  assert.deepEqual([g.base, g.baseDivisa, g.divisa.fuente], [1162.79, 1000, 'manual']);
  assert.equal(importes(enDivisa(g)).total, 1210);
});

test('en euros y en español, la factura queda como siempre; un tipo de cambio que no vale se dice', () => {
  const f = limpiar(datos({ base: '100', ivaPct: 21, divisa: { moneda: 'EUR', cambio: 1 }, idioma: 'es' }), ACTS);
  assert.ok(!('divisa' in f) && !('idioma' in f) && !('baseDivisa' in f));
  assert.equal(limpiar(datos({ base: '100', ivaPct: 21, idioma: 'xx' }), ACTS).idioma, undefined);
  for (const cambio of [0, -1, 'abc', '', 2e6]) {
    const r = limpiar(datos({ base: '100', ivaPct: 21, divisa: { moneda: 'USD', cambio } }), ACTS);
    assert.ok(r.error && r.errores['divisa.cambio'], String(cambio));
  }
  assert.equal(limpiarDivisa({ moneda: 'XXX', cambio: 1 }), null);
});

test('formatos: en español y euros, idénticos a los de siempre; en otro idioma, los suyos', () => {
  const es = formatoDoc({});
  assert.deepEqual([es.dinero(1234.5), es.pct(21), es.fecha('2026-10-21'), es.t.factura], [eur(1234.5), pct(21), fechaCorta('2026-10-21'), 'Factura']);
  const en = formatoDoc({ idioma: 'en', divisa: { moneda: 'USD', cambio: 1.08 } });
  assert.deepEqual([en.dinero(1234.5), en.euros(1234.5), en.pct(21), en.fecha('2026-10-21'), en.t.factura], ['USD\u00a01,234.50', '€1,234.50', '21.00%', '21/10/2026', 'Invoice']);
  const de = formatoDoc({ idioma: 'de' });
  assert.deepEqual([de.dinero(1234.5), de.pct(19), de.fecha('2026-10-21'), de.t.base], ['1.234,50 €', '19,00 %', '21.10.2026', 'Nettobetrag']);
  assert.match(en.cambio({ moneda: 'USD', cambio: 1.0812, fecha: '2026-10-20' }), /^Exchange rate: 1 € = 1\.0812 USD \(ECB, 20\/10\/2026\)$/);
});

test('documento en inglés y dólares: textos, importes en dólares y contravalor en euros', async () => {
  const f = { id: 'x', numero: 7, anio: 2026, serie: '', ...limpiar(datos({ lineas: [{ concepto: 'Consulting', cantidad: 3, precio: '100', ivaPct: 21 }], divisa: { moneda: 'USD', cambio: 1.0812, fecha: '2026-10-20', fuente: 'BCE' }, idioma: 'en' }), ACTS) };
  const html = facturaHtml(f, E);
  for (const texto of ['>Invoice<', 'DESCRIPTION', 'Taxable base', 'USD\u00a0300.00', 'USD\u00a0363.00', 'Equivalent in euros', '€335.74', 'Exchange rate: 1 € = 1.0812 USD (ECB, 20/10/2026)', 'Tax ID B12345674', 'Bank transfer', 'lang="en"']) {
    assert.ok(html.includes(texto), texto);
  }
  assert.ok(!html.includes('Base imponible'));
  const pdf = await facturaPdf(f, E);
  assert.ok(pdf.length > 1000);
});

test('correo de la factura en su idioma, con el total en su moneda; sin plantilla propia', () => {
  const f = { numero: 7, anio: 2026, serie: '', fecha: '2026-10-21', ...limpiar(datos({ base: '1000', ivaPct: 0, operacion: 'servicios-fuera', divisa: { moneda: 'GBP', cambio: 0.86 }, idioma: 'en' }), ACTS) };
  assert.equal(asuntoFactura(f, E), `Invoice 07-2026 from Prueba SL`);
  assert.match(mensajeFactura(f, E), /^Hello,\n\nPlease find attached invoice 07-2026 for GBP\u00a01,000\.00, due on 20\/11\/2026\./);
  // Con la plantilla de la empresa, su texto (con el total en la moneda de la factura).
  assert.equal(mensajeFactura(f, E, { mensaje: 'Total: {total}' }), 'Total: GBP\u00a01,000.00');
});

test('recurrentes: en el idioma de la factura y en euros (el tipo de cambio es el de cada fecha)', () => {
  const f = limpiar(datos({ lineas: [{ concepto: 'Soporte', cantidad: 1, precio: '108,12', ivaPct: 21 }], divisa: { moneda: 'USD', cambio: 1.0812 }, idioma: 'en' }), ACTS);
  const p = plantillaDe(f);
  assert.deepEqual([p.idioma, p.divisa, p.lineas[0].precioDivisa, p.lineas[0].precio], ['en', undefined, undefined, 100]);
});

test('tipo de cambio del BCE: el último publicado hasta la fecha, o un error para escribirlo a mano', async () => {
  const { cambioBce } = await import('../lib/cambio.js');
  const original = globalThis.fetch;
  const pedidas = [];
  globalThis.fetch = async (url) => {
    pedidas.push(String(url));
    return Response.json({ dataSets: [{ series: { '0:0:0:0:0': { observations: { 0: [1.1234, 0, 0, null, null] } } } }], structure: { dimensions: { observation: [{ values: [{ id: '2026-10-16' }] }] } } });
  };
  try {
    assert.deepEqual(await cambioBce('USD', '2026-10-18'), { moneda: 'USD', cambio: 1.1234, fecha: '2026-10-16', fuente: 'BCE' });
    assert.ok(pedidas.some((u) => /\/D\.USD\.EUR\.SP00\.A\?endPeriod=2026-10-18&lastNObservations=1/.test(u)), pedidas.join(' '));
    assert.ok((await cambioBce('EUR', '2026-10-18')).error);
    assert.ok((await cambioBce('USD', '18/10/2026')).error);
    globalThis.fetch = async () => { throw new Error('sin red'); };
    assert.match((await cambioBce('GBP', '2026-10-18')).error, /Escríbelo a mano/);
  } finally { globalThis.fetch = original; }
});
