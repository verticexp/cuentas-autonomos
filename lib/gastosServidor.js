import { leer, guardar } from './redis.js';
import { posiblesDuplicados } from './duplicados.js';

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
