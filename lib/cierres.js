// Trimestres revisados y cerrados por la gestoría (Mi despacho, app/despacho). Al cerrarlo se guarda una huella de sus
// facturas y gastos (id, base y total de cada uno, del índice: sin leer los documentos). Mientras está cerrado, nadie crea,
// cambia ni borra una factura o un gasto con fecha en él (los cobros y pagos sí, y añadir justificantes). Lo que entre por
// otro camino (importar, bandeja…) no se pierde: cambia la huella y el despacho lo ve como «cambios después del cierre».
// cierres:<empresa>: 'AAAA-T' → { fecha, por: { id, nombre }, despacho, despachoId, huella, facturas, gastos }.
import { createHash } from 'node:crypto';
import { mismoId, redis } from './redis.js';
import { fichasRango } from './indices.js';
import { fechaCorta, hoy } from './formato.js';

const empresa = (u) => u.empresa || u.id;
const FIN = ['03-31', '06-30', '09-30', '12-31'];
const INICIO = ['01-01', '04-01', '07-01', '10-01'];
export const claveTrimestre = (anio, t) => `${anio}-${t}`;
export const rangoTrimestre = (anio, t) => [`${anio}-${INICIO[t - 1]}`, `${anio}-${FIN[t - 1]}`];
export const trimestreDe = (fecha) => (/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? { anio: Number(fecha.slice(0, 4)), t: Math.ceil(Number(fecha.slice(5, 7)) / 3) } : null);
export const periodoValido = (anio, t) => Number.isInteger(anio) && anio >= 2000 && anio <= 2100 && [1, 2, 3, 4].includes(t);

// Todos los lectores reciben solo los cierres que aún pueden bloquear, también los de importaciones y cuotas.
export async function cierresVigentes(u) {
  if (!redis) return {};
  const cierres = (await redis.hgetall(`cierres:${empresa(u)}`)) || {};
  const e = Object.values(cierres).some((c) => c.despachoId) ? await redis.hget('empresas', empresa(u)) : null;
  return Object.fromEntries(Object.entries(cierres).filter(([, c]) => !c.despachoId || (mismoId(e?.despachoCliente?.id, c.despachoId) && !e.despachoCliente.pendiente)));
}
export const cierresDe = cierresVigentes;

// Huella de un trimestre: cambia si se añade, quita o cambia el importe o la fecha de una factura o un gasto.
export async function huellaTrimestre(u, anio, t) {
  const [desde, hasta] = rangoTrimestre(anio, t);
  const [f, g] = await Promise.all([fichasRango(u, 'facturas', desde, hasta), fichasRango(u, 'gastos', desde, hasta)]);
  const lineas = (l, tipo) => l.map((x) => `${tipo}|${x.id}|${x.f}|${x.b}|${x.t}`).sort();
  const huella = createHash('sha256').update([...lineas(f, 'f'), ...lineas(g, 'g')].join('\n')).digest('hex').slice(0, 24);
  return { huella, facturas: f.length, gastos: g.length };
}

// Estado del cierre de un trimestre: null (abierto) o { ...cierre, cambios } (cambios: la huella ya no coincide).
export async function estadoCierre(u, anio, t, cierres) {
  const c = (cierres || (await cierresDe(u)))[claveTrimestre(anio, t)];
  if (!c) return null;
  const ahora = await huellaTrimestre(u, anio, t);
  return { ...c, cambios: ahora.huella !== c.huella, ahora };
}

export async function cerrarTrimestre(u, anio, t, quien, dia = hoy()) {
  if (!periodoValido(anio, t)) return { error: 'Trimestre no válido' };
  if (!dia || rangoTrimestre(anio, t)[1] >= dia) return { error: 'El trimestre aún no ha terminado' };
  const h = await huellaTrimestre(u, anio, t);
  const c = { fecha: new Date().toISOString(), por: { id: quien.id, nombre: String(quien.nombre || '').slice(0, 60) }, despacho: quien.despachoNombre || '', despachoId: quien.despacho || '', ...h };
  await redis.hset(`cierres:${empresa(u)}`, { [claveTrimestre(anio, t)]: c });
  return { cierre: c };
}

export async function reabrirTrimestre(u, anio, t) {
  if (!periodoValido(anio, t)) return { error: 'Trimestre no válido' };
  await redis.hdel(`cierres:${empresa(u)}`, claveTrimestre(anio, t));
  return { ok: true };
}

// Mensaje de error si alguna de las fechas cae en un trimestre cerrado; null si se puede. Las fechas vacías no cuentan.
export function fechaEnCierre(cierres, ...fechas) {
  for (const fecha of fechas) {
    const p = trimestreDe(fecha);
    const c = p && cierres?.[claveTrimestre(p.anio, p.t)];
    if (c) return `El ${p.t}T ${p.anio} está cerrado: ${c.despacho || c.por?.nombre || 'tu gestoría'} lo revisó el ${fechaCorta(String(c.fecha).slice(0, 10))}. Para cambiarlo, pide que lo reabran.`;
  }
  return null;
}
export async function comprobarCierre(u, ...fechas) {
  if (!fechas.some(Boolean)) return null;
  return fechaEnCierre(await cierresDe(u), ...fechas);
}
