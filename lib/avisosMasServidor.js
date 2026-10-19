// Avisos de «Más» guardados por versión de los datos (informe de capacidad E06, como lib/panelCache.js). La clave lleva
// el contador de cada colección que usa el aviso (rev:<empresa>, lo sube lib/redis.js en la misma transacción que cada
// escritura) y el día: mientras no cambie nada de eso, la página se sirve con dos lecturas pequeñas, sin documentos.
// Se lee la versión antes que los datos: si alguien escribe en medio, lo calculado queda con la versión vieja y la
// siguiente visita lo calcula de nuevo. La clave es de la empresa y caduca sola en un día.
import { redis, leer } from './redis.js';
import { claveVersion } from './fichas.js';
import { datosStock } from './stockServidor.js';
import { avisoDe, cuentaBanco, cuentaInventario, cuentaPresupuestos } from './avisosMas.js';

// Sube la versión (avisos:vN) si cambia lo que se guarda de algún aviso.
const V = 'avisos:v1';
const empresa = (u) => u.empresa || u.id;

const AVISOS = {
  banco: { cols: ['banco'], calcular: async (u) => cuentaBanco((await leer(u, 'banco')) || []) },
  presupuestos: { cols: ['presupuestos'], calcular: async (u, hoy) => cuentaPresupuestos((await leer(u, 'presupuestos')) || [], hoy) },
  inventario: { cols: ['facturas', 'gastos', 'productos', 'stock', 'albaranes'], calcular: async (u, hoy) => cuentaInventario(await datosStock(u), hoy) },
};
export const AVISOS_MAS = Object.keys(AVISOS);

// que: los avisos que esta persona puede ver ('banco', 'presupuestos', 'inventario'). Devuelve { que: aviso | null }.
export async function avisosMas(u, que, hoy) {
  que = que.filter((q) => AVISOS[q]);
  if (!redis || !que.length) return {};
  const rev = (await redis.hgetall(claveVersion(empresa(u)))) || {};
  const k = (q) => `${V}:${q}:${empresa(u)}:${hoy}:${AVISOS[q].cols.map((c) => Number(rev[c]) || 0).join('.')}`;
  const guardados = await Promise.all(que.map((q) => redis.get(k(q))));
  const cuentas = await Promise.all(que.map(async (q, i) => {
    if (guardados[i] !== null && guardados[i] !== undefined) return guardados[i];
    const c = await AVISOS[q].calcular(u, hoy);
    await redis.set(k(q), c, { ex: 86400 });
    return c;
  }));
  return Object.fromEntries(que.map((q, i) => [q, avisoDe(q, cuentas[i])]));
}
