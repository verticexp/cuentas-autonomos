import { redis } from './redis.js';
import { ipDe } from './limite.js';

// Registro de accesos de cada persona (Ajustes › Seguridad): las 30 últimas entradas a su cuenta, con la fecha, la IP, el
// dispositivo y cómo entró, para que vea si alguien ha entrado sin ella. accesos-usuario:<id>. Nunca bloquea la entrada.
const MAX = 30;

// «iPhone · Safari», «Mac · Chrome», «iPhone · app de Fisquo»… a partir del User-Agent.
export function describirDispositivo(ua = '') {
  const s = String(ua || '');
  const sistema = /iPhone/.test(s) ? 'iPhone' : /iPad/.test(s) ? 'iPad' : /Android/.test(s) ? 'Android' : /Macintosh|Mac OS X/.test(s) ? 'Mac'
    : /Windows/.test(s) ? 'Windows' : /CrOS/.test(s) ? 'Chromebook' : /Linux/.test(s) ? 'Linux' : '';
  const nav = /(^|\s)FisquoApp\/\d/.test(s) ? 'app de Fisquo' : /Edg(A|iOS)?\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera'
    : /Firefox\/|FxiOS/.test(s) ? 'Firefox' : /Chrome\/|CriOS/.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : '';
  return [sistema, nav].filter(Boolean).join(' · ') || 'Dispositivo desconocido';
}

export async function apuntarAcceso(id, req, metodo) {
  if (!redis || !id) return;
  try {
    const k = `accesos-usuario:${id}`;
    await redis.lpush(k, { fecha: new Date().toISOString(), ip: ipDe(req), dispositivo: describirDispositivo(req.headers.get('user-agent')), metodo });
    await redis.ltrim(k, 0, MAX - 1);
  } catch (e) {
    console.warn('[accesos]', e.message);
  }
}

export const accesosDe = async (id, n = MAX) => (redis ? (await redis.lrange(`accesos-usuario:${id}`, 0, n - 1)) || [] : []);
