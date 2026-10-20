import { NextResponse } from 'next/server';
import { comprobar } from '@/lib/auth';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { eliminarCuenta } from '@/lib/baja';
import { MUCHOS, pasado } from '@/lib/limite';
import { membresias } from '@/lib/membresias';
import { redis } from '@/lib/redis';
import { cancelarSuscripcion } from '@/lib/suscripcion';
import { avisarBaja } from '@/lib/avisosCorreo';

// Eliminar la propia cuenta (lib/baja.js eliminarCuenta), con su contraseña. Vale también en solo lectura.
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  if (u.admin) return error('La cuenta del administrador de Kontix no se puede eliminar desde aquí', 403);
  if (await pasado('eliminar-cuenta', u.id, 5, 3600)) return error(MUCHOS, 429);
  const { password } = await cuerpo(req);
  if (!(await comprobar(String(password || ''), u.pass))) return error('La contraseña no es correcta');
  await auditar(u, 'Cuenta eliminada', u.email);
  // Los planes, antes de la baja: así se sabe qué suscripción dejar de renovar.
  const planes = Object.fromEntries(await Promise.all(Object.keys(membresias(u)).map(async (id) => [id, (await redis.hget('empresas', id))?.plan])));
  const r = await eliminarCuenta(u);
  if (r.error) return error(r.error, 409);
  for (const id of r.empresas) {
    const fallo = await cancelarSuscripcion(planes[id]);
    if (fallo) console.error(`[baja] no se pudo cancelar la suscripción de ${id}: ${fallo}`);
  }
  await avisarBaja(u, { cuenta: true });
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.delete('t');
  return respuesta;
}
