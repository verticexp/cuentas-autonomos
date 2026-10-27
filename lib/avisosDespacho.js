// Avisos al móvil (notificaciones push, lib/push.js) entre el despacho y su cliente: un mensaje nuevo o un documento
// pedido o entregado. Como mucho uno cada 10 minutos por persona y conversación (una ráfaga de mensajes no son diez
// avisos). Al cliente le llega a su cuenta principal (la que creó la empresa); al despacho, a quien puede ver al cliente.
// Nunca bloquea ni hace fallar lo que lo provoca: se envía después de responder (after) y los errores se ignoran.
import { after } from 'next/server.js';
import { redis } from './redis.js';
import { conAvisos, enviarPush, pushListo } from './push.js';
import { puedeVerCliente } from './despachos.js';

const ESPERA = 600;

async function aviso(uid, empresa, datos) {
  if (!(await conAvisos(uid))) return;
  // SET NX: el primero en 10 minutos pasa; los siguientes, no.
  if (!(await redis.set(`push-chat:${uid}:${empresa}`, 1, { nx: true, ex: ESPERA }))) return;
  await enviarPush(uid, datos);
}

const enviarDespues = (fn) => {
  if (!pushListo() || !redis) return;
  const tarea = () => fn().catch((e) => console.warn('[avisos despacho]', e.message));
  try { after(tarea); } catch { tarea(); }
};

// Al cliente: e es la empresa (su id es el de la cuenta que la creó).
export function avisarCliente(e, { titulo, cuerpo, url = '/tu-gestoria' }) {
  enviarDespues(() => aviso(e.id, e.id, { titulo, cuerpo: String(cuerpo).slice(0, 140), url }));
}

// Al despacho: titular y gestores que pueden ver a este cliente, menos quien lo ha hecho.
export function avisarDespacho(d, e, { titulo, cuerpo, url }, salvo = '') {
  enviarDespues(async () => {
    const ids = Object.keys(d?.miembros || {}).filter((uid) => uid !== salvo && puedeVerCliente(d, uid, e));
    for (const uid of ids) await aviso(uid, e.id, { titulo, cuerpo: String(cuerpo).slice(0, 140), url: url || `/despacho/mensajes/${encodeURIComponent(e.id)}` });
  });
}
