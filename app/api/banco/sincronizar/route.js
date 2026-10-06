import { cuerpo, error, usuarioApi } from '@/lib/api';
import { MUCHOS, pasado } from '@/lib/limite';
import { sincronizar } from '@/lib/bancoServidor';

export const dynamic = 'force-dynamic';

// Trae lo último de las cuentas conectadas (al abrir la pantalla, si hace más de 6 horas, o con «Actualizar»).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const b = await cuerpo(req);
  // «Actualizar» llama al banco aunque no hayan pasado 6 horas: como mucho 10 veces por hora.
  if (b.forzar && (await pasado('sincronizar', u.id, 10, 3600))) return error(MUCHOS, 429);
  return Response.json({ ok: true, ...(await sincronizar(u, { forzar: Boolean(b.forzar) })) });
}
