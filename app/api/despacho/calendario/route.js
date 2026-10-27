import { miDespacho } from '@/lib/despachoApi';
import { error } from '@/lib/api';
import { pasado, respuesta429 } from '@/lib/limite';
import { crearCalendario, quitarCalendario } from '@/lib/calendarioDespacho';

async function cambiar(req, crear) {
  const { u, d, res } = await miDespacho();
  if (res) return res;
  if (await pasado('calendario', u.id, 20, 3600)) return respuesta429(3600);
  const r = await (crear ? crearCalendario : quitarCalendario)(d, u.id);
  if (r.error) return error(r.error, r.status || 400);
  if (!crear) return Response.json({ ok: true });
  const url = new URL('/api/abierta/calendario', req.nextUrl.origin);
  url.protocol = 'https:';
  url.searchParams.set('t', r.token);
  return Response.json({ url: url.href }, { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = (req) => cambiar(req, true);
export const DELETE = (req) => cambiar(req, false);
