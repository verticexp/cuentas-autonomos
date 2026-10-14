// Scripts Lua de operaciones que tienen que ser atómicas en Redis (revisión de escalabilidad del 14/10/2026, S01–S02).
// tests/apoyo/upstash-mem.mjs los reconoce por su texto y los ejecuta igual en JavaScript.

// S01 · Reconstruir un índice sin pisar escrituras recientes. KEYS[1]: hash de documentos. ARGV[1]: JSON
// [[id, esperado, ops], …], con esperado el documento tal como se leyó ('' si no existía) y ops [[comando, clave, …], …].
// Las operaciones de cada documento solo se aplican si sigue exactamente igual: si alguien lo ha cambiado mientras
// tanto, su propia escritura ya dejó el índice al día. Devuelve cuántos se han aplicado.
export const INDICE_SI_IGUAL = `local lote = cjson.decode(ARGV[1])
local n = 0
for _, d in ipairs(lote) do
  local actual = redis.call('hget', KEYS[1], d[1])
  if (actual == false and d[2] == '') or actual == d[2] then
    for _, op in ipairs(d[3]) do redis.call(unpack(op)) end
    n = n + 1
  end
end
return n`;

// S02 · Cerrar un trabajo solo si sigue siendo la versión que se ejecutó. KEYS[1]: hash de trabajos; KEYS[2]: cola.
// ARGV: id, versión, miembro de la cola, 'borrar' | 'guardar', trabajo (JSON, para guardar), puntuación ('' = sacarlo
// de la cola). Si hay una versión nueva, no se toca: sigue guardada y programada. Devuelve 1 si se ha cerrado.
export const CERRAR_TRABAJO = `local t = redis.call('hget', KEYS[1], ARGV[1])
if not t then return 0 end
if cjson.decode(t)['v'] ~= ARGV[2] then return 0 end
if ARGV[4] == 'borrar' then redis.call('hdel', KEYS[1], ARGV[1]) else redis.call('hset', KEYS[1], ARGV[1], ARGV[5]) end
if ARGV[6] == '' then redis.call('zrem', KEYS[2], ARGV[3]) else redis.call('zadd', KEYS[2], ARGV[6], ARGV[3]) end
return 1`;
