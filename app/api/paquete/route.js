import { leer } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { datosPaquete, nombrePaquete, paqueteXlsx } from '@/lib/paquete';
import { paquetePdf } from '@/lib/paquetePdf';
import { zip } from '@/lib/zip';

export const dynamic = 'force-dynamic';

// Paquete trimestral para la gestoría. ?anio=2026&t=3&formato=zip|xlsx|pdf (por defecto, un .zip con los dos).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const q = req.nextUrl.searchParams;
  const anio = Number(q.get('anio')) || new Date().getFullYear();
  const t = Math.min(4, Math.max(1, Number(q.get('t')) || 1));
  const [facturas, gastos, nominas] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas')]);
  const d = datosPaquete(u, { facturas, gastos, nominas }, anio, t);
  const n = nombrePaquete(d);
  const formato = q.get('formato');
  const [cuerpo, tipo, ext] = formato === 'xlsx' ? [paqueteXlsx(d), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx']
    : formato === 'pdf' ? [await paquetePdf(d), 'application/pdf', 'pdf']
      : [zip([{ nombre: `${n}.xlsx`, datos: paqueteXlsx(d) }, { nombre: `${n}.pdf`, datos: await paquetePdf(d) }]), 'application/zip', 'zip'];
  return new Response(cuerpo, { headers: { 'Content-Type': tipo, 'Content-Disposition': `attachment; filename="${n}.${ext}"` } });
}
