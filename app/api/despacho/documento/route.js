import { error } from '@/lib/api';
import { clienteDelDespacho } from '@/lib/despachoApi';
import { pasado, respuesta429 } from '@/lib/limite';
import { archivoDocumento, respuestaArchivo, resumenDocumento, tipoValido } from '@/lib/documentoVista';

export const dynamic = 'force-dynamic';

// Vista previa de una factura o un gasto de un cliente: ?empresa=&tipo=factura|gasto&id= → sus datos; con &archivo=1, el
// PDF de la factura o el justificante del gasto (components/VistaDocumento.js).
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { u, ctx, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const tipo = q.get('tipo'), id = q.get('id');
  if (!tipoValido(tipo) || !id) return error('Documento no válido');
  if (q.get('archivo')) {
    if (await pasado('pdf', u.id, 120, 600)) return respuesta429(600, 'Has abierto demasiados documentos seguidos. Espera unos minutos.');
    const a = await archivoDocumento(ctx, tipo, id);
    return a.error ? error(a.error, a.status) : respuestaArchivo(a);
  }
  const d = await resumenDocumento(ctx, tipo, id);
  return d ? Response.json(d) : error('Ese documento ya no existe', 404);
}
