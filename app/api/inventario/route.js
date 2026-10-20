import { mensajePlan } from '@/lib/app';
import { borrar, guardar, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { leerImporte, r2 } from '@/lib/calculos';
import { MOTIVOS, SALEN, inventario } from '@/lib/inventario';
import { datosStock } from '@/lib/stockServidor';
import { xlsx } from '@/lib/xlsx';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';
import { usarFuncion } from '@/lib/usoPlan';

export const dynamic = 'force-dynamic';

// Ajuste de stock a mano: stock inicial, recuento, rotura, consumo… { producto, fecha, cantidad (+ entra, − sale) o recuento, motivo, coste }.
// Con «recuento», se apunta la diferencia entre lo contado y lo que dice Fisquo (con como: 'consumo', si falta, como consumo).
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar' });
  if (res) return res;
  const sinPlan = await usarFuncion(u, 'inventario');
  if (sinPlan) return error(mensajePlan(sinPlan, req.headers.get('user-agent')), 403);
  const b = await cuerpo(req);
  const datos = await datosStock(u);
  const p = datos.productos.find((x) => x.id === b.producto);
  if (!p) return error('Ese producto ya no existe', 404);
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : hoy();
  let motivo = MOTIVOS[b.motivo] ? b.motivo : 'otro';
  let cantidad = Math.round((leerImporte(b.cantidad) || 0) * 1000) / 1000;
  if (motivo === 'recuento') {
    const actual = inventario(datos, { hoy: fecha }).productos.find((x) => x.id === p.id)?.stock || 0;
    cantidad = Math.round((Math.abs(cantidad) - actual) * 1000) / 1000;
    if (!cantidad) return Response.json({ ok: true, sinCambios: true });
    // En talleres, peluquerías o restaurantes lo que falta suele ser material gastado en los servicios: consumo, no pérdida.
    if (b.como === 'consumo' && cantidad < 0) motivo = 'consumo';
  } else if (SALEN.includes(motivo)) cantidad = -Math.abs(cantidad);
  else if (motivo === 'inicial') cantidad = Math.abs(cantidad);
  if (!cantidad) return error('Pon una cantidad');
  const a = { id: crypto.randomUUID(), producto: p.id, fecha, cantidad, motivo, ...(cantidad > 0 && r2(leerImporte(b.coste) || 0) ? { coste: r2(leerImporte(b.coste)) } : {}), nota: String(b.nota || '').trim().slice(0, 120), por: u.id };
  await guardar(u, 'stock', a);
  await auditar(u, 'Inventario', `${MOTIVOS[motivo]} · ${p.nombre} · ${cantidad > 0 ? '+' : ''}${cantidad}`);
  return Response.json({ ok: true, ajuste: a });
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'gastar', funcion: 'inventario' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id') || '';
  const a = await leerUno(u, 'stock', id);
  if (!a) return error('Ese ajuste ya no existe', 404);
  await borrar(u, 'stock', id);
  await auditar(u, 'Inventario', `Ajuste borrado · ${a.fecha} · ${a.cantidad}`);
  return Response.json({ ok: true });
}

// Excel del inventario a hoy (o a una fecha: ?fecha=2025-12-31): stock, coste medio, valor, ventas y margen del año.
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get('fecha') || '') ? req.nextUrl.searchParams.get('fecha') : hoy();
  const inv = inventario(await datosStock(u), { hoy: fecha });
  const L = inv.productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  const cuerpoXlsx = xlsx([{ nombre: 'Inventario', anchos: [12, 34, 22, 10, 10, 12, 12, 10, 12, 12, 9], filas: [
    ['Referencia', 'Producto', 'Proveedor', 'Stock', 'Mínimo', 'Coste medio', 'Valor', 'Vendidas', 'Ventas', 'Margen', 'Margen %'],
    ...L.map((p) => [p.sku || '', p.nombre, p.proveedor || '', { n: p.stock }, { n: p.minimo }, p.costeMedio, p.valor, { n: p.ventas }, p.ingresos, p.margen, { n: p.margenPct }]),
    ['', 'Total', '', '', '', '', { b: inv.valor }, '', { b: r2(L.reduce((s, p) => s + p.ingresos, 0)) }, { b: r2(L.reduce((s, p) => s + p.margen, 0)) }, ''],
  ] }]);
  return new Response(cuerpoXlsx, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="inventario-${fecha}.xlsx"` } });
}
