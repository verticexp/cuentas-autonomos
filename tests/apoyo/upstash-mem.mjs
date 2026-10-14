// Simulador en memoria de la API REST de Upstash, solo para pruebas (nunca una base de datos real).
// Cada petición se atiende por HTTP, así que las carreras entre «leer» y «guardar» de la app se reproducen igual que
// contra Upstash. MULTI/EXEC se aplica de golpe (Node atiende una petición cada vez): es atómico, como en Redis.
// Uso: const s = await arrancar(); process.env.KV_REST_API_URL = s.url; … await s.cerrar();
import http from 'node:http';
import { TX_INDICES, CERRAR_TRABAJO } from '../../lib/scripts.js';

// Scripts Lua que usa la app (lib/cerrojo.js): se reconocen por su texto y se ejecutan en JavaScript.
export const SCRIPTS = {
  CONTAR_VENTANA: "local n = redis.call('INCR', KEYS[1])\nif n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end\nreturn n",
  TOMAR_PLAZA: "if redis.call('EXISTS', KEYS[1]) == 0 then\n  redis.call('SET', KEYS[2], ARGV[3], 'PX', ARGV[2])\nend\nlocal n = redis.call('INCR', KEYS[1])\nif n > tonumber(ARGV[1]) and ARGV[4] == 'activo' then\n  redis.call('DECR', KEYS[1])\n  return {n, ''}\nend\nredis.call('PEXPIRE', KEYS[1], ARGV[2])\nredis.call('PEXPIRE', KEYS[2], ARGV[2])\nreturn {n, redis.call('GET', KEYS[2])}",
  DEJAR_PLAZA: "if redis.call('GET', KEYS[2]) ~= ARGV[1] or redis.call('EXISTS', KEYS[1]) == 0 then return 0 end\nlocal n = redis.call('DECR', KEYS[1])\nif n <= 0 then redis.call('DEL', KEYS[1], KEYS[2]) end\nreturn n",

  soltar: "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
};

export function crearBase() {
  const db = new Map(); const exp = new Map();
  const vivo = (k) => { const t = exp.get(k); if (t && Date.now() > t) { db.delete(k); exp.delete(k); } return db.get(k); };
  const H = (k) => { let v = vivo(k); if (!v) db.set(k, v = { t: 'h', m: new Map() }); return v.m; };
  const S = (k) => { let v = vivo(k); if (!v) db.set(k, v = { t: 's', m: new Set() }); return v.m; };
  const L = (k) => { let v = vivo(k); if (!v) db.set(k, v = { t: 'l', m: [] }); return v; };
  const Z = (k) => { let v = vivo(k); if (!v) db.set(k, v = { t: 'z', m: new Map() }); return v.m; };
  // Conjunto ordenado: por puntuación y, a igual puntuación, por el miembro (orden binario, como Redis).
  const ordenZ = (m) => [...m].sort(([a, x], [b, y]) => x - y || (a < b ? -1 : a > b ? 1 : 0));
  const limScore = (s) => { const t = String(s); if (t === '-inf') return [-Infinity, false]; if (t === '+inf' || t === 'inf') return [Infinity, false]; return t[0] === '(' ? [Number(t.slice(1)), true] : [Number(t), false]; };
  const enRango = (v, [lo, exLo], [hi, exHi]) => (exLo ? v > lo : v >= lo) && (exHi ? v < hi : v <= hi);
  const limLex = (s) => (s === '-' ? { min: true } : s === '+' ? { max: true } : { v: s.slice(1), ex: s[0] === '(' });
  const lexMin = (x, l) => l.min || (!l.max && (l.ex ? x > l.v : x >= l.v));
  const lexMax = (x, l) => l.max || (!l.min && (l.ex ? x < l.v : x <= l.v));
  const idx = (i, n) => (i < 0 ? n + i : i);
  const patron = (p) => new RegExp(`^${p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  function run([c, ...a]) {
    a = a.map(String);
    switch (c.toLowerCase()) {
      case 'hset': { const m = H(a[0]); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!m.has(a[i])) n++; m.set(a[i], a[i + 1]); } return n; }
      case 'hsetnx': { const m = H(a[0]); if (m.has(a[1])) return 0; m.set(a[1], a[2]); return 1; }
      case 'hincrby': { const m = H(a[0]); const n = Number(m.get(a[1]) || 0) + Number(a[2]); m.set(a[1], String(n)); return n; }
      case 'hget': return vivo(a[0])?.m.get(a[1]) ?? null;
      case 'hmget': return a.slice(1).map((f) => vivo(a[0])?.m.get(f) ?? null);
      case 'hgetall': { const v = vivo(a[0]); return v ? [...v.m].flat() : []; }
      case 'hdel': { const v = vivo(a[0]); let n = 0; for (const f of a.slice(1)) if (v?.m.delete(f)) n++; return n; }
      case 'hlen': return vivo(a[0])?.m.size || 0;
      case 'hexists': return vivo(a[0])?.m.has(a[1]) ? 1 : 0;
      case 'hkeys': return [...(vivo(a[0])?.m.keys() || [])];
      case 'hvals': return [...(vivo(a[0])?.m.values() || [])];
      case 'get': { const v = vivo(a[0]); return v ? v.v : null; }
      case 'set': {
        const o = a.slice(2).map((x) => x.toUpperCase());
        if (o.includes('NX') && vivo(a[0])) return null;
        if (o.includes('XX') && !vivo(a[0])) return null;
        db.set(a[0], { t: 'k', v: a[1] }); exp.delete(a[0]);
        const i = o.indexOf('EX'); if (i >= 0) exp.set(a[0], Date.now() + Number(a[3 + i]) * 1000);
        const j = o.indexOf('PX'); if (j >= 0) exp.set(a[0], Date.now() + Number(a[3 + j]));
        return 'OK';
      }
      case 'incr': case 'incrby': { const v = vivo(a[0]); const n = Number(v?.v || 0) + (c.toLowerCase() === 'incrby' ? Number(a[1]) : 1); db.set(a[0], { t: 'k', v: String(n) }); return n; }
      case 'expire': if (!vivo(a[0])) return 0; exp.set(a[0], Date.now() + Number(a[1]) * 1000); return 1;
      case 'pexpire': if (!vivo(a[0])) return 0; exp.set(a[0], Date.now() + Number(a[1])); return 1;
      case 'ttl': { if (!vivo(a[0])) return -2; const t = exp.get(a[0]); return t ? Math.ceil((t - Date.now()) / 1000) : -1; }
      case 'pttl': { if (!vivo(a[0])) return -2; const t = exp.get(a[0]); return t ? Math.max(0, t - Date.now()) : -1; }
      case 'type': return ({ h: 'hash', s: 'set', l: 'list', k: 'string', z: 'zset' })[vivo(a[0])?.t] || 'none';
      case 'sadd': { const m = S(a[0]); let n = 0; for (const x of a.slice(1)) if (!m.has(x)) { m.add(x); n++; } return n; }
      case 'srem': { const v = vivo(a[0]); let n = 0; for (const x of a.slice(1)) if (v?.m.delete(x)) n++; return n; }
      case 'smembers': return [...(vivo(a[0])?.m || [])];
      case 'sismember': return vivo(a[0])?.m.has(a[1]) ? 1 : 0;
      case 'lpush': { const l = L(a[0]); l.m.unshift(...a.slice(1).reverse()); return l.m.length; }
      case 'rpush': { const l = L(a[0]); l.m.push(...a.slice(1)); return l.m.length; }
      case 'lrange': { const m = vivo(a[0])?.m || []; return m.slice(idx(Number(a[1]), m.length), idx(Number(a[2]), m.length) + 1); }
      case 'ltrim': { const l = vivo(a[0]); if (l) l.m = l.m.slice(idx(Number(a[1]), l.m.length), idx(Number(a[2]), l.m.length) + 1); return 'OK'; }
      case 'llen': return vivo(a[0])?.m.length || 0;
      case 'zadd': { const m = Z(a[0]); let n = 0; for (let i = 1; i < a.length; i += 2) { if (!m.has(a[i + 1])) n++; m.set(a[i + 1], Number(a[i])); } return n; }
      case 'zrem': { const v = vivo(a[0]); let n = 0; for (const x of a.slice(1)) if (v?.m.delete(x)) n++; if (v && !v.m.size) db.delete(a[0]); return n; }
      case 'zcard': return vivo(a[0])?.m.size || 0;
      case 'zscore': { const s = vivo(a[0])?.m.get(a[1]); return s === undefined ? null : String(s); }
      case 'zrange': {
        const v = vivo(a[0]); if (!v) return [];
        const op = a.slice(3).map((x) => x.toLowerCase());
        const rev = op.includes('rev'), byscore = op.includes('byscore'), bylex = op.includes('bylex'), conScores = op.includes('withscores');
        const li = op.indexOf('limit');
        let lista = ordenZ(v.m);
        if (rev) lista.reverse();
        let [ini, fin] = [a[1], a[2]];
        if (byscore || bylex) {
          if (rev) [ini, fin] = [fin, ini];
          if (byscore) { const lo = limScore(ini), hi = limScore(fin); lista = lista.filter(([, s]) => enRango(s, lo, hi)); }
          else { const lo = limLex(ini), hi = limLex(fin); lista = lista.filter(([x]) => lexMin(x, lo) && lexMax(x, hi)); }
          if (li >= 0) { const off = Number(a[3 + li + 1]), cnt = Number(a[3 + li + 2]); lista = lista.slice(off, cnt < 0 ? undefined : off + cnt); }
        } else lista = lista.slice(idx(Number(ini), lista.length), idx(Number(fin), lista.length) + 1);
        return conScores ? lista.flatMap(([x, s]) => [x, String(s)]) : lista.map(([x]) => x);
      }
      case 'del': { let n = 0; for (const k of a) if (db.delete(k)) n++; return n; }
      case 'exists': return a.filter((k) => vivo(k)).length;
      case 'keys': return [...db.keys()].filter((k) => patron(a[0]).test(k));
      case 'scan': { const i = a.findIndex((x) => x.toLowerCase() === 'match'); const re = i >= 0 ? patron(a[i + 1]) : /.*/; return ['0', [...db.keys()].filter((k) => re.test(k))]; }
      case 'eval': {
        const [script, n, ...resto] = a;
        const keys = resto.slice(0, Number(n)), args = resto.slice(Number(n));
        if (script === SCRIPTS.CONTAR_VENTANA) {
          const n = run(['incr', keys[0]]);
          if (n === 1) run(['pexpire', keys[0], args[0]]);
          return n;
        }
        if (script === SCRIPTS.TOMAR_PLAZA) {
          if (!run(['exists', keys[0]])) run(['set', keys[1], args[2], 'PX', args[1]]);
          const n = run(['incr', keys[0]]);
          if (n > Number(args[0]) && args[3] === 'activo') { db.get(keys[0]).v = String(n - 1); return [n, '']; }
          run(['pexpire', keys[0], args[1]]);
          run(['pexpire', keys[1], args[1]]);
          return [n, run(['get', keys[1]])];
        }
        if (script === SCRIPTS.DEJAR_PLAZA) {
          if (run(['get', keys[1]]) !== args[0] || !run(['exists', keys[0]])) return 0;
          const n = Number(run(['get', keys[0]])) - 1;
          db.get(keys[0]).v = String(n);
          if (n <= 0) run(['del', ...keys]);
          return n;
        }
        if (script === SCRIPTS.soltar) return vivo(keys[0])?.v === args[0] ? run(['del', keys[0]]) : 0;
        if (script === TX_INDICES) {
          const quitar = (K, id) => {
            const v = run(['hget', K.ixf, id]);
            if (v === null) return;
            const o = JSON.parse(v);
            if (o.zs) for (const [z, m] of o.zs) run(['zrem', K.z[z], m]);
            else if (o.o !== undefined) {
              const om = `${String(Math.round(o.o)).padStart(16, '0')}\0${id}`;
              for (const k of Object.values(K.z)) run(['zrem', k, om]);
              for (const c of o.cl || []) run(['zrem', K.z.n, c]);
            }
            for (const [c, n] of Object.entries(o.ag || {})) run(['hincrby', K.ixa, c, String(-n)]);
          };
          const poner = (K, id, fj, texto) => {
            const f = JSON.parse(fj);
            for (const [z, m] of f.zs) run(['zadd', K.z[z], '0', m]);
            for (const [c, n] of Object.entries(f.ag)) run(['hincrby', K.ixa, c, String(n)]);
            run(['hset', K.ixf, id, fj]);
            if (typeof texto === 'string') run(['hset', K.ixt, id, texto]);
          };
          return JSON.parse(args[0]).map((op) => {
            const [c] = op;
            const rev = (K) => run(['hincrby', K.ixa, 'rev', '1']);
            if (c === '_g') { rev(op[6]); quitar(op[6], op[2]); const x = run(['hset', op[1], op[2], op[3]]); poner(op[6], op[2], op[4], op[5]); return x; }
            if (c === '_b') { rev(op[3]); quitar(op[3], op[2]); run(['hdel', op[3].ixf, op[2]]); run(['hdel', op[3].ixt, op[2]]); return run(['hdel', op[1], op[2]]); }
            if (c === '_i') { const a = run(['hget', op[1], op[2]]); if ((a === null && op[3] === '') || a === op[3]) { rev(op[6]); quitar(op[6], op[2]); poner(op[6], op[2], op[4], op[5]); return 1; } return 0; }
            if (c === '_d') { if (!run(['hexists', op[1], op[2]])) { rev(op[3]); quitar(op[3], op[2]); run(['hdel', op[3].ixf, op[2]]); run(['hdel', op[3].ixt, op[2]]); for (const [z, m] of op[4] || []) run(['zrem', op[3].z[z], m]); return 1; } return 0; }
            return run(op.map(String));
          });
        }
        if (script === CERRAR_TRABAJO) {
          const t = run(['hget', keys[0], args[0]]);
          if (t === null || JSON.parse(t).v !== args[1]) return 0;
          if (args[3] === 'borrar') run(['hdel', keys[0], args[0]]); else run(['hset', keys[0], args[0], args[4]]);
          if (args[5] === '') run(['zrem', keys[1], args[2]]); else run(['zadd', keys[1], args[5], args[2]]);
          return 1;
        }
        throw new Error('script no simulado');
      }
      case 'ping': return 'PONG';
      case 'flushdb': case 'flushall': db.clear(); exp.clear(); return 'OK';
      default: throw new Error(`comando no simulado: ${c}`);
    }
  }
  return { db, run };
}

// fallos: { exec: n } hace fallar las n próximas transacciones (para simular cortes a mitad).
// ganchos.antes(cuerpo, ruta): si está puesto, se espera antes de atender cada petición (para pausar una escritura concreta
// y meter otra operación en medio, de forma determinista).
export function arrancar({ puerto = 0, base = crearBase() } = {}) {
  const fallos = { exec: 0 };
  const ganchos = { antes: null };
  const b64 = (v) => (typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v);
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; }); req.on('end', async () => {
      if (ganchos.antes) await ganchos.antes(body, req.url);
      const enc = req.headers['upstash-encoding'] === 'base64';
      const uno = (cmd) => { try { const r = base.run(cmd); return { result: enc ? b64(r) : r }; } catch (e) { return { error: e.message }; } };
      const j = JSON.parse(body || 'null');
      let out;
      // Un corte simulado afecta a las transacciones: MULTI/EXEC y la transacción con índices (lib/scripts.js TX_INDICES).
      const esEvalTx = (c) => Array.isArray(c) && String(c[0]).toLowerCase() === 'eval' && c[1] === TX_INDICES;
      const esTx = /^\/multi-exec/.test(req.url) || esEvalTx(j) || (/^\/pipeline/.test(req.url) && Array.isArray(j) && j.some(esEvalTx));
      if (esTx && fallos.exec > 0) { fallos.exec--; res.writeHead(500); res.end(JSON.stringify({ error: 'corte simulado' })); return; }
      if (/^\/(pipeline|multi-exec)/.test(req.url)) out = j.map(uno); else out = uno(j);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    });
  });
  return new Promise((ok) => server.listen(puerto, '127.0.0.1', () => ok({
    url: `http://127.0.0.1:${server.address().port}`, base, fallos, ganchos,
    cerrar: () => new Promise((c) => { server.closeAllConnections?.(); server.close(() => c()); }),
  })));
}

// Como script: node tests/apoyo/upstash-mem.mjs 8079 (para levantar la app en local contra una base vacía).
if (import.meta.url === `file://${process.argv[1]}`) arrancar({ puerto: Number(process.argv[2]) || 8079 }).then((s) => console.log(`upstash-mem en ${s.url}`));
