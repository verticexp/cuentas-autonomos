import { redis, leer, guardar } from '@/lib/redis';
import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { crearFactura } from '@/lib/facturas';
import { emailListo, emailValido } from '@/lib/email';
import { asuntoFactura, enviarFactura, mensajeFactura } from '@/lib/envio';
import { tocaRecurrente } from '@/lib/recurrentes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel cada mañana (vercel.json → crons, con CRON_SECRET): crea las facturas del mes que toquen.
export async function GET(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return error('No autorizado', 401);
  if (!redis) return error('Base de datos no conectada', 503);
  const dia = hoy();
  const creadas = [];
  const fallos = [];
  for (const emp of Object.values((await redis.hgetall('empresas')) || {})) {
    const u = { ...emp, empresa: emp.id };
    for (const r of (await leer(u, 'recurrentes')) || []) {
      if (!tocaRecurrente(r, dia)) continue;
      // Se apunta antes de crearla: si algo falla a medias, nunca sale dos veces en el mismo mes.
      await guardar(u, 'recurrentes', { ...r, ultima: dia.slice(0, 7) });
      const { factura: f, error: e } = await crearFactura(u, { ...r.plantilla, fecha: dia, cobrada: false });
      if (e) { fallos.push(`${emp.id}/${r.id}: ${e}`); continue; }
      creadas.push(f.id);
      if (r.enviar && emailListo() && emailValido(f.cliente.email)) {
        const s = await enviarFactura(u, f, { para: f.cliente.email, asunto: asuntoFactura(f, u.emisor || {}), mensaje: mensajeFactura(f, u.emisor || {}), origen: req.nextUrl.origin });
        if (s.error) fallos.push(`${emp.id}/${f.id}: ${s.error}`);
      }
    }
  }
  return Response.json({ ok: true, creadas, fallos });
}
