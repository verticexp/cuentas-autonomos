// Emails de invitación y de confirmación del email. Las plantillas viven en lib/correos.js. Sin imagen de seguimiento.
import { componer, enviarCorreo } from './correos.js';

// El idioma de la petición (quien se registra o quien invita, lib/i18n.js): el de quien recibe el correo aún no se sabe.
// Fuera de una petición (pruebas, scripts), ninguno: castellano.
const idiomaPeticion = () => import('./idiomaServidor.js').then((m) => m.idiomaActual()).catch(() => undefined);

export const asuntoInvitacion = ({ quien, empresa }) => componer('invitacion', { quien, empresa }).asunto;
export const htmlInvitacion = (d) => componer('invitacion', d).html;
export const htmlConfirmacion = (d) => componer('confirmar-email', d).html;

export async function enviarConfirmacion({ para, nombre, url }) {
  const r = await enviarCorreo('confirmar-email', { para, datos: { nombre, url }, idioma: await idiomaPeticion() });
  return r.error ? { aviso: r.error } : { enviado: true };
}

// Devuelve { enviado: true } o { aviso } con el motivo; nunca lanza (la invitación ya está creada).
export async function enviarInvitacion({ para, nombre, quien, empresa, url, responderA, dias }) {
  const r = await enviarCorreo('invitacion', { para, datos: { nombre, quien, empresa, url, dias }, responderA, idioma: await idiomaPeticion() });
  return r.error ? { aviso: r.error } : { enviado: true };
}

// Cliente «solo documentos» de un despacho (lib/documentos.js): la invitación la manda su gestoría.
export async function enviarInvitacionDocumentos({ para, nombre, despacho, url, responderA, dias }) {
  const r = await enviarCorreo('invitacion-documentos', { para, datos: { nombre, despacho, url, dias }, responderA, idioma: await idiomaPeticion() });
  return r.error ? { aviso: r.error } : { enviado: true };
}
