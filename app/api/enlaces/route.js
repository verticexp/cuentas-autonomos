import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { Ocupado } from '@/lib/cerrojo';
import { cambiarEnlacePortal, cambiarEnlacePresupuesto } from '@/lib/enlaces';
import { numeroPresupuesto } from '@/lib/presupuestos';

export const dynamic = 'force-dynamic';

// Cambiar un enlace público (informe de seguridad M2): el anterior deja de funcionar al momento.
// { tipo: 'portal', cliente, nif } · { tipo: 'presupuesto', id }
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (b.tipo === 'portal') {
    try {
      const ruta = await cambiarEnlacePortal(u, b.cliente, typeof b.nif === 'string' ? b.nif : undefined);
      if (!ruta) return error('Ese cliente no existe', 404);
      await auditar(u, 'Enlace del portal cambiado', String(b.cliente).slice(0, 80));
      return Response.json({ ok: true, ruta });
    } catch (e) {
      if (e instanceof Ocupado) return error(e.message, 409);
      throw e;
    }
  }
  if (b.tipo === 'presupuesto') {
    const id = String(b.id || '');
    try {
      const p = await cambiarEnlacePresupuesto(u, id);
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
