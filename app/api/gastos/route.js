import { mensajePlan } from '@/lib/app';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { sinFuncion } from '@/lib/planes';
import { emparejar } from '@/lib/bancoServidor';
import { auditar } from '@/lib/auditoria';
import { borrarGasto, crearGasto, editarGasto, pagarGasto } from '@/lib/gastosServidor';
import { gastoEditado, nuevoGasto } from '@/lib/gastoCuerpo';
import { hoy } from '@/lib/formato';
import { secundarios } from '@/lib/trabajos';
import { borrarJustificantes } from '@/lib/justificantes';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (b.banco) {
    const no = sinFuncion(u.plan, 'revision');
    if (no) return error(mensajePlan(no, req.headers.get('user-agent')), 403);
  }
  const v = nuevoGasto(u, b);
  if (v.error) return Response.json({ error: v.error, errores: v.errores }, { status: 400 });
  const g = v.gasto;
  const alta = await crearGasto(u, g, { duplicadoConfirmado: b.duplicadoConfirmado });
  if (alta.error) return Response.json(alta, { status: 409 });
  Object.assign(g, alta.gasto);
  // Apuntado desde un movimiento del banco que no tenía gasto: queda emparejado (y pagado con la fecha del banco).
  // Si el cargo no casa con el gasto (informe R01), el gasto queda apuntado sin emparejar y se avisa.
  const emp = b.banco ? await emparejar(u, String(b.banco), 'gasto', g.id) : null;
  await secundarios(u, { gastos: [g.id], meses: [g.fecha] });
  return Response.json({ ok: true, gasto: g, ...(emp?.error ? { aviso: `Gasto guardado, pero sin emparejar con el banco: ${emp.error}` } : {}) });
}

export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (!b.id) return error('Ese gasto ya no existe', 404);
  // Solo {id, pagado: true}: marcar como pagado un gasto sin pagar (deslizar en la lista), sin tocar nada más.
  if (Object.keys(b).length === 2 && b.pagado === true) {
    const p = await pagarGasto(u, String(b.id), hoy());
    if (p.error) return error(p.error, p.status || 400);
    await secundarios(u, { meses: [p.antes.fecha] });
    return Response.json({ ok: true });
  }
  // Se valida y se construye sobre el gasto releído dentro del cerrojo de su pedido (informe R04), si es de una recepción.
  const r = await editarGasto(u, String(b.id), (antes) => gastoEditado(u, b, antes));
  if (r.errores) return Response.json({ error: r.error, errores: r.errores }, { status: 400 });
  if (r.error) return error(r.error, r.status || 400);
  const { antes, gasto: g } = r;
  if (antes.inversion && antes.inversion.tipo !== g.inversion?.tipo) await auditar(u, 'Criterio de amortización cambiado', `${antes.concepto} · ${antes.inversion.tipo} → ${g.inversion?.tipo || 'sin inversión'}`);
  await secundarios(u, { meses: [antes.fecha, g.fecha] });
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return error('Falta id');
  // Si venía de un pedido a proveedor, se quita su recepción (el pedido recupera sus unidades pendientes) a la vez.
  const r = await borrarGasto(u, id);
  if (r.error) return error(r.error, r.status || 400);
  const { antes } = r;
  if (antes) await auditar(u, 'Gasto borrado', `${antes.concepto} · ${antes.fecha} · ${antes.base} € sin IVA`);
  if (antes?.archivo) await borrarJustificantes(u, [antes.archivo]);
  if (antes) await secundarios(u, { meses: [antes.fecha] });
  return Response.json({ ok: true });
}
