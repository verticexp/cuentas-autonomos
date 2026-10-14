// Lecturas por índice (informe de capacidad E01): páginas, rangos de fechas, pendientes y documentos de un cliente sin
// descargar el histórico completo. Los índices los mantiene lib/redis.js al escribir (lib/fichas.js dice qué llevan).
import { redis, clave, hgetallCrudo } from './redis.js';
import { TX_INDICES } from './scripts.js';
import { metrica } from './metricas.js';
import { conCerrojo, Ocupado } from './cerrojo.js';
import { claves, clavesAntiguas, idDe, miembro, opIndexar, opQuitar, ordenDeMiembro, ordenFecha, pad, nifNormal, nombreNormal, VERSION_INDICE } from './fichas.js';
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

// Reconstruye el índice de una colección desde su hash (la primera vez, al cambiar de versión, tras una restauración o
// si no cuadra). Revisión S01: no borra el índice ni escribe a ciegas. Lee los documentos tal como están guardados y
// escribe la ficha de cada uno con un script atómico que solo la aplica si el documento sigue igual; si alguien lo ha
// cambiado mientras tanto, su propia escritura ya actualizó el índice (lib/redis.js) y no se pisa con la copia antigua.
// Lo que sobra (documentos que ya no existen) se retira con la misma condición. Solo después se publica la versión.
const P = 'cuentas:';
export async function reconstruir(u, col) {
  const emp = empresa(u);
  const k = claves(col, emp);
  return conCerrojo(`indice:${col}:${emp}`, async () => {
    const zk = [['ix', k.ix], ['p', k.ixp], ['i', k.ixi], ['d', k.ixd]];
    const [docs, fichas, ...zs] = await Promise.all([hgetallCrudo(clave(u, col)), redis.hgetall(k.ixf), ...zk.map(([, z]) => redis.zrange(z, 0, -1))]);
    const lote = Object.entries(docs).map(([id, crudo]) => opIndexar(col, emp, P, { ...JSON.parse(crudo), id }, crudo));
    // Lo que está en el índice sin documento: fuera (si sigue sin existir al aplicarlo). Con ficha, el script sabe qué
    // quitar; las entradas sueltas, sin ficha, se pasan una a una.
    const sueltas = new Map();
    zk.forEach(([z], i) => { for (const m of (zs[i] || []).map(String)) { const id = idDe(m); if (!Object.hasOwn(docs, id) && !fichas?.[id]) sueltas.set(id, [...(sueltas.get(id) || []), [z, m]]); } });
    for (const id of new Set([...Object.keys(fichas || {}), ...sueltas.keys()])) if (!Object.hasOwn(docs, id)) lote.push(opQuitar(col, emp, P, id, sueltas.get(id) || []));
    for (let i = 0; i < lote.length; i += 200) await redis.eval(TX_INDICES, [], [JSON.stringify(lote.slice(i, i + 200))]);
    await redis.del(...clavesAntiguas(col, emp)); // las de la versión 3, que ya no se usan
    const [n, z] = await Promise.all([redis.hlen(clave(u, col)), redis.zcard(k.ix)]);
    if (n === z) await redis.set(k.ixv, VERSION_INDICE);
    metrica('indice-reconstruido', { coleccion: col, empresa: emp, documentos: n, completo: n === z });
    return lote.length;
  }, { caduca: 120000, espera: 30000 });
}

// Antes de leer por índice: construido, de esta versión y con tantas entradas como documentos. Si otra petición lo está
// reconstruyendo, se espera a que acabe; nunca se lee un índice a medias.
export async function asegurar(u, col) {
  const k = claves(col, empresa(u));
  const valido = async () => {
    const [v, n, z] = await Promise.all([redis.get(k.ixv), redis.hlen(clave(u, col)), redis.zcard(k.ix)]);
    return String(v ?? '') === VERSION_INDICE && n === z;
  };
  for (let i = 0; i < 3; i++) {
    if (await valido()) return;
    try { await reconstruir(u, col); } catch (e) { if (!(e instanceof Ocupado)) throw e; }
  }
  if (!(await valido())) throw new Ocupado('Estamos preparando tus datos: vuelve a cargar en unos segundos.');
}

export const contar = async (u, col) => { await asegurar(u, col); return redis.zcard(claves(col, empresa(u)).ix); };
export const contarMarcados = async (u, col, marca) => { await asegurar(u, col); return redis.zcard(claves(col, empresa(u))[`ix${marca}`]); };

// Cursor: «orden~id» del último de la página. El orden lexicográfico es por (orden, id) y el siguiente se pide con un
// límite exclusivo a partir de ese miembro (revisión S04): avanza por todos los empates, aunque haya miles con el mismo
// orden, y sigue siendo válido si entre páginas se dan altas o bajas.
const leerCursor = (c) => { const m = /^(\d+)~(.+)$/.exec(String(c || '')); return m ? miembro(m[1], m[2]) : null; };
const escribirCursor = (m) => `${ordenDeMiembro(m)}~${idDe(m)}`;

// Una página de ids (los más recientes primero) del índice general o de un subconjunto (marca 'p' o 'i'), opcionalmente
// filtrada por ficha y por texto (buscar: en todos los conceptos, revisión S06). Recorre por bloques hasta llenar la
// página: con un filtro poco frecuente puede recorrer mucho, pero solo fichas y textos, nunca documentos.
export async function pagina(u, col, { cursor, limite = POR_PAGINA, marca, filtro, buscar } = {}) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const zk = marca ? k[`ix${marca}`] : k.ix;
  const q = String(buscar || '').trim().toLowerCase();
  let desde = leerCursor(cursor);
  const ids = [], fichas = [];
  const conFiltro = Boolean(filtro || q);
  const bloque = conFiltro ? 200 : limite + 1;
  for (;;) {
    const ms = (await redis.zrange(zk, desde ? `(${desde}` : '+', '-', { byLex: true, rev: true, offset: 0, count: bloque })).map(String);
    if (!ms.length) return { ids, fichas, siguiente: null };
    const lista = ms.map(idDe);
    const [fs, ts] = await Promise.all([filtro ? hmget(k.ixf, lista) : lista.map(() => null), q ? hmget(k.ixt, lista) : lista.map(() => null)]);
    for (let i = 0; i < ms.length; i++) {
      if (filtro && (!fs[i] || !filtro(fs[i]))) continue;
      if (q && !String(ts[i] ?? '').includes(q)) continue;
      if (ids.length === limite) return { ids, fichas, siguiente: escribirCursor(i ? ms[i - 1] : desde) };
      ids.push(lista[i]); fichas.push(fs[i]);
    }
    desde = ms.at(-1);
    if (ms.length < bloque) return { ids, fichas, siguiente: null };
    if (!conFiltro && ids.length === limite) return { ids, fichas, siguiente: null };
  }
}

export async function documentos(u, col, ids) {
  return (await hmget(clave(u, col), ids)).map((d, i) => (d ? { ...d, id: d.id ?? ids[i] } : null)).filter(Boolean);
}

const idsRango = (zk, desde, hasta) => redis.zrange(zk, `[${pad(ordenFecha(desde))}`, `(${pad(ordenFecha(hasta, true) + 1)}`, { byLex: true }).then((r) => r.map(idDe));

// Documentos entre dos fechas (incluidas), por orden.
export async function leerRango(u, col, desde, hasta) {
  await asegurar(u, col);
  return documentos(u, col, await idsRango(claves(col, empresa(u)).ix, desde, hasta));
}

// Fichas entre dos fechas (para sumar sin leer los documentos). Con textos: cada una con su texto de búsqueda en `x`.
export async function fichasRango(u, col, desde, hasta, { textos = false } = {}) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const ids = await idsRango(k.ix, desde, hasta);
  const [fs, ts] = await Promise.all([hmget(k.ixf, ids), textos ? hmget(k.ixt, ids) : []]);
  return fs.map((f, i) => f && { ...f, id: ids[i], ...(textos ? { x: String(ts[i] ?? '') } : {}) }).filter(Boolean);
}

// Documentos de un subconjunto entero: 'p' (facturas sin cobrar, gastos sin pagar) o 'i' (bienes de inversión).
export async function leerMarcados(u, col, marca) {
  await asegurar(u, col);
  const ids = (await redis.zrange(claves(col, empresa(u))[`ix${marca}`], 0, -1)).map(idDe);
  return documentos(u, col, ids);
}
export async function fichasMarcadas(u, col, marca) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const ids = (await redis.zrange(k[`ix${marca}`], 0, -1)).map(idDe);
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

// Todas las fichas de una colección (compactas: unos 150 bytes por documento, no el documento entero). Para lo que
// necesita recorrerlo todo sin los detalles (agrupar por proveedor, nombres de proyecto…).
export async function todasFichas(u, col) {
  await asegurar(u, col);
  return Object.entries((await redis.hgetall(claves(col, empresa(u)).ixf)) || {}).map(([id, f]) => ({ ...f, id }));
}

// Facturas y gastos de unos años (y, con bienes, todos los bienes de inversión, que se amortizan en años posteriores;
// con pendientes, lo que queda por cobrar o pagar de cualquier año). Primero se reúnen los ids y después se lee cada
// documento una sola vez (revisión: lo pendiente del año no se vuelve a transferir).
export async function delosAnios(u, anios, { bienes = true, pendientes = false } = {}) {
  const ys = [...new Set(anios.map(Number).filter(Boolean))];
  const ids = async (col, marcas) => {
    await asegurar(u, col);
    const k = claves(col, empresa(u));
    const listas = await Promise.all([...ys.map((y) => idsRango(k.ix, `${y}-01-01`, `${y}-12-31`)), ...marcas.map((m) => redis.zrange(k[`ix${m}`], 0, -1).then((r) => r.map(idDe)))]);
    return [...new Set(listas.flat())];
  };
  const [fi, gi] = await Promise.all([ids('facturas', pendientes ? ['p'] : []), ids('gastos', [...(bienes ? ['i'] : []), ...(pendientes ? ['p'] : [])])]);
  const [facturas, gastos] = await Promise.all([documentos(u, 'facturas', fi), documentos(u, 'gastos', gi)]);
  return { facturas, gastos };
}

// ---------- Totales precalculados (E06) ----------
// Campos de ixa:<col>:<emp> en céntimos (lib/fichas.js AGREGADOS) → euros. Sin el campo, 0.
export async function totales(u, col, campos) {
  await asegurar(u, col);
  if (!campos.length) return {};
  const r = (await redis.hmget(claves(col, empresa(u)).ixa, ...campos)) || {};
  return Object.fromEntries(campos.map((c) => [c, (Number(r[c]) || 0) / 100]));
}

// Facturas vencidas hoy: las que tienen vencimiento guardado, contando en el índice por vencimiento; las de antes de
// guardarlo (vencimiento «»), con su ficha y el plazo actual, como siempre.
export async function vencidas(u, plazo, hoy) {
  await asegurar(u, 'facturas');
  const k = claves('facturas', empresa(u));
  const [conFecha, sinFecha] = await Promise.all([
    redis.zrange(k.ixd, '[0', `(${hoy}`, { byLex: true }),
    redis.zrange(k.ixd, '[\0', '(0', { byLex: true }),
  ]);
  const ids = [...conFecha, ...sinFecha].map(idDe);
  const fichas = (await hmget(k.ixf, ids)).map((f, i) => f && { ...f, id: ids[i] }).filter(Boolean);
  return fichas.filter((f) => vencidaFicha(f, plazo, hoy));
}

// Comprobación (E06): los totales guardados cuadran con los que salen de las fichas. Devuelve los campos que no.
export async function comprobarTotales(u, col) {
  await asegurar(u, col);
  const k = claves(col, empresa(u));
  const [guardado, fichas] = await Promise.all([redis.hgetall(k.ixa), redis.hgetall(k.ixf)]);
  const esperado = {};
  for (const f of Object.values(fichas || {})) for (const [c, n] of Object.entries(f.ag || {})) esperado[c] = (esperado[c] || 0) + n;
  const campos = new Set([...Object.keys(esperado), ...Object.keys(guardado || {})].filter((c) => c !== 'rev'));
  return [...campos].filter((c) => (Number(guardado?.[c]) || 0) !== (esperado[c] || 0)).map((c) => ({ campo: c, guardado: Number(guardado?.[c]) || 0, esperado: esperado[c] || 0 }));
}
