import { redis } from './redis.js';

// Límite de intentos por IP o por usuario: limite:<tipo>:<quién> cuenta las veces en la ventana de tiempo.
// LIMITES: «activo» corta (429), «off» nada, si no solo lo registra (sin IP ni email en el log).
export const modoLimites = () => ({ activo: 'activo', off: 'off' })[process.env.LIMITES] || 'registrar';
export const MUCHOS = 'Demasiados intentos. Espera unos minutos.';
export const ipDe = (req) => req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'desconocida';

// true si se ha pasado del máximo y hay que cortar.
export async function pasado(tipo, quien, max, segundos) {
  const modo = modoLimites();
  if (modo === 'off' || !redis) return false;
  const k = `limite:${tipo}:${quien}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, segundos);
  if (n <= max) return false;
  if (modo === 'registrar') { console.warn(`[limite] ${tipo} ${n}/${max}`); return false; }
  return true;
}
