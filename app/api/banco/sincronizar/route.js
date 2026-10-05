import { cuerpo, usuarioApi } from '@/lib/api';
import { sincronizar } from '@/lib/bancoServidor';

export const dynamic = 'force-dynamic';

// Trae lo último de las cuentas conectadas (al abrir la pantalla, si hace más de 6 horas, o con «Actualizar»).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const b = await cuerpo(req);
  return Response.json({ ok: true, ...(await sincronizar(u, { forzar: Boolean(b.forzar) })) });
}
