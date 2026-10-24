import { error, cuerpo } from '@/lib/api';
import { leerUno } from '@/lib/redis';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { pasado, respuesta429 } from '@/lib/limite';
import { registrarAcceso } from '@/lib/despachos';
import { docDe, escribir, marcarLeido } from '@/lib/comentariosDespacho';
import { invalidarNoLeidos } from '@/lib/mensajesDespacho';
import { anular, enlazarHilo, pedir, peticionDe, peticionesDe } from '@/lib/peticionesDespacho';
import { leerJustificante } from '@/lib/justificantes';
import { respuestaArchivo } from '@/lib/documentoVista';
import { avisarCliente } from '@/lib/avisosDespacho';
import { fechaCorta } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Documentos pedidos a un cliente (lib/peticionesDespacho.js). GET ?empresa= → la lista; con &id=&archivo=1, el
// documento que ha subido.
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { d, ctx, e, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  if (q.get('archivo')) {
    const p = await peticionDe(e.id, q.get('id') || '');
    if (!p || p.despacho !== d.id || !p.entrega?.archivo) return error('Ese documento no existe', 404);
    const datos = await leerJustificante(ctx, p.entrega.archivo);
    if (!datos) return error('No se encuentra el documento', 404);
    const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[p.entrega.archivo.tipo] || 'bin';
    return respuestaArchivo({ datos, tipo: p.entrega.archivo.tipo, nombre: `${p.texto.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 50) || 'documento'}.${ext}` });
  }
  return Response.json({ peticiones: await peticionesDe(e.id, { despacho: d.id, ctx }) });
}

// Pedir: { empresa, tipo: 'ticket', gasto } o { empresa, tipo: 'documento', texto }. Deja el mensaje en el chat.
export async function POST(req) {
  const b = await cuerpo(req);
  const { u, d, e, ctx, quien, res } = await clienteDelDespacho(b.empresa);
  if (res) return res;
  if (await pasado('peticiones', `${e.id}:${u.id}`, 60, 3600)) return respuesta429(600, 'Has pedido muchos documentos seguidos. Espera un poco.');
  let gasto = null, doc = null;
  if (b.tipo === 'ticket') {
    const g = await leerUno(ctx, 'gastos', String(b.gasto || ''));
    if (!g) return error('Ese gasto ya no existe', 404);
    if (g.archivo?.clave) return error('Este gasto ya tiene su justificante', 409);
    ({ doc } = await docDe(ctx, { tipo: 'gasto', id: g.id }));
    gasto = { id: g.id, texto: `${g.proveedor || g.concepto || 'gasto'} (${fechaCorta(g.fecha)})` };
  }
  const r = await pedir(e.id, quien, { despacho: d.id, tipo: b.tipo, gasto, texto: b.texto });
  if (r.error) return error(r.error, r.status || 400);
  const nota = r.peticion.texto ? ` ${r.peticion.texto}` : '';
  const texto = b.tipo === 'ticket' ? `📎 ¿Me subes el ticket o la factura de este gasto? Puedes hacerle una foto.${nota}` : `📎 Te pido un documento: ${r.peticion.texto}. Súbelo con el botón «Subir» de arriba: una foto o un PDF.`;
  const m = await escribir(e.id, quien, 'despacho', { texto, doc, despacho: d.id });
  if (m.comentario) await enlazarHilo(e.id, r.peticion.id, m.comentario.id);
  await marcarLeido(e.id, 'despacho');
  await invalidarNoLeidos(d.id);
  await registrarAcceso(e.id, quien, 'Te ha pedido un documento', b.tipo === 'ticket' ? gasto.texto : r.peticion.texto);
  avisarCliente(e, { titulo: `${d.nombre} te pide un documento`, cuerpo: b.tipo === 'ticket' ? `El ticket de ${gasto.texto}` : r.peticion.texto });
  return Response.json(r);
}

// Anular una petición pendiente: ?empresa=&id=
export async function DELETE(req) {
  const q = req.nextUrl.searchParams;
  const { d, e, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const r = await anular(e.id, q.get('id') || '', d.id);
  return r.error ? error(r.error, r.status || 400) : Response.json({ ok: true });
}
