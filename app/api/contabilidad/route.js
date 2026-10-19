import { clave, leer, redis } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { fiscalDe } from '@/lib/empresa';
import { contabilidadXlsx, informe } from '@/lib/contabilidad';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

// Excel de la contabilidad: pérdidas y ganancias, balance, libro diario, sumas y saldos y bienes de inversión. ?anio=2026&p=3 (sin p: todo el año)
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const h = hoy();
  const anio = Number(q.get('anio')) || Number(h.slice(0, 4));
  const p = /^[1-4]$/.test(q.get('p') || '') ? q.get('p') : '';
  const [facturas, gastos, nominas, manuales, saldo, productos, ajustes, albaranes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), redis?.get(clave(u, 'saldo')), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
  const d = informe({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], saldo, fiscal: fiscalDe(u), pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, anio, p, h);
  const nombre = `contabilidad-${anio}${p ? `-${p}T` : ''}.xlsx`;
  await auditar(u, 'Exportación a Excel', nombre);
  const cuerpo = contabilidadXlsx({ empresa: u.emisor?.nombre || u.empresaNombre || '', d });
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nombre}"` } });
}
