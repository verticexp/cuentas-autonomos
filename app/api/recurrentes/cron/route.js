import { redis, leer } from '@/lib/redis';
import { error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { procesarRecurrente } from '@/lib/recurrentesServidor';
import { emisorDe } from '@/lib/calculos';
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
    if (emp.baja) continue;
    const u = { ...emp, empresa: emp.id };
    // El email, si toca y se puede: si falla, la plantilla lo recuerda y se reintenta mañana sin emitir otra factura.
    const enviar = (u2, f) => (emailListo() && emailValido(f.cliente.email)
      ? enviarFactura(u2, f, { para: f.cliente.email, asunto: asuntoFactura(f, emisorDe(f, u2)), mensaje: mensajeFactura(f, emisorDe(f, u2)), origen: req.nextUrl.origin })
      : Promise.resolve({}));
    for (const r of (await leer(u, 'recurrentes')) || []) {
      if (!tocaRecurrente(r, dia) && !r.envio) continue;
      const x = await procesarRecurrente(u, r.id, dia, { enviar }).catch((e) => ({ fallo: e.message }));
      if (x.creada) creadas.push(x.creada);
      if (x.fallo) fallos.push(`${emp.id}/${r.id}: ${x.fallo}`);
      if (x.falloEnvio) fallos.push(`${emp.id}/${r.id}: envío: ${x.falloEnvio}`);
    }
  }
  return Response.json({ ok: true, creadas, fallos });
}
