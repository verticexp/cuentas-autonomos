import { createPrivateKey, sign } from 'node:crypto';

// Notificaciones nativas de Android por FCM HTTP v1. FCM_CUENTA_SERVICIO contiene el JSON de la cuenta
// de servicio de Firebase. Los dispositivos: fcm:<usuario> → token → { nombre, creado } (app/api/push).
const env = (k) => process.env[k]?.trim() || '';
function cuentaServicio() {
  try {
    const c = JSON.parse(env('FCM_CUENTA_SERVICIO'));
    return ['project_id', 'client_email', 'private_key'].every((k) => typeof c?.[k] === 'string' && c[k].trim()) ? c : null;
  } catch { return null; }
}
export const fcmListo = () => Boolean(cuentaServicio());

// Se renueva cinco minutos antes de caducar; los envíos simultáneos comparten también el canje pendiente.
let token = null, pendiente = null;
async function tokenProveedor(cuenta) {
  const identidad = JSON.stringify([cuenta, env('FCM_TOKEN_URL')]);
  if (token?.identidad === identidad && Date.now() < token.hasta) return token.valor;
  if (pendiente?.identidad === identidad) return pendiente.promesa;
  const promesa = (async () => {
    const iat = Math.floor(Date.now() / 1000);
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const cuerpo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: cuenta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 })}`;
    const firma = sign('sha256', Buffer.from(cuerpo), createPrivateKey(cuenta.private_key.replace(/\\n/g, '\n'))).toString('base64url');
    const r = await fetch(env('FCM_TOKEN_URL') || 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cuerpo}.${firma}` }), signal: AbortSignal.timeout(10000) });
    const datos = await r.json();
    if (!r.ok || typeof datos.access_token !== 'string' || !datos.access_token) throw new Error(`OAuth ${r.status}`);
    token = { identidad, valor: datos.access_token, hasta: Date.now() + (Number(datos.expires_in) - 300) * 1000 };
    return token.valor;
  })();
  const actual = { identidad, promesa };
  pendiente = actual;
  try { return await promesa; } finally { if (pendiente === actual) pendiente = null; }
}

// El aviso de siempre en formato FCM; los datos para abrir la app siempre viajan como texto.
export function cargaFcm(token, aviso) {
  return { message: { token, notification: { title: String(aviso.titulo || 'Fisquo'), body: String(aviso.cuerpo || '') }, data: { url: String(aviso.url || '/') }, android: { priority: 'HIGH', ttl: '86400s', notification: { channel_id: 'avisos', ...(aviso.hilo ? { tag: String(aviso.hilo) } : {}), ...(Number.isInteger(aviso.numero) && aviso.numero >= 0 ? { notification_count: aviso.numero } : {}) } } } };
}
export const esTokenFcm = (t) => typeof t === 'string' && t.length >= 100 && t.length <= 4096 && /^[A-Za-z0-9_:\-]+$/.test(t);

// Un envío por dispositivo. Android no permite cambiar solo el número del icono sin mostrar un aviso.
export async function enviarFcm(tokens, aviso) {
  const cuenta = cuentaServicio();
  if (!cuenta || !tokens.length || aviso.soloNumero) return { enviados: 0, caducados: [] };
  let acceso;
  try { acceso = await tokenProveedor(cuenta); }
  catch (e) { console.warn('[fcm]', 0, e.message); return { enviados: 0, caducados: [] }; }
  const rs = await Promise.all(tokens.map(async (t) => {
    try {
      const r = await fetch(env('FCM_URL') || `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cuenta.project_id)}/messages:send`, { method: 'POST', headers: { Authorization: `Bearer ${acceso}`, 'content-type': 'application/json' }, body: JSON.stringify(cargaFcm(t, aviso)), signal: AbortSignal.timeout(10000) });
      let datos = {};
      try { datos = await r.json(); } catch {}
      const motivo = datos.error?.message || '';
      const detalles = Array.isArray(datos.error?.details) ? datos.error.details : [];
      const caducado = r.status === 404 || detalles.some((d) => d.errorCode === 'UNREGISTERED') || (r.status === 400 && detalles.some((d) => d.errorCode === 'INVALID_ARGUMENT') && /(?:registration|device|fcm)\s+token|message\.token/i.test(motivo + ' ' + JSON.stringify(detalles)));
      if (!r.ok && !caducado) console.warn('[fcm]', r.status, motivo);
      return { t, ok: r.ok, caducado };
    } catch (e) { console.warn('[fcm]', 0, e.message); return { t, ok: false, caducado: false }; }
  }));
  return { enviados: rs.filter((x) => x.ok).length, caducados: rs.filter((x) => x.caducado).map((x) => x.t) };
}
