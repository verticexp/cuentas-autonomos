import { randomUUID } from 'node:crypto';
import { redis } from './redis.js';

// LIMITES: «activo» corta (429), «off» nada, si no solo registra (sin identificadores en el log).
export const modoLimites = () => ({ activo: 'activo', off: 'off' })[process.env.LIMITES] || 'registrar';
export const MUCHOS = 'Demasiados intentos. Espera unos minutos.';
export const ipDe = (req) => req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'desconocida';

export const CONTAR_VENTANA = `local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return n`;

// Cada adquisición renueva el TTL: también cubre trabajos que entran al final de la ventana.
// Una generación evita que un trabajo cuyo TTL venció libere la plaza de un trabajo nuevo.
export const TOMAR_PLAZA = `if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[2])
end
local n = redis.call('INCR', KEYS[1])
if n > tonumber(ARGV[1]) and ARGV[4] == 'activo' then
  redis.call('DECR', KEYS[1])
  return {n, ''}
end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return {n, redis.call('GET', KEYS[2])}`;
export const DEJAR_PLAZA = `if redis.call('GET', KEYS[2]) ~= ARGV[1] or redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
local n = redis.call('DECR', KEYS[1])
if n <= 0 then redis.call('DEL', KEYS[1], KEYS[2]) end
return n`;

// También sirve para cuotas diarias que ya tenían su propia clave y caducidad.
export const contarVentana = (k, segundos) => redis.eval(CONTAR_VENTANA, [k], [Math.ceil(segundos * 1000)]);

export async function pasado(tipo, quien, max, segundos) {
  const modo = modoLimites();
  if (modo === 'off' || !redis) return false;
  const n = await contarVentana(`limite:${tipo}:${quien}`, segundos);
  if (n <= max) return false;
  if (modo === 'registrar') { console.warn(`[limite] ${tipo} ${n}/${max}`); return false; }
  return true;
}

export const rafaga = (tipo, quien, max, segundos) => pasado(`rafaga:${tipo}`, quien, max, segundos);

export async function concurrencia(tipo, quien, max, ttlMs, fn) {
  const modo = modoLimites();
  if (modo === 'off' || !redis) return fn();
  const k = `concurrencia:${tipo}:${quien}`;
  const keys = [k, `${k}:generacion`];
  const [n, generacion] = await redis.eval(TOMAR_PLAZA, keys, [max, ttlMs, randomUUID(), modo]);
  if (!generacion) return { ocupado: true };
  if (n > max) console.warn(`[concurrencia] ${tipo} ${n}/${max}`);
  try { return await fn(); }
  finally {
    try { await redis.eval(DEJAR_PLAZA, keys, [generacion]); }
    catch { console.warn(`[concurrencia] ${tipo}: no se pudo liberar la plaza; caducará por TTL`); }
  }
}

export function respuesta429(segundos, mensaje = MUCHOS) {
  return Response.json({ error: mensaje }, { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(segundos))) } });
}
