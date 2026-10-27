import { usuarioClave, respuestaPublica, jsonPublico } from '@/lib/apiPublica';
import { paginaGastos, parametrosPagina } from '@/lib/apiPublicaDatos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (req) => respuestaPublica(async () => {
  const { u, res } = await usuarioClave(req, { alcance: 'gastos:leer' });
  if (res) return res;
  return jsonPublico(await paginaGastos(u, parametrosPagina(req)));
});
