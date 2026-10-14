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
import { CERRAR_TRABAJO } from './scripts.js';
import { metrica } from './metricas.js';

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
  // cuando: también en el trabajo (revisión S05), para volver a programarlo si la cola se pierde (restaurar una copia).
  const t = { id, tipo, datos, estado: 'pendiente', intentos: 0, v: randomUUID().slice(0, 8), creado: new Date().toISOString(), cuando };
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
    // Revisión S02: el cierre (con éxito o con error) compara la versión en la misma operación atómica que borra o
    // reprograma. Si mientras tanto se encoló otra versión, no se toca: sigue guardada y programada.
    const cerrar = (accion, nuevo, score) => redis.eval(CERRAR_TRABAJO, [clave(emp), COLA], [id, t.v, miembro, accion, nuevo ? JSON.stringify(nuevo) : '', score === undefined ? '' : String(score)]);
    if (!error) await cerrar('borrar');
    else {
      const intentos = (t.intentos || 0) + 1;
      if (definitivo || intentos >= MAX_INTENTOS) {
        await cerrar('guardar', { ...t, estado: 'error', intentos, error: error.slice(0, 300), ultimo: new Date().toISOString() });
        metrica('trabajo-fallido', { empresa: emp, tipo: t.tipo, intentos });
      } else {
        const cuando = Math.round(Date.now() + espera(intentos));
        await cerrar('guardar', { ...t, intentos, cuando, error: error.slice(0, 300), ultimo: new Date().toISOString() }, cuando);
      }
    }
    return error ? 'error' : { tipo: t.tipo, ...resultado };
  } finally {
    await redis.eval(SOLTAR, [uso], [yo]).catch(() => {});
  }
}

// Los de una empresa que ya tocan (su hash es pequeño: solo lo pendiente y los errores). Un pendiente sin entrada en la
// cola (revisión S05: datos restaurados) se vuelve a programar para su fecha, sin adelantar ni duplicar nada.
async function deEmpresa(emp) {
  const pendientes = Object.values((await redis.hgetall(clave(emp))) || {}).filter((t) => t.estado === 'pendiente');
  const ids = pendientes.map((t) => `${emp}${SEP}${t.id}`);
  const due = await Promise.all(ids.map((m) => redis.zscore(COLA, m)));
  const huerfanos = pendientes.filter((t, i) => due[i] === null);
  for (const t of huerfanos) await redis.zadd(COLA, { nx: true }, { score: Number(t.cuando) || Date.now(), member: `${emp}${SEP}${t.id}` });
  return ids.filter((m, i) => (due[i] === null ? Number(pendientes[i].cuando) || 0 : Number(due[i])) <= Date.now());
}

// Restaurar una copia (revisión S05): la cola no va en la copia; se reconstruye con los trabajos pendientes de lo
// restaurado, cada uno para su fecha y con sus intentos. Los fallidos siguen en su bandeja, sin programar.
// r: cliente sin prefijo (el de lib/copias.js). trabajos: { id → JSON } del hash cuentas:trabajos:<emp>.
export async function reprogramarRestaurados(r, emp, trabajos) {
  for (const crudo of Object.values(trabajos || {})) {
    let t;
    try { t = typeof crudo === 'string' ? JSON.parse(crudo) : crudo; } catch { continue; }
    if (t?.estado !== 'pendiente' || !t.id) continue;
    await r.zadd(`cuentas:${COLA}`, { score: Number(t.cuando) || Date.now(), member: `${emp}${SEP}${t.id}` });
  }
}

// Procesa lo que ya toca hasta `hasta` (ms). empresa: solo los de esa empresa. concurrencia: cuántos a la vez.
// Devuelve { hechos, errores, quedan } (quedan: si hay más pendientes que ya tocan).
export async function procesar({ hasta = Date.now() + 20000, empresa, concurrencia = 4, tareas } = {}) {
  tareas ||= (await import('./trabajosTareas.js')).TAREAS;
  const cuenta = { hechos: 0, errores: 0, ocupados: 0, quedan: false, resultados: [] };
  const vistos = new Set();
  // Revisión S03: si la ventana del principio ya está vista (trabajos ocupados por otra instancia), se avanza por la
  // cola en vez de darla por vacía; así unos pocos ocupados no tapan a los libres de detrás ni a otras empresas.
  let desde = 0;
  while (Date.now() < hasta - 2000) {
    const ventana = empresa ? await deEmpresa(empresa) : (await redis.zrange(COLA, '-inf', Date.now(), { byScore: true, offset: desde, count: concurrencia * 4 })).map(String);
    if (!ventana.length) break;
    const lista = ventana.filter((m) => !vistos.has(m)).slice(0, concurrencia);
    if (!lista.length) { if (empresa) break; desde += ventana.length; continue; }
    lista.forEach((m) => vistos.add(m));
    const r = await Promise.all(lista.map((m) => ejecutarUno(m, tareas, hasta).catch(() => 'error')));
    for (const x of r) {
      if (x === 'error') cuenta.errores++;
      else if (x === 'ocupado') cuenta.ocupados++;
      else if (typeof x === 'object') { cuenta.hechos++; if (cuenta.resultados.length < 2000) cuenta.resultados.push(x); }
    }
  }
  // Quedan: cualquier trabajo que ya toca, también los ocupados por otra instancia (no se declara vacía la cola).
  const quedan = empresa ? await deEmpresa(empresa) : await redis.zrange(COLA, '-inf', Date.now(), { byScore: true, offset: 0, count: 1 });
  cuenta.quedan = quedan.length > 0;
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
// Estado de la cola (E11): cuántos trabajos hay programados, cuántos ya tocan y cuánto lleva esperando el más antiguo.
export async function estadoCola() {
  const ahora = Date.now();
  const [total, primero] = await Promise.all([redis.zcard(COLA), redis.zrange(COLA, 0, 0, { withScores: true })]);
  const masAntiguo = primero?.length ? Number(primero[1]) : null;
  const vencidos = masAntiguo !== null && masAntiguo <= ahora ? (await redis.zrange(COLA, '-inf', ahora, { byScore: true })).length : 0;
  return { total, vencidos, esperaMaxMs: masAntiguo !== null ? Math.max(0, ahora - masAntiguo) : 0 };
}

export async function tanda(origen, n = 0, { hasta = Date.now() + 45000 } = {}) {
  const inicio = Date.now();
  const r = await procesar({ hasta, concurrencia: 6 });
  metrica('tanda-trabajos', { tanda: n, ms: Date.now() - inicio, hechos: r.hechos, errores: r.errores, ocupados: r.ocupados, quedan: r.quedan, ...(await estadoCola().catch(() => ({}))) });
  // Si todo lo que queda está ocupado por otra instancia, se espera un poco antes de pedir la siguiente tanda (no un
  // bucle inmediato de llamadas). Lo ocupado lo termina quien lo tiene; si se cae, su arrendamiento caduca (90 s).
  if (r.quedan && !r.hechos && !r.errores) await new Promise((ok) => setTimeout(ok, 15000));
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
