import { leer } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { sugerencias } from '@/lib/banco';
import { deshacer, emparejar, ignorar } from '@/lib/bancoServidor';
import { puede } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

// Confirmar, deshacer o ignorar un emparejamiento; o confirmar de una vez todos los seguros.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const b = await cuerpo(req);
  if (b.accion === 'seguras') {
    const [movs, facturas, gastos] = await Promise.all([leer(u, 'banco'), leer(u, 'facturas'), leer(u, 'gastos')]);
    const s = sugerencias(movs || [], facturas || [], gastos || []);
    let hechos = 0;
    for (const [id, x] of Object.entries(s)) {
      if (!x.segura || !puede(u, x.tipo === 'factura' ? 'facturar' : 'gastar')) continue;
      if ((await emparejar(u, id, x.tipo, x.id)).ok) hechos += 1;
    }
    return Response.json({ ok: true, hechos });
  }
  const id = String(b.id || '');
  if (!id) return error('Falta el movimiento');
  const r = b.accion === 'emparejar' ? await emparejar(u, id, b.tipo, String(b.destino || ''))
    : b.accion === 'deshacer' ? await deshacer(u, id)
      : b.accion === 'ignorar' ? await ignorar(u, id) : { error: 'Acción no válida' };
  if (r.error) return error(r.error, r.status || 400);
  return Response.json({ ok: true });
}
