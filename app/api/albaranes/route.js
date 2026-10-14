import { leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { limpiarDoc, numeroDoc, NOMBRE } from '@/lib/albaranes';
import { RiesgoSuperado } from '@/lib/facturas';
import { borrarDoc, cerrarPedido, corregirDoc, facturarAlbaranes, guardarDoc, normalizarIdsAlbaranes } from '@/lib/albaranesServidor';
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
    const ids = normalizarIdsAlbaranes(b.ids);
    const { factura: f, albaranes: lista, error: e } = await facturarAlbaranes(u, { ...b, ids });
    if (e) return error(e);
    await auditar(u, 'Albaranes facturados', `${lista.map(numeroDoc).join(', ')} → ${numeroFactura(f)}`);
    return Response.json({ ok: true, factura: f });
  }

  if (b.accion === 'cerrar') {
    const r = await cerrarPedido(u, String(b.id || ''), b.cerrado);
    if (r.error) return error(r.error, r.status || 400);
    return Response.json({ ok: true });
  }

  if (b.id) {
    const r = await corregirDoc(u, String(b.id), b);
    if (r.error) return error(r.error, r.status || 400);
    await auditar(u, `${NOMBRE[r.doc.tipo]} corregido`, `${numeroDoc(r.doc)} · ${r.doc.cliente.nombre}`);
    return Response.json({ ok: true, doc: r.doc });
  }
  const datos = limpiarDoc(b, b.tipo);
  if (datos.error) return error(datos.error);
  if (datos.pedido && !(await leerUno(u, 'albaranes', datos.pedido))) delete datos.pedido;
  let d;
  try { d = await guardarDoc(u, datos); } catch (e) { if (e instanceof RiesgoSuperado || e.status === 409) return error(e.message, 409); throw e; }
  await auditar(u, `${NOMBRE[d.tipo]} nuevo`, `${numeroDoc(d)} · ${d.cliente.nombre}`);
  return Response.json({ ok: true, doc: d });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const r = await borrarDoc(u, req.nextUrl.searchParams.get('id') || '');
  if (r.error) return error(r.error, r.status || 400);
  const d = r.doc;
  await auditar(u, `${NOMBRE[d.tipo]} borrado`, `${numeroDoc(d)} · ${d.cliente?.nombre || ''}`);
  return Response.json({ ok: true });
}
