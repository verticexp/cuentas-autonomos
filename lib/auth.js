import { validarContrasenaSegura } from './contrasenaFiltrada.js';
import { cache } from 'react';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { redis, clave, DATOS, mismoId } from './redis.js';
import { inicioDe, limpiarPermisos, puede } from './permisos.js';
import { activaDe, conMembresia, membresias } from './membresias.js';
import { apuntarActividad } from './actividad.js';
import { contarVentana } from './limite.js';
import { conCerrojo } from './cerrojo.js';

// empresas: id → empresa (datos de facturación, marca, conexiones) · cada usuario pertenece a una (u.empresa) con un rol y permisos.
// usuarios: id → usuario · emails: email → id · sesion:<token> → id (caduca) · sesiones:<id> → tokens · invitaciones: código → id
const DURACION = 60 * 60 * 24 * 30;
export const INVITACION_DIAS = 7;
export const opcionesCookie = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: DURACION };
export const limpiarEmail = (e) => String(e || '').trim().toLowerCase();
const nuevoCodigo = () => randomBytes(18).toString('base64url');
const DESCONTAR = `if redis.call('GET', KEYS[1]) then return redis.call('DECR', KEYS[1]) end return 0`;
const credencialesDe = (pass) => createHash('sha256').update(pass || '').digest('hex');

// Contraseñas con scrypt (informe de capacidad E09): asíncrono, en el grupo de hilos de Node y no en el hilo de
// JavaScript, con como mucho CONCURRENCIA cálculos a la vez por instancia (cada uno usa 16 MB y un hilo). El formato
// guardado no cambia («sal:hash» en hexadecimal), así que las contraseñas de antes siguen valiendo.
const CONCURRENCIA = 2;
let enCurso = 0;
const cola = [];
async function derivar(password, sal) {
  if (enCurso >= CONCURRENCIA) await new Promise((ok) => cola.push(ok));
  enCurso++;
  try {
    return await new Promise((ok, mal) => scrypt(String(password), sal, 64, (e, b) => (e ? mal(e) : ok(b))));
  } finally {
    enCurso--;
    cola.shift()?.();
  }
}

export async function cifrar(password) {
  const sal = randomBytes(16).toString('hex');
  return `${sal}:${(await derivar(password, sal)).toString('hex')}`;
}

// Hash de relleno: el login tarda lo mismo exista o no el email (no revela qué emails tienen cuenta). No hace falta
// calcularlo: basta con que tenga el mismo formato, porque comprobar() deriva igual y la comparación falla.
const FALSO = `${randomBytes(16).toString('hex')}:${randomBytes(64).toString('hex')}`;

export async function comprobar(password, guardado) {
  if (!guardado) return false;
  const [sal, hash] = guardado.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = await derivar(password, sal);
  return a.length === b.length && timingSafeEqual(a, b);
}

// cache: el layout y la página piden el usuario en la misma visita; así solo se lee una vez.
export const usuarioActual = cache(async () => {
  if (!redis) return null;
  const c = await cookies();
  const token = c.get('t')?.value;
  const [id, credenciales] = token ? await Promise.all([redis.get(`sesion:${token}`), redis.get(`sesion-credenciales:${token}`)]) : [];
  const u = id && (await redis.hget('usuarios', id));
  // Las sesiones anteriores, sin huella, siguen valiendo hasta su caducidad o cierre.
  if (credenciales && (!u || credenciales !== credencialesDe(u.pass))) return null;
  // e: la empresa con la que trabaja en este dispositivo (si tiene varias).
  if (!u) return null;
  const r = await conEmpresa(u, c.get('e')?.value);
  await apuntarActividad(r.id, r.empresa); // panel /admin (lib/actividad.js)
  return r;
});

// Lo que es de la empresa (y comparten todos sus usuarios), no de cada persona.
const DE_EMPRESA = ['emisor', 'marca', 'drive', 'driveError', 'pagos130', 'pres303', 'prorrata', 'pagadosHacienda', 'pagos202', 'rend130', 'cuotaIS', 'controlat', 'controlatEmail', 'actividades', 'fiscal', 'pendiente', 'verifactu', 'plan', 'envio', 'gestoria'];

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

// La ficha de una persona es una sola para todas sus empresas. Quien la cambia la vuelve a leer y la guarda bajo el
// cerrojo de esa persona: dos cambios a la vez (sus permisos en dos empresas, o su contraseña mientras le quitan el
// acceso) no se pisan ni devuelven un acceso ya quitado (auditoría de octubre de 2026, Codex H7). fn recibe la ficha
// de ese momento y devuelve la nueva, o nada para no guardar. Dentro, nada lento: la contraseña se comprueba y se cifra antes.
export async function cambiarUsuario(id, fn) {
  return conCerrojo(`usuario:${id}`, async () => {
    const u = await redis.hget('usuarios', id);
    const nuevo = u ? await fn(u) : null;
    if (nuevo) await redis.hset('usuarios', { [id]: nuevo });
    return nuevo || null;
  }, { caduca: 15000, espera: 10000 });
}

// Le quita el acceso a una empresa; si era la única, se borra su cuenta. Se decide con la ficha de ese momento.
export async function quitarDeEmpresa(id, empresa) {
  let borrar = false;
  await cambiarUsuario(id, (x) => {
    const m = membresias(x);
    if (!m[empresa]) return null;
    if (Object.keys(m).length > 1) return conMembresia(x, empresa, null);
    borrar = true;
    return null;
  });
  if (borrar) await borrarUsuario(id);
}

// Crea otra empresa en la misma cuenta, con esta persona de administradora (empieza por el cuestionario).
// datos: lo que llega del registro con sesión (emisor, plan, fiscal, censo); sin él, empresa vacía (Fundador, /admin).
export async function nuevaEmpresa(uid, nombre, datos = {}) {
  const o = await redis.hget('usuarios', uid);
  const n = String(nombre || '').trim().slice(0, 80);
  if (!o || !n) return { error: 'Falta el nombre de la empresa' };
  if (Object.keys(membresias(o)).length >= 10) return { error: 'Como mucho 10 empresas por cuenta' };
  const id = randomUUID().slice(0, 8);
  await redis.hset('empresas', { [id]: { id, nombre: n, creada: new Date().toISOString(), emisor: {}, pendiente: true, ...datos } });
  await cambiarUsuario(uid, (x) => conMembresia(x, id, { rol: 'admin' }));
  return { id };
}

// Bloqueo en el servidor: tras entrar (contraseña, llave de acceso, invitación) la cookie «d» (de sesión: se va al
// cerrar la app) apunta a desbloqueo:<d> → token de sesión, con caducidad que se alarga con el uso. Sin ella, las
// páginas no dan datos: mandan a /bloqueo. BLOQUEO_SERVIDOR: «activo» bloquea, «off» nada, si no solo lo registra.
const DESBLOQUEO = 60 * 15;
export const opcionesDesbloqueo = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' };
export const modoBloqueo = () => ({ activo: 'activo', off: 'off' })[process.env.BLOQUEO_SERVIDOR] || 'registrar';
// Como en cualquier web, la sesión basta: el bloqueo solo va si la persona lo activa (Ajustes › Face ID y contraseña).
export const bloqueoDe = (u) => (u?.bloqueoPantalla && modoBloqueo() !== 'off' ? 'activo' : 'off');

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
  const modo = bloqueoDe(u);
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
  if (!de || (id && !mismoId(de, id))) return null;
  await redis.del(`verificar:${String(token)}`);
  const u = await cambiarUsuario(de, (x) => ({ ...x, emailVerificado: true }));
  return u ? String(de) : null;
}

// Las cuentas creadas antes de activar la comprobación cuentan como confirmadas: nadie de antes se queda fuera.
const CONFIRMADAS_ANTES = '2026-10-11T18:30:00.000Z';

// true si hay que cortarle el paso por no haber confirmado el email.
export function bloquearPorEmail(u) {
  if (u.emailVerificado !== false || String(u.creado || '') < CONFIRMADAS_ANTES) return false;
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

export async function crearSesion(id, pass) {
  const u = await redis.hget('usuarios', id);
  if (!u || (pass !== undefined && pass !== u.pass)) return null;
  const credenciales = credencialesDe(u.pass);
  const token = nuevoCodigo();
  // La huella se guarda junto a la sesión: nunca se publica una sesión nueva sin versión.
  await redis.multi().set(`sesion:${token}`, id, { ex: DURACION })
    .set(`sesion-credenciales:${token}`, credenciales, { ex: DURACION }).sadd(`sesiones:${id}`, token).exec();
  const actual = await redis.hget('usuarios', id);
  if (!actual || credenciales !== credencialesDe(actual.pass)) {
    await cerrarSesion(token);
    return null;
  }
  return token;
}

export async function cerrarSesion(token) {
  if (token) await redis.del(`sesion:${token}`, `sesion-credenciales:${token}`);
}

// Cierra todas las sesiones de un usuario (cambio de contraseña, borrado).
export async function cerrarSesiones(id) {
  const tokens = (await redis.smembers(`sesiones:${id}`)) || [];
  await redis.del(`sesiones:${id}`, ...tokens.flatMap((t) => [`sesion:${t}`, `sesion-credenciales:${t}`]));
}

// Quita todas las llaves de Face ID de una persona (al recuperar la contraseña: quien la ha perdido puede haber perdido
// también el dispositivo).
export async function borrarLlaves(id) {
  const llaves = Object.keys((await redis.hgetall(`passkeys:${id}`)) || {});
  if (llaves.length) await redis.hdel('passkey-usuario', ...llaves);
  await redis.del(`passkeys:${id}`);
}

export async function crearUsuario({ nombre, email, password, admin = false, empresa, empresaNombre, empresaDatos = {}, rol = 'admin', permisos = [] }) {
  const e = limpiarEmail(email);
  if (!e || !String(nombre || '').trim()) return { error: 'Faltan el nombre o el email' };
  if (await redis.hget('emails', e)) return { error: 'Ese email ya tiene cuenta' };
  if (password !== undefined) { const v = await validarContrasenaSegura(password, { email: e, nombre }); if (!v.ok) return { error: v.error }; }
  const u = { id: randomUUID().slice(0, 8), nombre: String(nombre).trim().slice(0, 60), email: e, admin, creado: new Date().toISOString(), emailVerificado: false };
  u.empresa = empresa || u.id;
  u.rol = rol === 'admin' ? 'admin' : 'miembro';
  if (u.rol !== 'admin') u.permisos = limpiarPermisos(permisos);
  // Las empresas nuevas empiezan con el cuestionario (pendiente) para elegir actividades y modelos.
  if (!empresa) await redis.hset('empresas', { [u.id]: { id: u.id, nombre: String(empresaNombre || u.nombre).trim().slice(0, 80), creada: u.creado, emisor: {}, pendiente: true, ...empresaDatos } });
  if (password) u.pass = await cifrar(password);
  await redis.hset('usuarios', { [u.id]: u });
  await redis.hset('emails', { [e]: u.id });
  if (password) return { usuario: u };
  const codigo = nuevoCodigo();
  await redis.hset('invitaciones', { [codigo]: u.id });
  return { usuario: u, codigo };
}

export async function entrar(email, password, ip) {
  const e = limpiarEmail(email);
  // El tope estricto va por email y IP: quien prueba contraseñas desde su IP no deja sin entrar a la persona desde la
  // suya. Por email solo hay un tope alto, contra una prueba repartida entre muchas IP.
  const intentos = `intentos:${e}:${ip || 'desconocida'}`;
  const porEmail = `intentos:${e}`;
  const porIp = `intentos-ip:${ip || 'desconocida'}`;
  const [nE, nT, nI] = await Promise.all([contarVentana(intentos, 900), contarVentana(porEmail, 900), contarVentana(porIp, 900)]);
  if (Number(nE) > 10 || Number(nT) > 100 || Number(nI) > 30) return { bloqueado: true };
  const id = await redis.hget('emails', e);
  const u = id && (await redis.hget('usuarios', id));
  const ok = (await comprobar(password, u?.pass || FALSO)) && Boolean(u?.pass);
  if (!ok) return null;
  // El intento se reservó antes de comprobarlo (una ráfaga no se cuela); si acierta, no cuenta: ni para el email ni
  // para la IP, que puede ser la de una oficina con muchos usuarios.
  await Promise.all([redis.del(intentos), redis.eval(DESCONTAR, [porEmail], []), redis.eval(DESCONTAR, [porIp], [])]);
  const token = await crearSesion(u.id, u.pass);
  return token ? { token } : null;
}

// v: el token del email de invitación (confirma el email). Sin él (enlace copiado por el administrador), queda sin confirmar.
export async function aceptarInvitacion(codigo, password, v) {
  const id = await redis.hget('invitaciones', codigo);
  const u = id && (await redis.hget('usuarios', id));
  if (!u) return { error: 'Esta invitación ya no es válida' };
  const vPass = await validarContrasenaSegura(password, { email: u.email, nombre: u.nombre });
  if (!vPass.ok) return { error: vPass.error };
  if (Date.now() - Date.parse(u.creado) > INVITACION_DIAS * 864e5) return { error: 'Esta invitación ha caducado. Pide otra al administrador.' };
  const pass = await cifrar(password);
  // HDEL es atómico: solo quien retira el código puede fijar la contraseña.
  if (!(await redis.hdel('invitaciones', codigo))) return { error: 'Esta invitación ya no es válida' };
  // Una invitación es para quien aún no tiene contraseña (quien ya la tiene entra en otra empresa con api/invitacion/unirse).
  if (!(await cambiarUsuario(id, (x) => (x.pass ? null : { ...x, pass })))) return { error: 'Esta invitación ya no es válida' };
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
  if (Object.keys(propios).length) await cambiarUsuario(u.id, (x) => ({ ...x, ...propios }));
  return { ...u, ...cambios };
}

export async function actualizarEmpresa(id, cambios) {
  const e = await redis.hget('empresas', id);
  if (e) await redis.hset('empresas', { [id]: { ...e, ...cambios } });
}

export async function cambiarPassword(u, actual, nueva) {
  if (!(await comprobar(actual, u.pass))) return { error: 'La contraseña actual no es correcta' };
  const vPass = await validarContrasenaSegura(nueva, { email: u.email, nombre: u.nombre });
  if (!vPass.ok) return { error: vPass.error };
  await actualizarUsuario(u, { pass: await cifrar(nueva) });
  await cerrarSesiones(u.id);
  return { ok: true, token: await crearSesion(u.id) };
}

// Quita a una persona. Las facturas y gastos son de la empresa: se quedan.
export async function borrarUsuario(id) {
  const u = await redis.hget('usuarios', id);
  if (!u || u.admin) return;
  await cerrarSesiones(id);
  const invit = (await redis.hgetall('invitaciones')) || {};
  const suyasI = Object.keys(invit).filter((c) => mismoId(invit[c], id));
  if (suyasI.length) await redis.hdel('invitaciones', ...suyasI);
  await redis.hdel('emails', u.email);
  await redis.hdel('usuarios', id);
  await borrarLlaves(id);
}

// Borra una empresa entera: todos sus datos y su gente (quien tenga otras empresas solo pierde el acceso a esta).
export async function borrarEmpresa(empresa) {
  const usuarios = Object.values((await redis.hgetall('usuarios')) || {}).filter((u) => membresias(u)[empresa]);
  const solo = (u) => Object.keys(membresias(u)).length === 1;
  if (usuarios.some((u) => u.admin && solo(u))) return;
  for (const u of usuarios) await quitarDeEmpresa(u.id, empresa);
  await redis.hdel('empresas', empresa);
  await redis.del(...DATOS.map((n) => clave({ empresa }, n)));
}
