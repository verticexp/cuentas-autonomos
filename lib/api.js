import { redis } from './redis.js';
import { bloquearPorEmail, desbloqueada, modoBloqueo, usuarioActual } from './auth.js';
import { puede } from './permisos.js';

export const error = (msg, status = 400) => Response.json({ error: msg }, { status });
export const cuerpo = (req) => req.json().catch(() => ({}));

// Devuelve el usuario o una respuesta de error lista para devolver.
// admin: solo el administrador de la app (crea empresas). permiso: el que hace falta dentro de la empresa.
export async function usuarioApi({ admin = false, permiso } = {}) {
  if (!redis) return { res: error('Base de datos no conectada', 503) };
  const u = await usuarioActual();
  if (!u || (admin && !u.admin)) return { res: error('No autorizado', 401) };
  if (bloquearPorEmail(u)) return { res: error('Confirma tu email para seguir: te hemos enviado un enlace.', 403) };
  // Bloqueo de pantalla (auditoría F07): la API exige lo mismo que las páginas. Sin desbloqueo, 423 (la app lo pide
  // otra vez); desbloquear va por /api/login y /api/passkey, que no pasan por aquí.
  const modo = modoBloqueo();
  if (modo !== 'off' && !(await desbloqueada())) {
    if (modo === 'activo') return { res: Response.json({ error: 'La app está bloqueada: desbloquéala para seguir.', bloqueada: true }, { status: 423 }) };
    console.warn(`[bloqueo] API sin desbloqueo: ${u.id}`);
  }
  if (permiso && !puede(u, permiso)) return { res: error('No tienes permiso para esto. Pídeselo al administrador de tu empresa.', 403) };
  return { u };
}
