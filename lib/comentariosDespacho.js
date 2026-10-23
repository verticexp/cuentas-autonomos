// Preguntas y notas entre el despacho y su cliente: sobre un trimestre o sobre una factura o un gasto concretos. Las
// escribe el despacho (Mi despacho) y el cliente las ve y responde en Ajustes › Tu gestoría.
// despacho-comentarios:<empresa>: id → { id, anio, t, doc?: { tipo, id, texto }, hilo: [{ quien, nombre, lado, texto, fecha }], resuelto }.
import { randomUUID } from 'node:crypto';
import { leerUno, redis } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { periodoValido } from './cierres.js';
import { numeroFactura } from './calculos.js';

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
  const visto = doc.tipo === 'factura' ? `Factura ${numeroFactura(x)} · ${x.cliente?.nombre || ''}` : `Gasto del ${x.fecha} · ${x.proveedor || x.concepto || ''}`;
  return { doc: { tipo: doc.tipo, id: x.id, texto: visto } };
}
