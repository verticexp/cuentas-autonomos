import { conCerrojo, Ocupado } from '@/lib/cerrojo';
import { guardar, borrar, leerUno, redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { guardarCliente } from '@/lib/facturas';
import { crearPresupuesto, datosPresupuesto as datosDe } from '@/lib/presupuestosServidor';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const d = datosDe(u, await cuerpo(req));
  if (d.error) return error(d.error);
  return Response.json({ ok: true, presupuesto: await crearPresupuesto(u, d) });
}

// Solo se puede cambiar mientras está pendiente; «aceptado» a mano es para cuando el cliente dice que sí por teléfono.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  try {
    return await conCerrojo(`presupuesto:${u.empresa || u.id}:${b.id}`, async ({ quedaMs }) => {
      const antes = b.id && (await leerUno(u, 'presupuestos', b.id));
      if (!antes) return error('Ese presupuesto ya no existe', 404);
      if (antes.estado !== 'pendiente') return error('Ya está respondido: no se puede cambiar');
      if (b.estado === 'aceptado') {
        if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.');
        await guardar(u, 'presupuestos', { ...antes, estado: 'aceptado', respuesta: { fecha: new Date().toISOString(), nombre: `${u.nombre} (a mano)` } });
        return Response.json({ ok: true });
      }
      const d = datosDe(u, b);
      if (d.error) return error(d.error);
      if (quedaMs() <= 0) throw new Ocupado('La operación ha tardado demasiado: inténtalo de nuevo.');
      await guardar(u, 'presupuestos', { ...antes, evento: undefined, ...d, anio: antes.anio });
      await guardarCliente(u, d.cliente);
      return Response.json({ ok: true });
    });
  } catch (e) {
    if (e instanceof Ocupado) return error(e.message, 409);
    throw e;
  }
}

export async function DELETE(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const id = req.nextUrl.searchParams.get('id');
  const p = id && (await leerUno(u, 'presupuestos', id));
  if (!p) return error('Ese presupuesto ya no existe', 404);
  if (p.facturas?.length) return error('Tiene facturas: no se puede borrar');
  await borrar(u, 'presupuestos', id);
  await redis.hdel('presupuesto-enlaces', p.token);
  return Response.json({ ok: true });
}
