import { NextResponse } from 'next/server';
import { cambiarUsuario, crearReto, crearSesion, opcionesCookie, RETO_DOS_PASOS } from './auth.js';
import { apuntarAcceso } from './accesos.js';
import { ponerEntrada } from './entrada.js';
import { nuevoAzar } from './social.js';
import { redis } from './redis.js';

// Lo que sigue a comprobar el id_token de Google o Apple (lib/social.js): a qué cuenta corresponde, abrir la sesión
// (o pedir el código de la verificación en dos pasos) y, si no hay cuenta, guardar la identidad para el alta.
// social-usuario: «proveedor:sub» → id de usuario · social-alta:<id> → identidad para /registro (30 min)
// social-canje:<código> → sesión o reto para la app de iOS (2 min; app/api/login/canjear).

export const NOMBRE = { google: 'Google', apple: 'Apple' };
export const ALTA_SEGUNDOS = 1800;
export const opcionesAlta = { ...opcionesCookie, maxAge: ALTA_SEGUNDOS };

// La cuenta de esta identidad. Si aún no estaba enlazada, la del mismo email (solo si el proveedor lo ha verificado),
// y queda enlazada. extra: lo que se guarda en u.social[proveedor] (el refresh_token de Apple, para revocarlo).
export async function cuentaDe(proveedor, persona, extra = {}) {
  const clave = `${proveedor}:${persona.sub}`;
  let id = await redis.hget('social-usuario', clave);
  if (!id && persona.email) id = await redis.hget('emails', persona.email);
  const u = id && (await redis.hget('usuarios', String(id)));
  if (!u) return null;
  if (u.social?.[proveedor]?.sub !== persona.sub || (extra.refresh && u.social[proveedor].refresh !== extra.refresh)) {
    // Otra identidad del mismo proveedor ya enlazada a esta cuenta: se cambia por la nueva (mismo email verificado).
    const antes = u.social?.[proveedor]?.sub;
    if (antes && antes !== persona.sub) await redis.hdel('social-usuario', `${proveedor}:${antes}`);
    await cambiarUsuario(u.id, (x) => ({ ...x, social: { ...x.social, [proveedor]: { ...x.social?.[proveedor], sub: persona.sub, ...extra } } }));
    await redis.hset('social-usuario', { [clave]: u.id });
  }
  return u;
}

// Sesión nueva para la cuenta, o el reto del segundo paso si lo tiene activado (como con la contraseña).
export async function abrirSesion(u) {
  if (u.dosPasos?.secreto) return { reto: await crearReto(u) };
  const token = await crearSesion(u.id, u.pass);
  return token ? { token } : null;
}

export async function guardarAlta(proveedor, persona, extra = {}) {
  const id = nuevoAzar();
  await redis.set(`social-alta:${id}`, { proveedor, sub: persona.sub, email: persona.email, nombre: persona.nombre, ...extra }, { ex: ALTA_SEGUNDOS });
  return id;
}
export const leerAlta = async (id) => (typeof id === 'string' && /^[\w-]{20,40}$/.test(id) ? redis.get(`social-alta:${id}`) : null);

// Respuesta de una entrada web ya resuelta: cookies de sesión y a la app (o al segundo paso).
export async function responderWeb(req, proveedor, u, abierta) {
  const url = (ruta) => new URL(ruta, req.url);
  if (!abierta) return NextResponse.redirect(url('/login?error=social'), 303);
  if (abierta.reto) {
    const res = NextResponse.redirect(url('/login/dos-pasos'), 303);
    res.cookies.set('reto', abierta.reto, { ...opcionesCookie, maxAge: RETO_DOS_PASOS });
    return res;
  }
  await apuntarAcceso(u.id, req, NOMBRE[proveedor]);
  return ponerEntrada(NextResponse.redirect(url(u.despacho ? '/despacho' : '/'), 303), abierta.token, u, { recien: true });
}

// En la app, Google vuelve a ASWebAuthenticationSession, que no comparte cookies con la app: un código de un solo uso
// que la app canjea en su propia vista web.
export async function codigoCanje(u, abierta, proveedor) {
  const c = nuevoAzar();
  await redis.set(`social-canje:${c}`, { id: u.id, proveedor, ...abierta }, { ex: 120 });
  return c;
}
export async function canjear(c) {
  if (typeof c !== 'string' || !/^[\w-]{20,40}$/.test(c)) return null;
  const v = await redis.get(`social-canje:${c}`);
  if (v) await redis.del(`social-canje:${c}`);
  return v;
}
