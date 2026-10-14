// Lecturas por índice (informe de capacidad E01): páginas, rangos de fechas, pendientes y documentos de un cliente sin
// descargar el histórico completo. Los índices los mantiene lib/redis.js al escribir (lib/fichas.js dice qué llevan).
import { redis, clave } from './redis.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { claves, opsGuardar, ordenFecha, nifNormal, nombreNormal, VERSION_INDICE } from './fichas.js';
import { vencimiento } from './calculos.js';

const empresa = (u) => u.empresa || u.id;
const LOTE = 500;
export const POR_PAGINA = 50;

async function hmget(k, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const parte = ids.slice(i, i + LOTE);
    const r = (await redis.hmget(k, ...parte)) || {};
    for (const id of parte) out.push(r[id] ?? null);
  }
  return out;
}

// Reconstruye el índice de una colección desde su hash (la primera vez, tras una restauración o si no cuadra). Bajo
// cerrojo propio: dos peticiones no lo reconstruyen a la vez. Si mientras tanto cambia el número de documentos, no se
// marca como construido y la siguiente lectura lo repite.
export async function reconstruir(u, col) {
  const k = claves(col, empresa(u));
  return conCerrojo(`indice:${col}:${empresa(u)}`, async () => {
    const todos = Object.entries((await redis.hgetall(clave(u, col))) || {}).map(([id, d]) => ({ ...d, id }));
    await redis.del(k.ix, k.ixp, k.ixi, k.ixf, k.ixn, k.ixv);
    for (let i = 0; i < todos.length; i += LOTE) {
      const tx = redis.multi();
      opsGuardar(tx, col, empresa(u), todos.slice(i, i + LOTE));
      await tx.exec();
    }
    const [n, z] = await Promise.all([redis.hlen(clave(u, col)), redis.zcard(k.ix)]);
    if (n === z) await redis.set(k.ixv, VERSION_INDICE);
    return todos.length;
  }, { caduca: 120000, espera: 30000 });
}

// Antes de leer por índice: construido, de esta versión y con tantas entradas como documentos.
export async function asegurar(u, col) {
  const k = claves(col, empresa(u));
  const [v, n, z] = await Promise.all([redis.get(k.ixv), redis.hlen(clave(u, col)), redis.zcard(k.ix)]);
  if (String(v ?? '') === VERSION_INDICE && n === z) return;
  try { await reconstruir(u, col); } catch (e) { if (!(e instanceof Ocupado)) throw e; }
}

export const contar = async (u, col) => { await asegurar(u, col); return redis.zcard(claves(col, empresa(u)).ix); };

// Cursor estable: «orden~id» del último de la página. A igual orden, Redis ordena por id (al revés en REV).
const leerCursor = (c) => { const m = /^(\d+)~(.+)$/.exec(String(c || '')); return m ? { o: Number(m[1]), id: m[2] } : null; };

// Una página de ids (los más recientes primero) del índice general o de un subconjunto (marca 'p' o 'i'), opcionalmente
// filtrada por ficha. Recorre por bloques hasta llenar la página: con filtro poco frecuente puede recorrer mucho, pero
// solo fichas (pocos bytes), nunca documentos.
export async function pagina(u, col, { cursor, limite = POR_PAGINA, marca, filtro } = {}) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const zk = marca ? k[`ix${marca}`] : k.ix;
  let desde = leerCursor(cursor);
  const ids = [], fichas = [];
  const bloque = filtro ? 200 : limite + 1;
  for (;;) {
    const crudo = await redis.zrange(zk, desde ? desde.o : '+inf', '-inf', { byScore: true, rev: true, offset: 0, count: bloque + 20, withScores: true });
    let pares = [];
    for (let i = 0; i < crudo.length; i += 2) pares.push({ id: String(crudo[i]), o: Number(crudo[i + 1]) });
    const leidos = pares.length;
    if (desde) pares = pares.filter((p) => p.o < desde.o || p.id < desde.id);
    pares = pares.slice(0, bloque);
    if (!pares.length) return { ids, fichas, siguiente: null };
    const fs = filtro ? await hmget(k.ixf, pares.map((p) => p.id)) : pares.map(() => null);
    for (let i = 0; i < pares.length; i++) {
      if (filtro && (!fs[i] || !filtro(fs[i]))) continue;
      if (ids.length === limite) return { ids, fichas, siguiente: `${pares[i - 1]?.o ?? desde.o}~${pares[i - 1]?.id ?? desde.id}` };
      ids.push(pares[i].id); fichas.push(fs[i]);
    }
    const ult = pares.at(-1);
    desde = { o: ult.o, id: ult.id };
    if (leidos < bloque + 20 && pares.length < bloque) return { ids, fichas, siguiente: null };
    if (!filtro && ids.length === limite) return { ids, fichas, siguiente: null };
  }
}

export async function documentos(u, col, ids) {
  return (await hmget(clave(u, col), ids)).map((d, i) => (d ? { ...d, id: d.id ?? ids[i] } : null)).filter(Boolean);
}

const idsRango = (zk, desde, hasta) => redis.zrange(zk, ordenFecha(desde), ordenFecha(hasta, true), { byScore: true }).then((r) => r.map(String));

// Documentos entre dos fechas (incluidas), por orden.
export async function leerRango(u, col, desde, hasta) {
  await asegurar(u, col);
  return documentos(u, col, await idsRango(claves(col, empresa(u)).ix, desde, hasta));
}

// Fichas entre dos fechas (para sumar sin leer los documentos).
export async function fichasRango(u, col, desde, hasta) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const ids = await idsRango(k.ix, desde, hasta);
  return (await hmget(k.ixf, ids)).map((f, i) => f && { ...f, id: ids[i] }).filter(Boolean);
}

// Documentos de un subconjunto entero: 'p' (facturas sin cobrar, gastos sin pagar) o 'i' (bienes de inversión).
export async function leerMarcados(u, col, marca) {
  await asegurar(u, col);
  const ids = (await redis.zrange(claves(col, empresa(u))[`ix${marca}`], 0, -1)).map(String);
  return documentos(u, col, ids);
}
export async function fichasMarcadas(u, col, marca) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const ids = (await redis.zrange(k[`ix${marca}`], 0, -1)).map(String);
  return (await hmget(k.ixf, ids)).map((f, i) => f && { ...f, id: ids[i] }).filter(Boolean);
}

// Une listas de documentos sin repetir (por id).
export const unir = (...listas) => [...new Map(listas.flat().map((d) => [d.id, d])).values()];

// Documentos de un cliente (por su nombre y, si lo tiene, por su NIF): para el portal, sin leer los de los demás.
export async function leerCliente(u, col, { nombre, nif } = {}) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const prefijos = [nombreNormal(nombre) && `N:${nombreNormal(nombre)}\0`, nifNormal(nif) && `F:${nifNormal(nif)}\0`].filter(Boolean);
  const ids = new Set();
  for (const p of prefijos) for (const m of await redis.zrange(k.ixn, `[${p}`, `[${p}￿`, { byLex: true })) ids.add(String(m).slice(p.length));
  return documentos(u, col, [...ids]);
}

// Vencida según su ficha (lo mismo que calculos.vencida con el documento).
export const vencidaFicha = (f, plazo, hoy) => !f.co && f.t > 0 && hoy > vencimiento({ vence: f.ve, fecha: f.f }, plazo);
