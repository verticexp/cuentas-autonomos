import { Redis } from '@upstash/redis';
import { claves as clavesIndice, coleccionDe, opsBorrar, opsGuardar } from './fichas.js';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const base = url && token ? new Redis({ url, token }) : null;
// Acceso sin prefijo, solo para el conector con Controla'T. Si Netto pasa a su propia base de datos,
// CONTROLAT_KV_REST_API_URL / _TOKEN apuntan a la de Controla'T; sin ellas, es la misma de siempre.
const urlC = process.env.CONTROLAT_KV_REST_API_URL;
const tokenC = process.env.CONTROLAT_KV_REST_API_TOKEN;
export const crudo = urlC && tokenC ? new Redis({ url: urlC, token: tokenC }) : base;

// Comparte la base de datos de Controla'T: todas las claves de esta app van con el prefijo «cuentas:».
const P = 'cuentas:';
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Índices (informe de capacidad E01, lib/fichas.js): toda escritura o borrado en una colección indexada (facturas,
// gastos, presupuestos) lleva sus índices en la misma transacción MULTI/EXEC que el documento. Antes se leen las
// fichas anteriores de esos documentos (una petición) para retirar las entradas de cliente que cambien. Borrar la
// colección entera borra también sus índices.
// tx con prefijo que cuenta cuántas operaciones de índice se añaden (para devolver solo los resultados de lo pedido).
const conPrefijo = (t) => {
  const w = { n: 0 };
  for (const m of ['zadd', 'zrem', 'hset', 'hdel']) w[m] = (k, ...a) => { w.n++; t[m](P + k, ...a); };
  return w;
};
const docsDe = (a) => (esObjeto(a[0]) ? Object.entries(a[0]) : [[String(a[0]), a[1]]])
  .map(([id, d]) => ({ ...(typeof d === 'string' ? JSON.parse(d) : d), id: String(id) }));
const indicesDe = (k) => { const c = coleccionDe(k); return c ? Object.values(clavesIndice(c.col, c.emp)) : []; };

// ops: [[metodo, clave, ...args]] tal como se piden. Devuelve el resultado de cada una, en orden.
async function ejecutar(ops) {
  const ids = new Map();
  for (const [m, k, ...a] of ops) {
    if (!coleccionDe(k) || !['hset', 'hdel'].includes(m)) continue;
    ids.set(k, [...(ids.get(k) || []), ...(m === 'hset' ? docsDe(a).map((d) => d.id) : a.map(String))]);
  }
  const previas = new Map(await Promise.all([...ids].map(async ([k, xs]) => {
    const c = coleccionDe(k);
    return [k, (await base.hmget(P + clavesIndice(c.col, c.emp).ixf, ...new Set(xs))) || {}];
  })));
  const t = base.multi();
  const tx = conPrefijo(t);
  const posiciones = [];
  for (const [m, k, ...a] of ops) {
    posiciones.push(posiciones.length + tx.n);
    if (m === 'del') { t.del(...[k, ...a].flatMap((x) => [x, ...indicesDe(x)]).map((x) => P + x)); continue; }
    t[m](P + k, ...a);
    const c = coleccionDe(k);
    if (c && m === 'hset') opsGuardar(tx, c.col, c.emp, docsDe(a), previas.get(k));
    else if (c && m === 'hdel') opsBorrar(tx, c.col, c.emp, a.map(String), previas.get(k));
  }
  const r = await t.exec();
  return posiciones.map((i) => r[i]);
}
const indexada = (k) => Boolean(coleccionDe(k));

export const redis = base && {
  hget: (k, ...a) => base.hget(P + k, ...a),
  hset: (k, ...a) => (indexada(k) ? ejecutar([['hset', k, ...a]]).then((r) => r[0]) : base.hset(P + k, ...a)),
  hgetall: (k) => base.hgetall(P + k),
  hmget: (k, ...a) => base.hmget(P + k, ...a),
  hdel: (k, ...a) => (indexada(k) ? ejecutar([['hdel', k, ...a]]).then((r) => r[0]) : base.hdel(P + k, ...a)),
  hlen: (k) => base.hlen(P + k),
  get: (k) => base.get(P + k),
  set: (k, v, o) => base.set(P + k, v, o),
  sadd: (k, ...a) => base.sadd(P + k, ...a),
  smembers: (k) => base.smembers(P + k),
  incr: (k) => base.incr(P + k),
  expire: (k, s) => base.expire(P + k, s),
  ttl: (k) => base.ttl(P + k),
  lpush: (k, ...a) => base.lpush(P + k, ...a),
  ltrim: (k, ...a) => base.ltrim(P + k, ...a),
  lrange: (k, ...a) => base.lrange(P + k, ...a),
  del: (...ks) => (ks.some(indexada) ? ejecutar([['del', ...ks]]).then((r) => r[0]) : base.del(...ks.map((k) => P + k))),
  hsetnx: (k, ...a) => base.hsetnx(P + k, ...a),
  hincrby: (k, ...a) => base.hincrby(P + k, ...a),
  zadd: (k, ...a) => base.zadd(P + k, ...a),
  zrem: (k, ...a) => base.zrem(P + k, ...a),
  zcard: (k) => base.zcard(P + k),
  zscore: (k, m) => base.zscore(P + k, m),
  zrange: (k, ...a) => base.zrange(P + k, ...a),
  eval: (script, keys, args) => base.eval(script, keys.map((k) => P + k), args),
  // Transacción (MULTI/EXEC): o se aplica todo o nada. Mismos métodos y prefijo que arriba (con sus índices).
  multi: () => {
    const ops = [];
    const w = { exec: () => ejecutar(ops) };
    for (const m of ['hset', 'hdel', 'set', 'del', 'incr', 'hincrby', 'sadd', 'expire', 'lpush', 'ltrim', 'zadd', 'zrem']) w[m] = (k, ...a) => { ops.push([m, k, ...a]); return w; };
    return w;
  },
};

// Cada empresa tiene sus hashes: facturas:<empresa>, gastos:<empresa>, clientes:<empresa> (id → objeto).
// Las cuentas de antes usan su id de usuario como id de empresa, así sus datos no se mueven.
export const clave = (u, nombre) => `${nombre}:${u.empresa || u.id}`;
export const DATOS = ['facturas', 'gastos', 'clientes', 'empleados', 'nominas', 'recurrentes', 'productos', 'banco', 'bancos', 'saldo', 'jornada', 'asientos', 'cuentasAnuales', 'stock', 'albaranes', 'pedidosProv', 'domiciliaciones', 'cuentasProv', 'remesas', 'numeracion', 'numeracionDocs', 'facturasBorradas'];

export async function leer(u, nombre) {
  if (!redis) return null;
  return Object.values((await redis.hgetall(clave(u, nombre))) || {});
}

export const guardar = (u, nombre, obj) => redis.hset(clave(u, nombre), { [obj.id]: obj });
export const borrar = (u, nombre, id) => redis.hdel(clave(u, nombre), id);
export const leerUno = (u, nombre, id) => redis.hget(clave(u, nombre), id);
