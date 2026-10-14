import { leer } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { sugerencias } from '@/lib/banco';
import { candidatosConciliacion, contabilizar, deshacer, emparejar, ignorar } from '@/lib/bancoServidor';
import { puede } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

// Confirmar, deshacer o ignorar un emparejamiento, contabilizar lo que no es factura ni gasto (lib/banco.js CLASES), o
// confirmar de una vez todos los seguros.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const b = await cuerpo(req);
  if (b.accion === 'seguras') {
    if (b.ids !== undefined && (!Array.isArray(b.ids) || b.ids.length > 200 || b.ids.some((id) => typeof id !== 'string' || !id.trim()))) return error('Elige como máximo 200 ids de movimiento válidos');
    const movs = (await leer(u, 'banco')) || [];
    const { facturas, gastos } = await candidatosConciliacion(u, movs);
    const s = sugerencias(movs, facturas, gastos);
    const ids = b.ids === undefined ? movs.filter((m) => !m.estado || m.estado === 'pendiente').slice(0, 150).map((m) => m.id) : [...new Set(b.ids)];
    const rechazados = [];
    let hechos = 0;
    for (const id of ids) {
      const x = s[id];
      if (!x?.segura) { rechazados.push({ id, error: 'Ese movimiento ya no tiene una sugerencia segura' }); continue; }
      if (!puede(u, x.tipo === 'factura' ? 'facturar' : 'gastar')) { rechazados.push({ id, error: 'No tienes permiso para conciliar este movimiento' }); continue; }
      try {
        const r = await emparejar(u, id, x.tipo, x.id, { segura: true });
        if (r.ok) hechos += 1;
        else rechazados.push({ id, error: r.error || 'No se ha podido conciliar el movimiento' });
      } catch (e) { rechazados.push({ id, error: e.message || 'No se ha podido conciliar el movimiento' }); }
    }
    return Response.json({ ok: true, hechos, rechazados });
  }
  const id = String(b.id || '');
  if (!id) return error('Falta el movimiento');
  const r = b.accion === 'emparejar' ? await emparejar(u, id, b.tipo, String(b.destino || ''))
    : b.accion === 'deshacer' ? await deshacer(u, id)
      : b.accion === 'ignorar' ? await ignorar(u, id)
        : b.accion === 'contabilizar' ? await contabilizar(u, id, String(b.clase || ''), { intereses: b.intereses }) : { error: 'Acción no válida' };
  if (r.error) return error(r.error, r.status || 400);
  return Response.json({ ok: true });
}
