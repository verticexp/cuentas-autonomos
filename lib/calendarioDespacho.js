import { randomBytes } from 'node:crypto';
import { redis } from './redis.js';
import { cambiarDespacho, despachoDe, rolEn } from './despachos.js';

// Relee el miembro bajo el mismo cerrojo que los demás cambios del despacho.
async function cambiarCalendario(d, uid, token) {
  return cambiarDespacho(d.id, async (actual) => {
    if (!rolEn(actual, uid)) return { error: 'No perteneces a este despacho', status: 403 };
    const miembro = { ...actual.miembros[uid] };
    const anterior = miembro.calendario;
    if (token) {
      await redis.hset('despacho-calendarios', { [token]: { despacho: actual.id, uid } });
      miembro.calendario = token;
    } else delete miembro.calendario;
    if (anterior) await redis.hdel('despacho-calendarios', anterior);
    return { despacho: { ...actual, miembros: { ...actual.miembros, [uid]: miembro } }, token };
  });
}

export const crearCalendario = (d, uid) => cambiarCalendario(d, uid, randomBytes(24).toString('base64url'));
export const quitarCalendario = (d, uid) => cambiarCalendario(d, uid, null);

export async function calendarioDe(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const enlace = await redis.hget('despacho-calendarios', token);
  if (!enlace) return null;
  const d = await despachoDe(enlace.despacho);
  return rolEn(d, enlace.uid) && d.miembros[enlace.uid].calendario === token ? { d, uid: enlace.uid } : null;
}
