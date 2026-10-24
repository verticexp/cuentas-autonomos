// Documentos que el despacho le pide a su cliente con un toque: el ticket o la factura de un gasto que no lo tiene, o
// cualquier otro papel («el contrato de alquiler», «el modelo 036»). Cada petición deja un mensaje en el chat
// (lib/comentariosDespacho.js) y el cliente la ve en Ajustes › Tu gestoría, con un botón para subir una foto o un PDF.
// despacho-peticiones:<empresa>: id → { id, despacho, tipo: 'ticket' | 'documento', gasto?: { id, texto }, texto, creada,
//   por: { id, nombre }, estado: 'pendiente' | 'entregada' | 'anulada', entrega?: { fecha, nombre, archivo? }, hilo? }.
// Un ticket se da por entregado en cuanto el gasto tiene justificante, lo suba el cliente desde aquí o desde Gastos.
import { randomUUID } from 'node:crypto';
import { leerUno, redis } from './redis.js';
import { conCerrojo } from './cerrojo.js';

const k = (empresa) => `despacho-peticiones:${empresa}`;
const MAX_PENDIENTES = 100;
const texto = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
export const TIPOS_PETICION = { ticket: 'Ticket o factura de un gasto', documento: 'Otro documento' };

// Las de un despacho, las pendientes primero y lo más reciente arriba. ctx: el cliente (para ver si sus gastos ya tienen
// justificante: así una petición de ticket se da por entregada aunque lo haya subido desde Gastos).
export async function peticionesDe(empresa, { despacho, ctx } = {}) {
  if (!redis) return [];
  const todas = Object.values((await redis.hgetall(k(empresa))) || {}).filter((p) => !despacho || p.despacho === despacho);
  const tickets = todas.filter((p) => p.estado === 'pendiente' && p.tipo === 'ticket' && p.gasto?.id);
  if (ctx && tickets.length) {
    const gastos = await Promise.all(tickets.map((p) => leerUno(ctx, 'gastos', p.gasto.id).catch(() => null)));
    tickets.forEach((p, i) => {
      if (!gastos[i]) Object.assign(p, { estado: 'anulada', motivo: 'El gasto ya no existe' });
      else if (gastos[i].archivo?.clave) Object.assign(p, { estado: 'entregada', entrega: { fecha: gastos[i].archivo.subido || '', nombre: '' } });
    });
  }
  const orden = { pendiente: 0, entregada: 1, anulada: 2 };
  return todas.sort((a, b) => orden[a.estado] - orden[b.estado] || String(b.creada).localeCompare(String(a.creada)));
}
export const pendientes = (lista) => lista.filter((p) => p.estado === 'pendiente');

// Nueva petición. gasto: { id, texto } (ticket) · texto: lo que se pide (documento) o una nota (ticket).
export async function pedir(empresa, quien, { despacho, tipo, gasto, texto: t0 } = {}) {
  if (!TIPOS_PETICION[tipo]) return { error: 'Tipo de petición no válido' };
  if (!despacho) return { error: 'Falta el despacho' };
  const cuerpo = texto(t0, 300);
  if (tipo === 'ticket' && !gasto?.id) return { error: 'Elige el gasto' };
  if (tipo === 'documento' && cuerpo.length < 3) return { error: 'Escribe qué documento necesitas' };
  return conCerrojo(`peticiones:${empresa}`, async () => {
    const todas = Object.values((await redis.hgetall(k(empresa))) || {});
    if (todas.filter((p) => p.estado === 'pendiente' && p.despacho === despacho).length >= MAX_PENDIENTES) return { error: 'Tiene demasiadas peticiones pendientes: anula las que ya no hagan falta', status: 409 };
    if (tipo === 'ticket' && todas.some((p) => p.estado === 'pendiente' && p.tipo === 'ticket' && p.gasto?.id === gasto.id)) return { error: 'Ya le has pedido el ticket de este gasto', status: 409 };
    const p = {
      id: randomUUID().slice(0, 8), despacho, tipo, texto: cuerpo, creada: new Date().toISOString(), por: { id: quien.id, nombre: texto(quien.nombre, 60) }, estado: 'pendiente',
      ...(tipo === 'ticket' ? { gasto: { id: texto(gasto.id, 80), texto: texto(gasto.texto, 120) } } : {}),
    };
    await redis.hset(k(empresa), { [p.id]: p });
    return { peticion: p };
  }, { caduca: 10000, espera: 8000 });
}

// Cambiar una petición bajo cerrojo: fn(actual) → la nueva o { error }.
async function cambiar(empresa, id, despacho, fn) {
  return conCerrojo(`peticion:${empresa}:${id}`, async () => {
    const p = await redis.hget(k(empresa), String(id));
    if (!p || (despacho && p.despacho !== despacho)) return { error: 'Esa petición ya no existe', status: 404 };
    const nueva = fn(p);
    if (nueva.error) return nueva;
    await redis.hset(k(empresa), { [p.id]: nueva });
    return { peticion: nueva };
  }, { caduca: 10000, espera: 8000 });
}

export const anular = (empresa, id, despacho) => cambiar(empresa, id, despacho, (p) => (p.estado === 'pendiente' ? { ...p, estado: 'anulada' } : { error: 'Ya no está pendiente', status: 409 }));
// El cliente la entrega: con su archivo (documento) o porque el gasto ya tiene justificante (ticket).
export const entregar = (empresa, id, quien, { archivo } = {}) => cambiar(empresa, id, null, (p) => (p.estado !== 'pendiente' ? { error: 'Esta petición ya no está pendiente', status: 409 }
  : { ...p, estado: 'entregada', entrega: { fecha: new Date().toISOString(), nombre: texto(quien.nombre, 60), ...(archivo ? { archivo } : {}) } }));
export const enlazarHilo = (empresa, id, hilo) => cambiar(empresa, id, null, (p) => ({ ...p, hilo }));
export const peticionDe = async (empresa, id) => (redis ? redis.hget(k(empresa), String(id)) : null);
