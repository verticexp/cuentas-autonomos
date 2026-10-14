import { contarVentana, rafaga, concurrencia, respuesta429 } from '@/lib/limite';
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
  if (await rafaga('asistente', u.id, 6, 60)) return respuesta429(60, 'Has enviado demasiadas preguntas seguidas. Espera un minuto y prueba de nuevo.');
  const k = `asistente:${u.id}:${hoy()}`;
  const n = await contarVentana(k, 2 * 86400);
  if (n > POR_DIA) return respuesta429(86400, `Has llegado a las ${POR_DIA} preguntas de hoy. Mañana más.`);
  try {
    const r = await concurrencia('asistente', u.empresa, 2, 60000, () =>
      concurrencia('ia', 'global', 20, 60000, () => preguntar(u, pregunta, limpiarHistorial(b.historial), hoy())));
    if (r?.ocupado) return respuesta429(5, 'El asistente está ocupado. Espera unos segundos y prueba de nuevo.');
    return Response.json({ ok: true, ...r });
  } catch (e) { return error(e.message, 502); }
}
