import { randomBytes } from 'node:crypto';
import { redis, guardar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { conCerrojo, Ocupado } from '@/lib/cerrojo';
import { cambiarEnlacePortal } from '@/lib/portal';
import { numeroPresupuesto } from '@/lib/presupuestos';

export const dynamic = 'force-dynamic';

// Cambiar un enlace público (informe de seguridad M2): el anterior deja de funcionar al momento.
// { tipo: 'portal', cliente, nif } · { tipo: 'presupuesto', id }
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (b.tipo === 'portal') {
    const ruta = await cambiarEnlacePortal(u, b.cliente, typeof b.nif === 'string' ? b.nif : undefined);
    if (!ruta) return error('Ese cliente no existe', 404);
    await auditar(u, 'Enlace del portal cambiado', String(b.cliente).slice(0, 80));
    return Response.json({ ok: true, ruta });
  }
  if (b.tipo === 'presupuesto') {
    const id = String(b.id || '');
    try {
      // El mismo cerrojo que aceptar y editar el presupuesto: nadie guarda a la vez con el token viejo.
      const p = await conCerrojo(`presupuesto:${u.empresa || u.id}:${id}`, async () => {
        const antes = id && (await leerUno(u, 'presupuestos', id));
        if (!antes) return null;
        const token = randomBytes(18).toString('base64url');
        await redis.hset('presupuesto-enlaces', { [token]: { empresa: u.empresa || u.id, id } });
        await guardar(u, 'presupuestos', { ...antes, token });
        if (antes.token) await redis.hdel('presupuesto-enlaces', antes.token);
        return { ...antes, token };
      });
      if (!p) return error('Ese presupuesto ya no existe', 404);
      await auditar(u, 'Enlace del presupuesto cambiado', numeroPresupuesto(p));
      return Response.json({ ok: true, ruta: `/p/${p.token}` });
    } catch (e) {
      if (e instanceof Ocupado) return error(e.message, 409);
      throw e;
    }
  }
  return error('Tipo de enlace no válido');
}
