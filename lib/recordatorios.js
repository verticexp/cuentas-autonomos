// Recordatorios de cobro: a las facturas vencidas, con email del cliente, cada `cada` días (máximo 5).
import { vencida, vencimiento } from './calculos.js';

const dias = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export const MAX_RECORDATORIOS = 5;

export function tocaRecordatorio(f, { plazo, cada }, hoy) {
  if (!cada || !f.cliente?.email || !vencida(f, plazo, hoy)) return false;
  const previos = (f.envios || []).filter((x) => x.tipo === 'recordatorio');
  if (previos.length >= MAX_RECORDATORIOS) return false;
  // El primero, nada más vencer; los siguientes, `cada` días después del último email enviado tras el vencimiento.
  const ultimo = (f.envios || []).map((x) => x.fecha.slice(0, 10)).filter((d) => d > vencimiento(f, plazo)).sort().at(-1);
  return !ultimo || dias(ultimo, hoy) >= cada;
}
