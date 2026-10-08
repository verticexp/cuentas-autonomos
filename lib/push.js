// Notificaciones push de la PWA (web-push con claves VAPID). Suscripciones por usuario: push:<id> → { endpoint: suscripción }.
import webpush from 'web-push';
import { redis, leer } from './redis.js';
import { avisosDelDia } from './avisos.js';
import { fiscalDe } from './empresa.js';
import { puede } from './permisos.js';

const { VAPID_PUBLIC_KEY: publica, VAPID_PRIVATE_KEY: privada } = process.env;
export const pushListo = () => Boolean(publica && privada);
export const clavePublica = () => publica || '';

export async function enviarPush(idUsuario, aviso) {
  if (!pushListo()) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:avisos@netto.app', publica, privada);
  const subs = (await redis.hgetall(`push:${idUsuario}`)) || {};
  let n = 0;
  for (const [endpoint, sub] of Object.entries(subs)) {
    try { await webpush.sendNotification(sub, JSON.stringify(aviso), { TTL: 86400 }); n += 1; }
    catch (e) { if ([404, 410].includes(e.statusCode)) await redis.hdel(`push:${idUsuario}`, endpoint); } // el móvil ya no la acepta
  }
  return n;
}

// Cron de cada mañana: a cada usuario con el móvil suscrito, sus avisos del día (una vez por día y tipo).
export async function avisosPush(dia) {
  if (!pushListo()) return 0;
  const empresas = (await redis.hgetall('empresas')) || {};
  let enviados = 0;
  for (const usu of Object.values((await redis.hgetall('usuarios')) || {})) {
    if (!(await redis.hlen(`push:${usu.id}`))) continue;
    const emp = empresas[usu.empresa || usu.id];
    if (!emp) continue;
    const u = { ...usu, ...emp, id: usu.id, empresa: emp.id };
    const avisos = avisosDelDia({ facturas: puede(u, 'facturas') ? await leer(u, 'facturas') : [], plazo: emp.emisor?.plazo, fiscal: puede(u, 'resumen') ? fiscalDe(emp) : {}, cuotaIS: emp.cuotaIS }, dia);
    for (const a of avisos) {
      if (!(await redis.set(`avisado:${usu.id}:${dia}:${a.tipo}`, 1, { nx: true, ex: 172800 }))) continue;
      enviados += await enviarPush(usu.id, a);
    }
  }
  return enviados;
}
