import { invalidarNoLeidos } from '@/lib/mensajesDespacho';
import { cuerpo, error } from '@/lib/api';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { pasado, respuesta429 } from '@/lib/limite';
import { registrarAcceso } from '@/lib/despachos';
import { comentariosDe, docDe, escribir, leidoDe, marcarLeido, responder } from '@/lib/comentariosDespacho';

export const dynamic = 'force-dynamic';

// Mensajes con un cliente. ?empresa=
export async function GET(req) {
  const { e, d, res } = await clienteDelDespacho(req.nextUrl.searchParams.get('empresa'));
  if (res) return res;
  const [hilos, leido] = await Promise.all([comentariosDe(e.id, { despacho: d.id }), leidoDe(e.id)]);
  return Response.json({ hilos, leido });
}

// Escribir: { empresa, texto, hilo? (responder a una pregunta), doc?: { tipo, id } (pregunta sobre un documento) }.
export async function POST(req) {
  const b = await cuerpo(req);
  const { e, d, ctx, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  if (await pasado('mensajes', `${e.id}:${quien.id}`, 120, 3600)) return respuesta429(600, 'Has enviado muchos mensajes seguidos. Espera un poco.');
  const { doc, error: ed } = b.hilo ? { doc: null } : await docDe(ctx, b.doc);
  if (ed) return error(ed, 404);
  const r = await escribir(e.id, quien, 'despacho', { texto: b.texto, hilo: b.hilo, doc, despacho: d.id });
  if (r.error) return error(r.error, r.status || 400);
  await marcarLeido(e.id, 'despacho');
  await invalidarNoLeidos(d.id);
  if (doc) await registrarAcceso(e.id, quien, 'Te ha preguntado por un documento', doc.texto);
  return Response.json(r);
}

// Marcar una pregunta como resuelta (o volver a abrirla): { empresa, id, resuelto }. Marcar leído: { empresa, leer: true }
// (no con un GET: un enlace o una imagen de otra web no deben poder cambiar nada).
export async function PATCH(req) {
  const b = await cuerpo(req);
  const { e, d, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  if (b.leer === true) { await marcarLeido(e.id, 'despacho'); await invalidarNoLeidos(d.id); return Response.json({ ok: true }); }
  const r = await responder(e.id, String(b.id || ''), quien, 'despacho', { texto: b.texto, resuelto: b.resuelto, despacho: d.id });
  return r.error ? error(r.error, r.status || 400) : Response.json(r);
}
