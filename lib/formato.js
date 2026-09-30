const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
// Espacio no separable: el € nunca se queda solo en la línea de abajo.
export const eur = (n) => `${num.format(n)}\u00A0€`;
export const pct = (n) => `${num.format(n)}%`;
export const fechaCorta = (f) => f.split('-').reverse().join('-');
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
