const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
// Espacio no separable: el € nunca se queda solo en la línea de abajo.
export const eur = (n) => `${num.format(n)}\u00A0€`;
export const pct = (n) => `${num.format(n)}%`;
// 21% o 12,5%: para las columnas estrechas de las líneas de factura.
export const pctCorto = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n)}%`;
export const fechaCorta = (f) => f.split('-').reverse().join('-');
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
export const eurSin = (n) => num.format(n);
export const fechaTexto = (f) => new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
// Estado de un trimestre del 303/130 en texto (ver situacionTrimestre en calculos.js); `plazo` es la fecha límite
// en texto («20 de octubre») y `nota`, un añadido opcional («se marca en el 130»).
export function textoSituacion({ estado, dias }, plazo, nota) {
  const extra = nota ? ` · ${nota}` : '';
  if (estado === 'curso') return `En curso · se presenta hasta el ${plazo}`;
  if (estado === 'fuera') return `Fuera de plazo · venció el ${plazo}${extra}`;
  const hasta = dias === 0 ? `hasta hoy, ${plazo}` : dias === 1 ? `hasta mañana, ${plazo}` : `hasta el ${plazo}`;
  return `Listo para presentar · ${hasta}${extra}`;
}
// «Evento del 12-06-2026 en Hotel Arts»: para facturas y presupuestos de eventos.
export const textoEvento = (x) => (x.evento?.fecha || x.evento?.lugar ? `Evento${x.evento.fecha ? ` del ${fechaCorta(x.evento.fecha)}` : ''}${x.evento.lugar ? ` en ${x.evento.lugar}` : ''}` : '');
