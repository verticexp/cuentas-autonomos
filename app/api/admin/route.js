import { cuerpo, error, usuarioApi } from '@/lib/api';
import { cambioDePlan } from '@/lib/admin';
import { conCerrojo } from '@/lib/cerrojo';
import { metrica } from '@/lib/metricas';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Panel /admin: el administrador de Fisquo regala el plan Fundador, lo quita o alarga una prueba.
// { empresa, accion: 'fundador' | 'quitar-fundador' | 'alargar' | 'plan', dias, tipo, nombre }
export async function POST(req) {
  const { u, res } = await usuarioApi({ admin: true });
  if (res) return res;
  const b = await cuerpo(req);
  const id = String(b.empresa || '');
  return conCerrojo(`empresa-plan:${id}`, async () => {
    const e = id && (await redis.hget('empresas', id));
    if (!e || e.baja) return error('Esa empresa no existe', 404);
    const r = cambioDePlan(e, String(b.accion || ''), { dias: b.dias, tipo: String(b.tipo || ''), nombre: String(b.nombre || '') });
    if (r.error) return error(r.error);
    await redis.hset('empresas', { [id]: { ...e, plan: r.plan } });
    metrica('admin-plan', { empresa: id, accion: b.accion, por: u.id });
    return Response.json({ ok: true, plan: r.plan });
  });
}
