// Envía una factura en PDF por email (con enlace de pago si hay Stripe) y apunta el envío en la factura.
import { randomBytes } from 'node:crypto';
import { redis } from './redis.js';
import { guardarCliente } from './tercerosServidor.js';
import { importes, numeroFactura } from './calculos.js';
import { asuntoFactura } from './plantillaEnvio.js';
export { asuntoFactura, mensajeFactura } from './plantillaEnvio.js';
import { facturaPdf } from './pdf.js';
import { identidadDoc } from './documento.js';
import { enviarEmail, htmlMensaje } from './email.js';
import { enlacePago } from './cobros.js';
import { actualizarFactura } from './actualizarFactura.js';
import { stripeListo } from './stripe.js';

// u: usuario o empresa (con emisor, marca y empresa/id). origen: https://… de la app, para los enlaces.
export async function enviarFactura(u, f, { para, asunto, mensaje, origen, responderA }) {
  const { emisor: e, marca } = await identidadDoc(u, f);
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
    adjuntos: [{ nombre, datos: await facturaPdf(f, e, marca) }],
  });
  if (r.error) return r;
  const envio = { fecha: new Date().toISOString(), para, token };
  await redis.hset('factura-envios', { [token]: { empresa: u.empresa || u.id, id: f.id } });
  // El email queda guardado en el cliente para la próxima vez.
  // Sobre la factura de ahora, no la leída antes del correo: en el entretiempo pudo cobrarse o cambiar.
  const act = await actualizarFactura(u, f.id, (actual) => ({ nueva: { ...actual, cliente: { ...actual.cliente, email: para }, envios: [...(actual.envios || []), envio] } }));
  const nueva = act.factura || { ...f, cliente: { ...f.cliente, email: para }, envios: [...(f.envios || []), envio] };
  await guardarCliente(u, nueva.cliente);
  return { envio, factura: nueva };
}
