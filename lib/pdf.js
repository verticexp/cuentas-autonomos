import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { importes, numeroFactura } from './calculos.js';
import { eur, fechaCorta, pct } from './formato.js';
import { aclarar, colorValido } from './marca.js';

// PDF real de la factura (misma plantilla), sin cabeceras ni pies del navegador.
const color = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const GRIS = color('#7F7F7F'), TEXTO = color('#3F3F3F');
// Las fuentes estándar solo admiten Latin-1 y €: se quita lo demás para que nunca falle.
const limpio = (s) => String(s ?? '').normalize('NFC').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF€]/g, '');

// Sin marca: la plantilla de siempre (dorado y verde). Con color propio: ese color en títulos y fondos suaves.
export async function facturaPdf(f, e, marca = {}) {
  const propio = colorValido(marca?.color);
  const ORO = color(propio || '#9B7A35'), VERDE = color(propio || '#0F4F32');
  const FONDO = color(propio ? aclarar(propio, 0.92) : '#F5EFE5'), LINEA = color(propio ? aclarar(propio, 0.6) : '#C8B59A');
  const doc = await PDFDocument.create();
  doc.setTitle(numeroFactura(f));
  doc.setAuthor(limpio(e.nombre));
  doc.setCreator('');
  doc.setProducer('');
  const p = doc.addPage([595.28, 841.89]);
  const H = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const T = await doc.embedFont(StandardFonts.TimesRoman);
  const X = 57, D = 595.28 - 57;
  const t = importes(f);
  const c = f.cliente;

  const txt = (s, x, y, { font = H, size = 10, color: col = TEXTO } = {}) => p.drawText(limpio(s), { x, y, font, size, color: col });
  const der = (s, xd, y, o = {}) => txt(s, xd - (o.font || H).widthOfTextAtSize(limpio(s), o.size || 10), y, o);
  const partir = (s, ancho, font = H, size = 10) => {
    const lineas = [];
    let actual = '';
    for (const palabra of limpio(s).split(/\s+/)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(prueba, size) > ancho && actual) { lineas.push(actual); actual = palabra; } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    return lineas;
  };

  if (marca?.logo) {
    try {
      const datos = Buffer.from(marca.logo.split(',')[1], 'base64');
      const img = marca.logo.startsWith('data:image/png') ? await doc.embedPng(datos) : await doc.embedJpg(datos);
      const k = Math.min(150 / img.width, 64 / img.height);
      p.drawImage(img, { x: D - img.width * k, y: 800 - img.height * k, width: img.width * k, height: img.height * k });
    } catch { /* logo dañado: la factura sale igual, sin él */ }
  }

  let y = 780;
  txt(f.serie === 'R' ? `FACTURA RECTIFICATIVA ${numeroFactura(f)}` : numeroFactura(f), X, y, { font: B, size: 11, color: VERDE });
  y -= 50;
  txt(e.nombre, X, y, { font: T, size: 30, color: ORO });
  y -= 22;
  for (const l of [`NIF: ${e.nif}`, e.direccion, e.ciudad].filter(Boolean)) { txt(l, X, y, { size: 9, color: GRIS }); y -= 13; }

  y -= 50;
  txt('FACTURAR A', X, y, { font: B, size: 12, color: ORO });
  const fecha = fechaCorta(f.fecha);
  der(fecha, D, y, { size: 10.5 });
  der('FECHA: ', D - H.widthOfTextAtSize(fecha, 10.5), y, { font: B, size: 10.5, color: ORO });
  y -= 18;
  for (const l of [c.nombre, c.nif, c.direccion, c.ciudad].filter(Boolean)) { txt(l, X, y, { size: 10.5 }); y -= 14; }

  y -= 36;
  txt('Detalles', X + 6, y, { font: B, size: 11, color: ORO });
  der('IMPORTE', D - 6, y, { font: B, size: 11, color: ORO });
  y -= 10;
  const concepto = partir(f.concepto, D - X - 120);
  const alto = Math.max(1, concepto.length) * 14 + 12;
  p.drawRectangle({ x: X, y: y - alto, width: D - X, height: alto, color: FONDO });
  p.drawLine({ start: { x: X, y: y - alto }, end: { x: D, y: y - alto }, thickness: 0.8, color: LINEA });
  concepto.forEach((l, i) => txt(l, X + 6, y - 17 - i * 14));
  der(eur(t.base), D - 6, y - 17);
  y -= alto + 26;

  const x0 = D - 215;
  const fila = (a, b, o = {}) => { txt(a, x0 + 8, y, o); der(b, D - 8, y, o); y -= 20; };
  fila('SUBTOTAL', eur(t.base));
  fila('I.V.A', pct(f.ivaPct));
  if (f.irpfPct > 0) fila('I.R.P.F', pct(f.irpfPct));
  p.drawRectangle({ x: x0, y: y - 7, width: D - x0, height: 22, color: FONDO });
  fila('TOTAL', eur(t.total), { font: B, size: 11 });

  y -= 30;
  const notas = [f.rectifica && `Rectifica la factura nº ${f.rectifica.numero} de fecha ${fechaCorta(f.rectifica.fecha)}.`, f.nota].filter(Boolean);
  for (const n of notas) for (const l of partir(n, D - X, H, 9)) { txt(l, X, y, { size: 9, color: GRIS }); y -= 12; }
  if (notas.length) y -= 20;

  txt('CONDICIONES Y FORMA DE PAGO', X, y, { font: B, size: 12, color: ORO });
  y -= 18;
  for (const l of partir(`El pago se efectuará, en un plazo máximo de ${e.plazo} días, por transferencia bancaria a la cuenta:`, D - X)) { txt(l, X, y); y -= 14; }
  txt(e.iban, X, y);

  return doc.save();
}
