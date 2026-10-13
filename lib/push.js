// Notificaciones push de la PWA (web-push con claves VAPID). Suscripciones por usuario: push:<id> → { endpoint: suscripción }.
import webpush from 'web-push';
import { estadoVerifactu } from './verifactuEstado.js';
import { datosStock } from './stockServidor.js';
import { redis, leer } from './redis.js';
import { avisosDelDia } from './avisos.js';
import { inventario } from './inventario.js';
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
    // El del extracto, solo a quien puede subirlo.
    const subeExtracto = puede(u, 'facturar') || puede(u, 'gastar');
    const banco = subeExtracto ? { conectado: ((await leer(u, 'bancos')) || []).some((c) => c.origen === 'enable'), ultimo: ((await leer(u, 'banco')) || []).reduce((a, m) => (m.fecha > a ? m.fecha : a), '') } : null;
    // Stock bajo mínimo (con inventario y a quien puede facturar), solo los lunes.
    const lunes = new Date(`${dia}T12:00:00Z`).getUTCDay() === 1;
    const stockBajo = lunes && emp.fiscal?.inventario && puede(u, 'facturas')
      ? inventario(await datosStock(u), { hoy: dia }).bajos.map((p) => p.nombre)
      : [];
    const facturas = puede(u, 'facturas') ? await leer(u, 'facturas') : [];
    // Verifactu: solo a quien gestiona la empresa.
    const verifactu = emp.verifactu && puede(u, 'empresa') ? estadoVerifactu((await leer(u, 'registros')) || [], { modo: emp.verifactu, facturas: Object.fromEntries((facturas || []).map((f) => [f.id, f])) }) : null;
    const avisos = avisosDelDia({ facturas, plazo: emp.emisor?.plazo, fiscal: puede(u, 'resumen') ? fiscalDe(emp) : {}, cuotaIS: emp.cuotaIS, banco, stockBajo, verifactu }, dia);
    for (const a of avisos) {
      if (!(await redis.set(`avisado:${usu.id}:${dia}:${a.tipo}`, 1, { nx: true, ex: 172800 }))) continue;
      enviados += await enviarPush(usu.id, a);
    }
  }
  return enviados;
}
