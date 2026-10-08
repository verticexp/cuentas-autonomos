import { comprobar } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { darDeBaja } from '@/lib/baja';
import { MUCHOS, pasado } from '@/lib/limite';

// Dar de baja la empresa (lib/baja.js). Solo su administrador, con su contraseña. La del administrador de Netto, no.
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (u.rol !== 'admin') return error('Solo el administrador de la empresa puede darla de baja', 403);
  if (u.admin) return error('La empresa del administrador de Netto no se puede dar de baja desde aquí', 403);
  if (await pasado('baja', u.id, 5, 3600)) return error(MUCHOS, 429);
  const { password } = await cuerpo(req);
  if (!comprobar(String(password || ''), u.pass)) return error('La contraseña no es correcta');
  await auditar(u, 'Baja de la empresa', u.empresaNombre);
  const borrarEl = await darDeBaja(u.empresa);
  return Response.json({ ok: true, borrarEl });
}
