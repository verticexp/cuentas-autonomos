// El vencimiento de un gasto sin pagar que no lo trae (lib/pagos.js): el plazo de la ficha de su proveedor (lib/terceros.js)
// o, sin ficha o sin plazo, el legal. Se guarda en el gasto al apuntarlo: si después cambia el plazo de la ficha, los
// gastos ya apuntados conservan el suyo (como el vencimiento de las facturas emitidas).
import { leerUno } from './redis.js';
import { claveProveedor } from './proveedores.js';
import { masDias, PLAZO_PAGO } from './pagos.js';

export async function plazoProveedor(u, g) {
  const k = g.proveedor && claveProveedor(g);
  const ficha = k ? await leerUno(u, 'fichasProv', k).catch(() => null) : null;
  return Number.isInteger(ficha?.plazo) && ficha.plazo >= 0 ? ficha.plazo : PLAZO_PAGO;
}

// r: { gasto } de lib/gastoCuerpo.js (o su error, que pasa tal cual).
export async function conVencimiento(u, r) {
  const g = r?.gasto;
  if (!g || !g.pendiente || g.vence) return r;
  return { ...r, gasto: { ...g, vence: masDias(g.fecha, await plazoProveedor(u, g)) } };
}
