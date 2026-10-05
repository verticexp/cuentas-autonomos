import { randomBytes } from 'node:crypto';
import { redis, leer, guardar } from '@/lib/redis';
import { importes, numeroFactura, vencimiento } from '@/lib/calculos';
import { eur, fechaTexto, hoy } from '@/lib/formato';
import { facturaPdf } from '@/lib/pdf';
import { emailListo, emailValido, enviarEmail, htmlMensaje } from '@/lib/email';
import { enlacePago } from '@/lib/cobros';
import { stripeListo } from '@/lib/stripe';
import { tocaRecordatorio } from '@/lib/recordatorios';
import { avisosPush } from '@/lib/push';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Lo llama Vercel cada mañana (vercel.json → crons, con CRON_SECRET): envía los recordatorios de cobro que toquen
// y los avisos en el móvil.
export async function GET(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get('authorization') !== `Bearer ${secreto}`) return Response.json({ error: 'No autorizado' }, { status: 401 });
  const dia = hoy();
  // Avisos en el móvil (plazos de Hacienda y facturas vencidas), aunque no haya email configurado.
  const avisos = redis ? await avisosPush(dia) : 0;
  if (!redis || !emailListo()) return Response.json({ ok: true, enviados: 0, avisos, motivo: 'sin base de datos o sin email' });
  let enviados = 0;
  const fallos = [];
  for (const emp of Object.values((await redis.hgetall('empresas')) || {})) {
    const e = emp.emisor || {};
    const cada = Number(e.recordatorios) || 0;
    if (!cada || !e.nif || !e.iban) continue;
    const u = { ...emp, empresa: emp.id };
    for (const f0 of (await leer(u, 'facturas')) || []) {
      if (!tocaRecordatorio(f0, { plazo: e.plazo, cada }, dia) || !emailValido(f0.cliente.email)) continue;
      const { f, ruta } = stripeListo() ? await enlacePago(u, f0) : { f: f0 };
      const num = numeroFactura(f);
      const token = randomBytes(16).toString('hex');
      const mensaje = [
        'Hola,',
        `Te recordamos que la factura ${num} por ${eur(importes(f).total)} venció el ${fechaTexto(vencimiento(f, e.plazo))} y aún no nos consta el pago.`,
        ruta && `Puedes pagarla con tarjeta o Bizum aquí: ${req.nextUrl.origin}${ruta}`,
        `${ruta ? 'O' : 'Puedes pagarla'} por transferencia a ${e.iban}, indicando la factura ${num}.`,
        'Si ya la has pagado, ignora este mensaje.',
        `Gracias,\n${e.nombre || emp.nombre}`,
      ].filter(Boolean).join('\n\n');
      const r = await enviarEmail({
        para: f.cliente.email,
        asunto: `Recordatorio: factura ${num} pendiente de pago`,
        html: htmlMensaje(mensaje, `${req.nextUrl.origin}/api/abierta/${token}`),
        adjuntos: [{ nombre: `${num}.pdf`, datos: await facturaPdf(f, e, emp.marca) }],
      });
      if (r.error) { fallos.push(`${emp.id}/${f.id}: ${r.error}`); continue; }
      await redis.hset('factura-envios', { [token]: { empresa: emp.id, id: f.id } });
      await guardar(u, 'facturas', { ...f, envios: [...(f.envios || []), { tipo: 'recordatorio', fecha: new Date().toISOString(), para: f.cliente.email, token }] });
      enviados += 1;
    }
  }
  return Response.json({ ok: true, enviados, fallos, avisos });
}
