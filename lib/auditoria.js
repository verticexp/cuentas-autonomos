import { headers } from 'next/headers';
import { redis } from './redis.js';
import { registrarAcceso } from './despachos.js';

// Registro de acciones sensibles de cada empresa: auditoria:<empresa>, las últimas 1000.
// Lo ve el administrador de la empresa en Ajustes › Actividad. Nunca bloquea la acción: si falla, solo queda en el log.
// Lo que hace la gente de un despacho dentro de su cliente (u.viaDespacho, lib/auth.js) lleva el nombre del despacho.
const MAX = 1000;

// enGestoria: false cuando la ruta ya lo apunta en Tu gestoría con su propio texto (app/api/despacho).
export async function auditar(u, accion, detalle = '', { enGestoria = true } = {}) {
  if (!redis || !u?.empresa) return;
  try {
    const h = await headers();
    const ip = h.get('x-real-ip') || h.get('x-forwarded-for')?.split(',')[0].trim() || '';
    const k = `auditoria:${u.empresa}`;
    await redis.lpush(k, { fecha: new Date().toISOString(), quien: u.id, nombre: u.nombre, email: u.email, accion, detalle: String(detalle).slice(0, 200), ip, ...(u.viaDespacho ? { despacho: u.viaDespacho.nombre } : {}) });
    await redis.ltrim(k, 0, MAX - 1);
    // Y en Ajustes › Tu gestoría, que es donde el cliente mira lo que ha hecho su gestoría.
    if (u.viaDespacho && enGestoria) await registrarAcceso(u.empresa, { ...u, despachoNombre: u.viaDespacho.nombre }, accion, detalle);
  } catch (e) {
    console.warn('[auditoria]', e.message);
  }
}

export const leerAuditoria = async (empresa, n = 200) => (redis ? (await redis.lrange(`auditoria:${empresa}`, 0, n - 1)) || [] : []);
