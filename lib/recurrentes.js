// Facturas recurrentes: una plantilla que crea la factura sola cada mes, el día elegido.
export const diaValido = (d) => Math.min(28, Math.max(1, Math.round(Number(d) || 1)));

// Toca si está activa, ya es (o pasó) su día de este mes y este mes aún no se ha creado.
export const tocaRecurrente = (r, hoy) => Boolean(r.activa) && Number(hoy.slice(8, 10)) >= r.dia && (r.ultima || '') < hoy.slice(0, 7);

// Lo que se copia de la factura de origen (sin fecha, número, cobro ni envíos).
export const plantillaDe = (f) => Object.fromEntries(['actividad', 'cliente', 'concepto', 'base', 'ivaPct', 'irpfPct', 'lineas', 'nota']
  .filter((k) => f[k] !== undefined).map((k) => [k, f[k]]));
