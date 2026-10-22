import { error } from '@/lib/api';
import { redis } from '@/lib/redis';
import { correoEntranteListo, firmaResend, leerAviso } from '@/lib/correoEntrante';
import { olvidarCorreo, primeraVez, recibirCorreo } from '@/lib/buzonEntrante';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Webhook del correo entrante de Resend (evento email.received): las facturas reenviadas a <alias>@fisqal.com entran en
// la bandeja de su empresa (lib/buzonEntrante.js). Pública en lib/rutasPublicas.js; solo vale con la firma Svix de
// RESEND_WEBHOOK_SECRET, sobre el cuerpo crudo. Lo que no es para nadie se responde con 200 (no tiene sentido que
// Resend lo reintente); un fallo nuestro, con 500, y Resend lo vuelve a mandar.
export async function POST(req) {
  if (!correoEntranteListo() || !redis) return error('El correo entrante no está configurado', 503);
  const cuerpo = await req.text();
  if (!firmaResend(cuerpo, req.headers)) return error('Firma no válida', 401);
  const aviso = leerAviso(cuerpo);
  if (!aviso) return Response.json({ ok: true, ignorado: 'otro evento' });
  if (!(await primeraVez(aviso.emailId))) return Response.json({ ok: true, ignorado: 'repetido' });
  try {
    return Response.json({ ok: true, ...(await recibirCorreo(aviso)) });
  } catch (e) {
    console.error('[buzon] no se ha podido procesar el correo', aviso.emailId, e.message);
    await olvidarCorreo(aviso.emailId).catch(() => {});
    return error('No se ha podido procesar el correo', 500);
  }
}
