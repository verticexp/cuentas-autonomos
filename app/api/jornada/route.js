import { guardar, leer, leerUno } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { puede } from '@/lib/permisos';
import { ahoraMadrid, fichar, validar } from '@/lib/jornada';
import { miEmpleado } from '@/lib/jornadaServidor';

export const dynamic = 'force-dynamic';
const solapa = (fichajes, empleado, entrada, salida, excepto) => fichajes.some((f) => f.empleado === empleado && f.id !== excepto && f.entrada < salida && (f.salida || '9999') > entrada);

// Fichar (entrar, pausa, volver, salir) con la hora del servidor; o, quien lleva las nóminas, apuntar un día a mano.
export async function POST(req) {
  const { u, res } = await usuarioApi();
  if (res) return res;
  const b = await cuerpo(req);
  const ahora = ahoraMadrid();
  const { empleados, yo } = await miEmpleado(u, ahora.slice(0, 10));
  const fichajes = (await leer(u, 'jornada')) || [];
  if (b.accion === 'manual') {
    if (!puede(u, 'nominas')) return error('Solo quien lleva las nóminas puede apuntar jornadas a mano', 403);
    const e = empleados.find((x) => x.id === b.empleado);
    if (!e) return error('Ese empleado no existe', 404);
    const motivo = String(b.motivo || '').trim().slice(0, 200);
    if (motivo.length < 3) return error('Explica por qué se apunta a mano (queda en el registro)');
    const v = validar(b);
    if (v.error) return error(v.error);
    if (v.entrada > ahora) return error('No se pueden apuntar jornadas futuras');
    if (solapa(fichajes, e.id, v.entrada, v.salida)) return error('Se solapa con otra jornada de esa persona');
    const f = { id: `${e.id}-${v.entrada}`, empleado: e.id, fecha: v.entrada.slice(0, 10), ...v, manual: motivo, por: u.id, porNombre: u.nombre };
    await guardar(u, 'jornada', f);
    return Response.json({ ok: true, fichaje: f });
  }
  const para = b.empleado && b.empleado !== yo?.id ? empleados.find((x) => x.id === b.empleado) : yo;
  if (b.empleado && b.empleado !== yo?.id && !puede(u, 'nominas')) return error('Solo puedes fichar tú', 403);
  if (!para) return error('No estás dado de alta como empleado en esta empresa. Pide que pongan tu email en tu ficha.', 403);
  const r = fichar(fichajes, para.id, b.accion, ahora, u.id);
  if (r.error) return error(r.error);
  await guardar(u, 'jornada', r.fichaje);
  return Response.json({ ok: true, fichaje: r.fichaje });
}

// Corregir una jornada: se guarda cómo estaba, quién la cambió, cuándo y por qué.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'nominas' });
  if (res) return res;
  const b = await cuerpo(req);
  const antes = b.id && (await leerUno(u, 'jornada', b.id));
  if (!antes) return error('Esa jornada no existe', 404);
  const motivo = String(b.motivo || '').trim().slice(0, 200);
  if (motivo.length < 3) return error('Explica el motivo de la corrección (queda en el registro)');
  const v = validar(b);
  if (v.error) return error(v.error);
  if (solapa((await leer(u, 'jornada')) || [], antes.empleado, v.entrada, v.salida, antes.id)) return error('Se solapa con otra jornada de esa persona');
  const cambio = { cuando: ahoraMadrid(), por: u.id, porNombre: u.nombre, motivo, antes: { entrada: antes.entrada, salida: antes.salida, pausas: antes.pausas } };
  await guardar(u, 'jornada', { ...antes, ...v, fecha: v.entrada.slice(0, 10), cambios: [...(antes.cambios || []), cambio] });
  return Response.json({ ok: true });
}
