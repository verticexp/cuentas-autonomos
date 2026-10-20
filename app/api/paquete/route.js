import { DETALLE } from '@/lib/permisos';
import { concurrencia, respuesta429 } from '@/lib/limite';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { auditar } from '@/lib/auditoria';
import { construirPaquete, enviarPaqueteGestoria } from '@/lib/gestoriaEnvio';

export const dynamic = 'force-dynamic';

const periodo = (anio, t) => ({ anio: Number(anio) || new Date().getFullYear(), t: Math.min(4, Math.max(1, Number(t) || 1)) });
const ocupado = () => respuesta429(5, 'Ya hay una exportación en curso en tu empresa. Espera a que termine y prueba de nuevo.');

// Paquete trimestral para la gestoría. ?anio=2026&t=3&formato=zip|xlsx|pdf (por defecto, un .zip con los dos).
export async function GET(req) {
  const { u, res } = await usuarioApi({ permiso: DETALLE });
  if (res) return res;
  const resultado = await concurrencia('exportar', u.empresa, 1, 300000, async () => {
    const q = req.nextUrl.searchParams;
    const { anio, t } = periodo(q.get('anio'), q.get('t'));
    const formato = ['xlsx', 'pdf'].includes(q.get('formato')) ? q.get('formato') : 'zip';
    const p = await construirPaquete(u, anio, t, formato);
    return new Response(p.cuerpo, { headers: { 'Content-Type': p.tipo, 'Content-Disposition': `attachment; filename="${p.nombre}.${p.ext}"` } });
  });
  return resultado?.ocupado ? ocupado() : resultado;
}

// Mandar el paquete de un trimestre a la gestoría de la empresa (Ajustes › Tu gestoría). { anio, t }
export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'empresa' });
  if (res) return res;
  const b = await cuerpo(req);
  const { anio, t } = periodo(b?.anio, b?.t);
  const resultado = await concurrencia('exportar', u.empresa, 1, 300000, async () => {
    const r = await enviarPaqueteGestoria(u, { anio, t });
    if (r.error) return error(r.error);
    await auditar(u, 'Paquete enviado a la gestoría', `${t}T ${anio} · ${r.para}`);
    return Response.json(r);
  });
  return resultado?.ocupado ? ocupado() : resultado;
}
