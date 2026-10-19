// Emails de invitación y de confirmación del email. Las plantillas viven en lib/correos.js. Sin imagen de seguimiento.
import { componer, enviarCorreo } from './correos.js';

export const asuntoInvitacion = ({ quien, empresa }) => componer('invitacion', { quien, empresa }).asunto;
export const htmlInvitacion = (d) => componer('invitacion', d).html;
export const htmlConfirmacion = (d) => componer('confirmar-email', d).html;

export async function enviarConfirmacion({ para, nombre, url }) {
  const r = await enviarCorreo('confirmar-email', { para, datos: { nombre, url } });
  return r.error ? { aviso: r.error } : { enviado: true };
}

// Devuelve { enviado: true } o { aviso } con el motivo; nunca lanza (la invitación ya está creada).
export async function enviarInvitacion({ para, nombre, quien, empresa, url, responderA, dias }) {
  const r = await enviarCorreo('invitacion', { para, datos: { nombre, quien, empresa, url, dias }, responderA });
  return r.error ? { aviso: r.error } : { enviado: true };
}
