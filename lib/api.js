import { redis } from './redis.js';
import { usuarioActual } from './auth.js';
import { puede } from './permisos.js';

export const error = (msg, status = 400) => Response.json({ error: msg }, { status });
export const cuerpo = (req) => req.json().catch(() => ({}));

// Devuelve el usuario o una respuesta de error lista para devolver.
// admin: solo el administrador de la app (crea empresas). permiso: el que hace falta dentro de la empresa.
export async function usuarioApi({ admin = false, permiso } = {}) {
  if (!redis) return { res: error('Base de datos no conectada', 503) };
  const u = await usuarioActual();
  if (!u || (admin && !u.admin)) return { res: error('No autorizado', 401) };
  if (permiso && !puede(u, permiso)) return { res: error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403) };
  return { u };
}
