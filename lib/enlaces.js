// Cambiar enlaces públicos (informe de seguridad M2). Aparte de lib/portal.js para que el portal no cargue lo de cobros.
import { randomBytes } from 'node:crypto';
import { redis, clave, guardar, leerUno } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { leerCliente } from './indices.js';
import { nifNormal as nif } from './fichas.js';
import { delCliente, enlaceActual, enlacePortal } from './portal.js';
import { anularEnlacePago } from './cobros.js';

// Cambia el token público de un presupuesto: el anterior deja de valer al momento. El mismo cerrojo que aceptar y editar
// el presupuesto: nadie guarda a la vez con el token viejo. Devuelve el presupuesto con el token nuevo, o null si no existe.
export async function cambiarEnlacePresupuesto(u, id) {
  return conCerrojo(`presupuesto:${u.empresa || u.id}:${id}`, async () => {
    const antes = id && (await leerUno(u, 'presupuestos', id));
    if (!antes) return null;
    const token = randomBytes(18).toString('base64url');
    await redis.hset('presupuesto-enlaces', { [token]: { empresa: u.empresa || u.id, id } });
    await guardar(u, 'presupuestos', { ...antes, token });
    if (antes.token) await redis.hdel('presupuesto-enlaces', antes.token);
    return { ...antes, token };
  });
}

// Cambiar el enlace del portal (lo ha reenviado el cliente por error, o ya no trabaja con él): el anterior deja de
// funcionar al momento, y también los enlaces de pago de sus facturas y los de sus presupuestos, que salían del portal. Devuelve el enlace nuevo.
export async function cambiarEnlacePortal(u, nombre, nifDoc) {
  const id = String(nombre || '').trim().toUpperCase();
  const cliente = redis && id && (await redis.hget(clave(u, 'clientes'), id));
  if (!cliente) return null;
  const identidad = nifDoc !== undefined ? nifDoc : cliente.nif;
  const actual = await enlaceActual(u, id, identidad);
  if (actual) {
    await redis.hdel('portal-enlaces', actual.token);
    await redis.hdel(clave(u, 'portales'), actual.clavePortal);
    const c = { ...cliente, id, nif: nif(identidad) ? identidad : '' };
    const facturas = await leerCliente(u, 'facturas', { nombre: c.id, nif: c.nif });
    for (const f of delCliente(c, facturas).filter((x) => x.pago)) await anularEnlacePago(u, f);
    const presupuestos = await leerCliente(u, 'presupuestos', { nombre: c.id, nif: c.nif });
    for (const p of delCliente(c, presupuestos).filter((x) => x.token)) await cambiarEnlacePresupuesto(u, p.id);
  }
  return enlacePortal(u, nombre, nifDoc);
}
