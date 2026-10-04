import { leer, guardar } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { claveProveedor } from '@/lib/proveedores';

export const dynamic = 'force-dynamic';

// Marca como pagados los gastos pendientes de un proveedor. { clave }
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const { clave } = await cuerpo(req);
  const suyos = (await leer(u, 'gastos')).filter((g) => g.proveedor && g.pendiente && claveProveedor(g) === clave);
  if (!suyos.length) return error('No hay nada pendiente con ese proveedor', 404);
  for (const g of suyos) await guardar(u, 'gastos', { ...g, pendiente: undefined });
  return Response.json({ ok: true, pagados: suyos.length });
}
