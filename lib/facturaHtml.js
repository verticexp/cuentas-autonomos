import { baseLinea, columnasLineas, desglose, importes, numeroFactura, vencimiento } from './calculos.js';
import { eur, eurSin, fechaCorta, pct, pctCorto, textoEvento } from './formato.js';
import { aclarar, colorValido } from './marca.js';
import { COLOR_FACTURA } from './pdf.js';

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TH = 'font-size:7pt;color:#6B736F;border-bottom:1px solid #17201D;padding-bottom:6px';
const TD = 'padding:10px 0;border-bottom:1px solid #DDE2DF;font-size:10pt;vertical-align:top';
function tablaConceptos(f, t) {
  const ev = textoEvento(f) ? `<br><span style="font-size:9pt;color:#6B736F">${esc(textoEvento(f))}</span>` : '';
  if (!f.lineas?.length) {
    return `<table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left;${TH}">CONCEPTO</th><th style="text-align:right;${TH}">IMPORTE</th></tr>
<tr><td style="${TD}">${esc(f.concepto)}${ev}</td><td style="${TD};text-align:right">${eur(t.base)}</td></tr></table>`;
  }
  const k = columnasLineas(f);
  const th = (s) => `<th style="text-align:right;${TH};padding-left:10px">${s}</th>`;
  const td = (s) => `<td style="${TD};text-align:right;padding-left:10px;white-space:nowrap">${s}</td>`;
  return `<table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left;${TH}">CONCEPTO</th>${th('CANT.')}${th('PRECIO')}${k.dto ? th('DTO.') : ''}${k.iva ? th('IVA') : ''}${th('IMPORTE')}</tr>
${f.lineas.map((l, i) => `<tr><td style="${TD}">${esc(l.concepto)}${i === 0 ? ev : ''}</td>${td(eurSin(l.cantidad).replace(/,00$/, ''))}${td(eur(l.precio))}${k.dto ? td(l.dto ? pctCorto(l.dto) : '') : ''}${k.iva ? td(pctCorto(l.ivaPct)) : ''}${td(eur(baseLinea(l)))}</tr>`).join('\n')}</table>`;
}

// La factura como HTML de tablas (misma plantilla que lib/pdf.js) para convertirla a PDF en Google Drive.
export function facturaHtml(f, e, marca = {}) {
  const c0 = colorValido(marca?.color) || COLOR_FACTURA;
  const suave = aclarar(c0, 0.9), claro = aclarar(c0, 0.75);
  const t = importes(f);
  const c = f.cliente;
  const et = (s) => `<p style="font-size:7pt;font-weight:bold;letter-spacing:1px;color:#6B736F;margin:0 0 4px">${s}</p>`;
  const lineas = (...xs) => xs.filter(Boolean).map(esc).join('<br>');
  const fila = (a, b) => `<tr><td style="color:#6B736F;padding:3px 30px 3px 0">${a}</td><td style="text-align:right">${b}</td></tr>`;
  return `<html><body style="font-family:Arial,sans-serif;font-size:9.5pt;color:#17201D;margin:0">
<table style="width:100%;border-collapse:collapse"><tr>
<td style="width:30%;background:${c0};color:#fff;vertical-align:top;padding:30px 20px">
${marca?.logo ? `<div style="background:#fff;padding:10px;display:inline-block;margin-bottom:24px"><img src="${marca.logo}" style="max-width:120px;max-height:54px"></div>` : ''}
<p style="font-size:14pt;font-weight:bold;margin:0 0 8px">${esc(e.nombre)}</p>
<p style="color:${claro};font-size:8.5pt;margin:0 0 40px">${lineas(`NIF ${e.nif}`, e.direccion, e.ciudad)}</p>
<p style="color:${claro};font-size:7pt;font-weight:bold;margin:0 0 4px">FORMA DE PAGO</p>
<p style="font-size:8.5pt;margin:0 0 12px">Transferencia bancaria<br><b>${esc(e.iban)}</b></p>
<p style="color:${claro};font-size:7pt;font-weight:bold;margin:0 0 4px">VENCIMIENTO</p>
<p style="font-size:8.5pt;margin:0">${fechaCorta(vencimiento(f, e.plazo))} (${esc(e.plazo)} días)</p>
</td>
<td style="vertical-align:top;padding:30px 30px 30px 26px">
<p style="font-size:24pt;font-weight:bold;margin:0">${f.serie === 'R' ? 'Factura rectificativa' : 'Factura'}</p>
<p style="color:${c0};font-weight:bold;font-size:11pt;margin:4px 0 30px">Nº ${numeroFactura(f)}</p>
<table style="width:100%;margin-bottom:30px"><tr><td style="vertical-align:top">${et('FACTURAR A')}<b style="font-size:11pt">${esc(c.nombre)}</b><br><span style="color:#6B736F">${lineas(c.nif && `NIF ${c.nif}`, c.direccion, c.ciudad)}</span></td>
<td style="vertical-align:top;width:35%">${et('FECHA')}${fechaCorta(f.fecha)}</td></tr></table>
${tablaConceptos(f, t)}
<table style="margin:18px 0 0 auto;border-collapse:collapse">
${fila('Base imponible', eur(t.base))}${desglose(f).map((d, _, l) => fila(`IVA ${pct(d.pct)}${l.length > 1 ? ` de ${eur(d.base)}` : ''}`, eur(d.iva))).join('')}${f.irpfPct > 0 ? fila(`Retención IRPF ${pct(f.irpfPct)}`, `-${eur(t.irpf)}`) : ''}
<tr style="background:${suave}"><td style="padding:10px 30px 10px 10px;font-weight:bold;font-size:11pt">Total</td><td style="padding:10px;text-align:right;font-weight:bold;font-size:15pt;color:${c0}">${eur(t.total)}</td></tr></table>
${f.rectifica || f.nota ? `<div style="margin-top:30px;color:#6B736F;font-size:9pt">${et('NOTAS')}${f.rectifica ? `<p style="margin:0">Rectifica la factura nº ${esc(f.rectifica.numero)} de fecha ${fechaCorta(f.rectifica.fecha)}.</p>` : ''}${f.nota ? `<p style="margin:0">${esc(f.nota)}</p>` : ''}</div>` : ''}
</td></tr></table>
</body></html>`;
}
