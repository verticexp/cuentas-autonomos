// Correo de gastos recibido por Resend: cada empresa tiene una dirección <alias>@fisqal.com (lib/buzon.js) a la que
// reenviar sus facturas. Resend avisa al webhook (app/api/buzon) con el evento email.received, firmado con Svix; el aviso
// trae solo metadatos y el cuerpo y los adjuntos se piden aparte a su API. El aviso se verifica sobre el cuerpo crudo
// antes de interpretarlo.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { conPlazo, proveedorJSON } from './llamadas.js';
import { MAX_BYTES, TIPOS, tipoReal } from './justificantes.js';

export const DOMINIO_ENTRANTE = () => (process.env.CORREO_ENTRANTE_DOMINIO || 'fisqal.com').toLowerCase();
export const correoEntranteListo = () => Boolean(process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET);
const cadena = (v) => typeof v === 'string' ? v : '';
const uuid = (v) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const patronAlias = /^[a-z0-9][a-z0-9-]{2,40}-[a-z0-9]{10}$/;

// Firma Svix del aviso: HMAC-SHA256 de «id.timestamp.cuerpo» con el secreto (whsec_<base64>), cinco minutos de margen.
export function firmaResend(cuerpo, cabeceras, secreto = process.env.RESEND_WEBHOOK_SECRET, ahora = Date.now()) {
  try {
    if (typeof cuerpo !== 'string' || typeof secreto !== 'string' || !secreto.startsWith('whsec_')) return false;
    const base64 = secreto.slice(6);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || (base64.includes('=') && base64.length % 4 !== 0)) return false;
    const clave = Buffer.from(base64, 'base64');
    // Buffer acepta base64 incompleto o con basura; el secreto debe poder reconstruirse sin cambios.
    if (!clave.length || clave.toString('base64').replace(/=+$/, '') !== base64.replace(/=+$/, '')) return false;
    const id = cabeceras.get('svix-id'), tiempo = cabeceras.get('svix-timestamp'), firmas = cabeceras.get('svix-signature');
    if (!id || typeof tiempo !== 'string' || !/^\d+$/.test(tiempo) || typeof firmas !== 'string') return false;
    if (!Number.isSafeInteger(Number(tiempo)) || !Number.isFinite(ahora) || Math.abs(ahora / 1000 - Number(tiempo)) > 300) return false;
    const esperada = Buffer.from(createHmac('sha256', clave).update(`${id}.${tiempo}.${cuerpo}`).digest('base64'));
    return firmas.split(/\s+/).some((firma) => {
      if (!firma.startsWith('v1,')) return false;
      const recibida = Buffer.from(firma.slice(3));
      return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
    });
  } catch { return false; }
}

const tipoDe = (v) => cadena(v).split(';', 1)[0].trim().toLowerCase();
const normalizarAdjunto = (a) => ({
  id: cadena(a.id),
  nombre: cadena(a.filename).replace(/[/\\\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 120),
  tipo: tipoDe(a.content_type),
  disposicion: cadena(a.content_disposition).trim().toLowerCase() || null,
  contentId: cadena(a.content_id) || null,
  tamano: typeof a.size === 'number' && Number.isFinite(a.size) && a.size >= 0 ? a.size : null,
  ...(typeof a.download_url === 'string' ? { url: a.download_url } : {}),
});
const normalizarAdjuntos = (lista) => Array.isArray(lista)
  ? lista.filter((a) => a && typeof a === 'object' && !Array.isArray(a)).map(normalizarAdjunto) : [];

// El aviso email.received → { emailId, de, para, asunto, adjuntos } o null (otro evento o JSON roto).
export function leerAviso(cuerpoTexto) {
  try {
    const aviso = JSON.parse(cuerpoTexto);
    if (aviso?.type !== 'email.received' || !uuid(aviso.data?.email_id)) return null;
    const d = aviso.data;
    const para = [...new Set([d.to, d.cc, d.bcc, d.received_for].flatMap((v) => Array.isArray(v) ? v : [])
      .filter((v) => typeof v === 'string').map((v) => v.trim().toLowerCase()))];
    return { emailId: d.email_id, de: cadena(d.from).trim().toLowerCase(), para, asunto: cadena(d.subject), adjuntos: normalizarAdjuntos(d.attachments) };
  } catch { return null; }
}

// El alias de la empresa entre los destinatarios (con nombre visible, mayúsculas o «+algo»), o null.
export function aliasDe(direcciones, dominio = DOMINIO_ENTRANTE()) {
  for (const direccion of Array.isArray(direcciones) ? direcciones : [direcciones]) {
    const s = cadena(direccion).trim().toLowerCase();
    const correo = s.includes('<') ? s.match(/<([^<>]+)>\s*$/)?.[1]?.trim() : s;
    const partes = correo?.match(/^([^\s@<>]+)@([^\s@<>]+)$/);
    if (!partes || partes[2] !== cadena(dominio).toLowerCase()) continue;
    const alias = partes[1].split('+', 1)[0];
    if (patronAlias.test(alias)) return alias;
  }
  return null;
}

// Alias nuevo: el nombre de la empresa y 10 caracteres al azar (sin los que se confunden al dictarlo).
export function nuevoAlias(nombreEmpresa) {
  const slug = cadena(nombreEmpresa).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20).replace(/-+$/, '');
  const alfabeto = 'abcdefghjkmnpqrstuvwxyz23456789';
  const limite = 256 - 256 % alfabeto.length;
  let sufijo = '';
  // Descartar el sobrante evita favorecer unas letras al reducir los bytes al alfabeto.
  while (sufijo.length < 10) {
    for (const b of randomBytes(16)) {
      if (b < limite) sufijo += alfabeto[b % alfabeto.length];
      if (sufijo.length === 10) break;
    }
  }
  return `${slug.length >= 3 ? slug : 'facturas'}-${sufijo}`;
}

async function recepcion(emailId, ruta = '') {
  if (!uuid(emailId)) throw new Error('El identificador del correo no es un UUID válido.');
  if (!process.env.RESEND_API_KEY) throw new Error('El correo entrante aún no está configurado (falta RESEND_API_KEY).');
  const base = (process.env.RESEND_RECEPCION_URL || 'https://api.resend.com/emails/receiving').replace(/\/+$/, '');
  const { d } = await proveedorJSON('Resend', `${base}/${emailId}${ruta}`, {
    method: 'GET', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  }, { idempotente: true });
  return d;
}

// El correo entero (texto, HTML, cabecera From con su nombre y SPF/DKIM/DMARC calculados por Resend).
export async function leerCorreo(emailId) {
  const d = await recepcion(emailId);
  const desde = Object.entries(d.headers || {}).find(([k]) => k.toLowerCase() === 'from')?.[1];
  const nombre = cadena(desde).match(/^\s*(.*?)\s*<[^<>]+>\s*$/)?.[1] || '';
  const a = d.authentication;
  return {
    de: cadena(d.from).trim().toLowerCase(), deNombre: nombre.replace(/^"|"$/g, '').trim(),
    asunto: cadena(d.subject), texto: cadena(d.text), html: cadena(d.html),
    autenticacion: a && typeof a === 'object' && !Array.isArray(a)
      ? { spf: cadena(a.spf) || null, dkim: cadena(a.dkim) || null, dmarc: cadena(a.dmarc) || null } : null,
    adjuntos: normalizarAdjuntos(d.attachments),
  };
}

// Los adjuntos con su URL de descarga firmada (vale una hora).
export async function listarAdjuntos(emailId) {
  const d = await recepcion(emailId, '/attachments');
  return normalizarAdjuntos(d.data);
}

function claseAdjunto(a) {
  const tipo = tipoDe(a?.tipo);
  if (tipo === 'application/pdf' || (tipo === 'application/octet-stream' && /\.pdf$/i.test(cadena(a.nombre)))) return 'pdf';
  if (tipo.startsWith('image/') && Object.hasOwn(TIPOS, tipo)) return 'imagen';
  if (tipo === 'application/xml' || tipo === 'text/xml' || (tipo === 'application/octet-stream' && /\.(xml|xsig)$/i.test(cadena(a.nombre)))) return 'xml';
  return null;
}

// Lo que merece la pena leer: PDF, fotos que no son logos ni firmas incrustadas y facturas electrónicas; como mucho 10.
export function adjuntosUtiles(lista) {
  const utiles = [];
  for (const a of Array.isArray(lista) ? lista : []) {
    const clase = claseAdjunto(a);
    if (!clase || (a.tamano != null && a.tamano > MAX_BYTES)) continue;
    if (clase === 'imagen' && (cadena(a.disposicion).toLowerCase() === 'inline' || a.contentId || (a.tamano != null && a.tamano < 15000))) continue;
    utiles.push({ ...a, clase });
    if (utiles.length === 10) break;
  }
  return utiles;
}

// Descarga un adjunto (solo de Resend, sin redirecciones y cortando al pasar del tope) y comprueba su tipo real.
export async function descargarAdjunto(adjunto, { maxBytes = MAX_BYTES, fetch = globalThis.fetch } = {}) {
  let lector;
  try {
    const url = new URL(adjunto?.url);
    if (url.protocol !== 'https:' || !(url.hostname === 'resend.com' || url.hostname.endsWith('.resend.com')) || url.username || url.password) {
      return { error: 'La dirección del adjunto no pertenece a Resend.' };
    }
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return { error: 'El límite de tamaño del adjunto no es válido.' };
    const clase = adjunto.clase || claseAdjunto(adjunto);
    if (!['pdf', 'imagen', 'xml'].includes(clase)) return { error: 'El tipo del adjunto no es compatible.' };
    const signal = AbortSignal.timeout(20000);
    const r = await conPlazo(() => fetch(url.href, { redirect: 'error', signal }), signal);
    if (!r.ok || !r.body) return { error: 'No se ha podido descargar el adjunto.' };
    lector = r.body.getReader();
    const trozos = [];
    let tamano = 0;
    // El tamaño anunciado puede faltar o ser falso; el límite se aplica mientras llega el cuerpo.
    while (true) {
      const { done, value } = await conPlazo(() => lector.read(), signal);
      if (done) break;
      tamano += value.byteLength;
      if (tamano > maxBytes) return { error: 'El adjunto supera el tamaño máximo permitido.' };
      trozos.push(value);
    }
    const bytes = new Uint8Array(tamano);
    let offset = 0;
    for (const trozo of trozos) { bytes.set(trozo, offset); offset += trozo.byteLength; }
    const real = tipoReal(bytes);
    if ((clase === 'pdf' && real !== 'application/pdf') || (clase === 'imagen' && (!real?.startsWith('image/') || !Object.hasOwn(TIPOS, real)))) {
      return { error: 'El contenido del adjunto no coincide con su tipo.' };
    }
    if (clase === 'xml' && !/^\s*</u.test(new TextDecoder().decode(bytes))) return { error: 'El adjunto no contiene XML.' };
    return bytes;
  } catch { return { error: 'No se ha podido descargar el adjunto.' }; }
  finally {
    // Un fallo al soltar el lector no debe tapar lo descargado (ni el error de antes).
    if (lector) { void lector.cancel().catch(() => {}); try { lector.releaseLock(); } catch { /* ya suelto */ } }
  }
}

const entidades = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function sinEntidades(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (original, entidad) => {
    if (entidad[0] !== '#') return entidades[entidad.toLowerCase()];
    const n = entidad[1].toLowerCase() === 'x' ? parseInt(entidad.slice(2), 16) : Number(entidad.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : original;
  });
}

// El correo con el que Gmail pide confirmar un reenvío automático: su código y el enlace (solo de Google), o null.
export function confirmacionGmail({ de, asunto, texto, html }) {
  if (cadena(de).trim().toLowerCase() !== 'forwarding-noreply@google.com') return null;
  const codigo = `${cadena(asunto)}\n${cadena(texto)}\n${textoPlano(html)}`.match(/(?<!\d)\d{6,12}(?!\d)/)?.[0];
  if (!codigo) return null;
  for (const coincidencia of sinEntidades(`${cadena(texto)}\n${cadena(html)}`).matchAll(/https:\/\/[^\s<>"']+/gi)) {
    try {
      const url = new URL(coincidencia[0].replace(/[),.;!?]+$/, ''));
      if (['mail.google.com', 'mail-settings.google.com', 'isolated.mail.google.com'].includes(url.host) && !url.username && !url.password) {
        return { codigo, enlace: url.href };
      }
    } catch { /* Un enlace roto no impide buscar el siguiente. */ }
  }
  return null;
}

// Texto legible de un correo en HTML (para las facturas que vienen en el cuerpo, sin adjunto).
export function textoPlano(html) {
  return sinEntidades(cadena(html).replace(/<!--[^]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '')
    .replace(/<br\b[^>]*>|<\/(?:p|div|tr)\s*>/gi, '\n').replace(/<[^>]*>/g, ' '))
    .replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
}
