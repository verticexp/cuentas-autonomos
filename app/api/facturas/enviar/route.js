import { leerUno, redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { emailValido } from '@/lib/email';
import { enviarFactura } from '@/lib/envio';
import { hoy } from '@/lib/formato';

const POR_DIA = 200; // tope de envíos por empresa y día: frena el abuso del correo sin estorbar al uso normal

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
  const k = `enviar:${u.empresa}:${hoy()}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 2 * 86400);
  if (n > POR_DIA) return error('Demasiados envíos por hoy. Inténtalo mañana.', 429);
  const r = await enviarFactura(u, f, { para, asunto: b.asunto, mensaje: b.mensaje, origen: req.nextUrl.origin, responderA: u.email });
  if (r.error) return error(r.error, r.error.startsWith('Rellena') ? 400 : 502);
  return Response.json({ ok: true, envio: r.envio });
}
