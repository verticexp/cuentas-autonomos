import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { redis, clave, DATOS } from './redis.js';

// usuarios: id → usuario · emails: email → id · sesion:<token> → id (caduca) · sesiones:<id> → tokens · invitaciones: código → id
const DURACION = 60 * 60 * 24 * 30;
const INVITACION_DIAS = 7;
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

export async function usuarioActual() {
  if (!redis) return null;
  const token = (await cookies()).get('t')?.value;
  const id = token && (await redis.get(`sesion:${token}`));
  return id ? redis.hget('usuarios', id) : null;
}

export async function requerir() {
  const u = await usuarioActual();
  if (!u) redirect('/login');
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

export async function crearUsuario({ nombre, email, password, admin = false }) {
  const e = limpiarEmail(email);
  if (!e || !String(nombre || '').trim()) return { error: 'Faltan el nombre o el email' };
  if (await redis.hget('emails', e)) return { error: 'Ese email ya tiene cuenta' };
  if (password !== undefined && String(password).length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
  const u = { id: randomUUID().slice(0, 8), nombre: String(nombre).trim().slice(0, 60), email: e, admin, creado: new Date().toISOString(), emisor: {} };
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

export async function aceptarInvitacion(codigo, password) {
  if (String(password || '').length < 8) return { error: 'La contraseña debe tener al menos 8 caracteres' };
  const id = await redis.hget('invitaciones', codigo);
  const u = id && (await redis.hget('usuarios', id));
  if (!u) return { error: 'Esta invitación ya no es válida' };
  if (Date.now() - Date.parse(u.creado) > INVITACION_DIAS * 864e5) return { error: 'Esta invitación ha caducado. Pide otra al administrador.' };
  await redis.hset('usuarios', { [id]: { ...u, pass: cifrar(password) } });
  await redis.hdel('invitaciones', codigo);
  return { token: await crearSesion(id) };
}

export async function actualizarUsuario(u, cambios) {
  const nuevo = { ...(await redis.hget('usuarios', u.id)), ...cambios };
  await redis.hset('usuarios', { [u.id]: nuevo });
  return nuevo;
}

export async function cambiarPassword(u, actual, nueva) {
  if (!comprobar(actual, u.pass)) return { error: 'La contraseña actual no es correcta' };
  if (String(nueva || '').length < 8) return { error: 'La nueva debe tener al menos 8 caracteres' };
  await actualizarUsuario(u, { pass: cifrar(nueva) });
  await cerrarSesiones(u.id);
  return { ok: true, token: await crearSesion(u.id) };
}

export async function borrarUsuario(id) {
  const u = await redis.hget('usuarios', id);
  if (!u || u.admin) return;
  await cerrarSesiones(id);
  const invit = (await redis.hgetall('invitaciones')) || {};
  const suyasI = Object.keys(invit).filter((c) => invit[c] === id);
  if (suyasI.length) await redis.hdel('invitaciones', ...suyasI);
  await redis.hdel('emails', u.email);
  await redis.hdel('usuarios', id);
  await redis.del(...DATOS.map((n) => clave({ id }, n)));
}
