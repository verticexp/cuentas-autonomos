// Avisos de la pestaña «Más» (app/mas/page.js): lo que cuenta cada uno y el texto que sale a la derecha de su fila.
// Lógica pura. Lo calcula y lo guarda por versión de los datos lib/avisosMasServidor.js, para no leer el histórico en
// cada visita (informe de capacidad E01/E06).
import { estadoDe } from './presupuestos.js';
import { inventario } from './inventario.js';

// Movimientos del banco sin conciliar: los mismos que la pantalla Banco enseña en «Pendientes» (lib/historialBanco.js).
export const cuentaBanco = (movimientos = []) => movimientos.filter((m) => !m.estado || m.estado === 'pendiente').length;

// Presupuestos abiertos: pendientes de respuesta (sin caducar) o aceptados sin facturar, como en la pantalla Presupuestos.
export const cuentaPresupuestos = (presupuestos = [], hoy) => presupuestos.filter((p) => ['pendiente', 'aceptado'].includes(estadoDe(p, hoy))).length;

// Productos en su stock mínimo o por debajo (y cuántos de ellos agotados), como en la pantalla Inventario.
export function cuentaInventario(datos, hoy) {
  const { bajos } = inventario(datos, { hoy });
  return { n: bajos.length, agotados: bajos.filter((p) => p.agotado).length };
}

// La cuenta guardada → { tono, texto } para la fila (components/MasLista.js), o null si no hay nada que avisar.
export function avisoDe(que, c) {
  if (que === 'banco') return c > 0 ? { tono: 'ambar', texto: `${c} sin conciliar` } : null;
  if (que === 'presupuestos') return c > 0 ? { tono: 'azul', texto: `${c} ${c === 1 ? 'abierto' : 'abiertos'}` } : null;
  if (que === 'inventario') return c?.n > 0 ? { tono: c.agotados ? 'rojo' : 'ambar', texto: `${c.n} bajo mínimo` } : null;
  return null;
}
