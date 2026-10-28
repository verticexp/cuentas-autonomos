// Notificaciones push de la PWA (web-push con claves VAPID). Suscripciones por usuario: push:<id> → { endpoint: suscripción }.
// Y las de la app de iOS por APNs (lib/apns.js): apns:<id> → token del iPhone. enviarPush manda a los dos.
import webpush from 'web-push';
import { estadoVerifactu } from './verifactuEstado.js';
import { datosStock } from './stockServidor.js';
import { redis, leer, clave } from './redis.js';
import { documentos, leerMarcados } from './indices.js';
import { avisosDelDia, plazosFiscales } from './avisos.js';
import { panelDe } from './panelCache.js';
import { inventario } from './inventario.js';
import { fiscalDe } from './empresa.js';
import { membresias } from './membresias.js';
import { puede } from './permisos.js';
import { apnsListo, enviarApns } from './apns.js';

const { VAPID_PUBLIC_KEY: publica, VAPID_PRIVATE_KEY: privada } = process.env;
export const webPushListo = () => Boolean(publica && privada);
export const pushListo = () => webPushListo() || apnsListo();
export const clavePublica = () => publica || '';
// ¿Tiene avisos en algún dispositivo (navegador o app)?
export const conAvisos = async (id) => Number(await redis.hlen(`push:${id}`)) + Number(await redis.hlen(`apns:${id}`)) > 0;

export async function enviarPush(idUsuario, aviso) {
  let n = 0;
  // Solo el número del icono: en el navegador no hay icono que cambiar.
  if (webPushListo() && !aviso.soloNumero) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:avisos@fisquo.com', publica, privada);
    const subs = (await redis.hgetall(`push:${idUsuario}`)) || {};
    for (const [endpoint, sub] of Object.entries(subs)) {
      try { await webpush.sendNotification(sub, JSON.stringify(aviso), { TTL: 86400 }); n += 1; }
      catch (e) { if ([404, 410].includes(e.statusCode)) await redis.hdel(`push:${idUsuario}`, endpoint); } // el móvil ya no la acepta
    }
  }
  if (apnsListo()) {
    const tokens = Object.keys((await redis.hgetall(`apns:${idUsuario}`)) || {});
    const r = await enviarApns(tokens, aviso).catch((e) => { console.warn('[apns]', e.message); return { enviados: 0, caducados: [] }; });
    if (r.caducados.length) await redis.hdel(`apns:${idUsuario}`, ...r.caducados); // la app se borró o se quitaron los avisos
    n += r.enviados;
  }
  return n;
}

// Pone el número del icono de Fisquo en el iPhone (al leer los mensajes), sin aviso visible.
export const ponerNumero = (idUsuario, numero) => (apnsListo() ? enviarPush(idUsuario, { soloNumero: true, numero: Math.max(0, Number(numero) || 0) }) : 0);

// ¿Hay un plazo de Hacienda dentro de una semana o mañana (los días en que el aviso dice cuánto toca pagar)?
const diasHasta = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const plazoCerca = (fiscal, cuotaIS, dia) => [Number(dia.slice(0, 4)), Number(dia.slice(0, 4)) + 1]
  .some((y) => plazosFiscales(fiscal, y, { cuotaIS }).some((p) => [7, 1].includes(diasHasta(dia, p.fecha))));

// Cron de cada mañana (informe de capacidad E04): un trabajo por empresa con sus usuarios suscritos (lib/trabajosTareas.js).
// Cada usuario recibe sus avisos del día una vez por día y tipo. Las facturas, solo las sin cobrar (índice), y las de
// los registros de Verifactu, por id: nunca el histórico.
export async function avisosPushEmpresa(emp, idsUsuarios, dia) {
  if (!pushListo()) return 0;
  const e = { empresa: emp.id };
  const lunes = new Date(`${dia}T12:00:00Z`).getUTCDay() === 1;
  let facturas = null, pagos = null, registros = null, enviados = 0;
  for (const id of idsUsuarios) {
    const usu = await redis.hget('usuarios', id);
    const m = usu && membresias(usu)[emp.id];
    if (!m || !(await conAvisos(usu.id))) continue;
    const u = { ...usu, ...emp, id: usu.id, empresa: emp.id, rol: m.rol, permisos: m.permisos || [], pv: m.pv };
    // El del extracto, solo a quien puede subirlo.
    const subeExtracto = puede(u, 'facturar') || puede(u, 'gastar');
    const bancos = subeExtracto ? (await leer(u, 'bancos')) || [] : [];
    const conPeriodos = bancos.filter((c) => c.origen === 'extracto');
    const banco = subeExtracto ? { conectado: bancos.some((c) => c.origen === 'enable'), ultimo: ((await leer(u, 'banco')) || []).reduce((a, m) => (m.fecha > a ? m.fecha : a), ''),
      ...(conPeriodos.length && conPeriodos.every((c) => c.extractos?.length) ? { extractos: conPeriodos.map((c) => c.extractos) } : {}) } : null;
    // Stock bajo mínimo (con inventario y a quien puede facturar), solo los lunes.
    const stockBajo = lunes && emp.fiscal?.inventario && puede(u, 'facturas')
      ? inventario(await datosStock(u), { hoy: dia }).bajos.map((p) => p.nombre)
      : [];
    if (puede(u, 'facturas')) facturas ||= await leerMarcados(e, 'facturas', 'p');
    if (puede(u, 'gastos')) pagos ||= await leerMarcados(e, 'gastos', 'p');
    // Verifactu: solo a quien gestiona la empresa.
    let verifactu = null;
    if (emp.verifactu && puede(u, 'empresa')) {
      registros ||= (await leer(e, 'registros')) || [];
      const ref = await documentos(e, 'facturas', [...new Set(registros.map((r) => r.factura))]);
      verifactu = estadoVerifactu(registros, { modo: emp.verifactu, facturas: Object.fromEntries(ref.map((f) => [f.id, f])) });
    }
    // Lo que toca pagar en cada plazo, solo el día que se avisa con una semana o un día de antelación: el panel con los
    // mismos datos que el Resumen (lib/panelCache.js), así que suele estar ya calculado.
    const fiscal = puede(u, 'resumen') ? fiscalDe(emp) : {};
    let importesPlazo = {};
    if (fiscal.tipo && plazoCerca(fiscal, emp.cuotaIS, dia)) {
      const [recurrentes, nominas, saldo] = await Promise.all([leer(e, 'recurrentes'), leer(e, 'nominas'), redis.get(clave(e, 'saldo'))]);
      const { teso } = await panelDe(u, { anio: Number(dia.slice(0, 4)), hoy: dia, recurrentes: recurrentes || [], nominas: nominas || [], saldo });
      importesPlazo = Object.groupBy((teso?.movimientos || []).filter((x) => x.tipo === 'hacienda' && !x.vencido), (x) => x.fecha);
    }
    const avisos = avisosDelDia({ importesPlazo, facturas: puede(u, 'facturas') ? facturas : [], pagos: puede(u, 'gastos') ? pagos : [], plazo: emp.emisor?.plazo, fiscal, cuotaIS: emp.cuotaIS, banco, stockBajo, verifactu }, dia);
    for (const a of avisos) {
      if (!(await redis.set(`avisado:${usu.id}:${dia}:${a.tipo}`, 1, { nx: true, ex: 172800 }))) continue;
      enviados += await enviarPush(usu.id, a);
    }
  }
  return enviados;
}
