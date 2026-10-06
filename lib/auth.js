import { cache } from 'react';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { redis, clave, DATOS } from './redis.js';
import { inicioDe, limpiarPermisos, puede } from './permisos.js';
import { activaDe, conMembresia, membresias } from './membresias.js';

// empresas: id → empresa (datos de facturación, marca, conexiones) · cada usuario pertenece a una (u.empresa) con un rol y permisos.
// usuarios: id → usuario · emails: email → id · sesion:<token> → id (caduca) · sesiones:<id> → tokens · invitaciones: código → id
const DURACION = 60 * 60 * 24 * 30;
export const INVITACION_DIAS = 7;
export const opcionesCookie = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DURACION };
export const limpiarEmail = (e) => String(e || '').trim().toLowerCase();
const nuevoCodigo = () => randomBytes(18).toString('base64url');

export function cifrar(password) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${scryptSync(password, sal, 64).toString('hex')}`;
}

// Hash de relleno: el login tarda lo mismo exista o no el email (no revela qué emails tienen cuenta).
const FALSO = cifrar(randomBytes(16).toString('hex'));

function comprobar(password, guardado) {
  if (!guardado) return false;
  const [sal, hash] = guardado.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(String(password), sal, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

// cache: el layout y la página piden el usuario en la misma visita; así solo se lee una vez.
export const usuarioActual = cache(async () => {
  if (!redis) return null;
  const c = await cookies();
  const token = c.get('t')?.value;
  const id = token && (await redis.get(`sesion:${token}`));
  const u = id && (await redis.hget('usuarios', id));
  // e: la empresa con la que trabaja en este dispositivo (si tiene varias).
  return u ? conEmpresa(u, c.get('e')?.value) : null;
});

// Lo que es de la empresa (y comparten todos sus usuarios), no de cada persona.
const DE_EMPRESA = ['emisor', 'marca', 'drive', 'driveError', 'pagos130', 'controlat', 'controlatEmail', 'actividades', 'fiscal', 'pendiente', 'verifactu'];

// Une el usuario con su empresa. Las cuentas de antes (sin empresa) pasan a tener la suya, con ellas de administrador;
// su id de empresa es el del usuario, así sus facturas y gastos siguen donde estaban.
// pedida: si tiene varias empresas, con cuál trabaja ahora (su rol y permisos son los de esa empresa).
export async function conEmpresa(u, pedida) {
  let e = u.empresa && (await redis.hget('empresas', u.empresa));
  if (!e) {
    e = { id: u.empresa || u.id, nombre: u.emisor?.nombre || u.nombre, creada: u.creado || new Date().toISOString(), emisor: {} };
    for (const k of DE_EMPRESA) if (u[k] !== undefined) e[k] = u[k];
    if (e.controlat && !e.controlatEmail) e.controlatEmail = u.email;
    await redis.hset('empresas', { [e.id]: e });
    const limpio = Object.fromEntries(Object.entries(u).filter(([k]) => !DE_EMPRESA.includes(k)));
    u = { ...limpio, empresa: e.id, rol: u.rol || 'admin' };
    await redis.hset('usuarios', { [u.id]: u });
  }
  const activa = activaDe(u, pedida);
  const otra = activa !== e.id && (await redis.hget('empresas', activa));
  if (otra) e = otra;
  const m = membresias(u)[e.id] || { rol: u.rol || 'admin', permisos: u.permisos };
  const campos = Object.fromEntries(DE_EMPRESA.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));
  const ids = Object.keys(membresias(u));
  const misEmpresas = ids.length > 1
    ? (await Promise.all(ids.map((id) => (id === e.id ? e : redis.hget('empresas', id))))).filter(Boolean).map((x) => ({ id: x.id, nombre: x.nombre }))
    : [{ id: e.id, nombre: e.nombre }];
  const sinRol = Object.fromEntries(Object.entries(u).filter(([k]) => k !== 'permisos'));
  return { ...sinRol, ...campos, empresa: e.id, rol: m.rol, ...(m.rol === 'admin' ? {} : { permisos: m.permisos || [] }), emisor: e.emisor || {}, empresaNombre: e.nombre, misEmpresas };
}

// Crea otra empresa en la misma cuenta, con esta persona de administradora (empieza por el cuestionario).
export async function nuevaEmpresa(uid, nombre) {
  const o = await redis.hget('usuarios', uid);
  const n = String(nombre || '').trim().slice(0, 80);
  if (!o || !n) return { error: 'Falta el nombre de la empresa' };
  if (Object.keys(membresias(o)).length >= 10) return { error: 'Como mucho 10 empresas por cuenta' };
  const id = randomUUID().slice(0, 8);
  await redis.hset('empresas', { [id]: { id, nombre: n, creada: new Date().toISOString(), emisor: {}, pendiente: true } });
  await redis.hset('usuarios', { [uid]: conMembresia(o, id, { rol: 'admin' }) });
  return { id };
}

// Bloqueo en el servidor: tras entrar (contraseña, llave de acceso, invitación) la cookie «d» (de sesión: se va al
// cerrar la app) apunta a desbloqueo:<d> → token de sesión, con caducidad que se alarga con el uso. Sin ella, las
// páginas no dan datos: mandan a /bloqueo. BLOQUEO_SERVIDOR: «activo» bloquea, «off» nada, si no solo lo registra.
const DESBLOQUEO = 60 * 15;
export const opcionesDesbloqueo = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
export const modoBloqueo = () => ({ activo: 'activo', off: 'off' })[process.env.BLOQUEO_SERVIDOR] || 'registrar';

export async function desbloqueo(token) {
  const d = nuevoCodigo();
  await redis.set(`desbloqueo:${d}`, token, { ex: DESBLOQUEO });
  return d;
}

export const desbloqueada = cache(async () => {
  const c = await cookies();
  const d = c.get('d')?.value;
  const ok = Boolean(d && redis && (await redis.get(`desbloqueo:${d}`)) === c.get('t')?.value);
  if (ok) await redis.expire(`desbloqueo:${d}`, DESBLOQUEO);
  return ok;
});

export async function exigirDesbloqueo(u) {
  const modo = modoBloqueo();
  if (modo === 'off' || (await desbloqueada())) return;
  const ruta = (await headers()).get('x-ruta') || '/';
  if (modo === 'registrar') { console.warn(`[bloqueo] sin desbloqueo: ${u.id} ${ruta.split('?')[0]}`); return; }
  redirect(`/bloqueo?a=${encodeURIComponent(ruta)}`);
}

// Email confirmado: las cuentas nuevas empiezan con emailVerificado: false (las de antes no lo tienen y valen como
// confirmadas). verificar:<token> → id de usuario: va en el email de invitación (?v=) y en el de confirmación.
// VERIFICAR_EMAIL: «activo» corta el paso sin confirmar, «off» nada, si no solo lo registra.
export const modoEmail = () => ({ activo: 'activo', off: 'off' })[process.env.VERIFICAR_EMAIL] || 'registrar';

export async function tokenEmail(id) {
  const t = nuevoCodigo();
  await redis.set(`verificar:${t}`, id, { ex: INVITACION_DIAS * 86400 });
  return t;
}

// Marca el email como confirmado si el token es de esa persona (o de quien sea, sin id). Devuelve el id o null.
export async function confirmarEmail(token, id) {
  const de = token && (await redis.get(`verificar:${String(token)}`));
  if (!de || (id && de !== id)) return null;
  await redis.del(`verificar:${String(token)}`);
  const u = await redis.hget('usuarios', de);
  if (u) await redis.hset('usuarios', { [de]: { ...u, emailVerificado: true } });
  return u ? de : null;
}

// true si hay que cortarle el paso por no haber confirmado el email.
export function bloquearPorEmail(u) {
  if (u.emailVerificado !== false) return false;
  const modo = modoEmail();
  if (modo === 'registrar') console.warn(`[email] sin confirmar: ${u.id}`);
  return modo === 'activo';
}

// Con permiso: si no lo tiene, a la primera pantalla que sí puede ver.
export async function requerir(permiso) {
  const u = await usuarioActual();
  if (!u) redirect('/login');
  await exigirDesbloqueo(u);
  if (bloquearPorEmail(u)) redirect('/confirmar-email');
  if (u.pendiente && u.rol === 'admin') redirect('/bienvenida');
  if (permiso && !puede(u, permiso)) redirect(inicioDe(u));
  return u;
}

export async function requerirAdmin() {
  const u = await requerir();
  if (!u.admin) redirect('/');
  return u;
}

export const hayUsuarios = async () => Boolean(redis && (await redis.hlen('usuarios')));

export async function crearSesion(id) {
  const token = nuevoCodigo();
  await redis.set(`sesion:${token}`, id, { ex: DURACION });
  await redis.sadd(`sesiones:${id}`, token);
  return token;
}

export async function cerrarSesion(token) {
  if (token) await redis.del(`sesion:${token}`);
}

// Cierra todas las sesiones de un usuario (cambio de contraseña, borrado).
export async function cerrarSesiones(id) {
  const tokens = (await redis.smembers(`sesiones:${id}`)) || [];
  await redis.del(`sesiones:${id}`, ...tokens.map((t) => `sesion:${t}`));
}

export async function crearUsuario({ nombre, email, password, admin = false, empresa, empresaNombre, rol = 'admin', permisos = [] }) {
  const e = limpiarEmail(email);
  if (!e || !String(nombre || '').trim()) return { error: 'Faltan el nombre o el email' };
  if (await redis.hget('emails', e)) return { error: 'Ese email ya tiene cuenta' };
  if (password !== undefined && String(password).length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
  const u = { id: randomUUID().slice(0, 8), nombre: String(nombre).trim().slice(0, 60), email: e, admin, creado: new Date().toISOString(), emailVerificado: false };
  u.empresa = empresa || u.id;
  u.rol = rol === 'admin' ? 'admin' : 'miembro';
  if (u.rol !== 'admin') u.permisos = limpiarPermisos(permisos);
  // Las empresas nuevas empiezan con el cuestionario (pendiente) para elegir actividades y modelos.
  if (!empresa) await redis.hset('empresas', { [u.id]: { id: u.id, nombre: String(empresaNombre || u.nombre).trim().slice(0, 80), creada: u.creado, emisor: {}, pendiente: true } });
  if (password) u.pass = cifrar(password);
  await redis.hset('usuarios', { [u.id]: u });
  await redis.hset('emails', { [e]: u.id });
  if (password) return { usuario: u };
  const codigo = nuevoCodigo();
  await redis.hset('invitaciones', { [codigo]: u.id });
  return { usuario: u, codigo };
}

export async function entrar(email, password, ip) {
  const e = limpiarEmail(email);
  const intentos = `intentos:${e}`;
  const porIp = `intentos-ip:${ip || 'desconocida'}`;
  const [nE, nI] = await Promise.all([redis.get(intentos), redis.get(porIp)]);
  if (Number(nE) >= 10 || Number(nI) >= 30) return { bloqueado: true };
  const id = await redis.hget('emails', e);
  const u = id && (await redis.hget('usuarios', id));
  const ok = comprobar(password, u?.pass || FALSO) && Boolean(u?.pass);
  if (!ok) {
    for (const k of [intentos, porIp]) {
      await redis.incr(k);
      await redis.expire(k, 900);
    }
    return null;
  }
  await redis.del(intentos);
  return { token: await crearSesion(u.id) };
}

// v: el token del email de invitación (confirma el email). Sin él (enlace copiado por el administrador), queda sin confirmar.
export async function aceptarInvitacion(codigo, password, v) {
  if (String(password || '').length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
  const id = await redis.hget('invitaciones', codigo);
  const u = id && (await redis.hget('usuarios', id));
  if (!u) return { error: 'Esta invitación ya no es válida' };
  if (Date.now() - Date.parse(u.creado) > INVITACION_DIAS * 864e5) return { error: 'Esta invitación ha caducado. Pide otra al administrador.' };
  await redis.hset('usuarios', { [id]: { ...u, pass: cifrar(password) } });
  await redis.hdel('invitaciones', codigo);
  const verificado = u.emailVerificado !== false || Boolean(await confirmarEmail(v, id));
  return { token: await crearSesion(id), verificado, usuario: u };
}

// Guarda cada cambio donde toca: lo de la empresa en la empresa y lo personal en el usuario.
export async function actualizarUsuario(u, cambios) {
  const deEmpresa = Object.fromEntries(Object.entries(cambios).filter(([k]) => DE_EMPRESA.includes(k)));
  const propios = Object.fromEntries(Object.entries(cambios).filter(([k]) => !DE_EMPRESA.includes(k)));
  if (Object.keys(deEmpresa).length) {
    const e = await redis.hget('empresas', u.empresa);
    await redis.hset('empresas', { [u.empresa]: { ...e, ...deEmpresa } });
  }
  if (Object.keys(propios).length) await redis.hset('usuarios', { [u.id]: { ...(await redis.hget('usuarios', u.id)), ...propios } });
  return { ...u, ...cambios };
}

export async function actualizarEmpresa(id, cambios) {
  const e = await redis.hget('empresas', id);
  if (e) await redis.hset('empresas', { [id]: { ...e, ...cambios } });
}

export async function cambiarPassword(u, actual, nueva) {
  if (!comprobar(actual, u.pass)) return { error: 'La contraseña actual no es correcta' };
  if (String(nueva || '').length < 8) return { error: 'La nueva debe tener al menos 8 caracteres' };
  await actualizarUsuario(u, { pass: cifrar(nueva) });
  await cerrarSesiones(u.id);
  return { ok: true, token: await crearSesion(u.id) };
}

// Quita a una persona. Las facturas y gastos son de la empresa: se quedan.
export async function borrarUsuario(id) {
  const u = await redis.hget('usuarios', id);
  if (!u || u.admin) return;
  await cerrarSesiones(id);
  const invit = (await redis.hgetall('invitaciones')) || {};
  const suyasI = Object.keys(invit).filter((c) => invit[c] === id);
  if (suyasI.length) await redis.hdel('invitaciones', ...suyasI);
  await redis.hdel('emails', u.email);
  await redis.hdel('usuarios', id);
  const llaves = Object.keys((await redis.hgetall(`passkeys:${id}`)) || {});
  if (llaves.length) await redis.hdel('passkey-usuario', ...llaves);
  await redis.del(`passkeys:${id}`);
}

// Borra una empresa entera: todos sus datos y su gente (quien tenga otras empresas solo pierde el acceso a esta).
export async function borrarEmpresa(empresa) {
  const usuarios = Object.values((await redis.hgetall('usuarios')) || {}).filter((u) => membresias(u)[empresa]);
  const solo = (u) => Object.keys(membresias(u)).length === 1;
  if (usuarios.some((u) => u.admin && solo(u))) return;
  for (const u of usuarios) {
    if (solo(u)) await borrarUsuario(u.id);
    else await redis.hset('usuarios', { [u.id]: conMembresia(u, empresa, null) });
  }
  await redis.hdel('empresas', empresa);
  await redis.del(...DATOS.map((n) => clave({ empresa }, n)));
}
