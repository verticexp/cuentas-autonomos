import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { baseLinea, desglose, importes } from './calculos.js';
import { eur, eurSin, fechaCorta, pct, pctCorto } from './formato.js';
import { aclarar, colorValido } from './marca.js';
import { COLOR_FACTURA, limpio, tamanoNumero } from './pdf.js';
import { NOMBRE, baseDoc, numeroDoc } from './albaranes.js';

// PDF del albarán o pedido (nota de entrega). Misma estética que la factura (lib/pdf.js) y que components/AlbaranA4.js.
// valorado: con precios, importes y totales; sin valorar, solo conceptos y cantidades. El albarán lleva «Recibí».
const color = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TINTA = color('#0F1F1B'), GRIS = color('#646B67'), RAYA = color('#E2E4E3');

// Datos comunes a la vista en pantalla y al PDF.
export function datosAlbaran(d, pedido) {
  const x = { ...d, base: baseDoc(d) };
  return {
    titulo: NOMBRE[d.tipo] || 'Albarán',
    numero: numeroDoc(d),
    fechas: [['Fecha', fechaCorta(d.fecha)], d.tipo === 'pedido' && d.entrega ? ['Entrega prevista', fechaCorta(d.entrega)] : pedido ? ['Pedido', numeroDoc(pedido)] : null].filter(Boolean),
    dto: d.lineas.some((l) => l.dto),
    desglose: desglose(x),
    total: importes(x),
    recibi: d.tipo === 'albaran',
  };
}

export const nombreArchivo = (d) => `${numeroDoc(d)} ${d.cliente.nombre.toUpperCase().replace(/[^A-Z0-9ÀÈÉÍÒÓÚÇÑ ]+/g, '').trim()}.pdf`;

export async function albaranPdf(d, e, marca = {}, { valorado = true, pedido = null } = {}) {
  const a = datosAlbaran(d, pedido);
  const base = colorValido(marca?.color) || COLOR_FACTURA;
  const SUAVE = color(aclarar(base, 0.9));
  const doc = await PDFDocument.create();
  doc.setTitle(a.numero);
  doc.setAuthor(limpio(e.nombre));
  doc.setCreator('');
  doc.setProducer('');
  const W = 595.28, H = 841.89, X = 40, D = W - 40, anchoHoja = D - X;
  const R = await doc.embedFont(StandardFonts.Helvetica);
  const B = await doc.embedFont(StandardFonts.HelveticaBold);
  let p, y;
  const txt = (s, x, yy, { font = R, size = 9.5, color: col = TINTA } = {}) => p.drawText(limpio(s), { x, y: yy, font, size, color: col });
  const ancho = (s, font = R, size = 9.5) => font.widthOfTextAtSize(limpio(s), size);
  const der = (s, xd, yy, o = {}) => txt(s, xd - ancho(s, o.font, o.size), yy, o);
  const partir = (s, max, font = R, size = 9.5) => String(s ?? '').split(/\r?\n/).flatMap((texto) => {
    const ls = []; let actual = '';
    for (const palabra of limpio(texto).split(/[ \t]+/).filter(Boolean)) {
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
  const raya = (yy, x0 = X, x1 = D) => p.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: 0.5, color: RAYA });
  const tarjeta = (x, yy, w, h, r = 12) => {
    p.drawRectangle({ x: x + r, y: yy, width: w - 2 * r, height: h, color: SUAVE });
    p.drawRectangle({ x, y: yy + r, width: w, height: h - 2 * r, color: SUAVE });
    for (const cx of [x + r, x + w - r]) for (const cy of [yy + r, yy + h - r]) p.drawCircle({ x: cx, y: cy, size: r, color: SUAVE });
  };
  const nueva = (continuacion = true) => {
    p = doc.addPage([W, H]);
    p.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: SUAVE });
    y = H - 48;
    if (continuacion) { txt(`${a.titulo} nº ${a.numero} (continuación)`, X, y, { size: 9, color: GRIS }); y -= 30; }
  };
  const LIMITE = 76;
  const espacio = (alto) => { if (y - alto < LIMITE) nueva(); };
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
    } catch { /* Un logo dañado no impide generar el documento. */ }
  }
  const titulo = partir(a.titulo, anchoHoja * 0.43, B, 22);
  titulo.forEach((l, i) => der(l, D, y - 12 - i * 25, { font: B, size: 22 }));
  y -= logoAlto;
  for (const l of partir(e.nombre, anchoHoja * 0.5, B, 16)) { txt(l, X, y - 8, { font: B, size: 16 }); y -= 20; }
  y = Math.min(y, H - 48 - titulo.length * 25) - 16;

  const datos = [['NÚMERO', `Nº ${a.numero}`], ...a.fechas.map(([k, v]) => [k.toUpperCase(), v])];
  const anchos = datos.length === 3 ? [anchoHoja * .39, anchoHoja * .305, anchoHoja * .305] : [anchoHoja * .5, anchoHoja * .5];
  tarjeta(X, y - 59, anchoHoja, 59);
  let dx = X;
  datos.forEach((dd, i) => { etiqueta(dd[0], dx + 16, y - 21); txt(dd[1], dx + 16, y - 38, { font: i === 0 ? B : R, size: i === 0 ? 11 : 9.5 }); dx += anchos[i]; });
  y -= 59 + 24;

  const mitad = X + (anchoHoja + 24) / 2, ap = (anchoHoja - 24) / 2;
  const parte = (q) => [...partir(q.nombre, ap, B, 11).map((s) => ({ s, negrita: true })), ...[q.nif && `NIF ${q.nif}`, q.direccion, q.ciudad].filter(Boolean).flatMap((s) => partir(s, ap).map((s) => ({ s })))];
  const de = parte(e), para = parte(d.cliente);
  etiqueta('DE', X, y); etiqueta(d.tipo === 'albaran' ? 'ENTREGAR A' : 'CLIENTE', mitad, y); y -= 17;
  for (let i = 0; i < Math.max(de.length, para.length); i++) {
    [de[i], para[i]].forEach((l, j) => { if (l) txt(l.s, j ? mitad : X, y, { font: l.negrita ? B : R, size: l.negrita ? 11 : 9.5, color: l.negrita ? TINTA : GRIS }); });
    y -= 15;
  }
  y -= 24;

  const cols = valorado ? [
    ['IMPORTE', 70, (l) => eur(baseLinea(l))],
    ...(a.dto ? [['DTO.', 38, (l) => l.dto ? pctCorto(l.dto) : '']] : []),
    ['PRECIO', 70, (l) => eur(l.precio)],
    ['CANT.', 50, (l) => eurSin(l.cantidad)],
  ] : [['CANTIDAD', 80, (l) => eurSin(l.cantidad)]];
  const bordes = []; let xr = D;
  for (const col of cols) { bordes.push(xr); xr -= col[1]; }
  const anchoConcepto = xr - X - 12;
  const cabecera = () => {
    etiqueta('CONCEPTO', X, y);
    cols.forEach((col, i) => der(col[0], bordes[i], y, { font: B, size: 7, color: GRIS }));
    y -= 8; raya(y); y -= 20;
  };
  espacio(80); cabecera();
  for (const l of d.lineas) {
    const ls = partir(l.concepto, anchoConcepto, R, 10);
    if (y - ls.length * 14 - 6 < LIMITE) { nueva(); cabecera(); }
    cols.forEach((col, i) => { const v = col[2](l); der(v, bordes[i], y, { size: tamanoNumero(v, col[1]) }); });
    for (const s of ls) { txt(s, X, y, { size: 10 }); y -= 14; }
    y -= 6; raya(y); y -= 18;
  }

  if (valorado) {
    const totales = [['Base imponible', eur(a.total.base)], ...a.desglose.map((x) => [`IVA ${pct(x.pct)}${a.desglose.length > 1 ? ` de ${eur(x.base)}` : ''}`, eur(x.iva)])];
    const anchoT = 260, xt = D - anchoT;
    espacio(totales.length * 17 + 70); y -= 4;
    for (const [k, v] of totales) { txt(k, xt, y, { color: GRIS }); der(v, D, y); y -= 17; }
    y -= 6; tarjeta(xt, y - 40, anchoT, 52);
    txt('Total', xt + 12, y - 18, { font: B, size: 11 });
    der(eur(a.total.total), D - 12, y - 21, { font: B, size: 18 }); y -= 62;
  }
  if (d.nota) {
    const ls = partir(d.nota, anchoHoja, R, 9);
    espacio(14 + ls.length * 13); etiqueta('NOTAS', X, y); y -= 14;
    for (const l of ls) { txt(l, X, y, { size: 9, color: GRIS }); y -= 13; }
    y -= 4;
  }
  if (a.recibi) {
    espacio(110); y -= 16;
    const w = (anchoHoja - 24) / 2;
    etiqueta('RECIBÍ CONFORME: NOMBRE Y FIRMA', X, y); etiqueta('FECHA', X + w + 24, y);
    raya(y - 62, X, X + w); raya(y - 62, X + w + 24, D);
    y -= 80;
  }
  for (const pagina of doc.getPages()) {
    p = pagina;
    txt(`${e.nombre}${e.nif ? ` · NIF ${e.nif}` : ''}`.slice(0, 110), X, 42, { size: 7.5, color: GRIS });
  }
  return doc.save();
}
