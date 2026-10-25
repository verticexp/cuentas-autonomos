import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { baseLinea, columnasLineas, desglose, importes, numeroFactura, vencimiento } from './calculos.js';
import { eur } from './formato.js';
import { aclarar, colorValido } from './marca.js';
import QRCode from 'qrcode';
import { urlQr } from './verifactu.js';
import { caduca } from './presupuestos.js';
import { enDivisa, filasTotales as filasResumen, formatoDoc, menciones, notaAparte, textoRectifica, tituloDoc } from './idiomas.js';

// PDF real de la factura, sin cabeceras ni pies del navegador. Misma plantilla que components/FacturaA4.js.
// Cabecera ligera, tarjeta de fechas, partes, líneas, totales y pago.
const color = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const TINTA = color('#0F1F1B'), GRIS = color('#646B67'), RAYA = color('#E2E4E3');
// Helvetica usa WinAnsi: conserva también sus caracteres europeos y símbolos.
export const limpio = (s) => String(s ?? '').normalize('NFC').replace(/[—–−‑]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\u202f/g, '\u00a0').replace(/[^\x20-\x7E\xA0-\xFF€ŒœŠšŽžŸ…•™†‡‰‹›ƒ]/gu, (ch) => ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ''));
export const COLOR_FACTURA = '#0F1F1B';
// Anchos de Helvetica Bold para cantidades: el mismo tamaño en las tres vistas.
const anchoCifra = (s) => [...limpio(s)].reduce((w, ch) => w + ('., \u00a0'.includes(ch) ? .278 : ch === '-' ? .333 : ch === '%' ? .889 : .556), 0);
export const tamanoTotal = (s) => Math.min(22, 175 / anchoCifra(s));
export const tamanoNumero = (s, ancho) => Math.min(10, (ancho - 8) / anchoCifra(s));
// dinero: cómo se escriben los importes (en otra moneda o idioma, lib/idiomas.js formatoDoc).
export const anchoResumen = (f, dinero = eur) => {
  const t = importes(f);
  const valores = [t.base, t.irpf, ...desglose(f).map((d) => d.iva)];
  return Math.min(515.28, Math.max(260, 170 + Math.max(90, ...valores.map((v) => anchoCifra(dinero(v)) * 9.5))));
};

// Presupuesto: conserva el mismo diseño y sus fechas de validez. En el idioma y la moneda de la factura (lib/idiomas.js):
// importes en su moneda y, si no es el euro, su contravalor en euros con el tipo de cambio.
export async function facturaPdf(fOriginal, e, marca = {}, { presupuesto = fOriginal.serie === 'P' } = {}) {
  const L = formatoDoc(fOriginal), f = enDivisa(fOriginal), tEur = importes(fOriginal);
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
  const tipo = tituloDoc(f, L.t, presupuesto);
  const fechaFin = presupuesto ? L.fecha(caduca(f)) : L.fecha(vencimiento(f, e.plazo));
  let p, y;
  const txt = (s, x, yy, { font = R, size = 9.5, color: col = TINTA } = {}) => p.drawText(limpio(s), { x, y: yy, font, size, color: col });
  const ancho = (s, font = R, size = 9.5) => font.widthOfTextAtSize(limpio(s), size);
  const der = (s, xd, yy, o = {}) => txt(s, xd - ancho(s, o.font, o.size), yy, o);
  // Conserva saltos de línea y divide también palabras sin espacios (NIF, IBAN, nombres largos).
  const partir = (s, max, font = R, size = 9.5) => String(s ?? '').split(/\r?\n/).flatMap((texto) => {
    const parrafo = limpio(texto).replace(/(\d[\d.,]*)\s+€/g, '$1\u00a0€');
    const ls = []; let actual = '';
    for (const palabra of parrafo.split(/[ \t]+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (ancho(prueba, font, size) <= max) { actual = prueba; continue; }
      if (actual) { ls.push(actual); actual = ''; }
      for (const ch of palabra) {
        if (ancho(actual + ch, font, size) > max && actual) { ls.push(actual); actual = ''; }
        actual += ch;
      }
    }
    if (actual) ls.push(actual);
    // Evita terminar un concepto o nombre con una palabra/número aislado.
    if (ls.length > 1 && ancho(ls.at(-1), font, size) < max * .2) {
      const anterior = ls.at(-2).split(' '), ultima = `${anterior.at(-1)} ${ls.at(-1)}`;
      if (anterior.length > 1 && ancho(ultima, font, size) <= max) {
        anterior.pop(); ls[ls.length - 2] = anterior.join(' '); ls[ls.length - 1] = ultima;
      }
    }
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
    if (continuacion) {
      const ls = partir(`${tipo} ${L.idioma === 'es' ? 'nº' : L.t.nro} ${numeroFactura(f)} (${L.t.continuacion})`, anchoHoja, R, 9);
      ls.forEach((l, i) => txt(l, X, y - i * 12, { size: 9, color: GRIS })); y -= ls.length * 12 + 18;
    }
  };
  // Calcula el pie antes de paginar: sus líneas se reservan en todas las páginas.
  // La leyenda y el QR de Verifactu, solo cuando los registros van de verdad a la AEAT (art. 6.5 RD 1619/2012): en pruebas, no.
  const vf = f.verifactu?.modo === 'real';
  const maxPie = vf ? anchoHoja / 2 - 12 : anchoHoja;
  const identidad = `${e.nombre} · ${L.t.nif} ${e.nif}${e.registro ? ` · ${e.registro}` : ''}`;
  let sizePie = 7.5;
  if (!e.registro) while (partir(identidad, maxPie, R, sizePie).length > 2 && sizePie > 5) sizePie -= .25;
  let lsPie = partir(identidad, maxPie, R, sizePie);
  if (!e.registro && lsPie.length > 2) {
    let nombreCorto = lsPie[0];
    while (ancho(`${nombreCorto}…`, R, sizePie) > maxPie) nombreCorto = nombreCorto.slice(0, -1);
    lsPie = [`${nombreCorto}…`, `${L.t.nif} ${e.nif}`];
  }
  const legal = e.pie ? partir(e.pie, anchoHoja, R, 7.5) : [];
  const yIdentidad = 42 + Math.max(0, lsPie.length - 2) * 10;
  const yLegal = yIdentidad + 14 + Math.max(0, legal.length - 1) * 10;
  const LIMITE = Math.max(76, (legal.length ? yLegal : yIdentidad) + 24), techo = H - 78;
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
    } catch { /* Un logo dañado no impide emitir el documento. */ }
  }
  const nombre = partir(e.nombre, anchoHoja * 0.5, B, 16);
  const titulo = partir(tipo, anchoHoja * 0.43, B, 22);
  titulo.forEach((l, i) => der(l, D, y - 12 - i * 25, { font: B, size: 22 }));
  y -= logoAlto;
  for (const l of nombre) { espacio(20); txt(l, X, y - 8, { font: B, size: 16 }); y -= 20; }
  y = Math.min(y, H - 48 - titulo.length * 25) - 16;
  const datos = [ [L.mayus(L.t.numero), `${L.t.nro} ${numeroFactura(f)}`], [L.mayus(L.t.fecha), L.fecha(f.fecha)], [L.mayus(presupuesto ? L.t.validoHasta : L.t.vencimiento), fechaFin] ];
  const anchos = [anchoHoja * .39, anchoHoja * .305, anchoHoja * .305];
  const dls = datos.map((d, i) => partir(d[1], anchos[i] - 32, i === 0 ? B : R, i === 0 ? 11 : 9.5));
  const altoDatos = 45 + Math.max(...dls.map((l) => l.length)) * 14;
  espacio(altoDatos); tarjeta(X, y - altoDatos, anchoHoja, altoDatos);
  let dx = X;
  datos.forEach((d, i) => { etiqueta(d[0], dx + 16, y - 21); dls[i].forEach((l, j) => txt(l, dx + 16, y - 38 - j * 14, { font: i === 0 ? B : R, size: i === 0 ? 11 : 9.5 })); dx += anchos[i]; });
  y -= altoDatos + 24;
  const mitad = X + (anchoHoja + 24) / 2, ap = (anchoHoja - 24) / 2;
  const contacto = [e.email, e.telefono, e.web].filter(Boolean).join(' · ');
  const parte = (persona, contacto = '') => [ ...partir(persona.nombre, ap, B, 11).map((s) => ({ s, negrita: true })), ...[persona.nif && `${L.t.nif} ${persona.nif}`, persona.direccion, persona.ciudad, contacto].filter(Boolean).flatMap((s) => partir(s, ap).map((s) => ({ s }))) ];
  const de = parte(e, contacto), para = parte(c);
  espacio(Math.min(17 + Math.max(de.length, para.length) * 15 + 24, techo - LIMITE));
  const etiquetasPartes = () => { etiqueta(L.mayus(L.t.de), X, y); etiqueta(L.mayus(L.t.para), mitad, y); y -= 17; };
  etiquetasPartes();
  for (let i = 0; i < Math.max(de.length, para.length); i++) {
    if (y - 15 < LIMITE) { nueva(); etiquetasPartes(); }
    [de[i], para[i]].forEach((l, j) => { if (l) txt(l.s, j ? mitad : X, y, { font: l.negrita ? B : R, size: l.negrita ? 11 : 9.5, color: l.negrita ? TINTA : GRIS }); }); y -= 15;
  }
  y -= 24;
  const lineasF = f.lineas?.length ? f.lineas : null, k = lineasF ? columnasLineas(f) : {};
  const lineas = lineasF || [{ concepto: f.concepto }];
  const cols = lineasF ? [
    [L.mayus(L.t.importe), 70, (l) => L.dinero(baseLinea(l))],
    ...(k.iva ? [[L.mayus(L.t.iva), 38, (l) => L.pctCorto(l.ivaPct)]] : []),
    ...(k.dto ? [[L.mayus(L.t.dto), 38, (l) => l.dto ? L.pctCorto(l.dto) : '']] : []),
    [L.mayus(L.t.precio), 70, (l) => L.dinero(l.precio)],
    [L.mayus(L.t.cant), 38, (l) => L.cantidad(l.cantidad)],
  ] : [[L.mayus(L.t.importe), 110, () => L.dinero(t.base)]];
  const bordes = []; let xr = D;
  for (const col of cols) { bordes.push(xr); xr -= col[1]; }
  const anchoConcepto = xr - X - 12;
  const totales = filasResumen(f, L, t);
  // Reserva dos columnas reales; las bases largas nunca invaden los importes.
  const anchoValor = Math.max(90, ...totales.map(([, b]) => ancho(b)));
  const anchoTotales = anchoResumen(f, L.dinero);
  const xt = D - anchoTotales, anchoEtiqueta = anchoTotales - anchoValor - 15;
  const filasTotales = totales.map(([a, b]) => ({ ls: partir(a, anchoEtiqueta), b }));
  const altoTotales = 4 + filasTotales.reduce((h, r) => h + Math.max(17, r.ls.length * 13 + 5), 0) + 68;
  // En otra moneda, el contravalor en euros (art. 10 del Reglamento de facturación: la cuota del IVA, también en euros).
  const contravalor = f.divisa && L.moneda !== 'EUR' && `${L.t.contravalor}: ${L.t.base} ${L.euros(tEur.base)} · ${L.t.iva} ${L.euros(tEur.iva)}${tEur.irpf ? ` · ${L.t.retencion} ${L.euros(-tEur.irpf)}` : ''} · ${L.t.total} ${L.euros(tEur.total)}. ${L.cambio(f.divisa)}.`;
  const notas = [textoRectifica(f, L), ...menciones(f, L), contravalor, notaAparte(f)].filter(Boolean).map((n) => partir(n, anchoHoja, R, 9));
  const altoNotas = notas.length ? 14 + notas.reduce((h, ls) => h + ls.length * 13 + 4, 0) : 0;
  const anchoPago = anchoHoja - (vf ? 110 : 0);
  const pago = [
    ...(e.iban ? [
      { s: L.t.transferencia, color: GRIS },
      ...partir(e.iban, anchoPago, B, 8.5).map((s) => ({ s, font: B })),
    ] : []),
    ...[e.bizum && `Bizum: ${e.bizum}`, e.otroPago].filter(Boolean).flatMap((s) => partir(s, anchoPago, R, 8.5).map((s) => ({ s, color: GRIS }))),
    ...partir(`${presupuesto ? L.t.validoHasta : L.t.vencimiento}: ${fechaFin}`, anchoPago, R, 8.5).map((s) => ({ s, color: GRIS })),
  ];
  const altoPago = 51 + Math.max(pago.length * 13, vf ? 88 : 0);
  const altoCierre = altoTotales + altoNotas + altoPago;
  const cabecera = () => {
    etiqueta(L.mayus(L.t.concepto), X, y);
    cols.forEach((col, i) => der(col[0], bordes[i], y, { font: B, size: 7, color: GRIS }));
    y -= 8; raya(y); y -= 20;
  };
  const filas = lineas.map((l, n) => {
    const ls = partir(l.concepto, anchoConcepto, R, 10).map((s) => ({ s, size: 10 }));
    if (n === 0 && L.evento(f)) ls.push(...partir(L.evento(f), anchoConcepto, R, 9).map((s) => ({ s, size: 9, color: GRIS })));
    return { l, ls, alto: ls.length * 14 + 24 };
  });
  const capacidadTabla = techo - LIMITE - 28;
  // Lleva las dos últimas filas con el cierre cuando el grupo cabe en una página.
  const ultimas = filas.slice(-2).reduce((h, r) => h + r.alto, 0);
  const cierre = ultimas + altoCierre <= capacidadTabla ? altoCierre : altoTotales;
  const grupoFinal = ultimas + cierre <= capacidadTabla;
  const reserva = (n) => {
    if (filas[n].alto > capacidadTabla) return 80;
    return grupoFinal && n >= filas.length - 2 ? filas.slice(n).reduce((h, r) => h + r.alto, 0) + cierre : filas[n].alto + (n === filas.length - 1 && filas[n].alto + altoTotales <= capacidadTabla ? altoTotales : 0);
  };
  espacio(28 + Math.min(reserva(0), capacidadTabla)); cabecera();
  filas.forEach(({ l, ls }, n) => {
    const necesario = reserva(n);
    if (y - Math.min(necesario, capacidadTabla) < LIMITE && y < techo - 28) { nueva(); cabecera(); }
    cols.forEach((col, i) => {
      const valor = col[2](l), size = tamanoNumero(valor, col[1]);
      der(valor, bordes[i], y, { size });
    });
    for (let i = 0; i < ls.length; i++) {
      const cola = (ls.length - i) * 14 + 24 + (n === filas.length - 1 ? (altoCierre + 52 <= capacidadTabla ? altoCierre : altoTotales) : 0);
      if (y - 14 - (i === ls.length - 1 ? 24 : 0) < LIMITE || (i > 0 && cola <= capacidadTabla && y - cola < LIMITE)) { nueva(); cabecera(); }
      txt(ls[i].s, X, y, ls[i]); y -= 14;
    }
    y -= 6; raya(y); y -= 18;
  });
  espacio(altoTotales); y -= 4;
  for (const { ls, b } of filasTotales) {
    ls.forEach((l, i) => txt(l, xt, y - i * 13, { color: GRIS })); der(b, D, y);
    y -= Math.max(17, ls.length * 13 + 5);
  }
  y -= 6; tarjeta(xt, y - 40, anchoTotales, 52);
  txt(L.t.total, xt + 12, y - 18, { font: B, size: 11 });
  const total = L.dinero(t.total), totalSize = tamanoTotal(total);
  der(total, D - 12, y - 21, { font: B, size: totalSize }); y -= 62;
  if (notas.length) {
    espacio(40); etiqueta(L.mayus(L.t.notas), X, y); y -= 14;
    for (const ls of notas) { for (const l of ls) { if (y - 13 < LIMITE) { nueva(); etiqueta(L.mayus(L.t.notas), X, y); y -= 14; } txt(l, X, y, { size: 9, color: GRIS }); y -= 13; } y -= 4; }
  }
  espacio(altoPago); y -= 12; raya(y); y -= 24;
  etiqueta(L.mayus(L.t.pago), X, y); y -= 15;
  pago.forEach((l, i) => txt(l.s, X, y - i * 13, { size: 8.5, ...l }));
  if (vf) {
    const qr = QRCode.create(urlQr(f.verifactu.modo, e.nif, fOriginal), { errorCorrectionLevel: 'M' });
    const n = qr.modules.size, lado = 76, m = lado / (n + 8), x0 = D - lado, y0 = y + 15 - lado;
    p.drawRectangle({ x: x0, y: y0, width: lado, height: lado, color: rgb(1, 1, 1) });
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (qr.modules.get(i, j)) p.drawRectangle({ x: x0 + (j + 4) * m, y: y0 + lado - (i + 5) * m, width: m, height: m, color: rgb(0, 0, 0) });
    txt('VERI*FACTU', x0 + (lado - ancho('VERI*FACTU', B, 6.5)) / 2, y0 - 10, { font: B, size: 6.5, color: GRIS });
  }
  // Pie en todas las páginas, con ancho reservado para nombres y textos largos.
  for (const pagina of doc.getPages()) {
    p = pagina;
    legal.forEach((l, i) => txt(l, X, yLegal - i * 10, { size: 7.5, color: GRIS }));
    lsPie.forEach((l, i) => txt(l, X, yIdentidad - i * 10, { size: sizePie, color: GRIS }));
    if (vf) partir('Factura verificable en la sede electrónica de la AEAT', anchoHoja / 2 - 12, R, 7.5).forEach((l, i) => der(l, D, 42 - i * 10, { size: 7.5, color: GRIS }));
  }
  return doc.save();
}
