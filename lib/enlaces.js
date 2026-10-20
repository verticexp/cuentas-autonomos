// Cambiar enlaces públicos (informe de seguridad M2). Aparte de lib/portal.js para que el portal no cargue lo de cobros.
import { redis, clave } from './redis.js';
import { leerCliente } from './indices.js';
import { nifNormal as nif } from './fichas.js';
import { delCliente, enlaceActual, enlacePortal } from './portal.js';
import { anularEnlacePago } from './cobros.js';

// Cambiar el enlace del portal (lo ha reenviado el cliente por error, o ya no trabaja con él): el anterior deja de
// funcionar al momento, y también los enlaces de pago de sus facturas, que salían del portal. Devuelve el enlace nuevo.
export async function cambiarEnlacePortal(u, nombre, nifDoc) {
  const id = String(nombre || '').trim().toUpperCase();
  const cliente = redis && id && (await redis.hget(clave(u, 'clientes'), id));
  if (!cliente) return null;
  const identidad = nifDoc !== undefined ? nifDoc : cliente.nif;
  const actual = await enlaceActual(u, id, identidad);
  if (actual) {
    await redis.hdel('portal-enlaces', actual.token);
    await redis.hdel(clave(u, 'portales'), actual.clavePortal);
    const c = { ...cliente, id, ...(nif(identidad) ? { nif: identidad } : {}) };
    const facturas = await leerCliente(u, 'facturas', { nombre: c.id, nif: c.nif });
    for (const f of delCliente(c, facturas).filter((x) => x.pago)) await anularEnlacePago(u, f);
  }
  return enlacePortal(u, nombre, nifDoc);
}
