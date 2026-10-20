import { secretoCron } from '@/lib/secreto';
import { redis } from '@/lib/redis';
import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { planificarDia, resumenTanda } from '@/lib/trabajosTareas';
import { tanda } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel cada mañana (vercel.json → crons, con CRON_SECRET): crea las facturas del mes que toquen. Informe de
// capacidad E04: un trabajo por empresa en la cola (lib/trabajosTareas.js), procesado en tandas encadenadas. Cada
// recurrente es idempotente por periodo y, si el email falla, la plantilla lo recuerda y se reintenta.
export async function GET(req) {
  if (!secretoCron(req)) return error('No autorizado', 401);
  if (!redis) return error('Base de datos no conectada', 503);
  const inicio = Date.now();
  const planificados = await planificarDia(hoy(), req.nextUrl.origin, ['recurrentes']);
  const r = await tanda(req.nextUrl.origin, 0, { hasta: inicio + 50000 });
  return Response.json({ ok: true, planificados, ...resumenTanda(r) });
}
