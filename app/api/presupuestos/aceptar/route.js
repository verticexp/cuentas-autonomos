import { redis, guardar, leerUno } from '@/lib/redis';
import { cuerpo, error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { estadoDe } from '@/lib/presupuestos';

export const dynamic = 'force-dynamic';

// Público (sin sesión): el cliente acepta o rechaza con el enlace que le enviaron.
export async function POST(req) {
  if (!redis) return error('Base de datos no conectada', 503);
  const { token, nombre, acepta } = await cuerpo(req);
  const enlace = token && (await redis.hget('presupuesto-enlaces', String(token)));
  if (!enlace) return error('Este enlace ya no es válido', 404);
  const e = { empresa: enlace.empresa };
  const p = await leerUno(e, 'presupuestos', enlace.id);
  if (!p) return error('Este enlace ya no es válido', 404);
  const estado = estadoDe(p, hoy());
  if (estado !== 'pendiente') return error(estado === 'caducado' ? 'Este presupuesto ha caducado: pide uno nuevo' : 'Este presupuesto ya está respondido');
  const quien = String(nombre || '').trim().slice(0, 80);
  if (!quien) return error('Escribe tu nombre');
  await guardar(e, 'presupuestos', { ...p, estado: acepta ? 'aceptado' : 'rechazado', respuesta: { fecha: new Date().toISOString(), nombre: quien } });
  return Response.json({ ok: true });
}
