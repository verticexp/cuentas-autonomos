import { leer, leerUno, guardar, clave, redis } from './redis.js';
import { posiblesDuplicados, normalizarNumero } from './duplicados.js';
import { todasFichas, documentos, leerRango, unir } from './indices.js';
import { claveProveedor } from './proveedores.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { cerrojoPedidoProv } from './albaranesServidor.js';
import { estadoPedidoProv, sinRecepcionDeGasto } from './albaranes.js';
import { soltarEnlaces } from './enlacesBanco.js';
import { avisarEvento } from './eventos.js';

// Alta de un gasto ya validado y normalizado por el POST, antes de sus integraciones.
export async function crearGasto(u, gasto, { duplicadoConfirmado } = {}) {
  const duplicados = posiblesDuplicados(gasto, await candidatosDuplicados(u, gasto));
  if (duplicados.length && duplicadoConfirmado !== true) {
    return { error: 'Puede que este gasto ya esté apuntado', duplicados };
  }
  const g = { ...gasto };
  if (duplicadoConfirmado === true) g.duplicadoRevisado = duplicados.map((d) => d.id);
  await guardar(u, 'gastos', g);
  await avisarEvento(u, 'gasto.creado', g);
  return { gasto: g };
}

export async function candidatosDuplicados(u, gasto) {
  const fichas = await todasFichas(u, 'gastos');
  const fecha = Date.parse(`${gasto.fecha}T00:00:00Z`);
  // Ventana inclusiva de posiblesDuplicados (dias = 7), en UTC, incluso al cambiar de mes/año.
  const dia = (n) => new Date(fecha + n * 864e5).toISOString().slice(0, 10);
  const cercanos = Number.isFinite(fecha)
    ? await leerRango(u, 'gastos', dia(-7), dia(7))
    : await documentos(u, 'gastos', fichas.filter((f) => f.f === gasto.fecha).map((f) => f.id));
  const proveedor = claveProveedor(gasto);
  const yaLeidos = new Set(cercanos.map((g) => g.id));
  // El mismo número de factura del proveedor coincide aunque sea de hace años.
  const ids = fichas.filter((f) => !yaLeidos.has(f.id) && (
    (proveedor && normalizarNumero(gasto.numero) && claveProveedor({ proveedor: f.c, proveedorNif: f.n }) === proveedor)
    // El mismo adjunto (huella) coincide sin límite de fecha ni proveedor.
    || (gasto.archivo?.huella && f.h === gasto.archivo.huella))).map((f) => f.id);
  const candidatos = new Map(unir(cercanos, await documentos(u, 'gastos', ids)).map((g) => [g.id, g]));
  // La función pura conserva el orden del histórico dentro de cada certeza.
  return fichas.map((f) => candidatos.get(f.id)).filter(Boolean);
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

// editar(antes) → { gasto } (el gasto nuevo, ya validado) o { error, status }, o su promesa. Devuelve { antes, gasto } o el fallo.
export const editarGasto = (u, id, editar) => conPedidoDe(u, id, async () => {
  const antes = await leerUno(u, 'gastos', id);
  if (!antes) return { error: 'Ese gasto ya no existe', status: 404 };
  const r = await editar(antes);
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
  // Si estaba pagado por el banco, ese cargo vuelve a estar pendiente de emparejar.
  await soltarEnlaces(u, tx, 'gasto', id);
  await tx.exec();
  return { antes };
});

// Marca un gasto sin pagar como pagado (con la fecha de hoy, como «Marcar todo como pagado» de Proveedores). Es lo que hace
// «Pagado» al deslizar un gasto en el móvil. Un gasto que ya está pagado no se toca.
export const pagarGasto = (u, id, fecha) => editarGasto(u, id, (antes) => (antes.pendiente
  ? { gasto: { ...antes, pendiente: undefined, pagado: fecha } }
  : { error: 'Este gasto ya está pagado', status: 409 }));
