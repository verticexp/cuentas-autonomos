import { error } from '@/lib/api';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { respuestaArchivo } from '@/lib/documentoVista';
import { archivoDe } from '@/lib/documentosServidor';

export const dynamic = 'force-dynamic';

// El original de un documento del cliente (para verlo o para el ZIP del trimestre, que monta el navegador). ?empresa=&id=
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { ctx, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const a = await archivoDe(ctx, String(q.get('id') || ''));
  if (!a) return error('Ese documento no existe', 404);
  return respuestaArchivo({ datos: a.datos, tipo: a.doc.archivo.tipo, nombre: a.doc.nombre });
}
