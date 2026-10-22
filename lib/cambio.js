// Tipo de cambio de referencia del BCE (el que el Banco de España publica como oficial, art. 79.Once de la Ley del IVA):
// cuántas unidades de la moneda vale 1 € el día dado o, si ese día no hubo (festivo, fin de semana), el último anterior.
// Se guarda por moneda y día: un tipo publicado no cambia.
import { redis } from './redis.js';
import { proveedorJSON } from './llamadas.js';
import { monedaValida } from './idiomas.js';

const URL_BCE = (m, fecha) => `${process.env.BCE_URL || 'https://data-api.ecb.europa.eu/service/data/EXR'}/D.${m}.EUR.SP00.A?endPeriod=${fecha}&lastNObservations=1&format=jsondata`;

// { moneda, cambio, fecha (la del tipo publicado), fuente: 'BCE' } o { error }.
export async function cambioBce(moneda, fecha) {
  if (!monedaValida(moneda) || moneda === 'EUR') return { error: 'Moneda no válida' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return { error: 'Fecha no válida' };
  const k = `cambio:${moneda}:${fecha}`;
  const guardado = redis ? await redis.get(k) : null;
  if (guardado?.cambio) return guardado;
  try {
    const { d } = await proveedorJSON('BCE', URL_BCE(moneda, fecha), { headers: { Accept: 'application/json' } }, { idempotente: true, timeoutMs: 8000 });
    const serie = Object.values(d?.dataSets?.[0]?.series || {})[0];
    const cambio = Number(Object.values(serie?.observations || {})[0]?.[0]);
    const dia = d?.structure?.dimensions?.observation?.[0]?.values?.at(-1)?.id;
    if (!Number.isFinite(cambio) || cambio <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) throw new Error('Respuesta sin tipo');
    const r = { moneda, cambio, fecha: dia, fuente: 'BCE' };
    if (redis) await redis.set(k, r, { ex: 30 * 86400 });
    return r;
  } catch {
    return { error: 'No se ha podido consultar el tipo de cambio del BCE. Escríbelo a mano.' };
  }
}
