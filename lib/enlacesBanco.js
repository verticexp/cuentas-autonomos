// Movimientos del banco emparejados con una factura o un gasto (banco:<empresa>, enlace { tipo, id }).
// Al borrar o anular el documento, sus movimientos vuelven a «pendiente» en la misma transacción que el borrado: si no,
// el banco apunta a un documento que ya no existe (y la copia nocturna no verifica, lib/copias.js coherenciaBancaria).
import { clave, leer } from './redis.js';

export const enlazadosCon = async (u, tipo, id) => ((await leer(u, 'banco')) || [])
  .filter((m) => m.estado === 'emparejado' && m.enlace?.tipo === tipo && m.enlace.id === id);

// Igual que deshacer un emparejamiento (lib/bancoServidor.js), sin tocar el documento, que se borra.
export const movimientoLibre = (m) => ({ ...m, estado: 'pendiente', enlace: undefined, antes: undefined, por: undefined, auto: undefined, autoDescartada: true });

export async function soltarEnlaces(u, tx, tipo, id) {
  const movs = await enlazadosCon(u, tipo, id);
  if (movs.length) tx.hset(clave(u, 'banco'), Object.fromEntries(movs.map((m) => [m.id, movimientoLibre(m)])));
  return movs.length;
}
