import { clave, leer, redis } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { actividadesDe, fiscalDe, nombresActividad } from '@/lib/empresa';
import { contabilidadXlsx, informe } from '@/lib/contabilidad';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

// Excel de la contabilidad: pérdidas y ganancias, bienes de inversión y balance. ?anio=2026&p=3 (sin p: todo el año)
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const h = hoy();
  const anio = Number(q.get('anio')) || Number(h.slice(0, 4));
  const p = /^[1-4]$/.test(q.get('p') || '') ? q.get('p') : '';
  const [facturas, gastos, nominas, saldo] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), redis?.get(clave(u, 'saldo'))]);
  const d = informe({ facturas, gastos, nominas: nominas || [], saldo, fiscal: fiscalDe(u), pagos202: u.pagos202 || {}, nombres: nombresActividad(actividadesDe(u)) }, anio, p, h);
  const nombre = `contabilidad-${anio}${p ? `-${p}T` : ''}.xlsx`;
  await auditar(u, 'Exportación a Excel', nombre);
  const cuerpo = contabilidadXlsx({ empresa: u.emisor?.nombre || u.empresaNombre || '', nombre: d.nombre, actual: d.actual, anterior: d.anterior, libro: d.libro, bal: d.bal });
  return new Response(cuerpo, { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nombre}"` } });
}
