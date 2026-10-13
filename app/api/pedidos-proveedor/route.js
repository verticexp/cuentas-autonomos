import { guardar, borrar, leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { gastoDeRecepcion, limpiarPedidoProv, numeroDoc } from '@/lib/albaranes';
import { siguientePedidoProv } from '@/lib/albaranesServidor';
import { actividadesDe } from '@/lib/empresa';
import { subirGasto } from '@/lib/drive';
import { enviarNomina } from '@/lib/controlat';
import { auditar } from '@/lib/auditoria';

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
    const p = await leerUno(u, 'pedidosProv', String(b.id || ''));
    if (!p) return error('Ese pedido ya no existe', 404);
    if (p.recibido) return error('Ese pedido ya está recibido');
    if (b.accion === 'cancelar') {
      await guardar(u, 'pedidosProv', { ...p, cancelado: p.cancelado ? undefined : new Date().toISOString().slice(0, 10) });
      return Response.json({ ok: true });
    }
    const datos = gastoDeRecepcion(p, { fecha: b.fecha, recibido: Array.isArray(b.recibido) ? b.recibido.slice(0, 100) : undefined, ivaPct: b.ivaPct, actividad: actividadesDe(u)[0].id });
    if (datos.error) return error(datos.error);
    const g = { id: crypto.randomUUID(), ...datos };
    await guardar(u, 'gastos', g);
    await guardar(u, 'pedidosProv', { ...p, cancelado: undefined, recibido: g.fecha, gasto: g.id });
    await Promise.all([subirGasto(u, g), enviarNomina(u, [g.fecha])]);
    await auditar(u, 'Pedido recibido', `${num(p)} · ${p.proveedor} · ${g.base} € sin IVA`);
    return Response.json({ ok: true, gasto: g });
  }
  const datos = limpiarPedidoProv(b, (await leer(u, 'productos')) || []);
  if (datos.error) return error(datos.error);
  const anio = Number(datos.fecha.slice(0, 4));
  const p = { id: crypto.randomUUID(), numero: await siguientePedidoProv(u, anio), anio, ...datos, creado: new Date().toISOString(), por: u.id };
  await guardar(u, 'pedidosProv', p);
  await auditar(u, 'Pedido a proveedor', `${num(p)} · ${p.proveedor}`);
  return Response.json({ ok: true, pedido: p });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const p = await leerUno(u, 'pedidosProv', req.nextUrl.searchParams.get('id') || '');
  if (!p) return error('Ese pedido ya no existe', 404);
  if (p.recibido) return error('Ese pedido ya está recibido: borra su gasto si hace falta');
  await borrar(u, 'pedidosProv', p.id);
  await auditar(u, 'Pedido a proveedor borrado', `${num(p)} · ${p.proveedor}`);
  return Response.json({ ok: true });
}
