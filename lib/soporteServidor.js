// Soporte con IA y paso a una persona (app/api/soporte/chat y app/api/admin/soporte). La conversación vive en
// soporte:conv:<usuario> y el índice de recientes en soporte:recientes (zset por fecha). Fuera del horario
// (lib/soporte.js) contesta el asistente; lo que no resuelve queda como incidencia y avisa al equipo en el móvil
// (push a los administradores de Fisquo) y por WhatsApp (SOPORTE_WHATSAPP: números separados por comas).
import { redis } from './redis.js';
import { proveedorJSON } from './llamadas.js';
import { enviarPush } from './push.js';
import { enviarTexto, normalizarTelefono, whatsappListo } from './whatsapp.js';
import { SOPORTE, enviarCorreo } from './correos.js';
import { GLOSARIO } from './glosario.js';
import { soloLectura } from './planes.js';
import { diasPrueba } from './prueba.js';
import { PREGUNTAS, TEXTO_HORARIO, anadir, avisarEquipo, enHorario, historialIA, nuevaConversacion, pasarAPersona, proximaApertura } from './soporte.js';

const K = (id) => `soporte:conv:${id}`;
const RECIENTES = 'soporte:recientes';

export async function leerConversacion(id) {
  const c = await redis.get(K(id));
  return c && typeof c === 'string' ? JSON.parse(c) : c || null;
}

export async function guardarConversacion(c) {
  await redis.set(K(c.id), JSON.stringify(c), { ex: 90 * 86400 });
  await redis.zadd(RECIENTES, { score: Date.parse(c.actualizada), member: c.id });
  return c;
}

export async function recientes(n = 60) {
  const ids = (await redis.zrange(RECIENTES, 0, n - 1, { rev: true })) || [];
  return (await Promise.all(ids.map(leerConversacion))).filter(Boolean);
}

// Lo que sabe el asistente de la cuenta (sin datos contables): plan, prueba, rol y pantalla desde la que escribe.
function contextoCuenta(u, pagina) {
  const p = u.plan || {};
  const dias = diasPrueba(p);
  return [
    `Empresa: ${u.empresaNombre || '(sin nombre)'}; rol: ${u.rol === 'admin' ? 'administrador de la empresa' : 'usuario con permisos limitados'}.`,
    `Plan: ${[p.tipo, p.nombre].filter(Boolean).join(' ') || 'sin plan'}${soloLectura(p) ? ' — PRUEBA TERMINADA: está en solo lectura hasta que elija plan en Ajustes › Tu plan' : Number.isFinite(dias) && dias > 0 ? ` — en prueba, quedan ${dias} días` : ''}.`,
    pagina ? `Escribe desde la pantalla ${pagina}.` : '',
  ].filter(Boolean).join('\n');
}

function sistema(u, pagina, ahora) {
  const faq = PREGUNTAS.map((x) => `- ${x.p} → ${x.r}${x.href ? ` (pantalla ${x.href})` : ''}`).join('\n');
  const glos = Object.values(GLOSARIO).map((g) => `- ${g.t}: ${g.d}`).join('\n');
  const horario = enHorario(ahora) ? 'Ahora hay alguien del equipo conectado.' : `Ahora no hay nadie del equipo; vuelve ${proximaApertura(ahora)}.`;
  return `Eres el asistente de soporte de Fisquo, la app de facturas, gastos e impuestos para autónomos y pymes. Ayudas a usar la app y a resolver incidencias.
Horario del equipo humano: ${TEXTO_HORARIO} (hora de Madrid). ${horario}

${contextoCuenta(u, pagina)}

Reglas:
- Responde en el idioma del cliente (normalmente español), tuteando, en 1-5 frases claras y sin tecnicismos. Indica el camino en la app (Ajustes › …) cuando sirva.
- Usa solo lo que sabes de Fisquo por esta guía. Si no sabes si la app hace algo, no lo inventes: dilo y ofrece pasarlo al equipo.
- No ves ni cambias sus facturas, gastos ni datos contables. No des asesoramiento fiscal personalizado: para decisiones, su gestoría.
- Llama a la herramienta pasar_a_persona cuando: lo pide; no puedes resolverlo; es un fallo de la app que no se arregla con tus pasos; hay cobros, devoluciones, baja, pérdida de datos, acceso a la cuenta (contraseña, verificación en dos pasos) o algo urgente con Hacienda. Después dile, en una frase, que una persona le responderá aquí${enHorario(ahora) ? ' en breve' : ` ${proximaApertura(ahora)}`} y que le avisaremos.
- Nunca pidas contraseñas, códigos ni números de tarjeta.

Preguntas frecuentes:
${faq}

Glosario:
${glos}`;
}

const HERRAMIENTA = { name: 'pasar_a_persona', description: 'Pasa la conversación al equipo humano de Fisquo como incidencia.', input_schema: { type: 'object', properties: { motivo: { type: 'string', description: 'Resumen de una frase de lo que necesita' } }, required: ['motivo'] } };

async function llamarIA(body) {
  const { d } = await proveedorJSON('Anthropic', process.env.ANTHROPIC_URL || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, { idempotente: true, timeoutMs: 25000 });
  return d;
}

// Respuesta del asistente a la conversación (con el último mensaje del cliente ya dentro). → { texto, pasar?, motivo? }
export async function responderIA(u, c, { pagina = '', ahora = new Date() } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { texto: '', pasar: true, motivo: 'Asistente sin configurar' };
  const messages = historialIA(c);
  const base = { model: process.env.ANTHROPIC_MODEL_SOPORTE || 'claude-haiku-5-5', max_tokens: 600, system: sistema(u, pagina, ahora), tools: [HERRAMIENTA] };
  const d = await llamarIA({ ...base, messages });
  const uso = (d.content || []).find((x) => x.type === 'tool_use' && x.name === HERRAMIENTA.name);
  const texto = (d.content || []).map((x) => x.text || '').join('').trim();
  if (!uso) return { texto: texto || 'No te he entendido bien. ¿Me lo cuentas de otra forma?' };
  const motivo = String(uso.input?.motivo || '').slice(0, 300);
  if (texto) return { texto, pasar: true, motivo };
  // Pidió pasarla sin decir nada: segunda vuelta para que lo explique al cliente.
  const d2 = await llamarIA({ ...base, messages: [...messages, { role: 'assistant', content: d.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: uso.id, content: 'Hecho: la conversación ya está en manos del equipo.' }] }] });
  return { texto: (d2.content || []).map((x) => x.text || '').join('').trim(), pasar: true, motivo };
}

export const textoPasada = (ahora = new Date()) => (enHorario(ahora)
  ? 'Te paso con una persona del equipo: te responde aquí en breve.'
  : `Ahora no hay nadie del equipo (${TEXTO_HORARIO.toLowerCase()}). Te responderá una persona aquí ${proximaApertura(ahora)} y te avisaremos en el móvil.`);

const telefonosEquipo = () => String(process.env.SOPORTE_WHATSAPP || '').split(',').map(normalizarTelefono).filter((t) => t.length >= 9);

async function adminsFisquo() {
  const us = Object.values((await redis.hgetall('usuarios')) || {});
  return us.filter((x) => x?.admin).map((x) => x.id);
}

// Aviso al equipo (móvil y WhatsApp; si ninguno llega, correo). Marca la conversación como avisada.
export async function avisarAlEquipo(c, ahora = new Date()) {
  if (!avisarEquipo(c, ahora.getTime())) return c;
  const ultimo = [...c.mensajes].reverse().find((m) => m.de === 'cliente')?.texto || '';
  const titulo = `Soporte · ${c.empresaNombre || c.nombre || 'cliente'}`;
  const cuerpo = (c.motivo || ultimo).slice(0, 180);
  let n = 0;
  for (const id of await adminsFisquo()) n += await enviarPush(id, { titulo, cuerpo, url: '/admin#soporte', hilo: 'soporte' }).catch(() => 0);
  if (whatsappListo()) {
    const texto = `🛟 *${titulo}*\n${c.nombre} <${c.email}>\n${c.motivo ? `Motivo: ${c.motivo}\n` : ''}Último mensaje: ${ultimo.slice(0, 600)}\n\nResponde en https://fisquo.com/admin#soporte`;
    for (const t of telefonosEquipo()) n += (await enviarTexto(t, texto).catch(() => false)) ? 1 : 0;
  }
  if (!n) await enviarCorreo('soporte', { para: process.env.CONTACTO_EMAIL || SOPORTE, datos: { tema: 'Incidencia del asistente', empresa: c.empresaNombre || c.nombre, datos: [['Persona', `${c.nombre} <${c.email}>`], ['Motivo', c.motivo || '']], mensaje: ultimo } }).catch(() => {});
  return { ...c, avisada: ahora.toISOString() };
}

// Respuesta del equipo: se apunta y se avisa al cliente en el móvil.
export async function responderEquipo(id, texto, ahora = new Date()) {
  const c = await leerConversacion(id);
  if (!c) return null;
  const nueva = await guardarConversacion({ ...anadir(c, 'equipo', texto, ahora.toISOString()), leidaEquipo: true });
  await enviarPush(c.usuario, { titulo: 'Fisquo · Soporte', cuerpo: String(texto).slice(0, 180), url: '/ajustes/ayuda', hilo: 'soporte' }).catch(() => 0);
  return nueva;
}

export { nuevaConversacion, anadir, pasarAPersona };
