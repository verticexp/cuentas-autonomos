import { cuerpo, error } from '@/lib/api';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { registrarAcceso } from '@/lib/despachos';
import { comentariosDe, docDe, escribir, leidoDe, marcarLeido, responder } from '@/lib/comentariosDespacho';

export const dynamic = 'force-dynamic';

// Mensajes con un cliente. ?empresa=&leer=1 (marca como leído lo que ha escrito el cliente).
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { e, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const [hilos, leido] = await Promise.all([comentariosDe(e.id), leidoDe(e.id)]);
  if (q.get('leer') === '1') await marcarLeido(e.id, 'despacho');
  return Response.json({ hilos, leido });
}

// Escribir: { empresa, texto, hilo? (responder a una pregunta), doc?: { tipo, id } (pregunta sobre un documento) }.
export async function POST(req) {
  const b = await cuerpo(req);
  const { e, ctx, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  const { doc, error: ed } = b.hilo ? { doc: null } : await docDe(ctx, b.doc);
  if (ed) return error(ed, 404);
  const r = await escribir(e.id, quien, 'despacho', { texto: b.texto, hilo: b.hilo, doc });
  if (r.error) return error(r.error, r.status || 400);
  await marcarLeido(e.id, 'despacho');
  if (doc) await registrarAcceso(e.id, quien, 'Te ha preguntado por un documento', doc.texto);
  return Response.json(r);
}

// Marcar una pregunta como resuelta (o volver a abrirla): { empresa, id, resuelto }.
export async function PATCH(req) {
  const b = await cuerpo(req);
  const { e, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  const r = await responder(e.id, String(b.id || ''), quien, 'despacho', { texto: b.texto, resuelto: b.resuelto });
  return r.error ? error(r.error, r.status || 400) : Response.json(r);
}
