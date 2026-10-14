import { leer } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { limpiarPedidoProv, numeroDoc } from '@/lib/albaranes';
import { borrarPedidoProv, cancelarPedidoProv, crearPedidoProv, recibirPedidoProv } from '@/lib/albaranesServidor';
import { auditar } from '@/lib/auditoria';
import { secundarios } from '@/lib/trabajos';

export const dynamic = 'force-dynamic';
const num = (p) => numeroDoc({ ...p, tipo: 'proveedor' });

// Pedidos a proveedores (salen de «Qué pedir»).
// { proveedor, proveedorNif, fecha, lineas: [{ producto, cantidad, coste }], nota } → pedido nuevo.
// { accion: 'recibir', id, fecha, recibido: [{ producto, cantidad, coste }], ivaPct } → el gasto con su stock.
// { accion: 'cancelar', id }.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const b = await cuerpo(req);
  if (b.accion === 'recibir' || b.accion === 'cancelar') {
    if (b.accion === 'cancelar') {
      const r = await cancelarPedidoProv(u, String(b.id || ''));
      if (r.error) return error(r.error, r.status || 400);
      return Response.json({ ok: true, pedido: r.pedido });
    }
    const r = await recibirPedidoProv(u, b);
    if (r.error) return error(r.error, r.status || 400);
    const g = r.gasto;
    if (!r.repetida) {
      await secundarios(u, { gastos: [g.id], meses: [g.fecha] });
      await auditar(u, 'Pedido recibido', `${num(r.pedido)} · ${r.pedido.proveedor} · ${g.base} € sin IVA`);
    }
    return Response.json({ ok: true, gasto: g, recepcion: r.recepcion, pedido: r.pedido });
  }
  const datos = limpiarPedidoProv(b, (await leer(u, 'productos')) || []);
  if (datos.error) return error(datos.error);
  const p = await crearPedidoProv(u, datos);
  await auditar(u, 'Pedido a proveedor', `${num(p)} · ${p.proveedor}`);
  return Response.json({ ok: true, pedido: p });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const r = await borrarPedidoProv(u, req.nextUrl.searchParams.get('id') || '');
  if (r.error) return error(r.error, r.status || 400);
  const p = r.pedido;
  await auditar(u, 'Pedido a proveedor borrado', `${num(p)} · ${p.proveedor}`);
  return Response.json({ ok: true });
}
