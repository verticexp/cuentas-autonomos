import { actualizarUsuario } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { enviarTodo, idControlat } from '@/lib/controlat';

// Activa o desactiva el envío del neto mensual a Controla'T.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  const { activar } = await cuerpo(req);
  if (!activar) {
    await actualizarUsuario(u, { controlat: false });
    return Response.json({ ok: true, activo: false });
  }
  if (!(await idControlat(u.email))) return error(`No hay ninguna cuenta de Controla'T con el email ${u.email}.`);
  const nuevo = await actualizarUsuario(u, { controlat: true, controlatEmail: u.email });
  const meses = await enviarTodo(nuevo);
  return Response.json({ ok: true, activo: true, meses });
}
