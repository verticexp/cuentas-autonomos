import { usuarioClave, respuestaPublica, jsonPublico, errorPublico } from '../../../../../lib/apiPublica.js';
import { gastoPublico, gastosVisibles } from '../../../../../lib/apiPublicaDatos.js';
import { leerUno } from '../../../../../lib/redis.js';
import { puede } from '../../../../../lib/permisos.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (req, { params }) => respuestaPublica(async () => {
  const { u, res } = await usuarioClave(req, { alcance: 'gastos:leer' });
  if (res) return res;
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(id)) return errorPublico('Gasto no encontrado', 404);
  const g = puede(u, 'nominas') ? await leerUno(u, 'gastos', id) : (await gastosVisibles(u)).find((x) => String(x.id) === id);
  return g ? jsonPublico(gastoPublico(g)) : errorPublico('Gasto no encontrado', 404);
});
