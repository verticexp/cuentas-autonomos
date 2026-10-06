import { cookies } from 'next/headers';
import { redis } from '@/lib/redis';
import { desbloqueada } from '@/lib/auth';
import { cuerpo } from '@/lib/api';

// La app se ha bloqueado en el navegador (al abrirla o al volver tras un rato fuera): el servidor deja de dar datos
// hasta desbloquear otra vez. «seguir»: la app sigue abierta y en uso, alarga el desbloqueo.
export async function POST(req) {
  if ((await cuerpo(req)).accion === 'seguir') return Response.json({ ok: await desbloqueada() });
  const c = await cookies();
  const d = c.get('d')?.value;
  if (d && redis) await redis.del(`desbloqueo:${d}`);
  c.delete('d');
  return Response.json({ ok: true });
}
