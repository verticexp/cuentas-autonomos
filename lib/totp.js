// Códigos de un solo uso para la verificación en dos pasos (TOTP, RFC 6238 sobre HOTP, RFC 4226): HMAC-SHA1, 6 cifras,
// pasos de 30 segundos, como Google Authenticator, Microsoft Authenticator, 1Password o Authy. Se acepta el paso anterior
// y el siguiente (relojes desajustados) y nunca un paso ya usado. Más diez códigos de recuperación de un solo uso, de los
// que solo se guarda la huella. Sin acceso a la base de datos, para poder probarlo.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PASO = 30;

export function base32(buf) {
  let bits = 0, valor = 0, out = '';
  for (const b of buf) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(valor << (5 - bits)) & 31];
  return out;
}

export function deBase32(texto) {
  const limpio = String(texto || '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, valor = 0;
  const out = [];
  for (const ch of limpio) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Clave no válida');
    valor = (valor << 5) | i; bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// 160 bits, lo que recomienda el RFC 4226 para HMAC-SHA1.
export const nuevoSecreto = () => base32(randomBytes(20));
export const pasoDe = (ms = Date.now()) => Math.floor(ms / 1000 / PASO);

export function codigoTotp(secreto, paso) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const h = createHmac('sha1', deBase32(secreto)).update(contador).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const igual = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// El paso del código si vale (para guardarlo y no aceptarlo otra vez), o null. ultimo: el último paso aceptado.
export function comprobarTotp(secreto, codigo, { ahora = Date.now(), ultimo = -1 } = {}) {
  const c = String(codigo || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c) || !secreto) return null;
  const p = pasoDe(ahora);
  for (const q of [p, p - 1, p + 1]) if (q > ultimo && igual(codigoTotp(secreto, q), c)) return q;
  return null;
}

// Lo que lee la app de autenticación con el QR (formato «Key Uri» de Google Authenticator).
export const uriOtpauth = ({ secreto, email }) =>
  `otpauth://totp/${encodeURIComponent(`Fisquo:${email}`)}?secret=${secreto}&issuer=Fisquo&algorithm=SHA1&digits=6&period=${PASO}`;

// La clave en grupos de cuatro, para escribirla a mano si no se puede leer el QR.
export const claveLegible = (secreto) => String(secreto).match(/.{1,4}/g).join(' ');

// Códigos de recuperación: 8 caracteres sin los que se confunden (0/o, 1/l/i), en dos grupos.
const ALFABETO = 'abcdefghjkmnpqrstuvwxyz23456789';
export const esCodigoRecuperacion = (c) => /^[a-z2-9]{8}$/.test(String(c || '').toLowerCase().replace(/[\s-]/g, ''));
export function codigosRecuperacion(n = 10) {
  return Array.from({ length: n }, () => {
    const s = Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const huellaRecuperacion = (c) => createHash('sha256').update(String(c || '').toLowerCase().replace(/[\s-]/g, '')).digest('hex');
// La posición de la huella del código en la lista, o -1.
export const buscarRecuperacion = (huellas, codigo) => (esCodigoRecuperacion(codigo) ? (huellas || []).indexOf(huellaRecuperacion(codigo)) : -1);
