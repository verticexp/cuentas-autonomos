// Identidad con la que se vuelve a generar un documento ya emitido (auditoría F05): el emisor y la marca guardados al
// emitirlo (lib/facturas.js instantanea), no los ajustes de hoy. Las facturas de antes de guardarlos usan los actuales.
import { redis, clave } from './redis.js';
import { emisorDe } from './calculos.js';

// u: usuario o empresa ({ empresa } o { id }) con su emisor y marca actuales.
export async function identidadDoc(u, f) {
  const emisor = emisorDe(f, u);
  if (!f?.marca) return { emisor, marca: u?.marca };
  const logo = f.marca.logo && redis ? await redis.hget(clave(u, 'logos'), f.marca.logo) : null;
  return { emisor, marca: { ...(f.marca.color ? { color: f.marca.color } : {}), ...(logo ? { logo } : {}) } };
}
