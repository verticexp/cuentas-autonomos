import { actualizarUsuario } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { enviarTodo, idControlat } from '@/lib/controlat';
import { auditar } from '@/lib/auditoria';

// Activa o desactiva el envío del neto mensual a Controla'T.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  const { activar } = await cuerpo(req);
  // Escribe en la cuenta de Controla'T con el mismo email, y en Netto los emails no se verifican (los pone quien invita):
  // solo para el administrador de la app, que es el dueño de Controla'T.
  if (activar && !u.admin) return error("El conector con Controla'T solo está disponible para el administrador de Netto.", 403);
  if (!activar) {
    await actualizarUsuario(u, { controlat: false });
    await auditar(u, "Controla'T desconectado");
    return Response.json({ ok: true, activo: false });
  }
  if (!(await idControlat(u.email))) return error(`No hay ninguna cuenta de Controla'T con el email ${u.email}.`);
  const nuevo = await actualizarUsuario(u, { controlat: true, controlatEmail: u.email });
  const meses = await enviarTodo(nuevo);
  await auditar(u, "Controla'T conectado", u.email);
  return Response.json({ ok: true, activo: true, meses });
}
