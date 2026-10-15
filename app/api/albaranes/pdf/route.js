import { leerUno } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { albaranPdf, nombreArchivo } from '@/lib/pdfAlbaran';
import { identidadDoc } from '@/lib/documento';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const d = await leerUno(u, 'albaranes', q.get('id') || '');
  if (!d || !['albaran', 'pedido'].includes(d.tipo)) return error('Ese documento no existe', 404);
  const { emisor: e, marca } = await identidadDoc(u, d);
  if (!e.nombre) return error('Rellena tus datos de empresa en Ajustes', 400);
  const pedido = d.pedido ? await leerUno(u, 'albaranes', d.pedido) : null;
  const nombre = nombreArchivo(d);
  return new Response(await albaranPdf(d, e, marca, { valorado: q.get('precios') !== '0', pedido }), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"; filename*=UTF-8''${encodeURIComponent(nombre)}` },
  });
}
