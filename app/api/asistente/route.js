import { redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { iaLista } from '@/lib/ticket';
import { limpiarHistorial } from '@/lib/asistente';
import { preguntar } from '@/lib/asistenteIA';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const POR_DIA = 60;

// Pregunta sobre las cuentas → respuesta con las cifras de la app (solo de su empresa y según sus permisos).
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (!iaLista()) return error('El asistente aún no está configurado (falta ANTHROPIC_API_KEY en Vercel)', 503);
  const b = await cuerpo(req);
  const pregunta = String(b.pregunta || '').trim().slice(0, 500);
  if (!pregunta) return error('Escribe tu pregunta');
  const k = `asistente:${u.id}:${hoy()}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, 2 * 86400);
  if (n > POR_DIA) return error(`Has llegado a las ${POR_DIA} preguntas de hoy. Mañana más.`, 429);
  try {
    return Response.json({ ok: true, ...(await preguntar(u, pregunta, limpiarHistorial(b.historial), hoy())) });
  } catch (e) { return error(e.message, 502); }
}
