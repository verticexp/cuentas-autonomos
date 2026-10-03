import { cuerpo, error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { iaLista, leerTicket, limpiarTicket } from '@/lib/ticket';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Foto del ticket → datos del gasto para revisar antes de guardar (aquí no se guarda nada).
export async function POST(req) {
  const { res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  if (!iaLista()) return error('La lectura de tickets aún no está configurada (falta ANTHROPIC_API_KEY en Vercel)', 503);
  const { imagen } = await cuerpo(req);
  const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(imagen || ''));
  if (!m) return error('La foto debe ser JPG, PNG o WebP');
  if (m[3].length > 7_000_000) return error('La foto es demasiado grande');
  const r = await leerTicket(m[3], m[1]);
  if (r.error) return error(r.error, 502);
  return Response.json({ ok: true, gasto: limpiarTicket(r.datos, hoy()) });
}
