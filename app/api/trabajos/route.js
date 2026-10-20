import { secretoCron } from '@/lib/secreto';
import { after } from 'next/server';
import { redis } from '@/lib/redis';
import { error } from '@/lib/api';
import { estadoCola, tanda } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Procesa la cola de trabajos (lib/trabajos.js) en tandas cortas (informe de capacidad E04). Responde enseguida y
// trabaja después (after); si al acabar la tanda aún quedan trabajos que ya tocan, llama a la siguiente. Así 1.000
// empresas no dependen de que todo quepa en una sola función de 60 s, y un corte solo deja trabajos pendientes que
// la siguiente tanda (o el cron de mañana) retoma sin duplicar. Solo con CRON_SECRET.
export async function GET(req) {
  if (!secretoCron(req)) return error('No autorizado', 401);
  if (!redis) return error('Base de datos no conectada', 503);
  const n = Math.max(0, Number(req.headers.get('x-tanda')) || 0);
  after(() => tanda(req.nextUrl.origin, n).catch((e) => console.error('[trabajos]', e.message)));
  return Response.json({ ok: true, tanda: n, cola: await estadoCola() });
}
