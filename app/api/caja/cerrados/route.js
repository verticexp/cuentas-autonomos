import { redis, clave } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { fechaReal } from '@/lib/validacion';
import { hoy } from '@/lib/formato';

export const dynamic = 'force-dynamic';

// Días que el negocio no abrió (lib/caja.js diasSinCerrar): así no se avisa de que les falta el cierre de caja.
// { fecha } lo marca; { fecha, quitar: true } lo desmarca.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const fecha = String(b.fecha || '');
  if (!fechaReal(fecha) || fecha > hoy()) return error('Elige un día que ya haya pasado');
  if (b.quitar) await redis.hdel(clave(u, 'cajaCerrados'), fecha);
  else await redis.hset(clave(u, 'cajaCerrados'), { [fecha]: { id: fecha } });
  return Response.json({ ok: true });
}
