import { Redis } from '@upstash/redis';
import { claves as clavesIndice, clavesAntiguas, coleccionDe, opBorrar, opGuardar } from './fichas.js';
import { TX_INDICES } from './scripts.js';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const base = url && token ? new Redis({ url, token }) : null;
// Sin deserializar: los valores tal como están guardados (para comparar documentos byte a byte, revisión S01).
const sinDeserializar = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
export async function hgetallCrudo(k) {
  const r = (await sinDeserializar.hgetall(P + k)) || [];
  if (!Array.isArray(r)) return r;
  const o = {};
  for (let i = 0; i < r.length; i += 2) o[r[i]] = r[i + 1];
  return o;
}
// Acceso sin prefijo, solo para el conector con Controla'T. Si Netto pasa a su propia base de datos,
// CONTROLAT_KV_REST_API_URL / _TOKEN apuntan a la de Controla'T; sin ellas, es la misma de siempre.
const urlC = process.env.CONTROLAT_KV_REST_API_URL;
const tokenC = process.env.CONTROLAT_KV_REST_API_TOKEN;
export const crudo = urlC && tokenC ? new Redis({ url: urlC, token: tokenC }) : base;

// Comparte la base de datos de Controla'T: todas las claves de esta app van con el prefijo «cuentas:».
const P = 'cuentas:';
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Índices y totales (informe de capacidad E01/E06, lib/fichas.js): toda escritura o borrado en una colección indexada
// (facturas, gastos, presupuestos) va con su índice y sus totales en una sola ejecución atómica (lib/scripts.js
// TX_INDICES), junto con el resto de órdenes de la misma transacción. La ficha anterior se lee dentro del script: dos
// escrituras a la vez del mismo documento no descuadran nada. Borrar la colección entera borra también sus índices.
const ser = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
const docsDe = (a) => (esObjeto(a[0]) ? Object.entries(a[0]) : [[String(a[0]), a[1]]])
  .map(([id, d]) => [String(id), typeof d === 'string' ? d : JSON.stringify(d)]);
const indicesDe = (k) => { const c = coleccionDe(k); return c ? [...Object.values(clavesIndice(c.col, c.emp)), ...clavesAntiguas(c.col, c.emp)] : []; };
// Una orden del envoltorio → argumentos de Redis tal como los manda el cliente de Upstash.
function crudoDe(m, k, a) {
  switch (m) {
    case 'hset': return ['hset', P + k, ...Object.entries(a[0]).flatMap(([c, v]) => [c, ser(v)])];
    case 'set': { const o = a[1] || {}; return ['set', P + k, ser(a[0]), ...(o.nx ? ['NX'] : []), ...(o.ex ? ['EX', String(o.ex)] : []), ...(o.px ? ['PX', String(o.px)] : [])]; }
    case 'zadd': return ['zadd', P + k, ...a.flatMap((x) => [String(x.score), x.member])];
    case 'sadd': case 'lpush': return [m, P + k, ...a.map(ser)];
    default: return [m, P + k, ...a.map(String)];
  }
}

// ops: [[metodo, clave, ...args]] tal como se piden. Devuelve el resultado de cada una, en orden.
async function ejecutar(ops) {
  if (!ops.some(([m, k, ...a]) => coleccionDe(k) || (m === 'del' && a.some(coleccionDe)))) {
    const t = base.multi();
    for (const [m, k, ...a] of ops) t[m](P + k, ...a);
    return t.exec();
  }
  const tx = [];
  const posiciones = [];
  for (const [m, k, ...a] of ops) {
    const c = coleccionDe(k);
    if (m === 'del') { posiciones.push(tx.length); tx.push(['del', ...[k, ...a].flatMap((x) => [x, ...indicesDe(x)]).map((x) => P + x)]); continue; }
    if (c && m === 'hset') {
      posiciones.push(tx.length);
      for (const [id, valor] of docsDe(a)) tx.push(opGuardar(c.col, c.emp, P, { ...JSON.parse(valor), id }, valor));
      continue;
    }
    if (c && m === 'hdel') { posiciones.push(tx.length); for (const id of a) tx.push(opBorrar(c.col, c.emp, P, id)); continue; }
    posiciones.push(tx.length);
    tx.push(crudoDe(m, k, a));
  }
  const r = await base.eval(TX_INDICES, [], [JSON.stringify(tx)]);
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
export const DATOS = ['facturas', 'gastos', 'clientes', 'empleados', 'nominas', 'recurrentes', 'productos', 'banco', 'bancos', 'saldo', 'jornada', 'asientos', 'cuentasAnuales', 'stock', 'albaranes', 'pedidosProv', 'domiciliaciones', 'cuentasProv', 'fichasProv', 'remesas', 'numeracion', 'numeracionDocs', 'facturasBorradas'];

export async function leer(u, nombre) {
  if (!redis) return null;
  return Object.values((await redis.hgetall(clave(u, nombre))) || {});
}

export const guardar = (u, nombre, obj) => redis.hset(clave(u, nombre), { [obj.id]: obj });
export const borrar = (u, nombre, id) => redis.hdel(clave(u, nombre), id);
export const leerUno = (u, nombre, id) => redis.hget(clave(u, nombre), id);
