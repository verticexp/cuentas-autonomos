// Cola duradera de trabajos secundarios (informe de capacidad E03/E04). Lo que no hace falta para guardar una operación
// —subir a Drive, el neto a Controla'T, los recordatorios, las recurrentes, los avisos y los envíos de cada mañana— se
// apunta como trabajo pendiente y se responde sin esperarlo. Lo procesa después quien llegue: la propia petición tras
// responder (after), la siguiente visita de esa empresa o el cron, que se encadena en invocaciones cortas.
//
//   trabajos:<emp>     hash id → { id, tipo, datos, estado: 'pendiente'|'error', intentos, v, error }
//   cola-trabajos      conjunto ordenado «<emp>|<id>» → cuándo toca (ms). Solo los pendientes.
//   trabajo-uso:<…>    arrendamiento (SET NX PX): un trabajo lo procesa una sola instancia a la vez.
//
// El id es la clave idempotente: volver a encolar el mismo trabajo (otro cambio de la misma factura, el mismo mes) no lo
// duplica, lo actualiza; las tareas releen los datos al ejecutarse, así que siempre suben lo último.
import { randomUUID } from 'node:crypto';
import { after } from 'next/server.js';
import { redis } from './redis.js';
import { SOLTAR } from './cerrojo.js';

export const COLA = 'cola-trabajos';
const USO_MS = 90000;
const MAX_INTENTOS = 6;
const SEP = '|';
const clave = (emp) => `trabajos:${emp}`;
export const empresaDe = (u) => u.empresa || u.id;

// Error que no merece reintento (los datos están mal, el servicio lo ha rechazado): pasa a la bandeja de errores.
export class Definitivo extends Error {}

// Para una transacción que ya está en marcha (redis.multi()): el trabajo se guarda con la operación o no se guarda.
export function opsEncolar(tx, emp, { id, tipo, datos = {} }, { cuando = Date.now() } = {}) {
  const t = { id, tipo, datos, estado: 'pendiente', intentos: 0, v: randomUUID().slice(0, 8), creado: new Date().toISOString() };
  tx.hset(clave(emp), { [id]: t });
  tx.zadd(COLA, { score: cuando, member: `${emp}${SEP}${id}` });
  return tx;
}

export const encolar = (u, trabajo, op) => opsEncolar(redis.multi(), empresaDe(u), trabajo, op).exec();

// Trabajos de una empresa que no se pudieron hacer (para enseñarlos y reintentarlos a mano).
export async function fallidos(u) {
  return Object.values((await redis.hgetall(clave(empresaDe(u)))) || {}).filter((t) => t.estado === 'error');
}
export async function reintentar(u, id) {
  const t = await redis.hget(clave(empresaDe(u)), id);
  if (!t || t.estado !== 'error') return false;
  await opsEncolar(redis.multi(), empresaDe(u), t).exec();
  return true;
}

const espera = (intentos) => Math.min(6 * 3600e3, 60e3 * 2 ** intentos) * (0.8 + Math.random() * 0.4);

async function ejecutarUno(miembro, tareas, hasta) {
  const i = miembro.indexOf(SEP);
  const emp = miembro.slice(0, i), id = miembro.slice(i + 1);
  const uso = `trabajo-uso:${miembro}`, yo = randomUUID();
  if (!(await redis.set(uso, yo, { nx: true, px: USO_MS }))) return 'ocupado';
  try {
    const t = await redis.hget(clave(emp), id);
    if (!t || t.estado !== 'pendiente') { await redis.zrem(COLA, miembro); return 'nada'; }
    const fn = tareas[t.tipo];
    if (!fn) { await redis.zadd(COLA, { score: Date.now() + 3600e3, member: miembro }); return 'desconocido'; }
    let error = null, definitivo = false, resultado;
    try { resultado = await fn({ empresa: emp, ...t.datos }, { hasta: Math.min(hasta, Date.now() + USO_MS - 5000) }); } catch (e) { error = e.message || String(e); definitivo = e instanceof Definitivo; }
    // Si mientras tanto se volvió a encolar (otra versión), esa versión sigue en la cola y se hará después.
    const ahora = await redis.hget(clave(emp), id);
    if (ahora?.v !== t.v) return error ? 'error' : { tipo: t.tipo, ...resultado };
    const tx = redis.multi();
    if (!error) {
      tx.hdel(clave(emp), id);
      tx.zrem(COLA, miembro);
    } else {
      const intentos = (t.intentos || 0) + 1;
      if (definitivo || intentos >= MAX_INTENTOS) {
        tx.hset(clave(emp), { [id]: { ...t, estado: 'error', intentos, error: error.slice(0, 300), ultimo: new Date().toISOString() } });
        tx.zrem(COLA, miembro);
        console.error('[trabajos]', emp, id, error);
      } else {
        tx.hset(clave(emp), { [id]: { ...t, intentos, error: error.slice(0, 300), ultimo: new Date().toISOString() } });
        tx.zadd(COLA, { score: Date.now() + espera(intentos), member: miembro });
      }
    }
    await tx.exec();
    return error ? 'error' : { tipo: t.tipo, ...resultado };
  } finally {
    await redis.eval(SOLTAR, [uso], [yo]).catch(() => {});
  }
}

// Los de una empresa que ya tocan (su hash es pequeño: solo lo pendiente, los errores y los diarios del día).
async function deEmpresa(emp) {
  const ids = Object.values((await redis.hgetall(clave(emp))) || {}).filter((t) => t.estado === 'pendiente').map((t) => `${emp}${SEP}${t.id}`);
  const due = await Promise.all(ids.map((m) => redis.zscore(COLA, m)));
  return ids.filter((m, i) => due[i] !== null && Number(due[i]) <= Date.now());
}

// Procesa lo que ya toca hasta `hasta` (ms). empresa: solo los de esa empresa. concurrencia: cuántos a la vez.
// Devuelve { hechos, errores, quedan } (quedan: si hay más pendientes que ya tocan).
export async function procesar({ hasta = Date.now() + 20000, empresa, concurrencia = 4, tareas } = {}) {
  tareas ||= (await import('./trabajosTareas.js')).TAREAS;
  const cuenta = { hechos: 0, errores: 0, quedan: false, resultados: [] };
  const vistos = new Set();
  while (Date.now() < hasta - 2000) {
    let lista = empresa ? await deEmpresa(empresa) : (await redis.zrange(COLA, '-inf', Date.now(), { byScore: true, offset: 0, count: concurrencia * 4 })).map(String);
    lista = lista.filter((m) => !vistos.has(m));
    if (!lista.length) return cuenta;
    lista = lista.slice(0, concurrencia);
    lista.forEach((m) => vistos.add(m));
    const r = await Promise.all(lista.map((m) => ejecutarUno(m, tareas, hasta).catch(() => 'error')));
    for (const x of r) {
      if (x === 'error') cuenta.errores++;
      else if (typeof x === 'object') { cuenta.hechos++; if (cuenta.resultados.length < 2000) cuenta.resultados.push(x); }
    }
  }
  cuenta.quedan = (await redis.zrange(COLA, '-inf', Date.now(), { byScore: true, offset: 0, count: 1 })).length > 0;
  return cuenta;
}

// Después de responder: lo pendiente de esta empresa (como mucho ~20 s). Fuera de una petición (pruebas), al momento.
export function procesarLuego(u) {
  if (!redis) return;
  const tarea = () => procesar({ empresa: empresaDe(u), hasta: Date.now() + 20000 }).catch((e) => console.error('[trabajos]', e.message));
  try { after(tarea); } catch { tarea(); }
}

// Una tanda del procesado global (app/api/trabajos): ~45 s; si aún quedan trabajos que ya tocan, pide la siguiente
// (otra invocación, con su propio tiempo). Como mucho MAX_TANDAS seguidas: lo que quede, mañana o la siguiente visita.
const MAX_TANDAS = 60;
export async function tanda(origen, n = 0, { hasta = Date.now() + 45000 } = {}) {
  const r = await procesar({ hasta, concurrencia: 6 });
  if (r.quedan && n + 1 < MAX_TANDAS && process.env.CRON_SECRET) {
    // Al dominio propio (APP_URL o el de producción de Vercel): los *.vercel.app del proyecto piden SSO.
    const base = (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : origen)).replace(/\/$/, '');
    await fetch(`${base}/api/trabajos`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, 'x-tanda': String(n + 1) }, signal: AbortSignal.timeout(10000) })
      .catch((e) => console.error('[trabajos] no se pudo encadenar la tanda', e.message));
  }
  return r;
}

// Lo secundario de guardar facturas o gastos (informe E03): subirlos a Drive y el neto del mes a Controla'T. tx: la
// transacción de la propia operación (se guarda con ella); sin tx, una aparte justo después.
export function opsSecundarios(tx, u, { facturas = [], gastos = [], meses = [] } = {}) {
  const emp = empresaDe(u);
  if (u.drive?.url) {
    for (const id of facturas) opsEncolar(tx, emp, { id: `drive-factura:${id}`, tipo: 'drive-factura', datos: { factura: id } });
    for (const id of gastos) opsEncolar(tx, emp, { id: `drive-gasto:${id}`, tipo: 'drive-gasto', datos: { gasto: id } });
  }
  if (u.controlat && u.admin) {
    for (const mes of new Set(meses.filter(Boolean).map((m) => m.slice(0, 7)))) opsEncolar(tx, emp, { id: `controlat:${u.id}:${mes}`, tipo: 'controlat', datos: { usuario: u.id, mes } });
  }
  return tx;
}
export async function secundarios(u, que) {
  if (!redis) return;
  const tx = opsSecundarios(redis.multi(), u, que);
  await tx.exec().catch((e) => console.error('[trabajos] no se pudo encolar', e.message));
  procesarLuego(u);
}
