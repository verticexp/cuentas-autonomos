import { randomBytes } from 'node:crypto';
import { redis, guardar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { importes, numeroFactura } from '@/lib/calculos';
import { facturaPdf } from '@/lib/pdf';
import { emailValido, enviarEmail, htmlMensaje } from '@/lib/email';
import { enlacePago } from '@/lib/cobros';
import { stripeListo } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

// Envía la factura en PDF al cliente y apunta el envío (para avisar cuando la abra).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  let f = b.id && (await leerUno(u, 'facturas', b.id));
  if (!f) return error('Esa factura ya no existe', 404);
  const para = String(b.para || '').trim().toLowerCase();
  if (!emailValido(para)) return error('Escribe un email válido');
  const e = u.emisor || {};
  if (!e.nif || !e.iban) return error('Rellena tus datos de facturación en Ajustes');
  const num = numeroFactura(f);
  const token = randomBytes(16).toString('hex');
  const nombre = `${num} ${f.cliente.nombre.toUpperCase().replace(/[^A-Z0-9 ]+/g, '')}.pdf`.trim();
  // Con Stripe conectado, el email lleva el enlace para pagar con tarjeta o Bizum.
  let mensaje = String(b.mensaje || '').slice(0, 5000);
  if (stripeListo() && !f.cobrada && importes(f).total > 0) {
    const p = await enlacePago(u, f);
    f = p.f;
    mensaje += `\n\nPuedes pagarla con tarjeta o Bizum aquí: ${req.nextUrl.origin}${p.ruta}`;
  }
  const r = await enviarEmail({
    para,
    asunto: String(b.asunto || '').trim().slice(0, 200) || `Factura ${num} de ${e.nombre}`,
    html: htmlMensaje(mensaje, `${req.nextUrl.origin}/api/abierta/${token}`),
    responderA: u.email,
    adjuntos: [{ nombre, datos: await facturaPdf(f, e, u.marca) }],
  });
  if (r.error) return error(r.error, 502);
  const envio = { fecha: new Date().toISOString(), para, token };
  await redis.hset('factura-envios', { [token]: { empresa: u.empresa || u.id, id: f.id } });
  // El email queda guardado en el cliente para la próxima vez.
  const cliente = { ...f.cliente, email: para };
  await guardar(u, 'facturas', { ...f, cliente, envios: [...(f.envios || []), envio] });
  await guardar(u, 'clientes', { id: cliente.nombre.toUpperCase(), ...cliente });
  return Response.json({ ok: true, envio });
}
