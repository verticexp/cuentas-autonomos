import { connect } from 'node:http2';
import { createPrivateKey, sign } from 'node:crypto';

// Notificaciones nativas de la app de iOS por APNs (mobile/ios/App/App/AvisosPlugin.swift): HTTP/2 con un token del
// proveedor (JWT ES256 firmado con la clave .p8 de «Apple Push Notifications service»). Variables: APPLE_TEAM_ID,
// APNS_KEY_ID, APNS_PRIVATE_KEY y, para una app compilada en Xcode sin TestFlight, APNS_ENTORNO=sandbox.
// Los dispositivos: apns:<usuario> → token → { nombre, creado } (app/api/push).
export const TOPIC = 'com.fisquo.app';
const env = (k) => process.env[k]?.trim() || '';
export const apnsListo = () => Boolean(env('APPLE_TEAM_ID') && env('APNS_KEY_ID') && env('APNS_PRIVATE_KEY'));
const servidor = () => (env('APNS_ENTORNO') === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');

// Apple pide renovar el token entre 20 y 60 minutos: se guarda 40.
let token = null;
export function tokenProveedor(ahora = Math.floor(Date.now() / 1000)) {
  if (token && ahora - token.iat < 2400) return token.jwt;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const cuerpo = `${b64({ alg: 'ES256', kid: env('APNS_KEY_ID') })}.${b64({ iss: env('APPLE_TEAM_ID'), iat: ahora })}`;
  const firma = sign('sha256', Buffer.from(cuerpo), { key: createPrivateKey(env('APNS_PRIVATE_KEY').replace(/\\n/g, '\n')), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  token = { iat: ahora, jwt: `${cuerpo}.${firma}` };
  return token.jwt;
}

// El aviso de siempre ({ titulo, cuerpo, url }) en el formato de APNs; url viaja aparte para abrirla al tocar.
export const cargaDe = (aviso) => ({ aps: { alert: { title: String(aviso.titulo || 'Fisquo'), body: String(aviso.cuerpo || '') }, sound: 'default' }, url: aviso.url || '/' });
export const esToken = (t) => typeof t === 'string' && /^[0-9a-f]{64,200}$/i.test(t);

// Envía a varios tokens por una sola conexión. Devuelve { enviados, caducados: [tokens que Apple ya no acepta] }.
export async function enviarApns(tokens, aviso) {
  if (!apnsListo() || !tokens.length) return { enviados: 0, caducados: [] };
  const sesion = connect(servidor());
  sesion.on('error', () => {});
  const jwt = tokenProveedor();
  const cuerpo = JSON.stringify(cargaDe(aviso));
  const uno = (t) => new Promise((resolver) => {
    const r = sesion.request({ ':method': 'POST', ':path': `/3/device/${t}`, authorization: `bearer ${jwt}`, 'apns-topic': TOPIC, 'apns-push-type': 'alert', 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400), 'content-type': 'application/json' });
    let estado = 0, datos = '';
    r.setTimeout(10000, () => r.close());
    r.on('response', (h) => { estado = h[':status']; });
    r.on('data', (c) => { datos += c; });
    r.on('end', () => {
      let motivo = '';
      try { motivo = JSON.parse(datos || '{}').reason || ''; } catch {}
      if (estado !== 200 && estado !== 410) console.warn('[apns]', estado, motivo);
      resolver({ t, ok: estado === 200, caducado: estado === 410 || ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(motivo) });
    });
    r.on('error', () => resolver({ t, ok: false, caducado: false }));
    r.end(cuerpo);
  });
  try {
    const rs = await Promise.all(tokens.map(uno));
    return { enviados: rs.filter((x) => x.ok).length, caducados: rs.filter((x) => x.caducado).map((x) => x.t) };
  } finally { sesion.close(); }
}
