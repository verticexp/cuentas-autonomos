import { clave, redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';
import { hoy } from '@/lib/formato';
import { puede } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

// Saldo en el banco hoy: el punto de partida de la previsión de tesorería. Vacío para quitarlo.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  // Cambia el saldo real del que parte Tesorería: no basta con ver el resumen.
  if (!puede(u, 'facturar') && !puede(u, 'gastar')) return error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403);
  const b = await cuerpo(req);
  if (b.saldo === null || b.saldo === '') { await redis.del(clave(u, 'saldo')); return Response.json({ ok: true }); }
  const importe = r2(leerImporte(b.saldo));
  if (!Number.isFinite(importe)) return error('Importe no válido');
  const saldo = { importe, fecha: hoy() };
  await redis.set(clave(u, 'saldo'), saldo);
  return Response.json({ ok: true, saldo });
}
