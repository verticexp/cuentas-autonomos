import { randomBytes } from 'crypto';
import { borrarEmpresa, borrarUsuario, crearUsuario } from '@/lib/auth';
import { redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { limpiarPermisos, puede } from '@/lib/permisos';
import { conMembresia, enEmpresa, membresias } from '@/lib/membresias';
import { limpiarEmail } from '@/lib/auth';

const enlace = (req, codigo) => new URL(`/invitacion/${codigo}`, req.url).toString();
const deMiEmpresa = async (u, id) => {
  const o = id && (await redis.hget('usuarios', id));
  return o && enEmpresa(o, u.empresa) ? o : null;
};
// Quien gestiona usuarios sin ser administrador no puede crear administradores, tocar a uno, ni dar permisos que no tiene.
const esAdminDe = (o, empresa) => membresias(o)[empresa]?.rol === 'admin';
const papel = (u, b) => (u.rol === 'admin'
  ? { rol: b.rol === 'admin' ? 'admin' : 'miembro', permisos: limpiarPermisos(b.permisos) }
  : { rol: 'miembro', permisos: limpiarPermisos(b.permisos).filter((p) => puede(u, p)) });

// Invitar a alguien a tu empresa (o, si eres el administrador de la app, crear una empresa nueva con su administrador).
export async function POST(req) {
  const b = await cuerpo(req);
  if (b.empresaNueva) {
    const { res } = await usuarioApi({ admin: true });
    if (res) return res;
    if (!String(b.empresaNueva).trim()) return error('Falta el nombre de la empresa');
    const r = await crearUsuario({ nombre: b.nombre, email: b.email, empresaNombre: b.empresaNueva, rol: 'admin' });
    if (r.error) return error(r.error);
    return Response.json({ ok: true, enlace: enlace(req, r.codigo) });
  }
  const { u, res } = await usuarioApi({ permiso: 'usuarios' });
  if (res) return res;
  if (b.rol === 'admin' && u.rol !== 'admin') return error('Solo un administrador de la empresa puede dar o quitar el acceso de administrador', 403);
  if (b.reenviar) {
    const o = await deMiEmpresa(u, b.reenviar);
    if (!o || o.pass) return error('Esa persona ya tiene acceso');
    if (esAdminDe(o, u.empresa) && u.rol !== 'admin') return error('Solo un administrador de la empresa puede dar o quitar el acceso de administrador', 403);
    const todas = (await redis.hgetall('invitaciones')) || {};
    const viejas = Object.keys(todas).filter((c) => todas[c] === o.id);
    if (viejas.length) await redis.hdel('invitaciones', ...viejas);
    const codigo = randomBytes(18).toString('base64url');
    await redis.hset('invitaciones', { [codigo]: o.id });
    await redis.hset('usuarios', { [o.id]: { ...o, creado: new Date().toISOString() } });
    return Response.json({ ok: true, enlace: enlace(req, codigo) });
  }
  // Si ya tiene cuenta en Netto (de otra empresa), se le añade esta empresa: la verá al cambiar de empresa.
  const yaId = await redis.hget('emails', limpiarEmail(b.email));
  const ya = yaId && (await redis.hget('usuarios', yaId));
  if (ya) {
    if (enEmpresa(ya, u.empresa)) return error('Esa persona ya está en tu empresa');
    await redis.hset('usuarios', { [ya.id]: conMembresia(ya, u.empresa, papel(u, b)) });
    return Response.json({ ok: true, existente: ya.nombre });
  }
  const r = await crearUsuario({ nombre: b.nombre, email: b.email, empresa: u.empresa, ...papel(u, b) });
  if (r.error) return error(r.error);
  return Response.json({ ok: true, enlace: enlace(req, r.codigo) });
}

// Cambiar el perfil y los permisos de alguien de tu empresa.
export async function PATCH(req) {
  const { u, res } = await usuarioApi({ permiso: 'usuarios' });
  if (res) return res;
  const b = await cuerpo(req);
  const o = await deMiEmpresa(u, b.id);
  if (!o) return error('Esa persona no está en tu empresa', 404);
  if (o.id === u.id) return error('No puedes cambiar tus propios permisos: pídeselo a otro administrador');
  if ((esAdminDe(o, u.empresa) || b.rol === 'admin') && u.rol !== 'admin') return error('Solo un administrador de la empresa puede dar o quitar el acceso de administrador', 403);
  await redis.hset('usuarios', { [o.id]: conMembresia(o, u.empresa, papel(u, b)) });
  return Response.json({ ok: true });
}

// Quitar el acceso a alguien (sus facturas y gastos se quedan en la empresa) o borrar una empresa entera.
export async function DELETE(req) {
  const q = req.nextUrl.searchParams;
  if (q.get('empresa')) {
    const { u, res } = await usuarioApi({ admin: true });
    if (res) return res;
    if (q.get('empresa') === u.empresa) return error('No puedes borrar tu propia empresa');
    await borrarEmpresa(q.get('empresa'));
    return Response.json({ ok: true });
  }
  const { u, res } = await usuarioApi({ permiso: 'usuarios' });
  if (res) return res;
  const o = await deMiEmpresa(u, q.get('id'));
  if (!o || o.id === u.id) return error('No se puede quitar');
  if (esAdminDe(o, u.empresa) && u.rol !== 'admin') return error('Solo un administrador de la empresa puede dar o quitar el acceso de administrador', 403);
  // Si tiene otras empresas, solo pierde el acceso a esta; si no, se borra su cuenta.
  if (Object.keys(membresias(o)).length > 1) await redis.hset('usuarios', { [o.id]: conMembresia(o, u.empresa, null) });
  else await borrarUsuario(o.id);
  return Response.json({ ok: true });
}
