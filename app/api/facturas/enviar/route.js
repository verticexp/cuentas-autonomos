import { leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { emailValido } from '@/lib/email';
import { enviarFactura } from '@/lib/envio';

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
  const r = await enviarFactura(u, f, { para, asunto: b.asunto, mensaje: b.mensaje, origen: req.nextUrl.origin, responderA: u.email });
  if (r.error) return error(r.error, r.error.startsWith('Rellena') ? 400 : 502);
  return Response.json({ ok: true, envio: r.envio });
}
