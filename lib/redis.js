import { Redis } from '@upstash/redis';

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const base = url && token ? new Redis({ url, token }) : null;
// Acceso sin prefijo, solo para el conector con Controla'T (que usa la misma base de datos).
export const crudo = base;

// Comparte la base de datos de Controla'T: todas las claves de esta app van con el prefijo «cuentas:».
const P = 'cuentas:';
export const redis = base && {
  hget: (k, ...a) => base.hget(P + k, ...a),
  hset: (k, ...a) => base.hset(P + k, ...a),
  hgetall: (k) => base.hgetall(P + k),
  hdel: (k, ...a) => base.hdel(P + k, ...a),
  hlen: (k) => base.hlen(P + k),
  get: (k) => base.get(P + k),
  set: (k, v, o) => base.set(P + k, v, o),
  sadd: (k, ...a) => base.sadd(P + k, ...a),
  smembers: (k) => base.smembers(P + k),
  incr: (k) => base.incr(P + k),
  expire: (k, s) => base.expire(P + k, s),
  del: (...ks) => base.del(...ks.map((k) => P + k)),
};

// Cada empresa tiene sus hashes: facturas:<empresa>, gastos:<empresa>, clientes:<empresa> (id → objeto).
// Las cuentas de antes usan su id de usuario como id de empresa, así sus datos no se mueven.
export const clave = (u, nombre) => `${nombre}:${u.empresa || u.id}`;
export const DATOS = ['facturas', 'gastos', 'clientes', 'empleados', 'nominas', 'recurrentes', 'productos', 'banco', 'bancos', 'saldo'];

export async function leer(u, nombre) {
  if (!redis) return null;
  return Object.values((await redis.hgetall(clave(u, nombre))) || {});
}

export const guardar = (u, nombre, obj) => redis.hset(clave(u, nombre), { [obj.id]: obj });
export const borrar = (u, nombre, id) => redis.hdel(clave(u, nombre), id);
export const leerUno = (u, nombre, id) => redis.hget(clave(u, nombre), id);
