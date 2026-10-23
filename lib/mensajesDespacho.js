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
    const hilos = Object.values(datos[i][0] || {});
    return { id: c.id, nombre: c.empresa.nombre || c.empresa.emisor?.nombre || '', ultimo: mensajesDe(hilos).at(-1) || null, noLeidos: noLeidos(hilos, datos[i][1] || {}, 'despacho') };
  });
  return lista.sort((a, b) => Number(b.noLeidos > 0) - Number(a.noLeidos > 0) || (b.ultimo?.fecha || '').localeCompare(a.ultimo?.fecha || '') || a.nombre.localeCompare(b.nombre, 'es'));
}
export const totalNoLeidos = (lista) => lista.reduce((n, c) => n + c.noLeidos, 0);
