// Cambios sobre una factura ya guardada (auditoría P01). Quien escribe una factura completa a partir de una copia leída
// antes pisa lo que otro haya cambiado entre medias (un cobro de Stripe, un envío, un emparejamiento del banco). Todos
// los escritores pasan por aquí: bajo el cerrojo común de la factura se relee, se aplica solo su cambio y se guarda.
import { conCerrojo } from './cerrojo.js';
import { guardar, leerUno } from './redis.js';

// El mismo nombre que ya usaba el cobro de Stripe (lib/cobros.js): cobros, envíos y edición se serializan juntos.
export const cerrojoFactura = (u, id) => `cobro:${u.empresa || u.id}:${id}`;

// cambio(f, c) recibe la factura recién leída y devuelve la nueva ({ nueva }), un fallo ({ error, status }) o null/undefined
// para no tocar nada. Devuelve { factura, nueva: true|false } o el fallo.
export async function actualizarFactura(u, id, cambio, { hash = 'facturas', ...opciones } = {}) {
  return conCerrojo(cerrojoFactura(u, id), async (c) => {
    const f = await leerUno(u, hash, id);
    if (!f) return { error: 'Esa factura ya no existe', status: 404 };
    const r = await cambio(f, c);
    if (!r) return { factura: f, guardada: false };
    if (r.error) return r;
    await guardar(u, hash, r.nueva);
    return { factura: r.nueva, guardada: true, ...(r.extra ? { extra: r.extra } : {}) };
  }, opciones);
}
