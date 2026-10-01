const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
// Espacio no separable: el € nunca se queda solo en la línea de abajo.
export const eur = (n) => `${num.format(n)}\u00A0€`;
export const pct = (n) => `${num.format(n)}%`;
export const fechaCorta = (f) => f.split('-').reverse().join('-');
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
export const eurSin = (n) => num.format(n);
export const fechaTexto = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
// «Evento del 12-06-2026 en Hotel Arts»: para facturas y presupuestos de eventos.
export const textoEvento = (x) => (x.evento?.fecha || x.evento?.lugar ? `Evento${x.evento.fecha ? ` del ${fechaCorta(x.evento.fecha)}` : ''}${x.evento.lugar ? ` en ${x.evento.lugar}` : ''}` : '');
