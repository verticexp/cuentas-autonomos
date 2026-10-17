import { cuerpo, error, usuarioApi } from '@/lib/api';
import { emparejar, ignorar } from '@/lib/bancoServidor';
import { leerUno } from '@/lib/redis';
import { secundarios } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';

// «En revisión» de Gastos (components/RevisionGastos.js): emparejar un cargo del banco con un gasto o apartarlo. Con el
// permiso de gastos basta (el perfil Gastos no tiene «resumen», que pide /api/banco). Borrar el gasto va por DELETE /api/gastos.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  const id = String(b.id || '');
  if (!id) return error('Falta el movimiento');
  const m = await leerUno(u, 'banco', id);
  if (!m) return error('Ese movimiento ya no existe', 404);
  if (!(m.importe < 0)) return error('Desde Gastos solo se revisan cargos');
  if (b.accion === 'emparejar') {
    const gasto = String(b.gasto || '');
    if (!gasto) return error('Elige el gasto');
    const r = await emparejar(u, id, 'gasto', gasto);
    if (r.error) return error(r.error, r.status || 400);
    const g = await leerUno(u, 'gastos', gasto);
    if (g) await secundarios(u, { meses: [g.fecha] });
    return Response.json({ ok: true });
  }
  if (b.accion === 'ignorar') {
    const r = await ignorar(u, id);
    if (r.error) return error(r.error, r.status || 400);
    return Response.json({ ok: true });
  }
  return error('Acción no válida');
}
