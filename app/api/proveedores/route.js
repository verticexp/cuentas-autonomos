import { guardar } from '@/lib/redis';
import { leerMarcados } from '@/lib/indices';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { claveProveedor } from '@/lib/proveedores';
import { hoy } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Marca como pagados los gastos pendientes de un proveedor. { clave }
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const { clave } = await cuerpo(req);
  const suyos = (await leerMarcados(u, 'gastos', 'p')).filter((g) => g.proveedor && g.pendiente && claveProveedor(g) === clave);
  if (!suyos.length) return error('No hay nada pendiente con ese proveedor', 404);
  for (const g of suyos) await guardar(u, 'gastos', { ...g, pendiente: undefined, pagado: hoy() });
  return Response.json({ ok: true, pagados: suyos.length });
}
