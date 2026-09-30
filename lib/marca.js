// Marca de cada empresa: color y logo, para la app y sus facturas.
export const COLORES = ['#16213A', '#1F5FAD', '#0E7C86', '#0F6B45', '#9B7A35', '#B4442C', '#8A2F6B', '#3A3F4B'];
export const COLOR_BASE = '#16213A';
export const colorValido = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c)) ? c.toUpperCase() : null);
export const logoValido = (l) => (typeof l === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(l) && l.length < 400000 ? l : null);

// Mezcla el color con blanco (t = 0 → color, 1 → blanco), para fondos suaves en la factura.
export function aclarar(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
