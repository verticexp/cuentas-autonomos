// Marca de cada empresa: color y logo, para la app y sus facturas.
export const COLORES = ['#0F1F1B', '#007AFF', '#0E7C86', '#248A3D', '#9B7A35', '#C4452C', '#8E3A8C', '#48484A'];
export const COLOR_BASE = '#0F1F1B';
export const colorValido = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c)) ? c.toUpperCase() : null);
export const logoValido = (l) => (typeof l === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(l) && l.length < 400000 ? l : null);

// Mezcla el color con blanco (t = 0 → color, 1 → blanco), para fondos suaves en la factura.
export function aclarar(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
