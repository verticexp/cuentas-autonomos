// Envía una factura en PDF por email (con enlace de pago si hay Stripe) y apunta el envío en la factura.
import { randomBytes } from 'node:crypto';
import { redis, guardar } from './redis.js';
import { importes, numeroFactura } from './calculos.js';
import { eur, fechaTexto } from './formato.js';
import { vencimiento } from './calculos.js';
import { facturaPdf } from './pdf.js';
import { enviarEmail, htmlMensaje } from './email.js';
import { enlacePago } from './cobros.js';
import { stripeListo } from './stripe.js';

export const asuntoFactura = (f, e) => `Factura ${numeroFactura(f)} de ${e.nombre || ''}`.trim();
export const mensajeFactura = (f, e) => `Hola,\n\nTe adjunto la factura ${numeroFactura(f)} por ${eur(importes(f).total)}, con vencimiento el ${fechaTexto(vencimiento(f, e.plazo))}.\n\nGracias,\n${e.nombre || ''}`;

// u: usuario o empresa (con emisor, marca y empresa/id). origen: https://… de la app, para los enlaces.
export async function enviarFactura(u, f, { para, asunto, mensaje, origen, responderA }) {
  const e = u.emisor || {};
  if (!e.nif || !e.iban) return { error: 'Rellena tus datos de facturación en Ajustes' };
  const num = numeroFactura(f);
  const token = randomBytes(16).toString('hex');
  const nombre = `${num} ${f.cliente.nombre.toUpperCase().replace(/[^A-Z0-9 ]+/g, '')}.pdf`.trim();
  let texto = String(mensaje || '').slice(0, 5000);
  if (stripeListo() && !f.cobrada && importes(f).total > 0) {
    const p = await enlacePago(u, f);
    f = p.f;
    texto += `\n\nPuedes pagarla con tarjeta o Bizum aquí: ${origen}${p.ruta}`;
  }
  const r = await enviarEmail({
    para,
    asunto: String(asunto || '').trim().slice(0, 200) || asuntoFactura(f, e),
    html: htmlMensaje(texto, `${origen}/api/abierta/${token}`),
    responderA,
    adjuntos: [{ nombre, datos: await facturaPdf(f, e, u.marca) }],
  });
  if (r.error) return r;
  const envio = { fecha: new Date().toISOString(), para, token };
  await redis.hset('factura-envios', { [token]: { empresa: u.empresa || u.id, id: f.id } });
  // El email queda guardado en el cliente para la próxima vez.
  const cliente = { ...f.cliente, email: para };
  const nueva = { ...f, cliente, envios: [...(f.envios || []), envio] };
  await guardar(u, 'facturas', nueva);
  await guardar(u, 'clientes', { id: cliente.nombre.toUpperCase(), ...cliente });
  return { envio, factura: nueva };
}
