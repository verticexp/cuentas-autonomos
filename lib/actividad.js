// Actividad para el panel del administrador de Netto (/admin): qué personas y empresas entran cada día.
// Solo ids internos, nada de datos fiscales. Una escritura al día por persona y empresa en cada instancia del servidor.
import { redis } from './redis.js';

const GUARDAR = 100 * 86400; // los días se borran solos a los 100 días
const vistos = new Set();
export const diaDe = (d = new Date()) => d.toISOString().slice(0, 10);

export async function apuntarActividad(uid, empresa, hoy = new Date()) {
  const dia = diaDe(hoy), k = `${dia}:${uid}:${empresa}`;
  if (!redis || !uid || !empresa || vistos.has(k)) return;
  if (vistos.size > 5000) vistos.clear();
  vistos.add(k);
  // Nunca debe impedir entrar: si falla, se intenta en la siguiente petición.
  try {
    await redis.multi()
      .sadd(`actividad:${dia}`, uid).expire(`actividad:${dia}`, GUARDAR)
      .sadd(`actividad-empresas:${dia}`, empresa).expire(`actividad-empresas:${dia}`, GUARDAR)
      .hset('ultima-actividad', { [empresa]: dia })
      .exec();
  } catch { vistos.delete(k); }
}

// { 'AAAA-MM-DD': { usuarios: [ids], empresas: [ids] } } de los últimos `dias` días (hoy incluido).
export async function actividadReciente(dias = 30, hoy = new Date()) {
  const lista = Array.from({ length: dias }, (_, i) => diaDe(new Date(hoy.getTime() - i * 86400000)));
  const datos = await Promise.all(lista.map((d) => Promise.all([redis.smembers(`actividad:${d}`), redis.smembers(`actividad-empresas:${d}`)])));
  return Object.fromEntries(lista.map((d, i) => [d, { usuarios: datos[i][0] || [], empresas: datos[i][1] || [] }]));
}

export const ultimaActividad = async () => (await redis.hgetall('ultima-actividad')) || {};
