import { createHash, timingSafeEqual } from 'node:crypto';

// Secreto de los crons de Vercel (CRON_SECRET), comparado en tiempo constante (informe de seguridad m9).
export function secretoCron(req) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const huella = (texto) => createHash('sha256').update(texto).digest();
  return timingSafeEqual(huella(req.headers.get('authorization') || ''), huella(`Bearer ${secreto}`));
}
