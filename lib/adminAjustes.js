// Estado de la configuración para el panel /admin: remitente de los correos y su dominio en Resend.
import { promises as dns } from 'node:dns';

export const DOMINIO_FISQUO = 'fisquo.com';

// «Fisquo <no-reply@fisquo.com>» → { nombre: 'Fisquo', email: 'no-reply@fisquo.com', dominio: 'fisquo.com' }
export function leerRemitente(valor) {
  const s = String(valor || '').trim();
  const m = s.match(/^(.*?)\s*<([^>]+)>$/);
  const email = (m ? m[2] : s).trim().toLowerCase();
  const nombre = m ? m[1].replace(/^"|"$/g, '').trim() : '';
  const dominio = email.includes('@') ? email.split('@').pop() : '';
  return { nombre, email, dominio };
}

// Avisos legibles sobre el remitente: marca antigua, dominio ajeno o sin nombre visible.
export function avisosRemitente(valor) {
  if (!valor) return ['Falta RESEND_FROM: se usa «Fisquo <no-reply@fisquo.com>» por defecto.'];
  const r = leerRemitente(valor);
  const avisos = [];
  if (/netto/i.test(valor)) avisos.push('Todavía usa el nombre o el dominio antiguo (Netto). Cámbialo en Vercel.');
  else if (r.dominio && r.dominio !== DOMINIO_FISQUO) avisos.push(`El dominio del remitente es ${r.dominio}, no ${DOMINIO_FISQUO}.`);
  if (!r.nombre) avisos.push('No lleva nombre visible: en la bandeja de entrada solo se verá la dirección.');
  return avisos;
}

// Comprueba en el DNS público que el dominio tiene la firma de Resend (DKIM). Nunca lanza.
export async function dkimResend(dominio, resolver = dns.resolveTxt) {
  if (!dominio) return false;
  try {
    const txt = await Promise.race([resolver(`resend._domainkey.${dominio}`), new Promise((_, no) => setTimeout(() => no(new Error('tiempo')), 3000))]);
    return txt.some((partes) => partes.join('').includes('p='));
  } catch { return false; }
}
