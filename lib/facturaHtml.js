import { importes, numeroFactura } from './calculos.js';
import { eur, fechaCorta, pct, textoEvento } from './formato.js';

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// La factura como HTML simple (misma plantilla que la vista PDF) para convertirla a PDF en Google Drive.
import { aclarar, colorValido } from './marca.js';

export function facturaHtml(f, e, marca = {}) {
  const propio = colorValido(marca?.color);
  const fondo = propio ? aclarar(propio, 0.92) : '#F5EFE5';
  const t = importes(f);
  const c = f.cliente;
  const oro = `color:${propio || '#9B7A35'}`;
  const lineas = (...xs) => xs.filter(Boolean).map(esc).join('<br>');
  return `<html><body style="font-family:Arial,sans-serif;font-size:10pt;color:#3F3F3F;padding:20px">
${marca?.logo ? `<img src="${marca.logo}" style="float:right;max-width:150px;max-height:64px">` : ''}
<p style="color:${propio || '#0F4F32'};font-weight:bold">${f.serie === 'R' ? 'FACTURA RECTIFICATIVA ' : ''}${numeroFactura(f)}</p>
<h1 style="${oro};font-family:'Times New Roman',serif;font-weight:normal;font-size:28pt;margin:30px 0 8px">${esc(e.nombre)}</h1>
<p style="color:#7F7F7F;font-size:9pt">${lineas(`NIF: ${e.nif}`, e.direccion, e.ciudad)}</p>
<table style="width:100%;margin:50px 0 30px"><tr><td style="vertical-align:top"><h3 style="${oro}">FACTURAR A</h3>${lineas(c.nombre, c.nif, c.direccion, c.ciudad)}</td>
<td style="text-align:right;vertical-align:top"><b style="${oro}">FECHA:</b> ${fechaCorta(f.fecha)}</td></tr></table>
<table style="width:100%;border-collapse:collapse"><tr><th style="${oro};text-align:left">Detalles</th><th style="${oro};text-align:right">IMPORTE</th></tr>
<tr style="background:${fondo}"><td style="padding:8px">${esc(f.concepto)}${textoEvento(f) ? `<br>${esc(textoEvento(f))}` : ''}</td><td style="padding:8px;text-align:right">${eur(t.base)}</td></tr></table>
<table style="margin:20px 0 40px auto;border-collapse:collapse">
<tr><td style="padding:5px 20px">SUBTOTAL</td><td style="text-align:right">${eur(t.base)}</td></tr>
<tr><td style="padding:5px 20px">I.V.A</td><td style="text-align:right">${pct(f.ivaPct)}</td></tr>
${f.irpfPct > 0 ? `<tr><td style="padding:5px 20px">I.R.P.F</td><td style="text-align:right">${pct(f.irpfPct)}</td></tr>` : ''}
<tr style="background:${fondo};font-weight:bold"><td style="padding:8px 20px">TOTAL</td><td style="padding:8px;text-align:right">${eur(t.total)}</td></tr></table>
${f.rectifica ? `<p style="font-size:9pt;color:#7F7F7F">Rectifica la factura nº ${esc(f.rectifica.numero)} de fecha ${fechaCorta(f.rectifica.fecha)}.</p>` : ''}
${f.nota ? `<p style="font-size:9pt;color:#7F7F7F">${esc(f.nota)}</p>` : ''}
<h3 style="${oro}">CONDICIONES Y FORMA DE PAGO</h3>
<p>El pago se efectuará, en un plazo máximo de ${esc(e.plazo)} días, por transferencia bancaria a la cuenta:<br>${esc(e.iban)}</p>
</body></html>`;
}
