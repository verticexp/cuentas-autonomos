// Mensajes entre el despacho y su cliente (Mi despacho › Mensajes y Ajustes › Tu gestoría), como un chat: una conversación
// general por cliente (id «general») y, aparte, las preguntas sobre una factura o un gasto concretos, cada una con su hilo.
// despacho-comentarios:<empresa>: id → { id, anio, t, doc?: { tipo, id, texto }, hilo: [{ quien, nombre, lado, texto, fecha }], resuelto }.
// despacho-leido:<empresa>: { despacho, cliente } → hasta cuándo ha leído cada lado (lo posterior del otro, sin leer).
import { randomUUID } from 'node:crypto';
import { leerUno, redis } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { periodoValido } from './cierres.js';
import { numeroFactura } from './calculos.js';
import { fechaCorta } from './formato.js';

const MAX = 500;
const MAX_HILO = 50;
const k = (empresa) => `despacho-comentarios:${empresa}`;
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
export const LADOS = { despacho: 'Gestoría', cliente: 'Cliente' };

// Más recientes primero; los pendientes antes que los resueltos.
export async function comentariosDe(empresa, { anio, t } = {}) {
  if (!redis) return [];
  const l = Object.values((await redis.hgetall(k(empresa))) || {}).filter((c) => (!anio || c.anio === anio) && (!t || c.t === t));
  const ultima = (c) => c.hilo?.at(-1)?.fecha || '';
  return l.sort((a, b) => Number(Boolean(a.resuelto)) - Number(Boolean(b.resuelto)) || ultima(b).localeCompare(ultima(a)));
}
export const pendientesDe = (lista, lado) => lista.filter((c) => !c.resuelto && c.hilo?.at(-1)?.lado !== lado).length;

export const GENERAL = 'general';
const kLeido = (empresa) => `despacho-leido:${empresa}`;
export const leidoDe = async (empresa) => (redis ? (await redis.hgetall(kLeido(empresa))) || {} : {});
export async function marcarLeido(empresa, lado) {
  if (!redis || !LADOS[lado]) return;
  await redis.hset(kLeido(empresa), { [lado]: new Date().toISOString() });
}
// Mensajes del otro lado posteriores a lo leído.
export const noLeidos = (lista, leido, lado) => lista.reduce((n, c) => n + (c.hilo || []).filter((m) => m.lado !== lado && m.fecha > (leido?.[lado] || '')).length, 0);
// Todos los mensajes en orden, cada uno con su hilo (para el chat) y el último de todos.
export const mensajesDe = (lista) => lista.flatMap((c) => (c.hilo || []).map((m, i) => ({ ...m, hilo: c.id, primero: i === 0, ...(c.doc ? { doc: c.doc } : {}), resuelto: Boolean(c.resuelto) }))).sort((a, b) => a.fecha.localeCompare(b.fecha));
const trimestreHoy = () => { const d = new Date().toISOString(); return { anio: Number(d.slice(0, 4)), t: Math.ceil(Number(d.slice(5, 7)) / 3) }; };

const mensaje = (quien, lado, t) => ({ quien: quien.id, nombre: texto(quien.nombre, 60), lado, texto: t, fecha: new Date().toISOString() });

// Nuevo comentario. doc: { tipo: 'factura' | 'gasto', id, texto } (texto: cómo se ve, «Factura 2026-12 · Bar Pepe»).
export async function comentar(empresa, quien, lado, { anio, t, doc, texto: t0 } = {}) {
  const cuerpo = texto(t0, 2000);
  if (!cuerpo) return { error: 'Escribe el comentario' };
  if (!periodoValido(anio, t)) return { error: 'Trimestre no válido' };
  if (!LADOS[lado]) return { error: 'Quién comenta no es válido' };
  if (doc && (!['factura', 'gasto'].includes(doc.tipo) || !texto(doc.id, 80))) return { error: 'Documento no válido' };
  if (Object.keys((await redis.hgetall(k(empresa))) || {}).length >= MAX) return { error: 'Hay demasiados comentarios: marca como resueltos los antiguos', status: 409 };
  const c = { id: randomUUID().slice(0, 8), anio, t, ...(doc ? { doc: { tipo: doc.tipo, id: texto(doc.id, 80), texto: texto(doc.texto, 120) } } : {}), hilo: [mensaje(quien, lado, cuerpo)], resuelto: false };
  await redis.hset(k(empresa), { [c.id]: c });
  return { comentario: c };
}

// Responder o marcar como resuelto (o volver a abrir). Bajo cerrojo: dos respuestas a la vez no se pisan.
export async function responder(empresa, id, quien, lado, { texto: t0, resuelto } = {}) {
  if (!LADOS[lado]) return { error: 'Quién comenta no es válido' };
  return conCerrojo(`comentario:${empresa}:${id}`, async () => {
    const c = await redis.hget(k(empresa), String(id));
    if (!c) return { error: 'Ese comentario ya no existe', status: 404 };
    const cuerpo = texto(t0, 2000);
    if (!cuerpo && resuelto === undefined) return { error: 'Escribe la respuesta' };
    const hilo = cuerpo ? [...c.hilo, mensaje(quien, lado, cuerpo)].slice(-MAX_HILO) : c.hilo;
    const nuevo = { ...c, hilo, resuelto: resuelto === undefined ? (cuerpo ? false : c.resuelto) : Boolean(resuelto) };
    await redis.hset(k(empresa), { [c.id]: nuevo });
    return { comentario: nuevo };
  }, { caduca: 10000, espera: 8000 });
}

// Cómo se ve el documento en el comentario. Se lee del cliente: solo se puede comentar lo que existe.
export async function docDe(ctx, doc) {
  if (!doc) return { doc: null };
  const tipo = doc.tipo === 'factura' ? 'facturas' : doc.tipo === 'gasto' ? 'gastos' : null;
  const x = tipo && doc.id && (await leerUno(ctx, tipo, String(doc.id)));
  if (!x) return { error: 'Ese documento ya no existe' };
  const visto = doc.tipo === 'factura' ? `Factura ${numeroFactura(x)} · ${x.cliente?.nombre || ''}` : `Gasto del ${fechaCorta(x.fecha)} · ${x.proveedor || x.concepto || ''}`;
  return { doc: { tipo: doc.tipo, id: x.id, texto: visto, fecha: x.fecha } };
}

// Escribir en el chat: respuesta a un hilo (hilo), pregunta nueva sobre un documento (doc, ya validado con docDe) o, sin
// nada más, en la conversación general del cliente (se crea la primera vez).
export async function escribir(empresa, quien, lado, { texto: t0, hilo, doc } = {}) {
  const cuerpo = texto(t0, 2000);
  if (!cuerpo) return { error: 'Escribe el mensaje' };
  if (!LADOS[lado]) return { error: 'Quién escribe no es válido' };
  if (hilo) return responder(empresa, String(hilo), quien, lado, { texto: cuerpo });
  const { anio, t } = doc?.fecha ? { anio: Number(doc.fecha.slice(0, 4)), t: Math.ceil(Number(doc.fecha.slice(5, 7)) / 3) } : trimestreHoy();
  if (doc) return comentar(empresa, quien, lado, { anio, t, doc, texto: cuerpo });
  return conCerrojo(`comentario:${empresa}:${GENERAL}`, async () => {
    const c = await redis.hget(k(empresa), GENERAL);
    const nuevo = c ? { ...c, hilo: [...c.hilo, mensaje(quien, lado, cuerpo)].slice(-200), resuelto: false } : { id: GENERAL, anio, t, hilo: [mensaje(quien, lado, cuerpo)], resuelto: false };
    await redis.hset(k(empresa), { [GENERAL]: nuevo });
    return { comentario: nuevo };
  }, { caduca: 10000, espera: 8000 });
}
