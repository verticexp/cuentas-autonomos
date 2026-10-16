import { concurrencia, respuesta429 } from '@/lib/limite';
import { leer } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { datosPaquete, nombrePaquete, paqueteXlsx } from '@/lib/paquete';
import { paquetePdf } from '@/lib/paquetePdf';
import { zip } from '@/lib/zip';
import { delosAnios } from '@/lib/indices';
import { justificantesParaZip } from '@/lib/justificantes';
import { trimestre } from '@/lib/calculos';

export const dynamic = 'force-dynamic';

// Los mismos gastos que el paquete (lib/paquete.js datosPaquete).
const gastosDelTrimestre = (gastos, anio, t) => (gastos || []).filter((g) => g.fecha?.startsWith(`${anio}-`) && trimestre(g.fecha) === t);

// Paquete trimestral para la gestoría. ?anio=2026&t=3&formato=zip|xlsx|pdf (por defecto, un .zip con los dos).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const resultado = await concurrencia('exportar', u.empresa, 1, 300000, async () => {
    const q = req.nextUrl.searchParams;
    const anio = Number(q.get('anio')) || new Date().getFullYear();
    const t = Math.min(4, Math.max(1, Number(q.get('t')) || 1));
    // Solo el año del trimestre y los bienes de inversión (informe de capacidad E01).
    const [{ facturas }, gastos, nominas] = await Promise.all([delosAnios(u, Array.from({ length: 5 }, (_, i) => anio - i)), leer(u, 'gastos'), leer(u, 'nominas')]);
    const d = datosPaquete(u, { facturas, gastos, nominas }, anio, t);
    const n = nombrePaquete(d);
    const formato = q.get('formato');
    const [cuerpo, tipo, ext] = formato === 'xlsx' ? [paqueteXlsx(d), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx']
      : formato === 'pdf' ? [await paquetePdf(d), 'application/pdf', 'pdf']
        // El .zip lleva también los justificantes de los gastos del trimestre.
        : [zip([{ nombre: `${n}.xlsx`, datos: paqueteXlsx(d) }, { nombre: `${n}.pdf`, datos: await paquetePdf(d) }, ...(await justificantesParaZip(u, gastosDelTrimestre(gastos, anio, t)))]), 'application/zip', 'zip'];
    return new Response(cuerpo, { headers: { 'Content-Type': tipo, 'Content-Disposition': `attachment; filename="${n}.${ext}"` } });
  });
  return resultado?.ocupado ? respuesta429(5, 'Ya hay una exportación en curso en tu empresa. Espera a que termine y prueba de nuevo.') : resultado;
}
