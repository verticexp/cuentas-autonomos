import { leer } from '@/lib/redis';
import { usuarioApi, error } from '@/lib/api';
import { basesNominasCsv, mesValido } from '@/lib/nominas';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const mes = new URL(req.url).searchParams.get('mes');
  if (!mesValido(mes)) return error('Mes no válido');
  const [nominas, empleados] = await Promise.all([leer(u, 'nominas'), leer(u, 'empleados')]);
  if (!nominas?.some((n) => n.mes === mes)) return error('No hay nóminas de ese mes', 404);
  let csv;
  try { csv = basesNominasCsv(nominas, empleados || [], mes); }
  catch (e) { return error(e.message, 409); }
  return new Response(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="bases-${mes}.csv"`,
    'Cache-Control': 'private, no-store',
  } });
}
