import { usuarioClave, respuestaPublica, jsonPublico } from '../../../../lib/apiPublica.js';
import { clientePublico, paginaLista, parametrosPagina } from '../../../../lib/apiPublicaDatos.js';
import { leer } from '../../../../lib/redis.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (req) => respuestaPublica(async () => {
  const { u, res } = await usuarioClave(req, { alcance: 'clientes:leer' });
  if (res) return res;
  return jsonPublico(paginaLista((await leer(u, 'clientes')) || [], parametrosPagina(req), clientePublico));
});
