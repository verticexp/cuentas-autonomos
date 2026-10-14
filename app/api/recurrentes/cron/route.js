import { after } from 'next/server';
import { redis } from '@/lib/redis';
import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { planificarDia } from '@/lib/trabajosTareas';
import { tanda } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel cada mañana (vercel.json → crons, con CRON_SECRET): crea las facturas del mes que toquen. Informe de
// capacidad E04: un trabajo por empresa en la cola (lib/trabajosTareas.js), procesado en tandas encadenadas. Cada
// recurrente es idempotente por periodo y, si el email falla, la plantilla lo recuerda y se reintenta.
export async function GET(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return error('No autorizado', 401);
  if (!redis) return error('Base de datos no conectada', 503);
  const planificados = await planificarDia(hoy(), req.nextUrl.origin, ['recurrentes']);
  after(() => tanda(req.nextUrl.origin).catch((e) => console.error('[trabajos]', e.message)));
  return Response.json({ ok: true, planificados });
}
