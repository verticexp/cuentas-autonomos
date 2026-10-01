import { randomBytes } from 'node:crypto';
import { leer, guardar, borrar, leerUno, redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { limpiar, guardarCliente } from '@/lib/facturas';
import { siguienteNumero } from '@/lib/calculos';
import { actividadesDe, fiscalDe } from '@/lib/empresa';

export const dynamic = 'force-dynamic';

const datosDe = (u, b) => {
  const d = limpiar(b, actividadesDe(u), fiscalDe(u).tipo === 'sociedad');
  if (d.error) return d;
  delete d.cobrada;
  return { ...d, senalPct: [0, 20, 30, 50].includes(Number(b.senalPct)) ? Number(b.senalPct) : 0, validez: Math.min(90, Math.max(1, Number(b.validez) || 15)) };
};

export async function POST(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const d = datosDe(u, await cuerpo(req));
  if (d.error) return error(d.error);
  const anio = Number(d.fecha.slice(0, 4));
  const numero = siguienteNumero(await leer(u, 'presupuestos'), anio, 'P');
  // El enlace público lleva un código imposible de adivinar que apunta a la empresa y al presupuesto.
  const token = randomBytes(18).toString('base64url');
  const p = { id: `P${anio}-${numero}`, numero, anio, serie: 'P', ...d, estado: 'pendiente', token, facturas: [] };
  await guardar(u, 'presupuestos', p);
  await redis.hset('presupuesto-enlaces', { [token]: { empresa: u.empresa || u.id, id: p.id } });
  await guardarCliente(u, p.cliente);
  return Response.json({ ok: true, presupuesto: p });
}

// Solo se puede cambiar mientras está pendiente; «aceptado» a mano es para cuando el cliente dice que sí por teléfono.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'facturar' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'presupuestos', b.id));
  if (!antes) return error('Ese presupuesto ya no existe', 404);
  if (antes.estado !== 'pendiente') return error('Ya está respondido: no se puede cambiar');
  if (b.estado === 'aceptado') {
    await guardar(u, 'presupuestos', { ...antes, estado: 'aceptado', respuesta: { fecha: new Date().toISOString(), nombre: `${u.nombre} (a mano)` } });
    return Response.json({ ok: true });
  }
  const d = datosDe(u, b);
  if (d.error) return error(d.error);
  await guardar(u, 'presupuestos', { ...antes, evento: undefined, ...d, anio: antes.anio });
  await guardarCliente(u, d.cliente);
  return Response.json({ ok: true });
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
