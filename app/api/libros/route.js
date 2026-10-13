import { leer } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { librosRegistro, librosZip } from '@/lib/librosRegistro';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';

export const dynamic = 'force-dynamic';

// Libros registro del IVA y del IRPF de un año (?anio=2026), en el formato de la AEAT: un .zip con los tres .xlsx.
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const h = hoy();
  const anio = Number(req.nextUrl.searchParams.get('anio')) || Number(h.slice(0, 4));
  const [facturas, gastos, nominas, productos, ajustes] = await Promise.all([leer(u, 'facturas'), leer(u, 'gastos'), leer(u, 'nominas'), leer(u, 'productos'), leer(u, 'stock')]);
  const l = librosRegistro({ facturas: facturas || [], gastos: gastos || [], nominas: nominas || [], productos: productos || [], ajustes: ajustes || [], fiscal: fiscalDe(u), actividades: actividadesDe(u),
    empresa: { nombre: u.emisor?.nombre || u.empresaNombre || '', nif: u.emisor?.nif || '' } }, anio, h);
  await auditar(u, 'Libros registro', `Descarga de ${anio}`);
  return new Response(librosZip(l), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="libros-registro-${anio}.zip"` } });
}
