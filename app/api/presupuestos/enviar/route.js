import { leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { emailValido } from '@/lib/email';
import { MENSAJE_PRUEBA, enviarPresupuesto } from '@/lib/envio';
import { limiteEnvios } from '@/lib/limite';
import { diasPrueba } from '@/lib/prueba';

export const dynamic = 'force-dynamic';

// Envía el presupuesto en PDF al cliente, con el botón para aceptarlo, y apunta el envío. Mismo tope diario que las facturas.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const p = b.id && (await leerUno(u, 'presupuestos', b.id));
  if (!p) return error('Ese presupuesto ya no existe', 404);
  const para = String(b.para || '').trim().toLowerCase();
  if (!emailValido(para)) return error('Escribe un email válido');
  const limite = await limiteEnvios(u);
  if (limite) return error(limite.error, limite.status);
  const prueba = diasPrueba(u.plan) > 0;
  // En el mes de prueba, el asunto de la plantilla y un mensaje más corto (como en las facturas).
  const asunto = prueba ? undefined : b.asunto;
  const mensaje = prueba ? String(b.mensaje || '').slice(0, MENSAJE_PRUEBA) : b.mensaje;
  const r = await enviarPresupuesto(u, p, { para, asunto, mensaje, origen: req.nextUrl.origin, responderA: u.email });
  if (r.error) return error(r.error, r.error.startsWith('Rellena') ? 400 : 502);
  return Response.json({ ok: true, envio: r.envio });
}
