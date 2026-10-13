// Albaranes y pedidos en el servidor: lo que lee y guarda en Redis (la lógica pura está en lib/albaranes.js).
import { guardar, leer } from './redis.js';
import { siguiente } from './albaranes.js';

// Numera y guarda un pedido o un albarán nuevo (o lo corrige, con `antes`, conservando su número).
export async function guardarDoc(u, datos, antes) {
  const anio = Number(datos.fecha.slice(0, 4));
  const numero = antes && antes.anio === anio ? antes.numero : siguiente((await leer(u, 'albaranes')) || [], datos.tipo, anio);
  const d = { ...(antes || {}), entrega: undefined, ...datos, id: antes?.id || crypto.randomUUID(), numero, anio, ...(antes ? { editado: new Date().toISOString() } : { creado: new Date().toISOString(), por: u.id }) };
  await guardar(u, 'albaranes', d);
  return d;
}

// Al borrar una factura hecha con albaranes, esos albaranes vuelven a estar pendientes de facturar.
export async function soltarAlbaranes(u, f) {
  const ids = new Set((f?.lineas || []).map((l) => l.albaran).filter(Boolean));
  if (!ids.size) return;
  for (const a of ((await leer(u, 'albaranes')) || []).filter((x) => ids.has(x.id) && x.factura === f.id)) await guardar(u, 'albaranes', { ...a, factura: undefined });
}

export async function siguientePedidoProv(u, anio) {
  return Math.max(0, ...((await leer(u, 'pedidosProv')) || []).filter((p) => p.anio === anio).map((p) => p.numero)) + 1;
}
