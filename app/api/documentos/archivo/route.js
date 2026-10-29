import { error, usuarioApi } from '@/lib/api';
import { respuestaArchivo } from '@/lib/documentoVista';
import { archivoDe } from '@/lib/documentosServidor';

export const dynamic = 'force-dynamic';

// El archivo de uno de sus documentos (lib/documentos.js), para verlo. ?id=…
export async function GET(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (u.viaDespacho) return error('Esto es para el cliente, no para su gestoría', 403);
  const a = await archivoDe(u, String(req.nextUrl.searchParams.get('id') || ''));
  if (!a) return error('Ese documento no existe', 404);
  return respuestaArchivo({ datos: a.datos, tipo: a.doc.archivo.tipo, nombre: a.doc.nombre });
}
