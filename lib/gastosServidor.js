import { leer, leerUno, guardar, clave, redis } from './redis.js';
import { posiblesDuplicados } from './duplicados.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { cerrojoPedidoProv } from './albaranesServidor.js';
import { estadoPedidoProv, sinRecepcionDeGasto } from './albaranes.js';

// Alta de un gasto ya validado y normalizado por el POST, antes de sus integraciones.
export async function crearGasto(u, gasto, { duplicadoConfirmado } = {}) {
  const duplicados = posiblesDuplicados(gasto, (await leer(u, 'gastos')) || []);
  if (duplicados.length && duplicadoConfirmado !== true) {
    return { error: 'Puede que este gasto ya esté apuntado', duplicados };
  }
  const g = { ...gasto };
  if (duplicadoConfirmado === true) g.duplicadoRevisado = duplicados.map((d) => d.id);
  await guardar(u, 'gastos', g);
  return { gasto: g };
}

// Informe R04: el gasto de una recepción y la recepción de su pedido no pueden contar unidades distintas. Su edición y su
// borrado van bajo el cerrojo del pedido (el mismo de recibir), releyendo el gasto dentro.
async function conPedidoDe(u, id, fn) {
  const g = await leerUno(u, 'gastos', id);
  if (!g?.pedidoProv) return fn();
  try { return await conCerrojo(cerrojoPedidoProv(u, g.pedidoProv), fn); } catch (e) {
    if (e instanceof Ocupado) return { error: e.message, status: 409 };
    throw e;
  }
}

// Las unidades, productos y costes de lo recibido se corrigen en el pedido (borrando el gasto y volviendo a recibir),
// no desde Gastos: si no, el gasto y la recepción dirían cosas distintas y el inventario acabaría con más de lo pedido.
const mismoStock = (a, b) => JSON.stringify((a || []).map(({ producto, cantidad, coste }) => [producto, Number(cantidad), Number(coste)]))
  === JSON.stringify((b || []).map(({ producto, cantidad, coste }) => [producto, Number(cantidad), Number(coste)]));

// editar(antes) → { gasto } (el gasto nuevo, ya validado) o { error, status }. Devuelve { antes, gasto } o el fallo.
export const editarGasto = (u, id, editar) => conPedidoDe(u, id, async () => {
  const antes = await leerUno(u, 'gastos', id);
  if (!antes) return { error: 'Ese gasto ya no existe', status: 404 };
  const r = editar(antes);
  if (r.error) return r;
  if (antes.pedidoProv && !mismoStock(antes.stock, r.gasto.stock)) return { error: 'Lo recibido de un pedido no se cambia desde Gastos: borra este gasto y vuelve a recibir el pedido con las unidades y costes correctos' };
  await guardar(u, 'gastos', r.gasto);
  return { antes, gasto: r.gasto };
});

// Borra el gasto y, si era de una recepción, la quita del pedido (recupera sus unidades pendientes) en la misma transacción.
export const borrarGasto = (u, id) => conPedidoDe(u, id, async () => {
  const antes = await leerUno(u, 'gastos', id);
  if (!antes) return { antes: null };
  const tx = redis.multi().hdel(clave(u, 'gastos'), id);
  const pedido = antes.pedidoProv && (await leerUno(u, 'pedidosProv', antes.pedidoProv));
  const sinRecepcion = sinRecepcionDeGasto(pedido, id);
  if (sinRecepcion) tx.hset(clave(u, 'pedidosProv'), { [pedido.id]: sinRecepcion });
  else if (pedido?.gasto === id) {
    const p = { ...pedido, recibido: undefined, gasto: undefined };
    tx.hset(clave(u, 'pedidosProv'), { [p.id]: { ...p, estado: estadoPedidoProv(p).estado } });
  }
  await tx.exec();
  return { antes };
});
