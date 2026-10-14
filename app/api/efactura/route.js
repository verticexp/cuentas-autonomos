import { error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { importes, numeroFactura, r2, vencimiento } from '@/lib/calculos';
import { xlsx } from '@/lib/xlsx';
import { hoy } from '@/lib/formato';
import { delosAnios } from '@/lib/indices';

export const dynamic = 'force-dynamic';

// Días entre la factura y el pago, como número entero en el Excel.
const dias = (a, b) => (a && b ? { n: Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5) } : '');

// Estado de pago de las facturas (Ley 18/2022 «Crea y Crece»: hay que poder informar de cuándo se paga cada factura B2B)
// y periodo medio de pago. Excel con dos hojas: emitidas (cobros) y recibidas (pagos). ?anio=2026
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const anio = Number(req.nextUrl.searchParams.get('anio')) || Number(hoy().slice(0, 4));
  if (anio < 2000 || anio > 2100) return error('Año no válido');
  const h = hoy();
  const { facturas, gastos } = await delosAnios(u, [anio], { bienes: false });
  const delAnio = (x) => x.fecha.startsWith(`${anio}-`);
  const estado = (pagada, vence) => (pagada ? 'Pagada' : vence && h > vence ? 'Vencida' : 'Pendiente');
  // Solo facturas a empresas y profesionales (con NIF): las simplificadas y los cierres de caja no.
  const emitidas = (facturas || []).filter((f) => delAnio(f) && !f.caja && String(f.cliente?.nif || '').trim()).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((f) => {
    const vence = vencimiento(f, u.emisor?.plazo), pago = f.cobrada ? f.cobro?.fecha?.slice(0, 10) || '' : '';
    return [numeroFactura(f), f.fecha, f.cliente.nif, f.cliente.nombre, importes(f).total, vence, estado(f.cobrada, vence), pago, dias(f.fecha, pago)];
  });
  const recibidas = (gastos || []).filter((g) => delAnio(g) && g.proveedorNif && !g.nomina).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((g) => {
    const i = importes(g), pago = g.pendiente ? '' : g.pagado || g.fecha;
    return [g.numero || '', g.fecha, g.proveedorNif, g.proveedor || '', r2(i.base + i.iva - i.irpf), '', estado(!g.pendiente, ''), pago, dias(g.fecha, pago), g.efactura ? g.efactura.toUpperCase() : ''];
  });
  const medio = (filas, col) => { const xs = filas.map((f) => f[col]?.n).filter((n) => n !== undefined); return xs.length ? r2(xs.reduce((s, n) => s + n, 0) / xs.length) : ''; };
  const hojas = [];
  if (puede(u, 'facturas')) hojas.push({ nombre: 'Emitidas', anchos: [14, 11, 13, 32, 12, 12, 11, 12, 10], filas: [['Factura', 'Fecha', 'NIF cliente', 'Cliente', 'Total', 'Vencimiento', 'Estado', 'Cobrada el', 'Días'], ...emitidas, ['', '', '', 'Periodo medio de cobro (días)', '', '', '', '', { b: medio(emitidas, 8) }]] });
  if (puede(u, 'gastos')) hojas.push({ nombre: 'Recibidas', anchos: [16, 11, 13, 32, 12, 12, 11, 12, 10, 10], filas: [['Factura', 'Fecha', 'NIF proveedor', 'Proveedor', 'A pagar', 'Vencimiento', 'Estado', 'Pagada el', 'Días', 'Electrónica'], ...recibidas, ['', '', '', 'Periodo medio de pago (días)', '', '', '', '', { b: medio(recibidas, 8) }, '']] });
  return new Response(xlsx(hojas), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="estado-pagos-${anio}.xlsx"` } });
}
