import { leerUno, redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { emailValido } from '@/lib/email';
import { asuntoFactura, enviarFactura } from '@/lib/envio';
import { emisorDe } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import { diasPrueba } from '@/lib/prueba';

const POR_DIA = 200; // tope de envíos por empresa y día: frena el abuso del correo sin estorbar al uso normal
// En el mes de prueba, menos envíos, el asunto de la plantilla y un mensaje más corto (informe de seguridad m1): una cuenta
// recién creada no puede usar el correo de Netto para mandar lo que quiera a quien quiera.
const POR_DIA_PRUEBA = 30;
const MENSAJE_PRUEBA = 1500;

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
  const prueba = diasPrueba(u.plan) > 0;
  if (n > (prueba ? POR_DIA_PRUEBA : POR_DIA)) return error(prueba ? `En el mes de prueba puedes enviar ${POR_DIA_PRUEBA} facturas al día. Inténtalo mañana o elige un plan.` : 'Demasiados envíos por hoy. Inténtalo mañana.', 429);
  const asunto = prueba ? asuntoFactura(f, emisorDe(f, u), u.envio) : b.asunto;
  const mensaje = prueba ? String(b.mensaje || '').slice(0, MENSAJE_PRUEBA) : b.mensaje;
  const r = await enviarFactura(u, f, { para, asunto, mensaje, origen: req.nextUrl.origin, responderA: u.email });
  if (r.error) return error(r.error, r.error.startsWith('Rellena') ? 400 : 502);
  return Response.json({ ok: true, envio: r.envio });
}
