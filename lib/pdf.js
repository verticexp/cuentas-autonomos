import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { importes, numeroFactura, vencimiento } from './calculos.js';
import { eur, fechaCorta, pct, textoEvento } from './formato.js';
import { aclarar, colorValido } from './marca.js';
import QRCode from 'qrcode';
import { urlQr } from './verifactu.js';

// PDF real de la factura, sin cabeceras ni pies del navegador. Misma plantilla que components/FacturaA4.js.
// Una columna de color a la izquierda con quién factura; a la derecha, a quién, qué y cuánto.
const color = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TINTA = color('#17201D'), GRIS = color('#6B736F'), RAYA = color('#DDE2DF'), BLANCO = rgb(1, 1, 1);
// Las fuentes estándar solo admiten Latin-1 y €: se quita lo demás para que nunca falle.
const limpio = (s) => String(s ?? '').normalize('NFC').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[−]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF€]/g, '');
export const COLOR_FACTURA = '#1F4A3D';

export async function facturaPdf(f, e, marca = {}) {
  const base = colorValido(marca?.color) || COLOR_FACTURA;
  const ACENTO = color(base), SUAVE = color(aclarar(base, 0.9)), CLARO = color(aclarar(base, 0.75));
  const doc = await PDFDocument.create();
  doc.setTitle(numeroFactura(f));
  doc.setAuthor(limpio(e.nombre));
  doc.setCreator('');
  doc.setProducer('');
  const W = 595.28, H = 841.89;
  const p = doc.addPage([W, H]);
  const R = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = importes(f);
  const c = f.cliente;
  const COL = 178; // ancho de la columna de color
  const X = COL + 34, D = W - 40;

  const txt = (s, x, y, { font = R, size = 9.5, color: col = TINTA } = {}) => p.drawText(limpio(s), { x, y, font, size, color: col });
  const ancho = (s, font = R, size = 9.5) => font.widthOfTextAtSize(limpio(s), size);
  const der = (s, xd, y, o = {}) => txt(s, xd - ancho(s, o.font, o.size), y, o);
  const partir = (s, max, font = R, size = 9.5) => {
    const lineas = [];
    let actual = '';
    for (const palabra of limpio(s).split(/\s+/)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ancho(prueba, font, size) > max && actual) { lineas.push(actual); actual = palabra; } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    return lineas;
  };

  // Columna de color: logo, emisor y forma de pago
  p.drawRectangle({ x: 0, y: 0, width: COL, height: H, color: ACENTO });
  let yc = H - 52;
  if (marca?.logo) {
    try {
      const datos = Buffer.from(marca.logo.split(',')[1], 'base64');
      const img = marca.logo.startsWith('data:image/png') ? await doc.embedPng(datos) : await doc.embedJpg(datos);
      const k = Math.min(118 / img.width, 54 / img.height);
      // El logo va sobre una placa blanca: así se ve bien sea del color que sea
      p.drawRectangle({ x: 26, y: yc - img.height * k - 12, width: img.width * k + 24, height: img.height * k + 24, color: BLANCO });
      p.drawImage(img, { x: 38, y: yc - img.height * k, width: img.width * k, height: img.height * k });
      yc -= img.height * k + 46;
    } catch { /* logo dañado: la factura sale igual, sin él */ }
  }
  for (const l of partir(e.nombre, COL - 52, B, 14)) { txt(l, 26, yc, { font: B, size: 14, color: BLANCO }); yc -= 18; }
  yc -= 6;
  for (const l of [`NIF ${e.nif}`, e.direccion, e.ciudad].filter(Boolean).flatMap((s) => partir(s, COL - 52, R, 8.5))) { txt(l, 26, yc, { size: 8.5, color: CLARO }); yc -= 12.5; }

  // Pago, abajo en la columna
  let yp = 150;
  txt('FORMA DE PAGO', 26, yp, { font: B, size: 7, color: CLARO }); yp -= 15;
  for (const l of partir('Transferencia bancaria', COL - 52, R, 8.5)) { txt(l, 26, yp, { size: 8.5, color: BLANCO }); yp -= 12.5; }
  for (const l of partir(e.iban, COL - 52, B, 8.5)) { txt(l, 26, yp, { font: B, size: 8.5, color: BLANCO }); yp -= 12.5; }
  yp -= 8;
  txt('VENCIMIENTO', 26, yp, { font: B, size: 7, color: CLARO }); yp -= 15;
  txt(`${fechaCorta(vencimiento(f, e.plazo))} (${e.plazo} días)`, 26, yp, { size: 8.5, color: BLANCO });

  // Cabecera: tipo y número
  let y = H - 64;
  txt(f.serie === 'R' ? 'Factura rectificativa' : 'Factura', X, y, { font: B, size: 24 });
  y -= 20;
  txt(`Nº ${numeroFactura(f)}`, X, y, { size: 11, color: ACENTO, font: B });

  // QR de Verifactu arriba a la derecha (nivel M, ~30 mm)
  if (f.verifactu) {
    const qr = QRCode.create(urlQr(f.verifactu.modo, e.nif, f), { errorCorrectionLevel: 'M' });
    const n = qr.modules.size, lado = 76, m = lado / n, x0 = D - lado, y0 = H - 44 - lado;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (qr.modules.get(i, j)) p.drawRectangle({ x: x0 + j * m, y: y0 + lado - (i + 1) * m, width: m, height: m, color: rgb(0, 0, 0) });
    }
    der('VERI*FACTU', D, y0 - 10, { font: B, size: 6.5, color: GRIS });
  }

  // Fechas y cliente (más abajo si hay QR, para no chocar con él)
  y -= f.verifactu ? 70 : 46;
  const mitad = X + (D - X) / 2;
  txt('FACTURAR A', X, y, { font: B, size: 7, color: GRIS });
  txt('FECHA', mitad + 30, y, { font: B, size: 7, color: GRIS });
  y -= 16;
  txt(fechaCorta(f.fecha), mitad + 30, y, { size: 10 });
  let yCli = y;
  partir(c.nombre, mitad - X + 10, B, 11).forEach((l) => { txt(l, X, yCli, { font: B, size: 11 }); yCli -= 15; });
  for (const l of [c.nif && `NIF ${c.nif}`, c.direccion, c.ciudad].filter(Boolean).flatMap((s) => partir(s, mitad - X + 10))) { txt(l, X, yCli, { color: GRIS }); yCli -= 13; }
  y = Math.min(yCli, y) - 34;

  // Concepto
  txt('CONCEPTO', X, y, { font: B, size: 7, color: GRIS });
  der('IMPORTE', D, y, { font: B, size: 7, color: GRIS });
  y -= 8;
  p.drawLine({ start: { x: X, y }, end: { x: D, y }, thickness: 0.8, color: TINTA });
  y -= 18;
  const lineas = partir(f.concepto, D - X - 110, R, 10.5);
  lineas.forEach((l, i) => txt(l, X, y - i * 14, { size: 10.5 }));
  der(eur(t.base), D, y, { size: 10.5 });
  y -= lineas.length * 14;
  if (textoEvento(f)) { for (const l of partir(textoEvento(f), D - X - 110, R, 9)) { txt(l, X, y, { size: 9, color: GRIS }); y -= 12; } }
  y -= 8;
  p.drawLine({ start: { x: X, y }, end: { x: D, y }, thickness: 0.5, color: RAYA });

  // Totales
  y -= 24;
  const xt = D - 190;
  const fila = (a, b) => { txt(a, xt, y, { color: GRIS }); der(b, D, y); y -= 17; };
  fila('Base imponible', eur(t.base));
  fila(`IVA ${pct(f.ivaPct)}`, eur(t.iva));
  if (f.irpfPct > 0) fila(`Retención IRPF ${pct(f.irpfPct)}`, `-${eur(t.irpf)}`);
  y -= 6;
  p.drawRectangle({ x: xt - 12, y: y - 14, width: D - xt + 24, height: 36, color: SUAVE });
  txt('Total', xt, y, { font: B, size: 11 });
  der(eur(t.total), D, y - 2, { font: B, size: 16, color: ACENTO });
  y -= 44;

  // Notas
  const notas = [f.rectifica && `Rectifica la factura nº ${f.rectifica.numero} de fecha ${fechaCorta(f.rectifica.fecha)}.`, f.nota].filter(Boolean);
  if (notas.length) {
    txt('NOTAS', X, y, { font: B, size: 7, color: GRIS }); y -= 14;
    for (const n of notas) for (const l of partir(n, D - X, R, 9)) { txt(l, X, y, { size: 9, color: GRIS }); y -= 12; }
  }

  // Pie
  p.drawLine({ start: { x: X, y: 58 }, end: { x: D, y: 58 }, thickness: 0.5, color: RAYA });
  txt(`${e.nombre} · NIF ${e.nif}`, X, 42, { size: 7.5, color: GRIS });
  if (f.verifactu) der('Factura verificable en la sede electrónica de la AEAT', D, 42, { size: 7.5, color: GRIS });

  return doc.save();
}
