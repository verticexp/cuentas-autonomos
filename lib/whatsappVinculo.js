// Fisquo por WhatsApp: qué teléfono es de qué usuario. Cada persona lo conecta desde Ajustes › WhatsApp: Fisquo le da un
// código de un solo uso y ella lo envía desde su WhatsApp al número de Fisquo. Como el mensaje sale de su propio
// WhatsApp, queda demostrado que el número es suyo (sin SMS ni plantillas de pago).
//   whatsapp:codigo:<CÓDIGO> → { usuario, empresa }   (10 minutos, un solo uso)
//   whatsapp:tel:<teléfono>  → { usuario, empresa, desde }
//   whatsapp:de:<usuario>    → teléfono
import { randomInt } from 'node:crypto';
import { redis } from './redis.js';
import { normalizarTelefono } from './whatsapp.js';

export const CODIGO_S = 10 * 60;
// Sin 0/O ni 1/I/L, que se confunden al leerlos.
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const nuevoCodigo = () => `FISQUO-${Array.from({ length: 6 }, () => LETRAS[randomInt(LETRAS.length)]).join('')}`;
// El mensaje del código, tal cual o con algo alrededor («Hola FISQUO-AB12CD»): el código en mayúsculas o no.
export const codigoEn = (texto) => String(texto || '').toUpperCase().match(/\bFISQUO-([A-HJ-NP-Z2-9]{6})\b/)?.[0] || null;

// Número de Fisquo para el enlace wa.me (WHATSAPP_NUMERO, solo cifras con prefijo). null si no está configurado.
export const numeroFisquo = () => normalizarTelefono(process.env.WHATSAPP_NUMERO) || null;
export const enlaceWa = (numero, codigo) => (numero ? `https://wa.me/${numero}?text=${encodeURIComponent(codigo)}` : null);

// Código nuevo para este usuario y empresa; el anterior deja de valer.
export async function crearCodigo(u) {
  const antes = await redis.get(`whatsapp:codigo-de:${u.id}`);
  if (antes) await redis.del(`whatsapp:codigo:${antes}`);
  const codigo = nuevoCodigo();
  await redis.set(`whatsapp:codigo:${codigo}`, { usuario: u.id, empresa: u.empresa }, { ex: CODIGO_S });
  await redis.set(`whatsapp:codigo-de:${u.id}`, codigo, { ex: CODIGO_S });
  return codigo;
}

// El teléfono que envía el código queda vinculado a ese usuario. Si ya era de otra persona, pasa a esta (el mensaje
// demuestra que el número es suyo ahora) y la anterior lo pierde. → { usuario, empresa } o null si el código no vale.
export async function vincular(codigo, tel) {
  const k = `whatsapp:codigo:${codigo}`;
  const v = await redis.get(k);
  if (!v?.usuario) return null;
  await redis.del(k, `whatsapp:codigo-de:${v.usuario}`);
  const antes = await redis.get(`whatsapp:tel:${tel}`);
  if (antes?.usuario && antes.usuario !== v.usuario) await redis.del(`whatsapp:de:${antes.usuario}`);
  const suyo = await redis.get(`whatsapp:de:${v.usuario}`);
  if (suyo && suyo !== tel) await redis.del(`whatsapp:tel:${suyo}`);
  await redis.set(`whatsapp:tel:${tel}`, { usuario: v.usuario, empresa: v.empresa, desde: new Date().toISOString() });
  await redis.set(`whatsapp:de:${v.usuario}`, tel);
  return v;
}

export const vinculoDe = (tel) => redis.get(`whatsapp:tel:${tel}`);
export const telefonoDe = (usuario) => redis.get(`whatsapp:de:${usuario}`);

// También el código pendiente: al desconectar (o al recuperar la contraseña) no se puede conectar otro teléfono con él.
export async function desvincular(usuario) {
  const tel = await telefonoDe(usuario);
  if (tel) await redis.del(`whatsapp:tel:${tel}`);
  const codigo = await redis.get(`whatsapp:codigo-de:${usuario}`);
  await redis.del(`whatsapp:de:${usuario}`, `whatsapp:codigo-de:${usuario}`, ...(codigo ? [`whatsapp:codigo:${codigo}`] : []));
  return Boolean(tel);
}

// «34693818775» → «+34 693 818 775» (para enseñarlo en Ajustes).
export function telefonoBonito(tel) {
  const t = normalizarTelefono(tel);
  if (t.startsWith('34') && t.length === 11) return `+34 ${t.slice(2, 5)} ${t.slice(5, 8)} ${t.slice(8)}`;
  return t ? `+${t}` : '';
}
