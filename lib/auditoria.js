import { headers } from 'next/headers';
import { redis } from './redis.js';

// Registro de acciones sensibles de cada empresa: auditoria:<empresa>, las últimas 1000.
// Lo ve el administrador de la empresa en Ajustes › Actividad. Nunca bloquea la acción: si falla, solo queda en el log.
const MAX = 1000;

export async function auditar(u, accion, detalle = '') {
  if (!redis || !u?.empresa) return;
  try {
    const h = await headers();
    const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || '';
    const k = `auditoria:${u.empresa}`;
    await redis.lpush(k, { fecha: new Date().toISOString(), quien: u.id, nombre: u.nombre, email: u.email, accion, detalle: String(detalle).slice(0, 200), ip });
    await redis.ltrim(k, 0, MAX - 1);
  } catch (e) {
    console.warn('[auditoria]', e.message);
  }
}

export const leerAuditoria = async (empresa, n = 200) => (redis ? (await redis.lrange(`auditoria:${empresa}`, 0, n - 1)) || [] : []);
