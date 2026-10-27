import { usuarioApi, error } from '@/lib/api';
import { leerUno } from '@/lib/redis';
import { reciboNominaPdf } from '@/lib/reciboNomina';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const id = new URL(req.url).searchParams.get('id');
  const nomina = id && await leerUno(u, 'nominas', id);
  if (!nomina || nomina.agrupada) return error('Esa nómina no existe', 404);
  const empleado = nomina.empleado ? await leerUno(u, 'empleados', nomina.empleado) : null;
  const pdf = await reciboNominaPdf({ nomina, empleado, empresa: u.emisor });
  const nombre = String(nomina.empleadoNombre || empleado?.nombre || 'trabajador').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trabajador';
  return new Response(pdf, { headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="nomina-${nomina.mes}-${nombre}.pdf"`,
    'Cache-Control': 'private, no-store',
  } });
}
