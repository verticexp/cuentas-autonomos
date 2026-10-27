import { clienteDelDespacho, periodoDe } from '@/lib/despachoApi';
import { datosInforme, informePdf } from '@/lib/informeCliente';
import { hoy } from '@/lib/formato';
import { pasado, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { u, d, ctx, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  if (await pasado('pdf', u.id, 120, 600)) return respuesta429(600);
  const fecha = hoy();
  const { anio, t } = periodoDe(q.get('anio'), q.get('t'), fecha);
  const datos = await datosInforme(ctx, anio, t, fecha);
  const pdf = await informePdf(datos, { despacho: d.nombre });
  const cliente = datos.empresa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'cliente';
  return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="informe-${t}T-${anio}-${cliente}.pdf"`, 'Cache-Control': 'no-store' } });
}
