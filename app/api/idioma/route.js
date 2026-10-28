import { usuarioApi } from '@/lib/api';
import { guardarIdioma } from '@/lib/auth';
import { idiomaActual } from '@/lib/idiomaServidor';

export const dynamic = 'force-dynamic';

// Ajustes › Idioma (components/IdiomaApp.js): guarda en la ficha de la persona el idioma que ya marca la cookie (o el del
// aparato, si vuelve a automático), para escribirle los correos y los avisos en él (lib/correos.js, lib/push.js).
export async function POST() {
  const { u, res } = await usuarioApi();
  if (res) return res;
  await guardarIdioma(u.id, await idiomaActual());
  return Response.json({ ok: true });
}
