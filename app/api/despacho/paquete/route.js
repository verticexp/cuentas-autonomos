import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { zip } from '@/lib/zip';
import { clienteDelDespacho, miDespacho, periodoDe } from '@/lib/despachoApi';
import { clientesVisibles, registrarAcceso } from '@/lib/despachos';
import { contextoCliente } from '@/lib/panelDespacho';
import { construirPaquete } from '@/lib/gestoriaEnvio';
import { concurrencia, respuesta429 } from '@/lib/limite';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const carpeta = (e) => `${e.emisor?.nif || e.id} ${e.emisor?.nombre || e.nombre || ''}`.trim().replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80);

// Paquete trimestral (el mismo de Ajustes › Tu gestoría). ?empresa=&anio=&t=&formato=zip|xlsx|pdf
// Sin empresa (?todos=1): un .zip con una carpeta por cliente, con su Excel y su PDF (sin justificantes, que pesan mucho).
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const { anio, t } = periodoDe(q.get('anio'), q.get('t'), hoy());
  if (q.get('todos') === '1') {
    const { u, d, quien, res } = await miDespacho();
    if (res) return res;
    const r = await concurrencia('despacho-paquetes', d.id, 1, 300000, async () => {
      const archivos = [];
      for (const c of await clientesVisibles(d, u.id)) {
        const ctx = contextoCliente(u, d, c.empresa);
        const [x, p] = await Promise.all([construirPaquete(ctx, anio, t, 'xlsx'), construirPaquete(ctx, anio, t, 'pdf')]);
        archivos.push({ nombre: `${carpeta(c.empresa)}/${x.nombre}.xlsx`, datos: x.cuerpo }, { nombre: `${carpeta(c.empresa)}/${p.nombre}.pdf`, datos: p.cuerpo });
        await registrarAcceso(c.id, quien, `Descargó el paquete del ${t}T ${anio}`);
      }
      if (!archivos.length) return error('Aún no tienes clientes', 404);
      return new Response(zip(archivos), { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="paquetes-${t}T-${anio}.zip"`, 'Cache-Control': 'no-store' } });
    });
    return r?.ocupado ? respuesta429(30, 'Ya se están preparando los paquetes: espera a que termine.') : r;
  }
  const { e, ctx, quien, res } = await clienteDelDespacho(q.get('empresa'));
  if (res) return res;
  const formato = ['xlsx', 'pdf'].includes(q.get('formato')) ? q.get('formato') : 'zip';
  const r = await concurrencia('exportar', e.id, 1, 300000, async () => {
    const p = await construirPaquete(ctx, anio, t, formato);
    await registrarAcceso(e.id, quien, `Descargó el paquete del ${t}T ${anio}`);
    return new Response(p.cuerpo, { headers: { 'Content-Type': p.tipo, 'Content-Disposition': `attachment; filename="${p.nombre}.${p.ext}"`, 'Cache-Control': 'no-store' } });
  });
  return r?.ocupado ? respuesta429(5, 'Ya hay una exportación en curso para este cliente. Espera a que termine.') : r;
}
