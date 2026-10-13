import { createHash } from 'node:crypto';
import { guardar, borrar, leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { crearFactura, limpiar } from '@/lib/facturas';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { facturaDeAlbaranes, limpiarDoc, numeroDoc, NOMBRE } from '@/lib/albaranes';
import { guardarDoc } from '@/lib/albaranesServidor';
import { numeroFactura } from '@/lib/calculos';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

// Pedidos de clientes y albaranes (lib/albaranes.js).
// { tipo: 'pedido' | 'albaran', id?, fecha, cliente, lineas, nota, pedido? } → crea o corrige.
// { accion: 'facturar', ids, fecha, actividad, irpfPct, cobrada } → una factura con esos albaranes.
// { accion: 'cerrar', id, cerrado } → un pedido que ya no se va a servir entero.
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);

  if (b.accion === 'facturar') {
    const ids = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 100) : [];
    const todos = (await leer(u, 'albaranes')) || [];
    const lista = ids.map((id) => todos.find((a) => a.id === id)).filter(Boolean);
    if (lista.length !== ids.length) return error('Alguno de esos albaranes ya no existe');
    const fd = facturaDeAlbaranes(lista);
    if (fd.error) return error(fd.error);
    const a = actividadesDe(u).find((x) => x.id === b.actividad) || actividadesDe(u)[0];
    const datos = limpiar({ ...fd, fecha: b.fecha, actividad: a.id, irpfPct: b.irpfPct ?? a.irpfPct, cobrada: b.cobrada }, actividadesDe(u), fiscalDe(u).tipo === 'sociedad');
    if (datos.error) return error(datos.error);
    // Idempotente por los albaranes elegidos: dos clics a la vez no hacen dos facturas.
    const idem = `alb:${createHash('sha256').update([...ids].sort().join(',')).digest('hex').slice(0, 32)}`;
    const { factura: f, error: e } = await crearFactura(u, datos, { idem });
    if (e) return error(e);
    for (const x of lista) await guardar(u, 'albaranes', { ...x, factura: f.id });
    await auditar(u, 'Albaranes facturados', `${lista.map(numeroDoc).join(', ')} → ${numeroFactura(f)}`);
    return Response.json({ ok: true, factura: f });
  }

  if (b.accion === 'cerrar') {
    const p = await leerUno(u, 'albaranes', String(b.id || ''));
    if (p?.tipo !== 'pedido') return error('Ese pedido ya no existe', 404);
    await guardar(u, 'albaranes', { ...p, cerrado: b.cerrado ? new Date().toISOString().slice(0, 10) : undefined });
    return Response.json({ ok: true });
  }

  const antes = b.id ? await leerUno(u, 'albaranes', String(b.id)) : null;
  if (b.id && !antes) return error('Ese documento ya no existe', 404);
  if (antes?.factura) return error('Ese albarán ya está facturado: para cambiarlo, borra o rectifica la factura');
  const datos = limpiarDoc(b, antes?.tipo || b.tipo);
  if (datos.error) return error(datos.error);
  if (datos.pedido && !(await leerUno(u, 'albaranes', datos.pedido))) delete datos.pedido;
  const d = await guardarDoc(u, datos, antes);
  await auditar(u, antes ? `${NOMBRE[d.tipo]} corregido` : `${NOMBRE[d.tipo]} nuevo`, `${numeroDoc(d)} · ${d.cliente.nombre}`);
  return Response.json({ ok: true, doc: d });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id') || '';
  const d = await leerUno(u, 'albaranes', id);
  if (!d) return error('Ese documento ya no existe', 404);
  if (d.factura) return error('Ese albarán está facturado: borra antes la factura');
  if (d.tipo === 'pedido' && ((await leer(u, 'albaranes')) || []).some((a) => a.pedido === d.id)) return error('Ese pedido tiene albaranes: bórralos antes o ciérralo');
  await borrar(u, 'albaranes', id);
  await auditar(u, `${NOMBRE[d.tipo]} borrado`, `${numeroDoc(d)} · ${d.cliente?.nombre || ''}`);
  return Response.json({ ok: true });
}
