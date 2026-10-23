// Bandeja de Mensajes de Mi despacho: una conversación por cliente, con su último mensaje y lo que el despacho no ha leído.
import { redis } from './redis.js';
import { clientesVisibles } from './despachos.js';
import { mensajesDe, noLeidos } from './comentariosDespacho.js';

// [{ id, nombre, ultimo, noLeidos }]: primero las que tienen algo sin leer, después por el último mensaje y al final los
// clientes con los que aún no se ha hablado.
export async function conversaciones(d, uid) {
  const clientes = await clientesVisibles(d, uid);
  const datos = await Promise.all(clientes.map((c) => Promise.all([redis.hgetall(`despacho-comentarios:${c.id}`), redis.hgetall(`despacho-leido:${c.id}`)])));
  const lista = clientes.map((c, i) => {
    // Solo lo hablado con este despacho (no lo de una gestoría anterior del cliente).
    const hilos = Object.values(datos[i][0] || {}).filter((h) => !h.despacho || h.despacho === d.id);
    return { id: c.id, nombre: c.empresa.nombre || c.empresa.emisor?.nombre || '', ultimo: mensajesDe(hilos).at(-1) || null, noLeidos: noLeidos(hilos, datos[i][1] || {}, 'despacho') };
  });
  return lista.sort((a, b) => Number(b.noLeidos > 0) - Number(a.noLeidos > 0) || (b.ultimo?.fecha || '').localeCompare(a.ultimo?.fecha || '') || a.nombre.localeCompare(b.nombre, 'es'));
}
export const totalNoLeidos = (lista) => lista.reduce((n, c) => n + c.noLeidos, 0);

// El número de «Mensajes» en la barra (app/layout.js): guardado 30 segundos por persona para no leer todas las
// conversaciones en cada pantalla; se borra en cuanto alguien escribe o lee (invalidarNoLeidos).
const kNoLeidos = (despacho, uid) => `despacho-noleidos:${despacho}:${uid}`;
export async function noLeidosDespacho(d, uid) {
  const guardado = await redis.get(kNoLeidos(d.id, uid));
  if (guardado !== null && guardado !== undefined) return Number(guardado) || 0;
  const n = totalNoLeidos(await conversaciones(d, uid));
  await redis.set(kNoLeidos(d.id, uid), n, { ex: 30 });
  return n;
}
export async function invalidarNoLeidos(despachoId) {
  const d = despachoId && (await redis.hget('despachos', String(despachoId)));
  const ks = Object.keys(d?.miembros || {}).map((uid) => kNoLeidos(d.id, uid));
  if (ks.length) await redis.del(...ks);
}
