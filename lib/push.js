// Notificaciones push de la PWA (web-push con claves VAPID). Suscripciones por usuario: push:<id> → { endpoint: suscripción }.
import webpush from 'web-push';
import { estadoVerifactu } from './verifactuEstado.js';
import { datosStock } from './stockServidor.js';
import { redis, leer } from './redis.js';
import { documentos, leerMarcados } from './indices.js';
import { avisosDelDia } from './avisos.js';
import { inventario } from './inventario.js';
import { fiscalDe } from './empresa.js';
import { puede } from './permisos.js';

const { VAPID_PUBLIC_KEY: publica, VAPID_PRIVATE_KEY: privada } = process.env;
export const pushListo = () => Boolean(publica && privada);
export const clavePublica = () => publica || '';

export async function enviarPush(idUsuario, aviso) {
  if (!pushListo()) return 0;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:avisos@fisquo.com', publica, privada);
  const subs = (await redis.hgetall(`push:${idUsuario}`)) || {};
  let n = 0;
  for (const [endpoint, sub] of Object.entries(subs)) {
    try { await webpush.sendNotification(sub, JSON.stringify(aviso), { TTL: 86400 }); n += 1; }
    catch (e) { if ([404, 410].includes(e.statusCode)) await redis.hdel(`push:${idUsuario}`, endpoint); } // el móvil ya no la acepta
  }
  return n;
}

// Cron de cada mañana (informe de capacidad E04): un trabajo por empresa con sus usuarios suscritos (lib/trabajosTareas.js).
// Cada usuario recibe sus avisos del día una vez por día y tipo. Las facturas, solo las sin cobrar (índice), y las de
// los registros de Verifactu, por id: nunca el histórico.
export async function avisosPushEmpresa(emp, idsUsuarios, dia) {
  if (!pushListo()) return 0;
  const e = { empresa: emp.id };
  const lunes = new Date(`${dia}T12:00:00Z`).getUTCDay() === 1;
  let facturas = null, registros = null, enviados = 0;
  for (const id of idsUsuarios) {
    const usu = await redis.hget('usuarios', id);
    if (!usu || !(await redis.hlen(`push:${usu.id}`))) continue;
    const u = { ...usu, ...emp, id: usu.id, empresa: emp.id };
    // El del extracto, solo a quien puede subirlo.
    const subeExtracto = puede(u, 'facturar') || puede(u, 'gastar');
    const banco = subeExtracto ? { conectado: ((await leer(u, 'bancos')) || []).some((c) => c.origen === 'enable'), ultimo: ((await leer(u, 'banco')) || []).reduce((a, m) => (m.fecha > a ? m.fecha : a), '') } : null;
    // Stock bajo mínimo (con inventario y a quien puede facturar), solo los lunes.
    const stockBajo = lunes && emp.fiscal?.inventario && puede(u, 'facturas')
      ? inventario(await datosStock(u), { hoy: dia }).bajos.map((p) => p.nombre)
      : [];
    if (puede(u, 'facturas')) facturas ||= await leerMarcados(e, 'facturas', 'p');
    // Verifactu: solo a quien gestiona la empresa.
    let verifactu = null;
    if (emp.verifactu && puede(u, 'empresa')) {
      registros ||= (await leer(e, 'registros')) || [];
      const ref = await documentos(e, 'facturas', [...new Set(registros.map((r) => r.factura))]);
      verifactu = estadoVerifactu(registros, { modo: emp.verifactu, facturas: Object.fromEntries(ref.map((f) => [f.id, f])) });
    }
    const avisos = avisosDelDia({ facturas: puede(u, 'facturas') ? facturas : [], plazo: emp.emisor?.plazo, fiscal: puede(u, 'resumen') ? fiscalDe(emp) : {}, cuotaIS: emp.cuotaIS, banco, stockBajo, verifactu }, dia);
    for (const a of avisos) {
      if (!(await redis.set(`avisado:${usu.id}:${dia}:${a.tipo}`, 1, { nx: true, ex: 172800 }))) continue;
      enviados += await enviarPush(usu.id, a);
    }
  }
  return enviados;
}
