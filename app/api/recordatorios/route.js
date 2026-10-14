import { redis } from '@/lib/redis';
import { hoy } from '@/lib/formato';
import { purgarBajas } from '@/lib/baja';
import { planificarDia, resumenTanda } from '@/lib/trabajosTareas';
import { tanda } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel cada mañana (vercel.json → crons, con CRON_SECRET). Informe de capacidad E04: no hace el trabajo de
// todas las empresas en una sola función; lo planifica (un trabajo por empresa y tarea: índices y totales al día,
// recordatorios de cobro, avisos
// en el móvil y envíos de Verifactu pendientes) y lo procesa en tandas encadenadas (la primera aquí, las siguientes en app/api/trabajos).
export async function GET(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return Response.json({ error: 'No autorizado' }, { status: 401 });
  if (!redis) return Response.json({ ok: true, planificados: 0, motivo: 'sin base de datos' });
  const inicio = Date.now();
  const dia = hoy();
  // Empresas dadas de baja cuyo plazo legal de conservación ha acabado: se borran del todo.
  const bajas = await purgarBajas(dia);
  const planificados = await planificarDia(dia, req.nextUrl.origin, ['indices', 'recordatorios', 'push', 'verifactu']);
  // La primera tanda, aquí mismo (su resumen va en la respuesta); si queda trabajo, encadena las siguientes.
  const r = await tanda(req.nextUrl.origin, 0, { hasta: inicio + 50000 });
  return Response.json({ ok: true, planificados, bajas, ...resumenTanda(r) });
}
