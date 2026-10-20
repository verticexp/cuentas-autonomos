import { redis, guardar, leerUno } from '@/lib/redis';
import { cuerpo, error } from '@/lib/api';
import { hoy } from '@/lib/formato';
import { conCerrojo, Ocupado } from '@/lib/cerrojo';
import { pasado, ipDe, respuesta429 } from '@/lib/limite';
import { estadoDe } from '@/lib/presupuestos';

export const dynamic = 'force-dynamic';

// Público (sin sesión): el cliente acepta o rechaza con el enlace que le enviaron.
export async function POST(req) {
  if (!redis) return error('Base de datos no conectada', 503);
  const { token, nombre, acepta } = await cuerpo(req);
  if (await pasado('presupuesto-aceptar-ip', ipDe(req), 20, 600)) return respuesta429(600);
  if (await pasado('presupuesto-aceptar-token', String(token || ''), 10, 3600)) return respuesta429(3600);
  const enlace = token && (await redis.hget('presupuesto-enlaces', String(token)));
  if (!enlace) return error('Este enlace ya no es válido', 404);
  const e = { empresa: enlace.empresa };
  try {
    return await conCerrojo(`presupuesto:${enlace.empresa}:${enlace.id}`, async ({ quedaMs }) => {
      const p = await leerUno(e, 'presupuestos', enlace.id);
      // Si la empresa ha cambiado el enlace mientras tanto, el viejo ya no vale.
      if (!p || (p.token && p.token !== String(token))) return error('Este enlace ya no es válido', 404);
      const estado = estadoDe(p, hoy());
      if (estado !== 'pendiente') return error(estado === 'caducado' ? 'Este presupuesto ha caducado: pide uno nuevo' : 'Este presupuesto ya está respondido');
      const quien = String(nombre || '').trim().slice(0, 80);
      if (!quien) return error('Escribe tu nombre');
      if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.');
      await guardar(e, 'presupuestos', { ...p, estado: acepta ? 'aceptado' : 'rechazado', respuesta: { fecha: new Date().toISOString(), nombre: quien } });
      return Response.json({ ok: true });
    });
  } catch (e) {
    if (e instanceof Ocupado) return error(e.message, 409);
    throw e;
  }
}
