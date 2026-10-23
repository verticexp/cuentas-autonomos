const COMUNES = new Set(`password password1 password123 123456 12345678 123456789 1234567890 12345678910 qwerty qwerty123 qwertyuiop contraseña contrasena contraseña123 contrasena123 fisquo2026 fisquo123456 netto2026 netto123456 admin administrador admin123 admin123456 welcome welcome123 bienvenido bienvenido1 letmein iloveyou monkey dragon football baseball abc123 abc123456 trustno1 sunshine princess master login acceso acceso123 secreto secret superman batman passw0rd password1234 password12345 changeme hola123456 madrid2026 barcelona2026`.split(' '));
const normalizar = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const MENSAJES_CONTRASENA = [
  'La contraseña debe tener al menos 10 caracteres.',
  'Añade una letra y un número, o usa al menos 16 caracteres.',
  'La contraseña no puede contener tu nombre ni la parte local de tu email.',
  'Esa contraseña es demasiado común o predecible.',
];

// Lo mismo, en una línea de ayuda bajo los campos de contraseña nueva (login del primer administrador, invitación, Ajustes).
export const AYUDA_CONTRASENA = 'Mínimo 10 caracteres, con letras y números (o 16 o más). Sin tu nombre ni contraseñas típicas.';

export function validarContrasena(pass, { email, nombre } = {}) {
  const p = String(pass || ''), n = normalizar(p), faltan = [];
  if (p.length < 10) faltan.push(MENSAJES_CONTRASENA[0]);
  if (p.length < 16 && !(/\p{L}/u.test(p) && /[0-9]/.test(p))) faltan.push(MENSAJES_CONTRASENA[1]);
  const personales = [normalizar(email).split('@')[0], normalizar(nombre), ...normalizar(nombre).split(/[^a-z]+/)];
  if (personales.some((v) => (v.match(/[a-z]/g) || []).length >= 4 && n.includes(v))) faltan.push(MENSAJES_CONTRASENA[2]);
  const secuencias = ['01234567890123456789', '12345678901234567890', 'abcdefghijklmnopqrstuvwxyz', 'qwertyuiopasdfghjklzxcvbnm'];
  if (COMUNES.has(n) || /^(.)\1+$/u.test(n) || (n.length > 0 && secuencias.some((s) => s.includes(n) || [...s].reverse().join('').includes(n)))) faltan.push(MENSAJES_CONTRASENA[3]);
  const ok = faltan.length === 0;
  const nivel = !p ? 0 : !ok ? 1 : p.length >= 20 ? 4 : p.length >= 14 ? 3 : 2;
  return { ok, ...(ok ? {} : { error: faltan[0] }), nivel, faltan };
}

