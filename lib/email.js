// Envío de emails con Resend (https://resend.com). Hace falta RESEND_API_KEY en Vercel;
// RESEND_FROM es el remitente (un dominio verificado en Resend). Sin dominio propio, Resend solo deja enviar a tu propio email.
export const emailListo = () => Boolean(process.env.RESEND_API_KEY);

export async function enviarEmail({ para, asunto, html, responderA, adjuntos = [] }) {
  if (!emailListo()) return { error: 'El envío de emails aún no está configurado (falta RESEND_API_KEY en Vercel)' };
  const r = await fetch(process.env.RESEND_URL || 'https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Netto <onboarding@resend.dev>',
      to: [para], subject: asunto, html,
      ...(responderA ? { reply_to: responderA } : {}),
      attachments: adjuntos.map((a) => ({ filename: a.nombre, content: Buffer.from(a.datos).toString('base64') })),
    }),
  }).catch(() => null);
  const d = await r?.json().catch(() => ({}));
  if (!r?.ok) return { error: `No se pudo enviar el email${d?.message ? `: ${d.message}` : ''}` };
  return { id: d.id };
}

export const emailValido = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// El mensaje en párrafos y una imagen invisible de 1 px que avisa cuando el cliente lo abre.
export const htmlMensaje = (mensaje, pixel) => `<div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;line-height:1.5;color:#17201D">${
  String(mensaje).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>').replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)}</p>`).join('')}</div>${pixel ? `<img src="${pixel}" width="1" height="1" alt="" style="display:block;border:0">` : ''}`;
