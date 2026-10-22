import { usuarioClave, respuestaPublica, jsonPublico, errorPublico } from '../../../../../lib/apiPublica.js';
import { facturaPublica } from '../../../../../lib/apiPublicaDatos.js';
import { leerUno } from '../../../../../lib/redis.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (req, { params }) => respuestaPublica(async () => {
  const { u, res } = await usuarioClave(req, { alcance: 'facturas:leer' });
  if (res) return res;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return errorPublico('Factura no encontrada', 404);
  const f = await leerUno(u, 'facturas', id);
  return f ? jsonPublico(facturaPublica(f)) : errorPublico('Factura no encontrada', 404);
});
