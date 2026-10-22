import { baseLinea, columnasLineas, desglose, importes, numeroFactura, vencimiento } from './calculos.js';
import { enDivisa, filasTotales, formatoDoc, menciones } from './idiomas.js';
import { aclarar, colorValido } from './marca.js';
import { COLOR_FACTURA, anchoResumen, tamanoNumero, tamanoTotal } from './pdf.js';
import QRCode from 'qrcode';
import { deflateSync } from 'node:zlib';
import { urlQr } from './verifactu.js';
import { caduca } from './presupuestos.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TH = 'font-size:7pt;letter-spacing:.06em;color:#646B67;border-bottom:.5pt solid #E2E4E3;padding-bottom:8pt';
const TD = 'padding:12pt 0;border-bottom:.5pt solid #E2E4E3;font-size:10pt;vertical-align:top';
function tablaConceptos(f, t, L) {
  const ev = L.evento(f) ? `<br><span style="font-size:9pt;color:#646B67">${esc(L.evento(f))}</span>` : '';
  if (!f.lineas?.length) {
    return `<table class="fa-tabla" style="width:100%;border-collapse:collapse;table-layout:fixed"><colgroup><col><col style="width:110pt"></colgroup><thead><tr><th style="text-align:left;${TH}">${esc(L.mayus(L.t.concepto))}</th><th style="text-align:right;${TH}">${esc(L.mayus(L.t.importe))}</th></tr></thead><tbody>
<tr class="fa-ultima"><td style="${TD};padding-right:12pt;overflow-wrap:anywhere;white-space:pre-wrap">${esc(f.concepto)}${ev}</td><td style="${TD};text-align:right;white-space:nowrap;font-size:${tamanoNumero(L.dinero(t.base), 110)}pt">${L.dinero(t.base)}</td></tr></tbody></table>`;
  }
  const k = columnasLineas(f);
  const th = (s) => `<th style="text-align:right;${TH};padding-left:8pt">${s}</th>`;
  const td = (s, w = 70) => `<td style="${TD};text-align:right;padding-left:8pt;white-space:nowrap;font-size:${tamanoNumero(s, w)}pt">${s}</td>`;
  return `<table class="fa-tabla" style="width:100%;border-collapse:collapse;table-layout:fixed"><colgroup><col><col style="width:38pt"><col style="width:70pt">${k.dto ? '<col style="width:38pt">' : ''}${k.iva ? '<col style="width:38pt">' : ''}<col style="width:70pt"></colgroup><thead><tr><th style="text-align:left;${TH}">${esc(L.mayus(L.t.concepto))}</th>${th(esc(L.mayus(L.t.cant)))}${th(esc(L.mayus(L.t.precio)))}${k.dto ? th(esc(L.mayus(L.t.dto))) : ''}${k.iva ? th(esc(L.mayus(L.t.iva))) : ''}${th(esc(L.mayus(L.t.importe)))}</tr></thead><tbody>
${f.lineas.map((l, i) => `<tr${i >= f.lineas.length - 2 ? ' class="fa-ultima"' : ''}><td style="${TD};padding-right:12pt;overflow-wrap:anywhere;white-space:pre-wrap">${esc(l.concepto)}${i === 0 ? ev : ''}</td>${td(L.cantidad(l.cantidad), 38)}${td(L.dinero(l.precio))}${k.dto ? td(l.dto ? L.pctCorto(l.dto) : '', 38) : ''}${k.iva ? td(L.pctCorto(l.ivaPct), 38) : ''}${td(L.dinero(baseLinea(l)))}</tr>`).join('\n')}</tbody></table>`;
}

// PNG síncrono: mantiene la API HTML y funciona también en la conversión de Drive.
function qrPng(f, e) {
  const qr = QRCode.create(urlQr(f.verifactu.modo, e.nif, f), { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, margen = 4, escala = 4, lado = (n + margen * 2) * escala;
  const pixeles = Buffer.alloc((lado + 1) * lado, 255);
  for (let y = 0; y < lado; y++) {
    pixeles[y * (lado + 1)] = 0;
    for (let x = 0; x < lado; x++) {
      const qx = Math.floor(x / escala) - margen, qy = Math.floor(y / escala) - margen;
      if (qx >= 0 && qx < n && qy >= 0 && qy < n && qr.modules.get(qy, qx)) pixeles[y * (lado + 1) + 1 + x] = 0;
    }
  }
  const bloque = (tipo, datos) => {
    const nombre = Buffer.from(tipo), contenido = Buffer.concat([nombre, datos]);
    let crc = 0xffffffff;
    for (const b of contenido) { crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const cab = Buffer.alloc(4), fin = Buffer.alloc(4);
    cab.writeUInt32BE(datos.length); fin.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([cab, contenido, fin]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4); ihdr[8] = 8;
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), bloque('IHDR', ihdr), bloque('IDAT', deflateSync(pixeles)), bloque('IEND', Buffer.alloc(0))]).toString('base64');
}

// Plantilla de tablas para la conversión de Google Drive, con las mismas medidas A4, en el idioma y la moneda de la
// factura (lib/idiomas.js).
export function facturaHtml(fOriginal, e, marca = {}, { presupuesto = fOriginal.serie === 'P' } = {}) {
  const L = formatoDoc(fOriginal), f = enDivisa(fOriginal), tEur = importes(fOriginal);
  const c0 = colorValido(marca?.color) || COLOR_FACTURA;
  const suave = aclarar(c0, 0.9);
  const t = importes(f), c = f.cliente;
  const et = (s) => `<p style="font-size:7pt;font-weight:bold;letter-spacing:.06em;color:#646B67;margin:0 0 4pt;text-transform:uppercase">${s}</p>`;
  const lineas = (...xs) => xs.filter(Boolean).map(esc).join('<br>');
  const fila = (a, b) => `<tr><td style="color:#646B67;padding:0 15pt 6pt 0">${a}</td><td style="text-align:right;white-space:nowrap;padding-bottom:6pt">${b}</td></tr>`;
  const contacto = [e.email, e.telefono, e.web].filter(Boolean).join(' · ');
  const parte = (p, contacto = '') => `<b style="font-size:11pt;color:#0F1F1B;white-space:pre-line">${esc(p.nombre)}</b><br><span style="color:#646B67;white-space:pre-line">${lineas(p.nif && `${L.t.nif} ${p.nif}`, p.direccion, p.ciudad, contacto)}</span>`;
  const pago = [
    e.iban || (!e.bizum && !e.otroPago) ? `${esc(L.t.transferencia)}<br><b style="color:#0F1F1B">${esc(e.iban)}</b>` : '',
    e.bizum ? `Bizum: ${esc(e.bizum)}` : '',
    e.otroPago ? esc(e.otroPago) : '',
  ].filter(Boolean).join('<br>');
  const fechaFin = L.fecha(presupuesto ? caduca(f) : vencimiento(f, e.plazo));
  const qr = f.verifactu ? qrPng(fOriginal, e) : null;
  const legales = menciones(f, L);
  const contravalor = f.divisa && L.moneda !== 'EUR' ? `${L.t.contravalor}: ${L.t.base} ${L.euros(tEur.base)} · ${L.t.iva} ${L.euros(tEur.iva)}${tEur.irpf ? ` · ${L.t.retencion} ${L.euros(-tEur.irpf)}` : ''} · ${L.t.total} ${L.euros(tEur.total)}. ${L.cambio(f.divisa)}.` : '';
  return `<html lang="${L.idioma}"><head><meta charset="utf-8"><style>
@page { size:A4; margin:40pt 40pt 56pt; }
* { box-sizing:border-box; } body { font-variant-numeric:tabular-nums; }
p, td:first-child { text-wrap:pretty; }
thead { display:table-header-group; } table { flex-shrink:0; } tr { break-inside:avoid; page-break-inside:avoid; }
.fa-tabla { break-after:avoid; } .fa-ultima { break-after:avoid; }
@media print { body { width:auto !important;border-top:0 !important; } .fa-cuerpo { padding:0 !important;min-height:0 !important;display:block !important; } .fa-pie { position:fixed;bottom:-32pt;left:0;right:0; } }
</style></head><body style="width:595.28pt;font-family:Helvetica,Arial,sans-serif;font-size:9.5pt;line-height:1.4;color:#0F1F1B;margin:0;background:#fff;border-top:8pt solid ${suave}">
<div class="fa-cuerpo" style="padding:32pt 40pt 30pt;min-height:833.89pt;display:flex;flex-direction:column">
<table style="width:100%;border-collapse:collapse;margin-bottom:20pt"><tr>
<td style="vertical-align:top;width:57%;padding-right:36.07pt;overflow-wrap:anywhere;white-space:pre-line">
${marca?.logo ? `<img src="${esc(marca.logo)}" alt="" style="display:block;max-width:118pt;max-height:48pt;margin-bottom:9pt">` : ''}
<p style="font-size:16pt;font-weight:bold;line-height:1.25;margin:0">${esc(e.nombre)}</p></td>
<td style="vertical-align:top;text-align:right"><p style="font-size:22pt;font-weight:bold;line-height:1.15;margin:0">${esc(presupuesto ? L.t.presupuesto : f.serie === 'R' ? L.t.rectificativa : L.t.factura)}</p></td></tr></table>
<table style="width:100%;border-collapse:separate;border-spacing:0;background:${suave};border-radius:12pt;margin-bottom:24pt"><tr>
<td style="width:39%;padding:16pt;vertical-align:top;overflow-wrap:anywhere">${et(esc(L.mayus(L.t.numero)))}<b style="font-size:11pt">${esc(L.t.nro)} ${esc(numeroFactura(f))}</b></td>
<td style="width:30.5%;padding:16pt;vertical-align:top">${et(esc(L.mayus(L.t.fecha)))}${L.fecha(f.fecha)}</td>
<td style="padding:16pt;vertical-align:top">${et(esc(L.mayus(presupuesto ? L.t.validoHasta : L.t.vencimiento)))}${fechaFin}</td></tr></table>
<table style="width:100%;border-collapse:collapse;margin-bottom:24pt;table-layout:fixed"><tr>
<td style="vertical-align:top;padding-right:12pt;overflow-wrap:anywhere">${et(esc(L.mayus(L.t.de)))}${parte(e, contacto)}</td>
<td style="vertical-align:top;padding-left:12pt;overflow-wrap:anywhere">${et(esc(L.mayus(L.t.para)))}${parte(c)}</td></tr></table>
${tablaConceptos(f, t, L)}
<table style="width:${anchoResumen(f, L.dinero)}pt;max-width:100%;margin:20pt 0 0 auto;border-collapse:separate;border-spacing:0;break-inside:avoid">
${filasTotales(f, L, t).map(([a, b]) => fila(esc(a), b)).join('')}
<tr><td colspan="2" style="height:6pt"></td></tr>
<tr><td colspan="2" style="padding:0;background:${suave};border-radius:12pt"><table style="width:100%;table-layout:fixed;border-collapse:collapse;height:52pt"><colgroup><col style="width:${anchoResumen(f, L.dinero) - 200}pt"><col></colgroup><tr><td style="padding:12pt;font-weight:bold;font-size:11pt">${esc(L.t.total)}</td><td style="padding:12pt 12pt 12pt 0;text-align:right;font-weight:bold;font-size:${tamanoTotal(L.dinero(t.total))}pt;white-space:nowrap">${L.dinero(t.total)}</td></tr></table></td></tr></table>
${f.rectifica || f.nota || contravalor || legales.length ? `<div style="margin-top:20pt;color:#646B67;font-size:9pt;overflow-wrap:anywhere">${et(esc(L.mayus(L.t.notas)))}${f.rectifica ? `<p style="margin:0">${esc(L.t.rectifica(f.rectifica.numero, L.fecha(f.rectifica.fecha)))}</p>` : ''}${legales.map((m) => `<p style="margin:3pt 0 0">${esc(m)}</p>`).join('')}${contravalor ? `<p style="margin:3pt 0 0">${esc(contravalor)}</p>` : ''}${f.nota ? `<p style="margin:3pt 0 0;white-space:pre-wrap">${esc(f.nota)}</p>` : ''}</div>` : ''}
<table style="width:100%;border-collapse:collapse;margin-top:24pt;border-top:.5pt solid #E2E4E3;break-inside:avoid"><tr>
<td style="vertical-align:top;padding-top:18pt;font-size:8.5pt;color:#646B67;overflow-wrap:anywhere">${et(esc(L.mayus(L.t.pago)))}${pago}<p style="margin:8pt 0 0">${esc(presupuesto ? L.t.validoHasta : L.t.vencimiento)}: ${fechaFin}</p></td>
${qr ? `<td style="width:100pt;text-align:center;vertical-align:top;padding:18pt 0 0 24pt"><img alt="QR de Verifactu" src="${qr}" style="width:76pt;height:76pt"><br><span style="font-size:6.5pt;font-weight:bold;color:#646B67">VERI*FACTU</span></td>` : ''}</tr></table>
<table class="fa-pie" style="width:100%;table-layout:fixed;border-collapse:collapse;margin-top:auto;padding-top:18pt;font-size:7.5pt;color:#646B67">${e.pie ? `<tr><td colspan="${qr ? 2 : 1}" style="white-space:pre-wrap;overflow-wrap:anywhere;padding-bottom:4pt">${esc(e.pie)}</td></tr>` : ''}<tr><td style="overflow-wrap:anywhere">${esc(e.nombre)} · ${esc(L.t.nif)} ${esc(e.nif)}${e.registro ? ` · ${esc(e.registro)}` : ''}</td>${qr ? '<td style="text-align:right;padding-left:15pt">Factura verificable en la sede electrónica de la AEAT</td>' : ''}</tr></table>
</div></body></html>`;
}
