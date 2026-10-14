// Scripts Lua de operaciones que tienen que ser atómicas en Redis (revisión de escalabilidad del 14/10/2026, S01–S02, y E06).
// tests/apoyo/upstash-mem.mjs los reconoce por su texto y los ejecuta igual en JavaScript.

// Transacción con índices y totales (E06; sustituye a MULTI/EXEC cuando se escribe una colección indexada). ARGV[1]:
// JSON con la lista de operaciones, en orden, todas en una sola ejecución atómica:
//   [comando, clave, …]                       una orden normal de Redis.
//   ['_g', doc, id, valor, ficha, texto, K]   guardar el documento y su índice.
//   ['_b', doc, id, K]                        borrar el documento y su índice.
//   ['_i', doc, id, esperado, ficha, texto, K] (reconstruir, S01) indexar solo si el documento sigue tal cual se leyó.
//   ['_d', doc, id, K, sueltas]               (reconstruir) quitar del índice solo si el documento ya no existe;
//                                             sueltas: [[nombre, miembro]] que quedaron sin ficha.
// K: { ixf, ixt, ixa, z = { nombre → clave } }. La ficha lleva zs ([[nombre, miembro]]: dónde está en cada conjunto
// ordenado) y ag ({ campo → céntimos }: su aportación a los totales). La ficha anterior se lee aquí dentro, así que
// dos escrituras a la vez del mismo documento nunca descuadran los totales ni dejan entradas viejas. Cada cambio sube
// el contador «rev» de los totales (versión de los datos, para lo que se guarda calculado: lib/panelCache.js).
// Devuelve el resultado de cada operación.
export const TX_INDICES = `local function quitar(K, id)
  local v = redis.call('hget', K.ixf, id)
  if not v then return end
  local o = cjson.decode(v)
  if o.zs then
    for _, e in ipairs(o.zs) do redis.call('zrem', K.z[e[1]], e[2]) end
  elseif o.o then
    local om = string.format('%016.0f', o.o) .. string.char(0) .. id
    for _, k in pairs(K.z) do redis.call('zrem', k, om) end
    if o.cl then for _, c in ipairs(o.cl) do redis.call('zrem', K.z.n, c) end end
  end
  if o.ag then for c, n in pairs(o.ag) do redis.call('hincrby', K.ixa, c, -n) end end
end
local function poner(K, id, fj, texto)
  local f = cjson.decode(fj)
  for _, e in ipairs(f.zs) do redis.call('zadd', K.z[e[1]], 0, e[2]) end
  for c, n in pairs(f.ag) do redis.call('hincrby', K.ixa, c, n) end
  redis.call('hset', K.ixf, id, fj)
  if type(texto) == 'string' then redis.call('hset', K.ixt, id, texto) end
end
local ops = cjson.decode(ARGV[1])
-- Valida la estructura completa antes de escribir: Redis no revierte una ejecución Lua que falla a mitad.
for _, op in ipairs(ops) do
  local c = op[1]
  local K = (c == '_g' or c == '_i') and op[7] or (c == '_b' or c == '_d') and op[4] or nil
  if c == '_g' or c == '_i' or c == '_b' or c == '_d' then
    if type(K) ~= 'table' or type(K.ixa) ~= 'string' or type(K.ixf) ~= 'string' or type(K.z) ~= 'table' then
      return redis.error_reply('Estructura de indice no valida; no se ha escrito nada')
    end
  end
end
local r = {}
for i, op in ipairs(ops) do
  local c = op[1]
  if c == '_g' then
    redis.call('hincrby', op[7].ixa, 'rev', 1)
    quitar(op[7], op[3])
    r[i] = redis.call('hset', op[2], op[3], op[4])
    poner(op[7], op[3], op[5], op[6])
  elseif c == '_b' then
    redis.call('hincrby', op[4].ixa, 'rev', 1)
    quitar(op[4], op[3])
    redis.call('hdel', op[4].ixf, op[3])
    redis.call('hdel', op[4].ixt, op[3])
    r[i] = redis.call('hdel', op[2], op[3])
  elseif c == '_i' then
    local actual = redis.call('hget', op[2], op[3])
    if (actual == false and op[4] == '') or actual == op[4] then redis.call('hincrby', op[7].ixa, 'rev', 1); quitar(op[7], op[3]); poner(op[7], op[3], op[5], op[6]); r[i] = 1 else r[i] = 0 end
  elseif c == '_d' then
    if redis.call('hexists', op[2], op[3]) == 0 then
      redis.call('hincrby', op[4].ixa, 'rev', 1); quitar(op[4], op[3]); redis.call('hdel', op[4].ixf, op[3]); redis.call('hdel', op[4].ixt, op[3])
      if op[5] then for _, e in ipairs(op[5]) do redis.call('zrem', op[4].z[e[1]], e[2]) end end
      r[i] = 1
    else r[i] = 0 end
  else
    r[i] = redis.call(unpack(op))
  end
end
return r`;

// S02 · Cerrar un trabajo solo si sigue siendo la versión que se ejecutó. KEYS[1]: hash de trabajos; KEYS[2]: cola.
// ARGV: id, versión, miembro de la cola, 'borrar' | 'guardar', trabajo (JSON, para guardar), puntuación ('' = sacarlo
// de la cola). Si hay una versión nueva, no se toca: sigue guardada y programada. Devuelve 1 si se ha cerrado.
export const CERRAR_TRABAJO = `local t = redis.call('hget', KEYS[1], ARGV[1])
if not t then return 0 end
if cjson.decode(t)['v'] ~= ARGV[2] then return 0 end
if ARGV[4] == 'borrar' then redis.call('hdel', KEYS[1], ARGV[1]) else redis.call('hset', KEYS[1], ARGV[1], ARGV[5]) end
if ARGV[6] == '' then redis.call('zrem', KEYS[2], ARGV[3]) else redis.call('zadd', KEYS[2], ARGV[6], ARGV[3]) end
return 1`;
