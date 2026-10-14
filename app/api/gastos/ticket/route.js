import { contarVentana, rafaga, concurrencia, respuesta429 } from '@/lib/limite';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { iaLista, leerTicket, limpiarTicket } from '@/lib/ticket';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const POR_DIA = 100; // cada foto es una llamada de pago a la IA

// Foto del ticket o factura (imagen o PDF) → datos del gasto para revisar antes de guardar (aquí no se guarda nada).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  if (!iaLista()) return error('La lectura de tickets aún no está configurada (falta ANTHROPIC_API_KEY en Vercel)', 503);
  const { imagen } = await cuerpo(req);
  const m = /^data:(image\/(jpeg|png|webp)|application\/(pdf));base64,([A-Za-z0-9+/=]+)$/.exec(String(imagen || ''));
  if (!m) return error('Sube una foto (JPG, PNG o WebP) o un PDF');
  if (m[4].length > 7_000_000) return error('El archivo es demasiado grande (máx. 5 MB)');
  if (await rafaga('ticket', u.id, 10, 60)) return respuesta429(60, 'Has enviado demasiadas fotos seguidas. Espera un minuto y prueba de nuevo.');
  const k = `tickets:${u.id}:${hoy()}`;
  const n = await contarVentana(k, 2 * 86400);
  if (n > POR_DIA) return respuesta429(86400, `Has llegado a las ${POR_DIA} fotos de hoy. Mañana más.`);
  const r = await concurrencia('ticket', u.empresa, 3, 30000, () =>
    concurrencia('ia', 'global', 20, 60000, () => leerTicket(m[4], m[1])));
  if (r?.ocupado) return respuesta429(5, 'La lectura de tickets está ocupada. Espera unos segundos y prueba de nuevo.');
  if (r.error) return error(r.error, 502);
  return Response.json({ ok: true, gasto: limpiarTicket(r.datos, hoy()) });
}
