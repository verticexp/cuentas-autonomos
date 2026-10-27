import { mensajePlan } from '@/lib/app';
import { leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { sugerencias } from '@/lib/banco';
import { candidatosConciliacion, contabilizar, deshacer, emparejar, ignorar, leerReglas } from '@/lib/bancoServidor';
import { aplicarReglas, conReglas } from '@/lib/reglasBanco';
import { puede } from '@/lib/permisos';
import { usarFuncion } from '@/lib/usoPlan';

export const dynamic = 'force-dynamic';

// Confirmar, deshacer o ignorar un emparejamiento, contabilizar lo que no es factura ni gasto (lib/banco.js CLASES), o
// confirmar de una vez todos los seguros (las sugerencias seguras con su factura o gasto y, si no las hay, lo que una regla
// del banco manda ignorar: lib/reglasBanco.js).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const sinPlan = await usarFuncion(u, 'conciliacion');
  if (sinPlan) return error(mensajePlan(sinPlan, req.headers.get('user-agent')), 403);
  const b = await cuerpo(req);
  if (b.accion === 'seguras') {
    if (b.ids !== undefined && (!Array.isArray(b.ids) || b.ids.length > 200 || b.ids.some((id) => typeof id !== 'string' || !id.trim()))) return error('Elige como máximo 200 ids de movimiento válidos');
    const movs = (await leer(u, 'banco')) || [];
    const reglas = await leerReglas(u);
    const { facturas, gastos } = await candidatosConciliacion(u, movs);
    const s = sugerencias(conReglas(movs, reglas), facturas, gastos, u);
    const aIgnorar = aplicarReglas(movs, reglas).ignorar;
    const porId = new Map(movs.map((m) => [m.id, m]));
    const ids = b.ids === undefined ? movs.filter((m) => !m.estado || m.estado === 'pendiente').slice(0, 150).map((m) => m.id) : [...new Set(b.ids)];
    const rechazados = [];
    let hechos = 0;
    for (const id of ids) {
      const x = s[id];
      const regla = !x?.segura && aIgnorar.get(id);
      if (!x?.segura && !regla) { rechazados.push({ id, error: 'Ese movimiento ya no tiene una sugerencia segura' }); continue; }
      if (!puede(u, regla ? (porId.get(id).importe > 0 ? 'facturar' : 'gastar') : x.tipo === 'factura' ? 'facturar' : 'gastar')) { rechazados.push({ id, error: 'No tienes permiso para conciliar este movimiento' }); continue; }
      try {
        const r = regla ? await ignorar(u, id, { regla: regla.id, reglas }) : await emparejar(u, id, x.tipo, x.id, { segura: true, reglas });
        if (r.ok) hechos += 1;
        else rechazados.push({ id, error: r.error || 'No se ha podido conciliar el movimiento' });
      } catch (e) { rechazados.push({ id, error: e.message || 'No se ha podido conciliar el movimiento' }); }
    }
    return Response.json({ ok: true, hechos, rechazados });
  }
  const id = String(b.id || '');
  if (!id) return error('Falta el movimiento');
  const contable = b.accion === 'contabilizar' && ['prestamo', 'socio', 'ingreso'].includes(b.clase)
    || b.accion === 'deshacer' && (await leerUno(u, 'banco', id))?.enlace?.tipo === 'asiento';
  if (contable && !puede(u, 'contabilidad')) return error('Pide el permiso de contabilidad al administrador', 403);
  const r = b.accion === 'emparejar' ? await emparejar(u, id, b.tipo, String(b.destino || ''))
    : b.accion === 'deshacer' ? await deshacer(u, id)
      : b.accion === 'ignorar' ? await ignorar(u, id, typeof b.regla === 'string' && b.regla ? { regla: b.regla.slice(0, 40) } : undefined)
        : b.accion === 'contabilizar' ? await contabilizar(u, id, String(b.clase || ''), { intereses: b.intereses }) : { error: 'Acción no válida' };
  if (r.error) return error(r.error, r.status || 400);
  return Response.json({ ok: true });
}
