import { createHash, timingSafeEqual } from 'node:crypto';

// Secreto de los crons de Vercel (CRON_SECRET), comparado en tiempo constante (informe de seguridad m9).
export function secretoCron(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const huella = (texto) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(huella(req.headers.get('authorization') || ''), huella(`Bearer ${secreto}`));
}

// Solo esta consulta, con una clave independiente de los crons y de las sesiones.
// Se comparan huellas de longitud fija, también si la cabecera falta o tiene otra longitud.
export function accesoCifras(req) {
  const secreto = process.env.OFICINA_CIFRAS_TOKEN;
  if (!secreto?.trim()) return 404;
  const huella = (texto) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(huella(req.headers.get('authorization') || ''), huella(`Bearer ${secreto}`)) ? null : 401;
}
