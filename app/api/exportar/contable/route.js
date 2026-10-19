import { leer } from '@/lib/redis';
import { error, usuarioApi } from '@/lib/api';
import { fiscalDe } from '@/lib/empresa';
import { generarAsientos } from '@/lib/asientos';
import { diarioA3, diarioContaplus, diarioContasol } from '@/lib/exportarContable';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const fecha = hoy();
  const anio = q.has('anio') ? Number(q.get('anio')) : Number(fecha.slice(0, 4));
  const formato = q.get('formato');
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return error('Año no válido');
  if (!['a3', 'contaplus', 'contasol'].includes(formato)) return error('Formato no válido: a3, contaplus o contasol');
  const [facturas, gastos, nominas, manuales, productos, ajustes, albaranes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'asientos'), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
  if (!facturas || !gastos) return error('No se han podido cargar los datos contables');
  const asientos = generarAsientos({ facturas, gastos, nominas: nominas || [], manuales: manuales || [], fiscal: fiscalDe(u), pagos130: u.pagos130 || {}, pres303: u.pres303 || {}, pagos202: u.pagos202 || {}, cuotaIS: u.cuotaIS || {}, productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [] }, fecha);
  const nombre = formato === 'a3' ? 'SUENLACE.DAT' : formato === 'contaplus' ? `XDiario-${anio}.txt` : `asientos-${anio}.csv`;
  let contenido;
  try {
    // Código en la gestoría: ?empresa=123; no es el identificador interno de Netto.
    contenido = formato === 'a3' ? diarioA3(asientos, { anio, empresa: q.get('empresa') ?? 1 }) : formato === 'contaplus' ? diarioContaplus(asientos, { anio }) : diarioContasol(asientos, { anio });
  } catch (e) {
    return error(e.message);
  }
  await auditar(u, 'Exportación contable', `${nombre} · ${anio} · ${formato}`);
  return new Response(contenido, { headers: { 'Content-Type': formato === 'contasol' ? 'text/csv; charset=utf-8' : 'text/plain; charset=us-ascii', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' } });
}
