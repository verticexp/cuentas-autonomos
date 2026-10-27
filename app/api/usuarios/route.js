import { mensajePlan } from '@/lib/app';
import { randomBytes } from 'crypto';
import { borrarEmpresa, cambiarUsuario, crearUsuario, quitarDeEmpresa } from '@/lib/auth';
import { mismoId, redis } from '@/lib/redis';
import { cuerpo, error, usuarioApi } from '@/lib/api';
import { limpiarPermisos, perfilDe, puede } from '@/lib/permisos';
import { conMembresia, enEmpresa, membresias } from '@/lib/membresias';
import { INVITACION_DIAS, limpiarEmail, tokenEmail } from '@/lib/auth';
import { enviarInvitacion } from '@/lib/invitacion';
import { auditar } from '@/lib/auditoria';
import { sinPlaza } from '@/lib/planes';
import { conCerrojo } from '@/lib/cerrojo';
import { pasado, respuesta429 } from '@/lib/limite';

const enlace = (req, codigo) => new URL(`/invitacion/${codigo}`, req.url).toString();
// Crea la respuesta con el enlace (que el administrador ve siempre) y le manda la invitación por email.
// Si el email no sale, la persona queda creada igual y se avisa para copiar el enlace a mano.
const invitar = async (req, quien, o, empresa, codigo) => {
  const url = enlace(req, codigo);
  // El del email lleva ?v=: quien entra con él confirma su email (el que ve el administrador, no).
  const e = await enviarInvitacion({ para: o.email, nombre: o.nombre, quien: quien.nombre, empresa, url: `${url}?v=${await tokenEmail(o.id)}`, responderA: quien.email, dias: INVITACION_DIAS });
  return Response.json({ ok: true, enlace: url, email: o.email, ...e });
};
// Nombre de la empresa de quien invita: el de facturación si lo tiene; si solo es su propio nombre, ninguno.
const nombreEmpresa = (u) => {
  const e = String(u.emisor?.nombre || u.empresaNombre || '').trim();
  return e.toLowerCase() === String(u.nombre || '').trim().toLowerCase() ? '' : e;
};
const deMiEmpresa = async (u, id) => {
  const o = id && (await redis.hget('usuarios', id));
  return o && enEmpresa(o, u.empresa) ? o : null;
};
// Quien gestiona usuarios sin ser administrador no puede crear administradores, tocar a uno, ni dar permisos que no tiene.
const esAdminDe = (o, empresa) => membresias(o)[empresa]?.rol === 'admin';
const quePapel = (p) => (p.rol === 'admin' ? 'Administrador' : perfilDe(p));
const papel = (u, b) => (u.rol === 'admin'
  ? { rol: b.rol === 'admin' ? 'admin' : 'miembro', permisos: limpiarPermisos(b.permisos) }
  : { rol: 'miembro', permisos: limpiarPermisos(b.permisos).filter((p) => puede(u, p)) });

// Invitar a alguien a tu empresa (o, si eres el administrador de la app, crear una empresa nueva con su administrador).
export async function POST(req) {
  const b = await cuerpo(req);
  if (b.empresaNueva) {
    const { u, res } = await usuarioApi({ admin: true });
    if (res) return res;
    if (!String(b.empresaNueva).trim()) return error('Falta el nombre de la empresa');
    if (await pasado('usuarios-invitar', u.empresa || u.id, 30, 3600)) return respuesta429(3600, 'Has enviado demasiadas invitaciones. Espera una hora antes de invitar a más personas.');
    const r = await crearUsuario({ nombre: b.nombre, email: b.email, empresaNombre: b.empresaNueva, rol: 'admin' });
    if (r.error) return error(r.error);
    return invitar(req, u, r.usuario, String(b.empresaNueva).trim(), r.codigo);
  }
  const { u, res } = await usuarioApi({ permiso: 'usuarios' });
  if (res) return res;
  // Invitar o reenviar invitaciones: solo el administrador de la empresa (no quien solo tiene el permiso de usuarios).
  if (u.rol !== 'admin') return error('Solo el administrador de la empresa puede invitar a personas', 403);
  if (b.reenviar) {
    if (await pasado('usuarios-reenviar', u.empresa, 10, 3600)) return respuesta429(3600, 'Has reenviado demasiadas invitaciones. Espera una hora antes de reenviar otra.');
    const o = await deMiEmpresa(u, b.reenviar);
    if (!o || o.pass) return error('Esa persona ya tiene acceso');
    if (esAdminDe(o, u.empresa) && u.rol !== 'admin') return error('Solo un administrador de la empresa puede dar o quitar el acceso de administrador', 403);
    // Bajo el cerrojo de la persona: si la acepta a la vez, no queda un código nuevo para una cuenta ya activa.
    const codigo = randomBytes(18).toString('base64url');
    const sigue = await cambiarUsuario(o.id, async (x) => {
      if (x.pass) return null;
      const todas = (await redis.hgetall('invitaciones')) || {};
      const viejas = Object.keys(todas).filter((c) => mismoId(todas[c], o.id));
      if (viejas.length) await redis.hdel('invitaciones', ...viejas);
      await redis.hset('invitaciones', { [codigo]: o.id });
      return { ...x, creado: new Date().toISOString() };
    });
    if (!sigue) return error('Esa persona ya tiene acceso');
    await auditar(u, 'Invitación reenviada', o.email);
    return invitar(req, u, o, nombreEmpresa(u), codigo);
  }
  if (await pasado('usuarios-invitar', u.empresa, 30, 3600)) return respuesta429(3600, 'Has enviado demasiadas invitaciones. Espera una hora antes de invitar a más personas.');
  // Las invitaciones pendientes ya reservan plaza. El cerrojo evita rebasar el cupo con dos altas simultáneas.
  return conCerrojo(`usuarios:${u.empresa}`, async () => {
    const personas = Object.values((await redis.hgetall('usuarios')) || {}).filter((x) => enEmpresa(x, u.empresa)).map((x) => ({ id: x.id, ...membresias(x)[u.empresa] }));
    const sinPlan = sinPlaza(u.plan, personas, papel(u, b));
    if (sinPlan) return error(mensajePlan(sinPlan, req.headers.get('user-agent')), 403);
    // Si ya tiene cuenta en Fisquo no se le añade sin más: recibe un enlace y entra en la empresa cuando lo acepta
    // con su sesión (api/invitacion/unirse). La respuesta no da su nombre ni ningún otro dato de su cuenta.
    const yaId = await redis.hget('emails', limpiarEmail(b.email));
    const ya = yaId && (await redis.hget('usuarios', yaId));
    if (ya) {
      if (enEmpresa(ya, u.empresa)) return error('Esa persona ya está en tu empresa');
      const codigo = randomBytes(18).toString('base64url');
      await redis.set(`union:${codigo}`, { usuario: ya.id, empresa: u.empresa, ...papel(u, b) }, { ex: INVITACION_DIAS * 86400 });
      await auditar(u, 'Persona invitada (ya tenía cuenta)', `${ya.email} · ${quePapel(papel(u, b))}`);
      const url = new URL(`/api/invitacion/unirse?c=${codigo}`, req.url).toString();
      const e = await enviarInvitacion({ para: ya.email, nombre: ya.nombre, quien: u.nombre, empresa: nombreEmpresa(u), url, responderA: u.email, dias: INVITACION_DIAS });
      return Response.json({ ok: true, pendiente: true, enlace: url, email: ya.email, ...e });
    }
    const r = await crearUsuario({ nombre: b.nombre, email: b.email, empresa: u.empresa, ...papel(u, b) });
    if (r.error) return error(r.error);
    await auditar(u, 'Persona invitada', `${r.usuario.email} · ${quePapel(papel(u, b))}`);
    return invitar(req, u, r.usuario, nombreEmpresa(u), r.codigo);
  });
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
  return conCerrojo(`usuarios:${u.empresa}`, async () => {
    const personas = Object.values((await redis.hgetall('usuarios')) || {}).filter((x) => enEmpresa(x, u.empresa)).map((x) => ({ id: x.id, ...membresias(x)[u.empresa] }));
    const sinPlan = sinPlaza(u.plan, personas, papel(u, b), o.id);
    if (sinPlan) return error(mensajePlan(sinPlan, req.headers.get('user-agent')), 403);
    // Su ficha se vuelve a leer bajo su cerrojo: se conservan sus otras empresas tal como estén en ese momento.
    const hecho = await cambiarUsuario(o.id, (x) => (enEmpresa(x, u.empresa) ? conMembresia(x, u.empresa, papel(u, b)) : null));
    if (!hecho) return error('Esa persona no está en tu empresa', 404);
    await auditar(u, 'Permisos cambiados', `${o.email} · ${quePapel(papel(u, b))}`);
    return Response.json({ ok: true });
  });
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
  await quitarDeEmpresa(o.id, u.empresa);
  await auditar(u, 'Acceso quitado', o.email);
  return Response.json({ ok: true });
}
