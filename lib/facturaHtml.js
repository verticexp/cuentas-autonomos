import { baseLinea, columnasLineas, desglose, importes, numeroFactura, vencimiento } from './calculos.js';
import { eur, eurSin, fechaCorta, pct, pctCorto, textoEvento } from './formato.js';
import { aclarar, colorValido } from './marca.js';
import { COLOR_FACTURA } from './pdf.js';
import QRCode from 'qrcode';
import { deflateSync } from 'node:zlib';
import { urlQr } from './verifactu.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TH = 'font-size:7pt;letter-spacing:.06em;color:#646B67;border-bottom:.5pt solid #E2E4E3;padding-bottom:8pt';
const TD = 'padding:12pt 0;border-bottom:.5pt solid #E2E4E3;font-size:10pt;vertical-align:top';
function tablaConceptos(f, t) {
  const ev = textoEvento(f) ? `<br><span style="font-size:9pt;color:#646B67">${esc(textoEvento(f))}</span>` : '';
  if (!f.lineas?.length) {
    return `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;${TH}">CONCEPTO</th><th style="text-align:right;${TH}">IMPORTE</th></tr></thead><tbody>
<tr><td style="${TD};overflow-wrap:anywhere;white-space:pre-wrap">${esc(f.concepto)}${ev}</td><td style="${TD};text-align:right">${eur(t.base)}</td></tr></tbody></table>`;
  }
  const k = columnasLineas(f);
  const th = (s) => `<th style="text-align:right;${TH};padding-left:10px">${s}</th>`;
  const td = (s) => `<td style="${TD};text-align:right;padding-left:10px;white-space:nowrap">${s}</td>`;
  return `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;${TH}">CONCEPTO</th>${th('CANT.')}${th('PRECIO')}${k.dto ? th('DTO.') : ''}${k.iva ? th('IVA') : ''}${th('IMPORTE')}</tr></thead><tbody>
${f.lineas.map((l, i) => `<tr><td style="${TD};overflow-wrap:anywhere;white-space:pre-wrap">${esc(l.concepto)}${i === 0 ? ev : ''}</td>${td(eurSin(l.cantidad).replace(/,00$/, ''))}${td(eur(l.precio))}${k.dto ? td(l.dto ? pctCorto(l.dto) : '') : ''}${k.iva ? td(pctCorto(l.ivaPct)) : ''}${td(eur(baseLinea(l)))}</tr>`).join('\n')}</tbody></table>`;
}

// PNG síncrono: mantiene la API HTML y funciona también en la conversión de Drive.
function qrPng(f, e) {
  const qr = QRCode.create(urlQr(f.verifactu.modo, e.nif, f), { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, escala = 4, lado = n * escala;
  const pixeles = Buffer.alloc((lado + 1) * lado, 255);
  for (let y = 0; y < lado; y++) {
    pixeles[y * (lado + 1)] = 0;
    for (let x = 0; x < lado; x++) if (qr.modules.get(Math.floor(y / escala), Math.floor(x / escala))) pixeles[y * (lado + 1) + 1 + x] = 0;
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

// Plantilla de tablas para la conversión de Google Drive, con las mismas medidas A4.
export function facturaHtml(f, e, marca = {}) {
  const c0 = colorValido(marca?.color) || COLOR_FACTURA;
  const suave = aclarar(c0, 0.9);
  const t = importes(f), c = f.cliente;
  const et = (s) => `<p style="font-size:7pt;font-weight:bold;letter-spacing:.06em;color:#646B67;margin:0 0 4pt;text-transform:uppercase">${s}</p>`;
  const lineas = (...xs) => xs.filter(Boolean).map(esc).join('<br>');
  const fila = (a, b) => `<tr><td style="color:#646B67;padding:0 15pt 6pt 0">${a}</td><td style="text-align:right;white-space:nowrap;padding-bottom:6pt">${b}</td></tr>`;
  const parte = (p) => `<b style="font-size:11pt;color:#0F1F1B">${esc(p.nombre)}</b><br><span style="color:#646B67">${lineas(p.nif && `NIF ${p.nif}`, p.direccion, p.ciudad)}</span>`;
  const fechaFin = fechaCorta(vencimiento(f, e.plazo));
  const qr = f.verifactu ? qrPng(f, e) : null;
  return `<html lang="es"><head><meta charset="utf-8"><style>
@page { size:A4; margin:0; }
* { box-sizing:border-box; } body { font-variant-numeric:tabular-nums; }
thead { display:table-header-group; } table { flex-shrink:0; } tr { break-inside:avoid; page-break-inside:avoid; }
</style></head><body style="font-family:'Bricolage Grotesque',Helvetica,Arial,sans-serif;font-size:9.5pt;line-height:1.4;color:#0F1F1B;margin:0;background:#fff;border-top:8pt solid ${suave}">
<div style="padding:32pt 40pt 30pt;min-height:834pt;display:flex;flex-direction:column">
<table style="width:100%;border-collapse:collapse;margin-bottom:20pt"><tr>
<td style="vertical-align:top;width:57%;padding-right:24pt;overflow-wrap:anywhere">
${marca?.logo ? `<img src="${esc(marca.logo)}" alt="" style="display:block;max-width:118pt;max-height:48pt;margin-bottom:9pt">` : ''}
<p style="font-size:16pt;font-weight:bold;line-height:1.25;margin:0">${esc(e.nombre)}</p></td>
<td style="vertical-align:top;text-align:right"><p style="font-size:22pt;font-weight:bold;line-height:1.15;margin:0">${f.serie === 'R' ? 'Factura rectificativa' : 'Factura'}</p></td></tr></table>
<table style="width:100%;border-collapse:separate;border-spacing:0;background:${suave};border-radius:12pt;margin-bottom:24pt"><tr>
<td style="width:39%;padding:16pt;vertical-align:top;overflow-wrap:anywhere">${et('NÚMERO')}<b style="font-size:11pt">Nº ${esc(numeroFactura(f))}</b></td>
<td style="width:30.5%;padding:16pt;vertical-align:top">${et('FECHA')}${fechaCorta(f.fecha)}</td>
<td style="padding:16pt;vertical-align:top">${et('VENCIMIENTO')}${fechaFin}</td></tr></table>
<table style="width:100%;border-collapse:collapse;margin-bottom:24pt;table-layout:fixed"><tr>
<td style="vertical-align:top;padding-right:12pt;overflow-wrap:anywhere">${et('DE')}${parte(e)}</td>
<td style="vertical-align:top;padding-left:12pt;overflow-wrap:anywhere">${et('PARA')}${parte(c)}</td></tr></table>
${tablaConceptos(f, t)}
<table style="width:260pt;max-width:100%;margin:20pt 0 0 auto;border-collapse:separate;border-spacing:0;break-inside:avoid">
${fila('Base imponible', eur(t.base))}${desglose(f).map((d, _, l) => fila(`IVA ${pct(d.pct)}${l.length > 1 ? ` de ${eur(d.base)}` : ''}`, eur(d.iva))).join('')}${f.irpfPct > 0 ? fila(`Retención IRPF ${pct(f.irpfPct)}`, `-${eur(t.irpf)}`) : ''}
<tr><td colspan="2" style="height:6pt"></td></tr>
<tr style="background:${suave}"><td style="padding:12pt;font-weight:bold;font-size:11pt;border-radius:12pt 0 0 12pt">Total</td><td style="padding:12pt 12pt 12pt 0;text-align:right;font-family:ui-rounded,'SF Pro Rounded','Bricolage Grotesque',Helvetica,Arial,sans-serif;font-weight:bold;font-size:22pt;white-space:nowrap;border-radius:0 12pt 12pt 0">${eur(t.total)}</td></tr></table>
${f.rectifica || f.nota ? `<div style="margin-top:20pt;color:#646B67;font-size:9pt;overflow-wrap:anywhere">${et('NOTAS')}${f.rectifica ? `<p style="margin:0">Rectifica la factura nº ${esc(f.rectifica.numero)} de fecha ${fechaCorta(f.rectifica.fecha)}.</p>` : ''}${f.nota ? `<p style="margin:3pt 0 0;white-space:pre-wrap">${esc(f.nota)}</p>` : ''}</div>` : ''}
<table style="width:100%;border-collapse:collapse;margin-top:24pt;border-top:.5pt solid #E2E4E3;break-inside:avoid"><tr>
<td style="vertical-align:top;padding-top:18pt;font-size:8.5pt;color:#646B67;overflow-wrap:anywhere">${et('FORMA DE PAGO')}Transferencia bancaria<br><b style="color:#0F1F1B">${esc(e.iban)}</b><p style="margin:8pt 0 0">Vencimiento: ${fechaFin} (${esc(e.plazo)} días)</p></td>
${qr ? `<td style="width:100pt;text-align:center;vertical-align:top;padding:18pt 0 0 24pt"><img alt="QR de Verifactu" src="${qr}" style="width:76pt;height:76pt"><br><span style="font-size:6.5pt;font-weight:bold;color:#646B67">VERI*FACTU</span></td>` : ''}</tr></table>
<table style="width:100%;border-collapse:collapse;margin-top:auto;padding-top:18pt;font-size:7.5pt;color:#646B67"><tr><td style="overflow-wrap:anywhere">${esc(e.nombre)} · NIF ${esc(e.nif)}</td>${qr ? '<td style="text-align:right;padding-left:15pt">Factura verificable en la sede electrónica de la AEAT</td>' : ''}</tr></table>
</div></body></html>`;
}
