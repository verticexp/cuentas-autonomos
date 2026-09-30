import { borrarUsuario, crearUsuario } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';

export async function POST(req) {
  const { res } = await usuarioApi({ admin: true });
  if (res) return res;
  const b = await cuerpo(req);
  const r = await crearUsuario({ nombre: b.nombre, email: b.email });
  if (r.error) return error(r.error);
  return Response.json({ ok: true, enlace: new URL(`/invitacion/${r.codigo}`, req.url).toString() });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ admin: true });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id || id === u.id) return error('No se puede borrar');
  await borrarUsuario(id);
  return Response.json({ ok: true });
}
