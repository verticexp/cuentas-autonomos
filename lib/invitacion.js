// Email de invitación: quién invita, a qué empresa, un botón grande y el enlace en texto. Sin imagen de seguimiento.
import { enviarEmail } from './email.js';

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Sin saltos de línea en el asunto (cabecera del email).
const linea = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

// Sin nombre de empresa propio: «X te ha invitado a unirte a su empresa en Netto».
const destino = (empresa, f = (s) => s) => (linea(empresa) ? f(linea(empresa)) : 'unirte a su empresa');
export const asuntoInvitacion = ({ quien, empresa }) => linea(`${quien} te ha invitado a ${destino(empresa)} en Netto`);

export function htmlInvitacion({ nombre, quien, empresa, url, dias = 7 }) {
  const u = esc(url);
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;color:#0F1F1B;background:#FAFAF8;padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:16px">
<tr><td style="padding:28px 24px">
<p style="margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:-0.02em">Netto</p>
<p style="margin:0 0 12px">Hola, ${esc(nombre)}:</p>
<p style="margin:0 0 24px"><strong>${esc(quien)}</strong> te ha invitado a ${destino(empresa, (e) => `<strong>${esc(e)}</strong>`)} en Netto. Elige tu contraseña para entrar.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="border-radius:12px;background:#0F1F1B">
<a href="${u}" style="display:block;padding:16px 24px;color:#FFFFFF;font-size:17px;font-weight:600;text-decoration:none;border-radius:12px">Aceptar la invitación</a>
</td></tr></table>
<p style="margin:24px 0 6px;font-size:14px;color:#646B67">Si el botón no funciona, copia este enlace en el navegador:</p>
<p style="margin:0 0 20px;font-size:14px;word-break:break-all"><a href="${u}" style="color:#0F1F1B">${u}</a></p>
<p style="margin:0;font-size:14px;color:#646B67">El enlace vale ${dias} días y solo se puede usar una vez. Si no esperabas este email, ignóralo.</p>
</td></tr></table></div>`;
}

// Devuelve { enviado: true } o { aviso } con el motivo; nunca lanza (la invitación ya está creada).
export async function enviarInvitacion({ para, nombre, quien, empresa, url, responderA, dias }) {
  const r = await enviarEmail({ para, asunto: asuntoInvitacion({ quien, empresa }), html: htmlInvitacion({ nombre, quien, empresa, url, dias }), responderA })
    .catch(() => ({ error: 'No se pudo enviar el email' }));
  return r.error ? { aviso: r.error } : { enviado: true };
}
