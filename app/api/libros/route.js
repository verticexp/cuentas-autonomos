import { concurrencia, respuesta429 } from '@/lib/limite';
import { leer } from '@/lib/redis';
import { usuarioApi } from '@/lib/api';
import { actividadesDe, fiscalDe } from '@/lib/empresa';
import { librosRegistro, librosXlsx } from '@/lib/librosRegistro';
import { hoy } from '@/lib/formato';
import { auditar } from '@/lib/auditoria';
import { delosAnios } from '@/lib/indices';

export const dynamic = 'force-dynamic';

// Libros registro del IVA y del IRPF de un año (?anio=2026), en el formato de la AEAT: un .xlsx con un libro por hoja.
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: 'resumen' });
  if (res) return res;
  const resultado = await concurrencia('exportar', u.empresa, 1, 300000, async () => {
    const h = hoy();
    const anio = Number(req.nextUrl.searchParams.get('anio')) || Number(h.slice(0, 4));
    const [nominas, productos, ajustes, albaranes] = await Promise.all([leer(u, 'nominas'), leer(u, 'productos'), leer(u, 'stock'), leer(u, 'albaranes')]);
    // Informe de capacidad E01: el año y los bienes de inversión; todo el histórico solo si hay que valorar el
    // inventario a cierre (variación de existencias de un año cerrado de un autónomo con productos con stock).
    const inventario = fiscalDe(u).tipo !== 'sociedad' && `${anio}-12-31` < h && (productos || []).some((p) => !p.servicio);
    const { facturas, gastos } = inventario ? { facturas: await leer(u, 'facturas'), gastos: await leer(u, 'gastos') } : await delosAnios(u, [anio]);
    const l = librosRegistro({ facturas: facturas || [], gastos: gastos || [], nominas: nominas || [], productos: productos || [], ajustes: ajustes || [], albaranes: albaranes || [], fiscal: fiscalDe(u), actividades: actividadesDe(u),
      empresa: { nombre: u.emisor?.nombre || u.empresaNombre || '', nif: u.emisor?.nif || '' } }, anio, h);
    await auditar(u, 'Libros registro', `Descarga de ${anio}`);
    const ascii = l.fichero.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '');
    return new Response(librosXlsx(l), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(l.fichero)}` } });
  });
  return resultado?.ocupado ? respuesta429(5, 'Ya hay una exportación en curso en tu empresa. Espera a que termine y prueba de nuevo.') : resultado;
}
