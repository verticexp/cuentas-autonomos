// Simulador en memoria de la API REST de Upstash, solo para pruebas (nunca una base de datos real).
// Cada petición se atiende por HTTP, así que las carreras entre «leer» y «guardar» de la app se reproducen igual que
// contra Upstash. MULTI/EXEC se aplica de golpe (Node atiende una petición cada vez): es atómico, como en Redis.
// Uso: const s = await arrancar(); process.env.KV_REST_API_URL = s.url; … await s.cerrar();
import http from 'node:http';

// Scripts Lua que usa la app (lib/cerrojo.js): se reconocen por su texto y se ejecutan en JavaScript.
export const SCRIPTS = {
  soltar: "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
};

export function crearBase() {
  const db = new Map(); const exp = new Map();
  const vivo = (k) => { const t = exp.get(k); if (t && Date.now() > t) { db.delete(k); exp.delete(k); } return db.get(k); };
  const H = (k) => { let v = vivo(k); if (!v) db.set(k, v = { t: 'h', m: new Map() }); return v.m; };
  const S = (k) => { let v = vivo(k); if (!v) db.set(k, v = { t: 's', m: new Set() }); return v.m; };
  const L = (k) => { let v = vivo(k); if (!v) db.set(k, v = { t: 'l', m: [] }); return v; };
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
      case 'type': return ({ h: 'hash', s: 'set', l: 'list', k: 'string' })[vivo(a[0])?.t] || 'none';
      case 'sadd': { const m = S(a[0]); let n = 0; for (const x of a.slice(1)) if (!m.has(x)) { m.add(x); n++; } return n; }
      case 'srem': { const v = vivo(a[0]); let n = 0; for (const x of a.slice(1)) if (v?.m.delete(x)) n++; return n; }
      case 'smembers': return [...(vivo(a[0])?.m || [])];
      case 'sismember': return vivo(a[0])?.m.has(a[1]) ? 1 : 0;
      case 'lpush': { const l = L(a[0]); l.m.unshift(...a.slice(1).reverse()); return l.m.length; }
      case 'rpush': { const l = L(a[0]); l.m.push(...a.slice(1)); return l.m.length; }
      case 'lrange': { const m = vivo(a[0])?.m || []; return m.slice(idx(Number(a[1]), m.length), idx(Number(a[2]), m.length) + 1); }
      case 'ltrim': { const l = vivo(a[0]); if (l) l.m = l.m.slice(idx(Number(a[1]), l.m.length), idx(Number(a[2]), l.m.length) + 1); return 'OK'; }
      case 'llen': return vivo(a[0])?.m.length || 0;
      case 'del': { let n = 0; for (const k of a) if (db.delete(k)) n++; return n; }
      case 'exists': return a.filter((k) => vivo(k)).length;
      case 'keys': return [...db.keys()].filter((k) => patron(a[0]).test(k));
      case 'scan': { const i = a.findIndex((x) => x.toLowerCase() === 'match'); const re = i >= 0 ? patron(a[i + 1]) : /.*/; return ['0', [...db.keys()].filter((k) => re.test(k))]; }
      case 'eval': {
        const [script, n, ...resto] = a;
        const keys = resto.slice(0, Number(n)), args = resto.slice(Number(n));
        if (script === SCRIPTS.soltar) return vivo(keys[0])?.v === args[0] ? run(['del', keys[0]]) : 0;
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
      if (/^\/multi-exec/.test(req.url) && fallos.exec > 0) { fallos.exec--; res.writeHead(500); res.end(JSON.stringify({ error: 'corte simulado' })); return; }
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
