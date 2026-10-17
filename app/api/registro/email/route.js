import { emailReal } from '@/lib/emailReal';
import { ipDe, MUCHOS, pasado } from '@/lib/limite';

export async function POST(req) {
  if (await pasado('registro-email', ipDe(req), 30, 3600)) return Response.json({ ok: false, error: MUCHOS }, { status: 429 });
  const datos = await req.json().catch(() => null);
  return Response.json(await emailReal(datos?.email));
}
