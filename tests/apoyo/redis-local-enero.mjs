// Transporte en proceso para el ensayo de consumo. Ejecuta los comandos en el simulador
// existente sin abrir puertos ni necesitar el SDK. NO mide latencia ni facturación del proveedor.
// Solo se instala en el proceso de enero mediante el cargador de pruebas.
import { crearBase } from './upstash-mem.mjs';

export const base = crearBase();
let registro = null;
const ejecutar = (cmd) => { registro?.push(cmd); return base.run(cmd); };

// Cuando el SDK esté instalado se usa su serialización real y se intercepta solo
// fetch. Se desagrupa cada pipeline: una llamada HTTP no equivale a un comando.
export function instalarFetchLocal() {
  const original = globalThis.fetch;
  const b64 = (v) => typeof v === 'string' ? Buffer.from(v).toString('base64') : Array.isArray(v) ? v.map(b64) : v;
  globalThis.fetch = async (url, opciones) => {
    const destino = new URL(typeof url === 'string' ? url : url.url || url.href);
    if (destino.hostname !== 'redis-enero.invalid') throw new Error('El ensayo de enero no permite red externa');
    const headers = new Headers(opciones?.headers);
    const enc = headers.get('upstash-encoding') === 'base64';
    const uno = (cmd) => {
      try { const r = ejecutar(cmd); return { result: enc ? b64(r) : r }; }
      catch (e) { return { error: e.message }; }
    };
    const cuerpo = JSON.parse(opciones.body);
    return new Response(JSON.stringify(Array.isArray(cuerpo[0]) ? cuerpo.map(uno) : uno(cuerpo)), { headers: { 'Content-Type': 'application/json' } });
  };
  return () => { globalThis.fetch = original; };
}
export async function medir(fn) {
  const comandos = [];
  if (registro) throw new Error('Las mediciones deben ser secuenciales');
  registro = comandos;
  try { return { datos: await fn(), comandos, n: comandos.length }; }
  finally { registro = null; }
}
const ser = (x) => typeof x === 'string' ? x : JSON.stringify(x);
const parse = (x) => { try { return JSON.parse(x); } catch { return x; } };

export class Redis {
  constructor({ automaticDeserialization = true } = {}) { this.auto = automaticDeserialization; }
  async ejecutar(cmd) {
    return ejecutar(cmd);
  }
  valor(x) { return this.auto && typeof x === 'string' ? parse(x) : x; }
  async get(k) { return this.valor(await this.ejecutar(['get', k])); }
  async hget(k, id) { return this.valor(await this.ejecutar(['hget', k, String(id)])); }
  async hgetall(k) {
    const xs = await this.ejecutar(['hgetall', k]);
    return Object.fromEntries(Array.from({ length: xs.length / 2 }, (_, i) => [xs[i * 2], this.valor(xs[i * 2 + 1])]));
  }
  async hmget(k, ...ids) {
    const xs = await this.ejecutar(['hmget', k, ...ids.map(String)]);
    return Object.fromEntries(ids.map((id, i) => [id, this.valor(xs[i])]));
  }
  hset(k, o) { return this.ejecutar(['hset', k, ...Object.entries(o).flatMap(([id, d]) => [id, ser(d)])]); }
  hdel(k, ...ids) { return this.ejecutar(['hdel', k, ...ids.map(String)]); }
  hlen(k) { return this.ejecutar(['hlen', k]); }
  zcard(k) { return this.ejecutar(['zcard', k]); }
  del(...ks) { return this.ejecutar(['del', ...ks]); }
  set(k, v, o = {}) { return this.ejecutar(['set', k, ser(v), ...(o.nx ? ['NX'] : []), ...(o.ex ? ['EX', String(o.ex)] : []), ...(o.px ? ['PX', String(o.px)] : [])]); }
  async eval(script, keys, args) {
    const r = await this.ejecutar(['eval', script, String(keys.length), ...keys, ...args.map(String)]);
    return Array.isArray(r) ? r.map((x) => this.valor(x)) : this.valor(r);
  }
  zrange(k, desde, hasta, o = {}) {
    return this.ejecutar(['zrange', k, String(desde), String(hasta), ...(o.byLex ? ['BYLEX'] : []), ...(o.rev ? ['REV'] : []), ...(o.count !== undefined ? ['LIMIT', String(o.offset || 0), String(o.count)] : [])]);
  }
}
