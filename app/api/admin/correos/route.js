import { cuerpo, error, usuarioApi } from '@/lib/api';
import { CORREOS, componer, enviarCorreo } from '@/lib/correos';
import { MUCHOS, pasado } from '@/lib/limite';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { u, res } = await usuarioApi({ admin: true });
  if (res) return res;
  if (await pasado('admin-correo', u.id, 20, 3600)) return error(MUCHOS, 429);
  const b = await cuerpo(req);
  const id = b?.id;
  if (typeof id !== 'string' || !Object.hasOwn(CORREOS, id)) return error('Ese correo no existe', 400);
  const datos = CORREOS[id].ejemplo;
  const r = await enviarCorreo(id, { para: u.email, datos, asunto: `[Prueba] ${componer(id, datos).asunto}` });
  if (r.error) return error(r.error, 502);
  return Response.json({ ok: true, para: u.email });
}
