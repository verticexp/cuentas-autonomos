import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { baseLinea, columnasLineas, desglose, importes, numeroFactura, vencimiento } from './calculos.js';
import { eur, eurSin, fechaCorta, pct, pctCorto, textoEvento } from './formato.js';
import { aclarar, colorValido } from './marca.js';
import QRCode from 'qrcode';
import { urlQr } from './verifactu.js';
import { caduca } from './presupuestos.js';

// PDF real de la factura, sin cabeceras ni pies del navegador. Misma plantilla que components/FacturaA4.js.
// Cabecera ligera, tarjeta de fechas, partes, líneas, totales y pago.
const color = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TINTA = color('#0F1F1B'), GRIS = color('#646B67'), RAYA = color('#E2E4E3');
// Las fuentes estándar solo admiten Latin-1 y €: se quita lo demás para que nunca falle.
export const limpio = (s) => String(s ?? '').normalize('NFC').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[−]/g, '-').replace(/[^\x20-\x7E\xA0-\xFF€]/g, '');
export const COLOR_FACTURA = '#0F1F1B';

// Presupuesto: conserva el mismo diseño y sus fechas de validez.
export async function facturaPdf(f, e, marca = {}, { presupuesto = false } = {}) {
  const base = colorValido(marca?.color) || COLOR_FACTURA;
  const SUAVE = color(aclarar(base, 0.9));
  const doc = await PDFDocument.create();
  doc.setTitle(numeroFactura(f));
  doc.setAuthor(limpio(e.nombre));
  doc.setCreator('');
  doc.setProducer('');
  const W = 595.28, H = 841.89, X = 40, D = W - 40, anchoHoja = D - X;
  const R = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  const t = importes(f), c = f.cliente;
  const tipo = presupuesto ? 'Presupuesto' : f.serie === 'R' ? 'Factura rectificativa' : 'Factura';
  const fechaFin = presupuesto ? fechaCorta(caduca(f)) : fechaCorta(vencimiento(f, e.plazo));
  let p, y;
  const txt = (s, x, yy, { font = R, size = 9.5, color: col = TINTA } = {}) => p.drawText(limpio(s), { x, y: yy, font, size, color: col });
  const ancho = (s, font = R, size = 9.5) => font.widthOfTextAtSize(limpio(s), size);
  const der = (s, xd, yy, o = {}) => txt(s, xd - ancho(s, o.font, o.size), yy, o);
  // Conserva saltos de línea y divide también palabras sin espacios (NIF, IBAN, nombres largos).
  const partir = (s, max, font = R, size = 9.5) => String(s ?? '').split(/\r?\n/).flatMap((texto) => {
    const parrafo = limpio(texto);
    const ls = []; let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ancho(prueba, font, size) <= max) { actual = prueba; continue; }
      if (actual) { ls.push(actual); actual = ''; }
      for (const ch of palabra) {
        if (ancho(actual + ch, font, size) > max && actual) { ls.push(actual); actual = ''; }
        actual += ch;
      }
    }
    if (actual) ls.push(actual);
    return ls.length ? ls : [''];
  });
  const raya = (yy) => p.drawLine({ start: { x: X, y: yy }, end: { x: D, y: yy }, thickness: 0.5, color: RAYA });
  const tarjeta = (x, yy, w, h, r = 12) => {
    p.drawRectangle({ x: x + r, y: yy, width: w - 2 * r, height: h, color: SUAVE });
    p.drawRectangle({ x, y: yy + r, width: w, height: h - 2 * r, color: SUAVE });
    for (const cx of [x + r, x + w - r]) for (const cy of [yy + r, yy + h - r]) p.drawCircle({ x: cx, y: cy, size: r, color: SUAVE });
  };
  const nueva = (continuacion = true) => {
    p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: SUAVE });
    y = H - 48;
    if (continuacion) { txt(`${tipo} nº ${numeroFactura(f)} (continuación)`, X, y, { size: 9, color: GRIS }); y -= 30; }
  };
  const espacio = (alto) => { if (y - alto < 76) nueva(); };
  const etiqueta = (s, x, yy) => txt(s, x, yy, { font: B, size: 7, color: GRIS });
  nueva(false);
  let logoAlto = 0;
  if (marca?.logo) {
    try {
      const datos = Buffer.from(marca.logo.split(',')[1], 'base64');
      const img = marca.logo.startsWith('data:image/png') ? await doc.embedPng(datos) : await doc.embedJpg(datos);
      const k = Math.min(118 / img.width, 48 / img.height);
      p.drawImage(img, { x: X, y: y - img.height * k + 8, width: img.width * k, height: img.height * k });
      logoAlto = img.height * k + 9;
    } catch { /* Un logo dañado no impide emitir el documento. */ }
  }
  const nombre = partir(e.nombre, anchoHoja * 0.5, B, 16);
  const titulo = partir(tipo, anchoHoja * 0.43, B, 22);
  titulo.forEach((l, i) => der(l, D, y - i * 25, { font: B, size: 22 }));
  y -= logoAlto;
  for (const l of nombre) { espacio(20); txt(l, X, y, { font: B, size: 16 }); y -= 20; }
  y = Math.min(y, H - 48 - titulo.length * 25) - 16;
  const datos = [ ['NÚMERO', `Nº ${numeroFactura(f)}`], ['FECHA', fechaCorta(f.fecha)], [presupuesto ? 'VÁLIDO HASTA' : 'VENCIMIENTO', fechaFin] ];
  const anchos = [anchoHoja * .39, anchoHoja * .305, anchoHoja * .305];
  const dls = datos.map((d, i) => partir(d[1], anchos[i] - 32, i === 0 ? B : R, i === 0 ? 11 : 9.5));
  const altoDatos = 45 + Math.max(...dls.map((l) => l.length)) * 14;
  espacio(altoDatos); tarjeta(X, y - altoDatos, anchoHoja, altoDatos);
  let dx = X;
  datos.forEach((d, i) => { etiqueta(d[0], dx + 16, y - 21); dls[i].forEach((l, j) => txt(l, dx + 16, y - 38 - j * 14, { font: i === 0 ? B : R, size: i === 0 ? 11 : 9.5 })); dx += anchos[i]; });
  y -= altoDatos + 24;
  const mitad = X + (anchoHoja + 24) / 2, ap = (anchoHoja - 24) / 2;
  const parte = (persona) => [ ...partir(persona.nombre, ap, B, 11).map((s) => ({ s, negrita: true })), ...[persona.nif && `NIF ${persona.nif}`, persona.direccion, persona.ciudad].filter(Boolean).flatMap((s) => partir(s, ap).map((s) => ({ s }))) ];
  const de = parte(e), para = parte(c);
  espacio(35); etiqueta('DE', X, y); etiqueta('PARA', mitad, y); y -= 17;
  for (let i = 0; i < Math.max(de.length, para.length); i++) {
    espacio(15);
    [de[i], para[i]].forEach((l, j) => { if (l) txt(l.s, j ? mitad : X, y, { font: l.negrita ? B : R, size: l.negrita ? 11 : 9.5, color: l.negrita ? TINTA : GRIS }); }); y -= 15;
  }
  y -= 24;
  const lineasF = f.lineas?.length ? f.lineas : null, k = lineasF ? columnasLineas(f) : {};
  const lineas = lineasF || [{ concepto: f.concepto }];
  const cols = lineasF ? [
    ['IMPORTE', 70, (l) => eur(baseLinea(l))],
    ...(k.iva ? [['IVA', 38, (l) => pctCorto(l.ivaPct)]] : []),
    ...(k.dto ? [['DTO.', 38, (l) => l.dto ? pctCorto(l.dto) : '']] : []),
    ['PRECIO', 70, (l) => eur(l.precio)],
    ['CANT.', 38, (l) => eurSin(l.cantidad).replace(/,00$/, '')],
  ] : [['IMPORTE', 110, () => eur(t.base)]];
  const bordes = []; let xr = D;
  for (const col of cols) { bordes.push(xr); xr -= col[1]; }
  const anchoConcepto = xr - X - 12;
  const cabecera = () => {
    etiqueta('CONCEPTO', X, y);
    cols.forEach((col, i) => der(col[0], bordes[i], y, { font: B, size: 7, color: GRIS }));
    y -= 8; raya(y); y -= 20;
  };
  espacio(50); cabecera();
  lineas.forEach((l, n) => {
    const ls = partir(l.concepto, anchoConcepto, R, 10).map((s) => ({ s, size: 10 }));
    if (n === 0 && textoEvento(f)) ls.push(...partir(textoEvento(f), anchoConcepto, R, 9).map((s) => ({ s, size: 9, color: GRIS })));
    if (y - Math.min(ls.length * 14 + 24, 160) < 76) { nueva(); cabecera(); }
    cols.forEach((col, i) => {
      const valor = col[2](l), size = Math.min(10, 10 * (col[1] - 8) / Math.max(ancho(valor, R, 10), 1));
      der(valor, bordes[i], y, { size });
    });
    for (const l of ls) {
      if (y - 14 < 76) { nueva(); cabecera(); }
      txt(l.s, X, y, l); y -= 14;
    }
    y -= 8; raya(y); y -= 20;
  });
  const ds = desglose(f);
  const totales = [['Base imponible', eur(t.base)], ...ds.map((d) => [`IVA ${pct(d.pct)}${ds.length > 1 ? ` de ${eur(d.base)}` : ''}`, eur(d.iva)]), ...(f.irpfPct > 0 ? [[`Retención IRPF ${pct(f.irpfPct)}`, `-${eur(t.irpf)}`]] : [])];
  const xt = D - 260;
  espacio(totales.length * 30 + 90); y -= 4;
  for (const [a, b] of totales) {
    const ls = partir(a, 155);
    ls.forEach((l, i) => txt(l, xt, y - i * 13, { color: GRIS })); der(b, D, y);
    y -= Math.max(17, ls.length * 13 + 5);
  }
  y -= 6; tarjeta(xt, y - 40, 260, 52);
  txt('Total', xt + 12, y - 18, { font: B, size: 11 });
  const total = eur(t.total), totalSize = Math.min(22, 22 * 175 / Math.max(ancho(total, B, 22), 1));
  der(total, D - 12, y - 21, { font: B, size: totalSize }); y -= 62;
  const notas = [f.rectifica && `Rectifica la factura nº ${f.rectifica.numero} de fecha ${fechaCorta(f.rectifica.fecha)}.`, f.nota].filter(Boolean);
  if (notas.length) {
    espacio(40); etiqueta('NOTAS', X, y); y -= 14;
    for (const n of notas) { for (const l of partir(n, anchoHoja, R, 9)) { espacio(13); txt(l, X, y, { size: 9, color: GRIS }); y -= 13; } y -= 4; }
  }
  const pago = [ 'Transferencia bancaria', ...partir(e.iban, anchoHoja - (f.verifactu ? 110 : 0), B, 8.5), ...partir(presupuesto ? `Válido hasta: ${fechaFin}` : `Vencimiento: ${fechaFin} (${e.plazo} días)`, anchoHoja - (f.verifactu ? 110 : 0), R, 8.5) ];
  const altoPago = Math.max(f.verifactu ? 108 : 0, pago.length * 13 + 45);
  espacio(altoPago + 24); y -= 12; raya(y); y -= 24;
  etiqueta('FORMA DE PAGO', X, y); y -= 15;
  pago.forEach((l, i) => txt(l, X, y - i * 13, { size: 8.5, font: i > 0 && i < pago.length - 1 ? B : R, color: i === 0 || i === pago.length - 1 ? GRIS : TINTA }));
  if (f.verifactu) {
    const qr = QRCode.create(urlQr(f.verifactu.modo, e.nif, f), { errorCorrectionLevel: 'M' });
    const n = qr.modules.size, lado = 76, m = lado / n, x0 = D - lado, y0 = y + 15 - lado;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.modules.get(i, j)) p.drawRectangle({ x: x0 + j * m, y: y0 + lado - (i + 1) * m, width: m, height: m, color: rgb(0, 0, 0) });
    txt('VERI*FACTU', x0 + (lado - ancho('VERI*FACTU', B, 6.5)) / 2, y0 - 10, { font: B, size: 6.5, color: GRIS });
  }
  // Pie en todas las páginas, con ancho reservado para nombres y textos largos.
  for (const pagina of doc.getPages()) {
    p = pagina;
    partir(`${e.nombre} · NIF ${e.nif}`, f.verifactu ? anchoHoja / 2 - 12 : anchoHoja, R, 7.5).slice(0, 2).forEach((l, i) => txt(l, X, 42 - i * 10, { size: 7.5, color: GRIS }));
    if (f.verifactu) partir('Factura verificable en la sede electrónica de la AEAT', anchoHoja / 2 - 12, R, 7.5).forEach((l, i) => der(l, D, 42 - i * 10, { size: 7.5, color: GRIS }));
  }
  return doc.save();
}
