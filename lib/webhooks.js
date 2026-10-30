import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';
import { redis, clave, mismoId } from './redis.js';
import { conCerrojo } from './cerrojo.js';
import { Definitivo, opsEncolar } from './trabajos.js';
import { ErrorApiPublica } from './apiPublica.js';
import { puede } from './permisos.js';
import { membresias } from './membresias.js';

export const EVENTOS = Object.freeze(['factura.creada', 'factura.cobrada', 'gasto.creado']);

export function ipPrivada(ip) {
  const familia = isIP(ip);
  if (familia === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113);
  }
  if (familia !== 6) return true;
  // URL normaliza las IPv6, incluidas las IPv4 mapeadas, sin depender de su escritura original.
  const normal = new URL(`https://[${ip}]/`).hostname.slice(1, -1).toLowerCase();
  const [izq, der] = normal.split('::');
  const l = izq ? izq.split(':') : [], r = der ? der.split(':') : [];
  const palabras = (der !== undefined ? [...l, ...Array(8 - l.length - r.length).fill('0'), ...r] : l).map((x) => parseInt(x, 16));
  if (palabras.slice(0, 5).every((x) => x === 0) && palabras[5] === 0xffff) {
    return ipPrivada(`${palabras[6] >> 8}.${palabras[6] & 255}.${palabras[7] >> 8}.${palabras[7] & 255}`);
  }
  // Solo unicast global 2000::/3. Excluye túneles, documentación y bloques especiales.
  return (palabras[0] & 0xe000) !== 0x2000 || palabras[0] === 0x2002
    || (palabras[0] === 0x2001 && (palabras[1] < 0x200 || palabras[1] === 0xdb8))
    || (palabras[0] === 0x3fff && palabras[1] < 0x1000);
}

export function validarUrl(valor) {
  if (typeof valor !== 'string' || valor.length > 2048 || /[\s\\]/.test(valor)) throw new ErrorApiPublica('Pon una URL HTTPS pública válida');
  let url;
  try { url = new URL(valor); } catch { throw new ErrorApiPublica('Pon una URL HTTPS pública válida'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.+$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash
    || !host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'local'
    || host.endsWith('.internal') || host === 'internal' || (isIP(host) && ipPrivada(host))
    || (!isIP(host) && !host.includes('.'))) throw new ErrorApiPublica('Usa una URL HTTPS pública, sin credenciales ni puertos distintos de 443');
  return url;
}

export const firmar = (secreto, cuerpo, t) => `t=${t},v1=${createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')}`;
export function verificarFirma(secreto, cuerpo, cabecera, { tolerancia = 300 } = {}) {
  if (typeof cabecera !== 'string' || !Number.isFinite(tolerancia) || tolerancia < 0) return false;
  const m = /^t=(\d{1,12}),v1=([a-f0-9]{64})$/.exec(cabecera);
  if (!m || Math.abs(Date.now() / 1000 - Number(m[1])) > tolerancia) return false;
  const esperado = firmar(secreto, cuerpo, m[1]).split('v1=')[1];
  return timingSafeEqual(Buffer.from(esperado, 'hex'), Buffer.from(m[2], 'hex'));
}

const publico = ({ id, uid, creador, url, eventos, creado, activo }) => ({ id, uid, creador, url, eventos, creado, activo });
export const webhooksDe = async (u) => Object.values((await redis.hgetall(clave(u, 'webhooks'))) || {}).map(publico);
export async function crearWebhook(u, { url, eventos } = {}) {
  const destino = validarUrl(url).href;
  if (!Array.isArray(eventos) || !eventos.length || eventos.length > 3 || eventos.some((e) => !EVENTOS.includes(e))) throw new ErrorApiPublica('Elige eventos válidos');
  // Los destinos reciben datos financieros. «Empresa» por sí solo no concede acceso a esos datos.
  if (eventos.some((e) => !puede(u, e === 'gasto.creado' ? ['gastos', 'nominas'] : 'facturas'))) throw new ErrorApiPublica('Necesitas permiso para ver los datos de estos eventos, incluidas las nóminas en gastos', 403);
  return conCerrojo(`webhooks:${u.empresa}`, async ({ quedaMs }) => {
    if (await redis.hlen(clave(u, 'webhooks')) >= 5) throw new ErrorApiPublica('Puedes tener hasta 5 webhooks por empresa');
    const w = { id: randomUUID(), uid: String(u.id), creador: String(u.nombre || '').slice(0, 80), url: destino, eventos: [...new Set(eventos)], secreto: `whsec_${randomBytes(32).toString('base64url')}`, creado: new Date().toISOString(), activo: true };
    if (quedaMs() <= 0) throw new ErrorApiPublica('Inténtalo de nuevo', 409);
    await redis.hset(clave(u, 'webhooks'), { [w.id]: w });
    return w;
  });
}
export async function revocarWebhook(u, id) {
  return Boolean(await redis.hdel(clave(u, 'webhooks'), id));
}

// Cada invocación crea un evento. Quien necesite reencolar el mismo evento debe conservar su id y creado.
export async function emitirEvento(u, tipo, datos, { id = randomUUID(), creado = new Date().toISOString() } = {}) {
  if (!EVENTOS.includes(tipo) || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new ErrorApiPublica('Evento no válido');
  const evento = JSON.parse(JSON.stringify({ id, tipo, creado, datos }));
  const lista = Object.values((await redis.hgetall(clave(u, 'webhooks'))) || {}).filter((w) => w.activo && w.eventos.includes(tipo));
  if (lista.length) {
    const tx = redis.multi();
    for (const w of lista) opsEncolar(tx, u.empresa, { id: `webhook:${id}:${w.id}`, tipo: 'webhook', datos: { webhook: w.id, evento } });
    await tx.exec();
  }
  return evento;
}

// Fija a la conexión la resolución ya validada: no hay una segunda consulta DNS vulnerable a rebinding.
export async function resolverDestino(url, resolver = lookup) {
  const host = validarUrl(url).hostname.replace(/^\[|\]$/g, '');
  const direcciones = await resolver(host, { all: true });
  if (!direcciones.length || direcciones.some((d) => ipPrivada(d.address))) throw new Definitivo('Destino del webhook no permitido');
  return direcciones;
}
// POST por HTTPS con las direcciones ya validadas fijadas a la conexión: no hay una segunda consulta DNS (rebinding) y se
// mantiene la validación TLS del nombre. No sigue redirecciones. Devuelve { ok, status }.
export function postHttps(url, { body, headers, signal, direcciones }) {
  return new Promise((resolver, rechazar) => {
    const req = request(url, {
      method: 'POST', signal, headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      lookup: (_host, opciones, cb) => {
        const elegidas = opciones?.family ? direcciones.filter((d) => d.family === opciones.family) : direcciones;
        if (!elegidas.length) return cb(new Error('Familia de red no disponible'));
        if (opciones?.all) cb(null, elegidas); else cb(null, elegidas[0].address, elegidas[0].family);
      },
    }, (res) => { res.resume(); resolver({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }); });
    req.on('error', rechazar);
    req.end(body);
  });
}

// La entrega depende de la pertenencia y los permisos actuales del creador. Los destinos antiguos siguen funcionando.
async function creadorPuede(empresa, w, tipo) {
  if (!w.uid) return true;
  const p = await redis.hget('usuarios', w.uid);
  if (!p || p.baja) return false;
  const m = p.empresas && Object.keys(p.empresas).length ? membresias(p)[empresa] : mismoId(p.empresa, empresa) ? p : null;
  return Boolean(m) && puede({ rol: m.rol || 'miembro', permisos: m.permisos || [], pv: m.pv }, tipo === 'gasto.creado' ? ['gastos', 'nominas'] : 'facturas');
}

export async function entregarWebhook({ empresa, webhook, evento }, { resolver = lookup, enviar = postHttps } = {}) {
  const w = await redis.hget(`webhooks:${empresa}`, webhook);
  if (!w?.activo || !w.eventos.includes(evento.tipo)) return { omitido: true };
  const emp = await redis.hget('empresas', empresa);
  if (!emp || emp.baja || !(await creadorPuede(empresa, w, evento.tipo))) return { omitido: true };
  const signal = AbortSignal.timeout(5000);
  let alAbortar;
  const cancelado = new Promise((_, reject) => {
    alAbortar = () => reject(new Error('Tiempo de entrega agotado'));
    signal.addEventListener('abort', alAbortar, { once: true });
  });
  try {
    try { validarUrl(w.url); } catch { throw new Definitivo('Destino del webhook no permitido'); }
    const direcciones = await Promise.race([resolverDestino(w.url, resolver), cancelado]);
    const cuerpo = JSON.stringify(evento), t = Math.floor(Date.now() / 1000);
    const r = await Promise.race([enviar(w.url, { method: 'POST', body: cuerpo, headers: { 'Content-Type': 'application/json', 'Fisquo-Firma': firmar(w.secreto, cuerpo, t) }, redirect: 'manual', signal, direcciones }), cancelado]);
    await r.body?.cancel?.();
    if (r.ok) return { entregado: true };
    if (r.status >= 400 && r.status < 500 && ![408, 429].includes(r.status)) throw new Definitivo(`Webhook rechazado: HTTP ${r.status}`);
    throw new Error(`Webhook no entregado: HTTP ${r.status}`);
  } finally {
    signal.removeEventListener('abort', alAbortar);
  }
}
