// Conexión con los bancos (PSD2) a través de Enable Banking, que pone su licencia AISP.
// Hace falta en Vercel: ENABLE_BANKING_APP_ID (id de la aplicación) y ENABLE_BANKING_KEY (su clave privada .pem).
// ENABLE_BANKING_URL solo para el simulador de las pruebas (tests/e2e/banco-local.py).
import { createSign } from 'node:crypto';

// En producción de Vercel nunca el simulador, aunque ENABLE_BANKING_URL esté puesta por error.
const API = () => (process.env.VERCEL_ENV !== 'production' && process.env.ENABLE_BANKING_URL) || 'https://api.enablebanking.com';
// Dirección fija de la app para la vuelta del banco (APP_URL, p. ej. https://www.nettohq.com); sin ella, la de la petición.
export const urlApp = (req) => (process.env.APP_URL || req.nextUrl.origin).replace(/\/$/, '');
export const bancoListo = () => Boolean(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_KEY);
// El botón de conectar el banco aún no se enseña a todo el mundo: solo a las cuentas de BANCO_DIRECTO (emails separados
// por comas, «*» para todas). Sin la variable, solo la del administrador de Netto. Subir extractos sigue abierto a todos.
const DIRECTO = () => (process.env.BANCO_DIRECTO ?? 'ramirezdelgadomarc@gmail.com').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
export const conectarVisible = (u) => bancoListo() && (DIRECTO().includes('*') || DIRECTO().includes(String(u?.email || '').trim().toLowerCase()));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

// Cada llamada va firmada con un JWT (RS256) de la aplicación; dura una hora.
function jwt() {
  const iat = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ typ: 'JWT', alg: 'RS256', kid: process.env.ENABLE_BANKING_APP_ID })}.${b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 })}`;
  const clave = process.env.ENABLE_BANKING_KEY.replace(/\\n/g, '\n');
  return `${cuerpo}.${createSign('RSA-SHA256').update(cuerpo).sign(clave, 'base64url')}`;
}

async function llamar(ruta, { metodo = 'GET', cuerpo } = {}) {
  const r = await fetch(API() + ruta, {
    method: metodo,
    headers: { Authorization: `Bearer ${jwt()}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!r) throw new Error('El banco no responde. Prueba en un rato.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.message || d.error || `Error del banco (${r.status})`), { status: r.status });
  return d;
}

export const listaBancos = async () => ((await llamar('/aspsps?country=ES')).aspsps || []).map((a) => ({
  nombre: a.name, tipos: a.psu_types || ['personal', 'business'], dias: Math.floor((a.maximum_consent_validity || 180 * 86400) / 86400),
}));

// Lleva al usuario a su banco para que dé permiso (máximo 180 días o lo que permita el banco).
export async function iniciar({ banco, tipo, dias, estado, vuelta }) {
  const valida = new Date(Date.now() + Math.max(1, Math.min(180, dias || 180)) * 864e5 - 60000).toISOString();
  const d = await llamar('/auth', { metodo: 'POST', cuerpo: { access: { valid_until: valida }, aspsp: { name: banco, country: 'ES' }, state: estado, redirect_url: vuelta, psu_type: tipo === 'business' ? 'business' : 'personal' } });
  return d.url;
}

// Con el código que devuelve el banco: la sesión y sus cuentas.
export async function abrirSesion(codigo) {
  const d = await llamar('/sessions', { metodo: 'POST', cuerpo: { code: codigo } });
  return {
    sesion: d.session_id, valida: d.access?.valid_until || null, banco: d.aspsp?.name || '',
    cuentas: (d.accounts || []).map((a) => (typeof a === 'string' ? { uid: a } : a)).map((a) => ({ uid: a.uid, iban: a.account_id?.iban || '', nombre: a.name || a.product || a.details || '' })),
  };
}

export const cerrarSesion = (sesion) => llamar(`/sessions/${encodeURIComponent(sesion)}`, { metodo: 'DELETE' }).catch(() => null);
export const saldos = async (uid) => (await llamar(`/accounts/${encodeURIComponent(uid)}/balances`)).balances || [];

export async function movimientos(uid, desde) {
  const out = [];
  let siguiente = '';
  for (let i = 0; i < 20; i++) {
    const d = await llamar(`/accounts/${encodeURIComponent(uid)}/transactions?date_from=${desde}${siguiente ? `&continuation_key=${encodeURIComponent(siguiente)}` : ''}`);
    out.push(...(d.transactions || []).filter((t) => t.status !== 'PDNG'));
    siguiente = d.continuation_key;
    if (!siguiente) break;
  }
  return out;
}
