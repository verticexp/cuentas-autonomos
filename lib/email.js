// Envío de emails con Resend (https://resend.com). Hace falta RESEND_API_KEY en Vercel;
// RESEND_FROM es el remitente (un dominio verificado en Resend). Sin dominio propio, Resend solo deja enviar a tu propio email.
import { proveedorJSON } from './llamadas.js';

export const emailListo = () => Boolean(process.env.RESEND_API_KEY);

// texto: versión en texto plano (lib/correos.js la genera). etiqueta: el tipo de correo, para filtrar en Resend.
export async function enviarEmail({ para, asunto, html, texto, etiqueta, responderA, adjuntos = [] }) {
  if (!emailListo()) return { error: 'El envío de emails aún no está configurado (falta RESEND_API_KEY en Vercel)' };
  try {
    const { d } = await proveedorJSON('Resend', process.env.RESEND_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Fisquo <no-reply@fisquo.com>',
        to: [para], subject: asunto, html,
        ...(texto ? { text: texto } : {}),
        ...(etiqueta ? { tags: [{ name: 'correo', value: etiqueta }] } : {}),
        ...(responderA ? { reply_to: responderA } : {}),
        attachments: adjuntos.map((a) => ({ filename: a.nombre, content: Buffer.from(a.datos).toString('base64') })),
      }),
    });
    return { id: d.id };
  } catch (e) { console.error('[email] No se ha podido enviar:', e); return { error: motivoEnvio(e) }; }
}

// Qué puede hacer quien envía. Resend rechaza una dirección mal escrita (400/422 que hablan del campo «to»): reintentar no
// sirve. 401/403 o un remitente rechazado son de configuración (clave o dominio en Resend). Lo demás suele ser pasajero.
export function motivoEnvio(e) {
  const texto = String(e?.message || '');
  if ([400, 422].includes(e?.status) && /\bto\b/i.test(texto)) return 'No se ha podido enviar: revisa que la dirección de email esté bien escrita.';
  if ([401, 403].includes(e?.status) || ([400, 422].includes(e?.status) && /\bfrom\b|domain|dominio/i.test(texto))) return 'El envío de emails no está bien configurado. Escríbenos desde Ajustes › Ayuda y contacto y lo revisamos.';
  return 'No se ha podido enviar el email. Inténtalo de nuevo en unos minutos.';
}

export const emailValido = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// El mensaje en párrafos y una imagen invisible de 1 px que avisa cuando el cliente lo abre.
export const htmlMensaje = (mensaje, pixel) => `<div style="font-family:-apple-system,Arial,sans-serif;font-size:15px;line-height:1.5;color:#17201D">${
  String(mensaje).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>').replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`)}</p>`).join('')}</div>${pixel ? `<img src="${pixel}" width="1" height="1" alt="" style="display:block;border:0">` : ''}`;
