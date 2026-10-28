// Avisos al móvil (notificaciones push, lib/push.js) entre el despacho y su cliente.
// - Mensajes (chat: true), como en una app de chat: uno por mensaje, con quien escribe de título y el mensaje de texto,
//   agrupados por conversación (hilo) y con el número de sin leer en el icono de Fisquo en el iPhone. Al leer la
//   conversación el número se pone al día (leidoCliente / leidoDespacho).
// - El resto (informes, solicitudes aceptadas): como mucho uno cada 10 minutos por persona y conversación.
// Al cliente le llega a su cuenta principal (la que creó la empresa); al despacho, a quien puede ver al cliente.
// Nunca bloquea ni hace fallar lo que lo provoca: se envía después de responder (after) y los errores se ignoran.
import { after } from 'next/server.js';
import { redis } from './redis.js';
import { conAvisos, enviarPush, ponerNumero, pushListo } from './push.js';
import { puedeVerCliente } from './despachos.js';
import { comentariosDe, leidoDe, noLeidos } from './comentariosDespacho.js';
import { noLeidosDespacho } from './mensajesDespacho.js';

const ESPERA = 600;
export const hiloDe = (empresa) => `gestoria-${empresa}`;

async function aviso(uid, empresa, datos, { chat = false } = {}) {
  if (!(await conAvisos(uid))) return;
  // SET NX: el primero en 10 minutos pasa; los siguientes, no. Los mensajes, todos.
  if (!chat && !(await redis.set(`push-chat:${uid}:${empresa}`, 1, { nx: true, ex: ESPERA }))) return;
  await enviarPush(uid, { ...datos, hilo: hiloDe(empresa) });
}

const enviarDespues = (fn) => {
  if (!pushListo() || !redis) return;
  const tarea = () => fn().catch((e) => console.warn('[avisos despacho]', e.message));
  try { after(tarea); } catch { tarea(); }
};

// Mensajes de la gestoría que el cliente aún no ha leído (el número del icono).
const sinLeerCliente = async (e) => {
  const despacho = e.despachoCliente?.id;
  const [hilos, leido] = await Promise.all([comentariosDe(e.id, despacho ? { despacho } : {}), leidoDe(e.id)]);
  return noLeidos(hilos, leido, 'cliente');
};

// Al cliente: e es la empresa (su id es el de la cuenta que la creó). chat: un mensaje de la gestoría.
export function avisarCliente(e, { titulo, cuerpo, url = '/tu-gestoria', chat = false }) {
  enviarDespues(async () => {
    const numero = chat ? await sinLeerCliente(e).catch(() => undefined) : undefined;
    await aviso(e.id, e.id, { titulo, cuerpo: String(cuerpo).slice(0, 140), url, numero }, { chat });
  });
}

// Al despacho: titular y gestores que pueden ver a este cliente, menos quien lo ha hecho.
export function avisarDespacho(d, e, { titulo, cuerpo, url, chat = false }, salvo = '') {
  enviarDespues(async () => {
    const ids = Object.keys(d?.miembros || {}).filter((uid) => uid !== salvo && puedeVerCliente(d, uid, e));
    for (const uid of ids) {
      const numero = chat ? await noLeidosDespacho(d, uid).catch(() => undefined) : undefined;
      await aviso(uid, e.id, { titulo, cuerpo: String(cuerpo).slice(0, 140), url: url || `/despacho/mensajes/${encodeURIComponent(e.id)}`, numero }, { chat });
    }
  });
}

// Al leer la conversación, el número del icono se pone al día en el iPhone.
export function leidoCliente(empresaId) {
  enviarDespues(() => ponerNumero(empresaId, 0));
}
export function leidoDespacho(d, uid) {
  enviarDespues(async () => ponerNumero(uid, await noLeidosDespacho(d, uid)));
}
