import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { cambiarUsuario, limpiarEmail } from '@/lib/auth';
import { metrica } from '@/lib/metricas';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Panel /admin, soporte: quitar la verificación en dos pasos (lib/dosPasos.js) a quien ha perdido el móvil y los códigos
// de recuperación, después de comprobar por otra vía que es esa persona. Queda en la actividad de su empresa.
export async function POST(req) {
  const { u, res } = await usuarioApi({ admin: true });
  if (res) return res;
  const email = limpiarEmail((await cuerpo(req)).email);
  const id = email && (await redis.hget('emails', email));
  if (!id) return error('No hay ninguna cuenta con ese email', 404);
  let tenia = false;
  const hecho = await cambiarUsuario(id, ({ dosPasos, ...x }) => { tenia = Boolean(dosPasos?.secreto); return tenia ? x : null; });
  if (!hecho) return error(tenia ? 'No se ha podido quitar. Vuelve a intentarlo.' : 'Esa cuenta no tiene la verificación en dos pasos activada');
  await auditar({ id: u.id, nombre: 'Soporte de Fisquo', email: u.email, empresa: hecho.empresa }, 'Verificación en dos pasos quitada por soporte', hecho.email);
  metrica('admin-dos-pasos', { usuario: id, por: u.id });
  return Response.json({ ok: true });
}
