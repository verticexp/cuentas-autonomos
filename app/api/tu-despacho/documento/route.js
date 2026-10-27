import { error, usuarioApi } from '@/lib/api';
import { pasado, respuesta429 } from '@/lib/limite';
import { archivoDocumento, respuestaArchivo, resumenDocumento, tipoValido } from '@/lib/documentoVista';

export const dynamic = 'force-dynamic';

// Lo mismo que api/despacho/documento, para el cliente con sus propios documentos (Ajustes › Tu gestoría): las facturas
// con el permiso de verlas y los gastos, con el de ver gastos.
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const tipo = q.get('tipo'), id = q.get('id');
  if (!tipoValido(tipo) || !id) return error('Documento no válido');
  const { u, res } = await usuarioApi({ permiso: tipo === 'factura' ? 'facturas' : 'gastos' });
  if (res) return res;
  if (q.get('archivo')) {
    if (await pasado('pdf', u.id, 120, 600)) return respuesta429(600, 'Has abierto demasiados documentos seguidos. Espera unos minutos.');
    const a = await archivoDocumento(u, tipo, id);
    return a.error ? error(a.error, a.status) : respuestaArchivo(a);
  }
  const d = await resumenDocumento(u, tipo, id);
  return d ? Response.json(d) : error('Ese documento ya no existe', 404);
}
