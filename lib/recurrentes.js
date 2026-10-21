// Facturas recurrentes: una plantilla que crea la factura sola cada mes, el día elegido.
export const diaValido = (d) => Math.min(28, Math.max(1, Math.round(Number(d) || 1)));

export const mesAnterior = (mes) => { const [y, m] = mes.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// Meses que tocan y aún no se han creado, del más antiguo al más nuevo: el actual, desde su día, y el anterior si quedó sin
// crear (falló hasta acabar el mes o el cron no pasó su día). Antes el anterior se perdía sin aviso: con el día 28, un
// fallo en febrero no se reintentaba en marzo hasta el 28, y entonces se creaba marzo. Más atrás no se rellena: al reanudar
// una recurrente en pausa, `ultima` pasa al mes anterior (app/api/recurrentes) y no salen los meses parados.
export function mesesPendientes(r, hoy) {
  if (!r.activa) return [];
  const actual = hoy.slice(0, 7), anterior = mesAnterior(actual), ultima = r.ultima || '';
  return [...(ultima && anterior > ultima ? [anterior] : []), ...(Number(hoy.slice(8, 10)) >= r.dia && ultima < actual ? [actual] : [])];
}
export const tocaRecurrente = (r, hoy) => mesesPendientes(r, hoy).length > 0;
// Emails pendientes, uno por factura: los de antes guardaban uno solo en `envio`, que la factura del mes siguiente pisaba.
export const enviosPendientes = (r) => [...(r.envios || []), ...(r.envio ? [r.envio] : [])];

// Lo que se copia de la factura de origen (sin fecha, número, cobro ni envíos).
export const plantillaDe = (f) => Object.fromEntries(['actividad', 'cliente', 'concepto', 'base', 'ivaPct', 'irpfPct', 'lineas', 'nota', 'operacion']
  .filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
