import { redis } from './redis.js';
import { usuarioActual } from './auth.js';

export const error = (msg, status = 400) => Response.json({ error: msg }, { status });
export const cuerpo = (req) => req.json().catch(() => ({}));

// Devuelve el usuario o una respuesta de error lista para devolver.
export async function usuarioApi({ admin = false } = {}) {
  if (!redis) return { res: error('Base de datos no conectada', 503) };
  const u = await usuarioActual();
  if (!u || (admin && !u.admin)) return { res: error('No autorizado', 401) };
  return { u };
}
