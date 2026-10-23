import { cuerpo, error } from '@/lib/api';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { registrarAcceso } from '@/lib/despachos';
import { comentar, comentariosDe, docDe, responder } from '@/lib/comentariosDespacho';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { e, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const anio = Number(q.get('anio')) || undefined, t = Number(q.get('t')) || undefined;
  return Response.json(await comentariosDe(e.id, { anio, t }));
}

// { empresa, anio, t, doc?: { tipo, id }, texto }
export async function POST(req) {
  const b = await cuerpo(req);
  const { e, ctx, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  const { doc, error: ed } = await docDe(ctx, b.doc);
  if (ed) return error(ed, 404);
  const r = await comentar(e.id, quien, 'despacho', { anio: Number(b.anio), t: Number(b.t), doc, texto: b.texto });
  if (r.error) return error(r.error, r.status || 400);
  await registrarAcceso(e.id, quien, 'Te ha dejado una pregunta', doc?.texto || `${b.t}T ${b.anio}`);
  return Response.json(r);
}

// { empresa, id, texto?, resuelto? }
export async function PATCH(req) {
  const b = await cuerpo(req);
  const { e, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  const r = await responder(e.id, String(b.id || ''), quien, 'despacho', { texto: b.texto, resuelto: b.resuelto });
  return r.error ? error(r.error, r.status || 400) : Response.json(r);
}
