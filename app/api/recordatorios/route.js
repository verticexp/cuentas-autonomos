import { after } from 'next/server';
import { redis } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import { purgarBajas } from '@/lib/baja';
import { planificarDia } from '@/lib/trabajosTareas';
import { tanda } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel cada mañana (vercel.json → crons, con CRON_SECRET). Informe de capacidad E04: no hace el trabajo de
// todas las empresas en una sola función; lo planifica (un trabajo por empresa y tarea: recordatorios de cobro, avisos
// en el móvil y envíos de Verifactu pendientes) y lo procesa en tandas encadenadas (app/api/trabajos).
export async function GET(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!redis) return Response.json({ ok: true, planificados: 0, motivo: 'sin base de datos' });
  const dia = hoy();
  // Empresas dadas de baja cuyo plazo legal de conservación ha acabado: se borran del todo.
  const bajas = await purgarBajas(dia);
  const planificados = await planificarDia(dia, req.nextUrl.origin, ['recordatorios', 'push', 'verifactu']);
  after(() => tanda(req.nextUrl.origin).catch((e) => console.error('[trabajos]', e.message)));
  return Response.json({ ok: true, planificados, bajas });
}
