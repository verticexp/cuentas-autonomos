// Correos que Fisquo manda solo al pasar algo en la cuenta (lib/correos.js tiene las plantillas): bienvenida,
// contraseña cambiada, cambios de la suscripción, premio por recomendar y bajas. Ninguno lanza: si el email falla,
// lo que lo provocó (un pago, una baja…) ya está hecho y no se deshace. Los que pueden repetirse (avisos de Stripe
// duplicados) se mandan una sola vez gracias a una marca en Redis.
import { redis } from './redis.js';
import { membresias } from './membresias.js';
import { emailListo } from './email.js';
import { enviarCorreo } from './correos.js';
import { esFundador } from './prueba.js';

const ORIGEN = () => process.env.APP_URL || 'https://www.fisquo.com';
const PERIODO = { mes: 'mensual', anio: 'anual', mensual: 'mensual', anual: 'anual' };

export const ahoraTexto = (d = new Date()) => d.toLocaleString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

// Una sola vez por clave (30 días por defecto). Si el envío falla, se quita la marca para poder repetirlo.
async function unaVez(k, enviar, ex = 30 * 86400) {
  if (!redis || !emailListo()) return { enviados: 0 };
  if (!(await redis.set(k, 1, { nx: true, ex }))) return { enviados: 0 };
  const r = await enviar().catch((e) => ({ error: e.message }));
  if (r?.error) { await redis.del(k).catch(() => {}); console.warn(`[correo] ${k}: ${r.error}`); return { enviados: 0, error: r.error }; }
  return { enviados: 1 };
}

export async function adminsDe(empresa) {
  const usuarios = Object.values((await redis.hgetall('usuarios')) || {});
  return usuarios.filter((x) => x.email && membresias(x)[empresa]?.rol === 'admin');
}

// A todos los administradores de la empresa; una vez por persona y clave.
async function aAdmins(empresa, clave, id, datos) {
  let enviados = 0;
  for (const a of await adminsDe(empresa)) {
    const r = await unaVez(`correo:${clave}:${a.id}`, () => enviarCorreo(id, { para: a.email, datos: { nombre: a.nombre, ...datos } }));
    enviados += r.enviados;
  }
  return { enviados };
}

// Tras confirmar el email por primera vez.
export async function bienvenida(usuarioId, origen = ORIGEN()) {
  try {
    const u = await redis.hget('usuarios', usuarioId);
    if (!u?.email || u.admin) return { enviados: 0 };
    // Solo quien administra su empresa (quien se registra); a las personas invitadas ya las recibe su equipo.
    const empresaId = u.empresa || Object.keys(membresias(u))[0];
    if (membresias(u)[empresaId]?.rol !== 'admin') return { enviados: 0 };
    const e = await redis.hget('empresas', empresaId);
    const quedan = e?.plan?.hasta && !e.plan.pagado && !esFundador(e.plan)
      ? Math.max(0, Math.round((Date.parse(`${e.plan.hasta}T12:00:00Z`) - Date.now()) / 86400000)) : 0;
    return await unaVez(`correo:bienvenida:${u.id}`, () => enviarCorreo('bienvenida', { para: u.email, datos: { nombre: u.nombre, empresa: e?.emisor?.nombre || e?.nombre, dias: quedan, url: origen } }), 365 * 86400);
  } catch (e) { console.warn('[correo] bienvenida:', e.message); return { enviados: 0 }; }
}

export async function contrasenaCambiada(u) {
  if (!u?.email || !emailListo()) return;
  const r = await enviarCorreo('contrasena-cambiada', { para: u.email, datos: { nombre: u.nombre, fecha: ahoraTexto() } }).catch((e) => ({ error: e.message }));
  if (r.error) console.warn('[correo] contraseña cambiada: no se pudo enviar');
}

// Lo llama lib/suscripcion.js con el plan de antes y el de ahora (estado de Stripe).
export function correoDeSuscripcion(antes, ahora) {
  const a = antes?.estado, b = ahora?.estado;
  if (a === b) return null;
  if (b === 'active' && a !== 'past_due') return 'plan-activado';
  if (['past_due', 'unpaid'].includes(b) && !['past_due', 'unpaid'].includes(a)) return 'pago-fallido';
  if (b === 'canceled' && ['active', 'past_due', 'unpaid', 'trialing'].includes(a)) return 'suscripcion-cancelada';
  return null;
}

export async function avisarSuscripcion(empresa, antes, ahora, origen = ORIGEN()) {
  try {
    const id = correoDeSuscripcion(antes, ahora);
    const e = id && (await redis.hget('empresas', empresa));
    if (!id || !e || e.baja) return { enviados: 0 };
    const url = `${origen}/ajustes/plan${id === 'suscripcion-cancelada' ? '?contratar=1' : ''}`;
    // La clave lleva el estado de antes: un segundo fallo tras recuperarse vuelve a avisar; un aviso repetido, no.
    return await aAdmins(empresa, `${id}:${ahora.suscripcion}:${antes?.estado || 'nuevo'}:${new Date().toISOString().slice(0, 7)}`, id, {
      empresa: e.emisor?.nombre || e.nombre, plan: ahora.nombre, periodo: PERIODO[ahora.periodo] || '', url,
    });
  } catch (e) { console.warn('[correo] suscripción:', e.message); return { enviados: 0 }; }
}

export async function avisarPremio(empresa, premio, origen = ORIGEN()) {
  try {
    if (!premio || !['abono', 'dias'].includes(premio.tipo)) return { enviados: 0 };
    const meses = (await redis.hget('empresas', empresa))?.recomienda?.meses || 0;
    return await aAdmins(empresa, `premio:${empresa}:${meses}`, 'premio-recomendacion', { ...premio, url: `${origen}/ajustes/recomienda` });
  } catch (e) { console.warn('[correo] premio:', e.message); return { enviados: 0 }; }
}

export async function avisarBaja(u, { empresa, borrarEl, cuenta = false }) {
  if (!u?.email || !emailListo()) return;
  const r = await enviarCorreo(cuenta ? 'cuenta-eliminada' : 'baja-empresa', { para: u.email, datos: { nombre: u.nombre, empresa, borrarEl } }).catch((e) => ({ error: e.message }));
  if (r.error) console.warn('[correo] baja: no se pudo enviar');
}

// 60 días antes de acabar la oferta de lanzamiento del despacho (lib/licencias.js), al email del despacho.
export async function avisoFinOferta(d, precios) {
  if (!d?.email || !d.oferta?.hasta) return { enviados: 0 };
  return unaVez(`correo:fin-oferta:${d.id}`, () => enviarCorreo('fin-oferta-despacho', { para: d.email, datos: { nombre: d.nombre, hasta: d.oferta.hasta, ...precios, url: `${ORIGEN()}/despacho/ajustes` } }), 400 * 86400);
}
