import { leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { emailValido } from '@/lib/email';
import { MENSAJE_PRUEBA, asuntoFactura, cupoEnvio, enviarFactura } from '@/lib/envio';
import { emisorDe } from '@/lib/calculos';

export const dynamic = 'force-dynamic';

// Envía la factura en PDF al cliente y apunta el envío (para avisar cuando la abra).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const f = b.id && (await leerUno(u, 'facturas', b.id));
  if (!f) return error('Esa factura ya no existe', 404);
  const para = String(b.para || '').trim().toLowerCase();
  if (!emailValido(para)) return error('Escribe un email válido');
  const { prueba, error: tope } = await cupoEnvio(u);
  if (tope) return error(tope, 429);
  const asunto = prueba ? asuntoFactura(f, emisorDe(f, u), u.envio) : b.asunto;
  const mensaje = prueba ? String(b.mensaje || '').slice(0, MENSAJE_PRUEBA) : b.mensaje;
  const r = await enviarFactura(u, f, { para, asunto, mensaje, origen: req.nextUrl.origin, responderA: u.email });
  if (r.error) return error(r.error, r.error.startsWith('Rellena') ? 400 : 502);
  return Response.json({ ok: true, envio: r.envio });
}
