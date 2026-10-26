// Hitos de activación de cada empresa para el embudo del panel de administración (lib/embudo.js), con lecturas baratas:
//  - factura y gasto: el número de documentos del hash (HLEN) y, solo si hay, el primer miembro del índice por fechas
//    (lib/fichas.js: «orden\0id»). Nunca se leen los documentos.
//  - banco: las cuentas de la empresa (bancos:<empresa>, pocas): subida del extracto o conexión.
//  - modelo: sale de la propia empresa, que el panel ya tiene leída (marcas pres303, pagos130… y pagadosHacienda).
// Un hito alcanzado no se pierde, así que se guarda en el hash «embudo» (empresa → { factura, gasto, banco, v }) y solo se
// vuelve a mirar lo que falta en las empresas con actividad desde la última vez (ultima-actividad, lib/actividad.js).
// Con el panel abierto todos los días, el gasto en Upstash es de unos pocos comandos por empresa activa, no por empresa.
import { redis } from './redis.js';
import { claves, ordenDeMiembro } from './fichas.js';
import { calcularEmbudo, modeloPresentado } from './embudo.js';

const GUARDADOS = ['factura', 'gasto', 'banco'];
const LOTE = 40;

// El día de la factura o gasto más antiguo (por su fecha), o undefined si no hay ninguno. '' si hay pero el índice aún no lo
// tiene (empresas de antes de los índices): cuenta como alcanzado, sin día.
async function primerDia(col, id) {
  if (!(await redis.hlen(`${col}:${id}`))) return undefined;
  const [primero] = (await redis.zrange(claves(col, id).ix, 0, 0)) || [];
  const n = primero ? String(Math.floor(ordenDeMiembro(primero) / 1e6)) : '';
  return /^\d{8}$/.test(n) ? `${n.slice(0, 4)}-${n.slice(4, 6)}-${n.slice(6)}` : '';
}

// El día en que se conectó o se subió el primer extracto de alguna cuenta (el de la última subida, si no hay otro).
async function primerDiaBanco(id) {
  const cuentas = Object.values((await redis.hgetall(`bancos:${id}`)) || {});
  if (!cuentas.length) return undefined;
  return cuentas.map((c) => String(c?.conectada || c?.subido || '').slice(0, 10)).filter(Boolean).sort()[0] || '';
}

// filas: las del panel (lib/admin.js). empresas: { id → empresa } tal como está en Redis. ultima: { id → último día de actividad }.
// Devuelve { id → { factura, gasto, banco, modelo } } de las empresas que se registraron ellas mismas.
export async function hitosDe({ filas, empresas, ultima = {}, hoy = new Date() }) {
  const dia = hoy.toISOString().slice(0, 10);
  const guardados = (await redis.hgetall('embudo')) || {};
  const propias = filas.filter((f) => f.registrada && !f.regalo);
  const hitos = {}, cambios = {};
  const mirar = [];
  for (const f of propias) {
    const g = guardados[f.id];
    hitos[f.id] = Object.fromEntries(GUARDADOS.filter((k) => g?.[k] !== undefined).map((k) => [k, g[k]]));
    // Falta algún hito y la empresa se ha usado desde la última vez (o no se ha mirado nunca).
    if (GUARDADOS.some((k) => g?.[k] === undefined) && (!g || (ultima[f.id] || '') >= (g.v || ''))) mirar.push(f.id);
  }
  for (let i = 0; i < mirar.length; i += LOTE) {
    await Promise.all(mirar.slice(i, i + LOTE).map(async (id) => {
      const [factura, gasto, banco] = await Promise.all([
        hitos[id].factura === undefined ? primerDia('facturas', id) : hitos[id].factura,
        hitos[id].gasto === undefined ? primerDia('gastos', id) : hitos[id].gasto,
        hitos[id].banco === undefined ? primerDiaBanco(id) : hitos[id].banco,
      ]);
      hitos[id] = Object.fromEntries(Object.entries({ factura, gasto, banco }).filter(([, v]) => v !== undefined));
      cambios[id] = { ...hitos[id], v: dia };
    }));
  }
  if (Object.keys(cambios).length) await redis.hset('embudo', cambios).catch(() => {}); // es solo una caché
  for (const f of propias) {
    const m = modeloPresentado(empresas[f.id]);
    if (m.hecho) hitos[f.id].modelo = m.fecha;
  }
  return hitos;
}

// El embudo ya calculado, o null si no se ha podido (el panel sigue sin él).
export async function embudoDe({ filas, empresas, ultima, hoy = new Date() }) {
  try { return calcularEmbudo({ empresas: filas, hitos: await hitosDe({ filas, empresas, ultima, hoy }), hoy }); } catch (e) { console.warn('[embudo]', e.message); return null; }
}
