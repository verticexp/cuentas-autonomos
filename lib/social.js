import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';

// Entrar con Google y con Apple (OpenID Connect). En la web, con redirección (app/api/login/social); en la app de iOS,
// Google con ASWebAuthenticationSession y Apple con su hoja nativa (mobile/ios/App/App/AccesoPlugin.swift,
// app/api/login/apple). Aquí solo lo que no depende de Redis: configuración, URL de autorización, comprobar el
// id_token con las claves públicas del proveedor y el client_secret de Apple.
// Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET · APPLE_TEAM_ID, APPLE_SERVICES_ID (web), APPLE_KEY_ID,
// APPLE_PRIVATE_KEY (la .p8 de «Sign in with Apple»). Sin ellas, los botones no salen.

export const BUNDLE_APP = 'com.fisquo.app';
export const PROVEEDORES = ['google', 'apple'];

const ISS = { google: ['https://accounts.google.com', 'accounts.google.com'], apple: ['https://appleid.apple.com'] };
const JWKS = { google: 'https://www.googleapis.com/oauth2/v3/certs', apple: 'https://appleid.apple.com/auth/keys' };
const TOKEN = { google: 'https://oauth2.googleapis.com/token', apple: 'https://appleid.apple.com/auth/token' };
const AUTORIZAR = { google: 'https://accounts.google.com/o/oauth2/v2/auth', apple: 'https://appleid.apple.com/auth/authorize' };

const env = (k) => process.env[k]?.trim() || '';
export const googleListo = () => Boolean(env('GOOGLE_CLIENT_ID') && env('GOOGLE_CLIENT_SECRET'));
export const appleListo = () => Boolean(env('APPLE_TEAM_ID') && env('APPLE_SERVICES_ID') && env('APPLE_KEY_ID') && env('APPLE_PRIVATE_KEY'));
export const socialListo = () => ({ google: googleListo(), apple: appleListo() });

export const nuevoAzar = () => randomBytes(24).toString('base64url');
export const sha256Hex = (t) => createHash('sha256').update(String(t)).digest('hex');

// client_id de cada proveedor. Apple: el Services ID en la web y el bundle de la app en la hoja nativa.
export const clienteDe = (proveedor, { nativo = false } = {}) => (proveedor === 'google' ? env('GOOGLE_CLIENT_ID') : nativo ? BUNDLE_APP : env('APPLE_SERVICES_ID'));

export function urlAutorizar(proveedor, { state, nonce, vuelta }) {
  const p = new URLSearchParams({ client_id: clienteDe(proveedor), redirect_uri: vuelta, response_type: 'code', state, nonce });
  if (proveedor === 'google') { p.set('scope', 'openid email profile'); p.set('prompt', 'select_account'); }
  // Apple solo da el nombre y el email con form_post (vuelve por POST desde appleid.apple.com).
  else { p.set('scope', 'name email'); p.set('response_mode', 'form_post'); }
  return `${AUTORIZAR[proveedor]}?${p}`;
}

// El client_secret de Apple es un JWT ES256 firmado con la clave .p8 (máximo 6 meses; aquí, 5 minutos).
export function secretoApple(cliente, ahora = Math.floor(Date.now() / 1000)) {
  const pem = env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const cuerpo = `${b64({ alg: 'ES256', kid: env('APPLE_KEY_ID') })}.${b64({ iss: env('APPLE_TEAM_ID'), iat: ahora, exp: ahora + 300, aud: 'https://appleid.apple.com', sub: cliente })}`;
  const firma = sign('sha256', Buffer.from(cuerpo), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${cuerpo}.${firma}`;
}

const secretoDe = (proveedor, cliente) => (proveedor === 'google' ? env('GOOGLE_CLIENT_SECRET') : secretoApple(cliente));

// Canjea el código de autorización: { id_token, refresh_token? }. vuelta: la redirect_uri (no la lleva la hoja de Apple).
export async function canjearCodigo(proveedor, code, { vuelta, nativo = false } = {}) {
  const cliente = clienteDe(proveedor, { nativo });
  const p = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: cliente, client_secret: secretoDe(proveedor, cliente) });
  if (vuelta) p.set('redirect_uri', vuelta);
  const r = await fetch(TOKEN[proveedor], { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p, signal: AbortSignal.timeout(10000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) throw new Error(`${proveedor}: ${j.error || r.status}`);
  return j;
}

// Al borrar una cuenta que entró con Apple hay que revocar su autorización (norma 5.1.1(v) de la App Store).
export async function revocarApple({ refresh, nativo }) {
  if (!refresh || !appleListo()) return;
  const cliente = clienteDe('apple', { nativo });
  await fetch('https://appleid.apple.com/auth/revoke', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ client_id: cliente, client_secret: secretoApple(cliente), token: refresh, token_type_hint: 'refresh_token' }),
  }).catch((e) => console.warn('[social] revocar Apple:', e.message));
}

let cacheClaves = {};
async function claves(proveedor, forzar = false) {
  const c = cacheClaves[proveedor];
  if (!forzar && c && Date.now() - c.en < 3600_000) return c.keys;
  const r = await fetch(JWKS[proveedor], { signal: AbortSignal.timeout(10000) });
  const { keys = [] } = await r.json();
  cacheClaves[proveedor] = { keys, en: Date.now() };
  return keys;
}

const parte = (t) => JSON.parse(Buffer.from(t, 'base64url').toString('utf8'));

// Comprueba un id_token: firma RS256 con la clave del proveedor, emisor, audiencia, caducidad y nonce.
// nonce: el que se mandó (en la hoja de Apple, el token lleva su SHA-256). Devuelve los datos de la persona o lanza.
// buscar: para las pruebas (por defecto, las claves publicadas del proveedor).
export async function comprobarIdToken(proveedor, idToken, { audiencia, nonce, ahora = Date.now() / 1000, buscar = claves } = {}) {
  const [h, c, f] = String(idToken || '').split('.');
  if (!h || !c || !f) throw new Error('Token no válido');
  const cab = parte(h), d = parte(c);
  if (cab.alg !== 'RS256') throw new Error('Algoritmo no admitido');
  let jwk = (await buscar(proveedor)).find((k) => k.kid === cab.kid);
  if (!jwk) jwk = (await buscar(proveedor, true)).find((k) => k.kid === cab.kid);
  if (!jwk) throw new Error('Clave desconocida');
  const ok = verify('RSA-SHA256', Buffer.from(`${h}.${c}`), createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(f, 'base64url'));
  if (!ok) throw new Error('Firma no válida');
  if (!ISS[proveedor].includes(d.iss)) throw new Error('Emisor no válido');
  const auds = Array.isArray(d.aud) ? d.aud : [d.aud];
  if (!auds.includes(audiencia)) throw new Error('Audiencia no válida');
  if (!(Number(d.exp) > ahora - 60)) throw new Error('Token caducado');
  if (nonce !== undefined && d.nonce !== nonce) throw new Error('Nonce no válido');
  if (!d.sub) throw new Error('Sin identificador');
  const verificado = d.email_verified === true || d.email_verified === 'true';
  return { sub: String(d.sub), email: verificado && d.email ? String(d.email).trim().toLowerCase() : '', nombre: String(d.name || '').trim().slice(0, 60) };
}
